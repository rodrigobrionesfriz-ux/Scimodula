/* ╔═══════════════════════════════════════════════════════════════╗
   ║                    SCI · Sistema Inventario                    ║
   ║                                                                ║
   ║  Estructura: SPA con IndexedDB para persistencia              ║
   ║  Auto-guardado en cada operación                              ║
   ║  Costeo: Promedio Ponderado (PPP)                             ║
   ║  Multi-bodega · Trazabilidad por lote · Permisos por usuario  ║
   ╚═══════════════════════════════════════════════════════════════╝ */

/* ═══════════════ DB LAYER (IndexedDB) ═══════════════ */
const DB_NAME='SCI_DB';
const DB_VERSION=9;
const STORES=[
  ['users','id'],
  ['products','codigoInterno'],
  ['warehouses','id'],
  ['groups','nombre'],
  ['productTypes','nombre'],
  ['providers','codigo'],
  ['customers','codigo'],
  ['costCenters','codigo'],
  ['inventoryCounts','id'],
  ['movements','numero'],
  ['mantenciones','id'],
  ['conteos','id'],
  ['estimaciones','id'],
  ['invplantas','id'],
  ['stock','key'],
  ['lots','id'],
  ['audit','id'],
  ['config','key']
];
let DB=null;

function openDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=(e)=>{
      const db=e.target.result;
      STORES.forEach(([name,key])=>{
        if(!db.objectStoreNames.contains(name)){
          db.createObjectStore(name,{keyPath:key});
        }
      });
    };
    req.onsuccess=()=>{DB=req.result;resolve(DB)};
    req.onerror=()=>reject(req.error);
  });
}
function tx(store,mode='readonly'){return DB.transaction(store,mode).objectStore(store)}
// Versión local pura (sin sincronización) — usada internamente al aplicar cambios remotos
function dbPutLocal(store,obj){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').put(obj);
    r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error);
  });
}
// Versión pública: guarda local Y sincroniza a la nube
function dbPut(store,obj){
  return new Promise((res,rej)=>{
    // Sellar marca de modificación en registros acumulativos: permite a la
    // fusión saber qué versión es más reciente cuando dos dispositivos editan
    // el mismo registro. No se aplica al aplicar un cambio remoto (para no
    // re-sellar lo que ya viene de la nube).
    try{
      var ACUM = {'invplantas':1,'conteos':1,'estimaciones':1,'movements':1,'mantenciones':1,'inventoryCounts':1,'lots':1};
      if(ACUM[store] && obj && typeof obj==='object' && !(typeof SCIFB!=='undefined' && SCIFB.applyingRemote)){
        obj._mod = Date.now();
      }
    }catch(e){}
    const r=tx(store,'readwrite').put(obj);
    r.onsuccess=()=>{
      // Disparar sincronización a la nube (si está lista, no aplicando remoto, y no en arranque)
      if(typeof SCIFB!=='undefined' && SCIFB.ready && !SCIFB.applyingRemote && !SCIFB.bootingUp){
        try{ sciFbPush(false); }catch(e){}
      }
      res(obj);
    };
    r.onerror=()=>rej(r.error);
  });
}
function dbGet(store,key){
  return new Promise((res,rej)=>{
    const r=tx(store).get(key);
    r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);
  });
}
function dbAll(store){
  return new Promise((res,rej)=>{
    let r;
    try{ r=tx(store).getAll(); }
    catch(e){ console.warn('dbAll: store no disponible aún:',store); return res([]); }
    r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);
  });
}

// ══ EMPRESA: helpers globales para datos de configuración ══
async function getCompanyData(){
  try{
    const emp = await dbGet('config', 'empresa');
    return emp || {key:'empresa',nombre:'', rut:'', direccion:'', giro:'', telefono:'', correo:'', logo:''};
  } catch(e){
    return {key:'empresa',nombre:'', rut:'', direccion:'', giro:'', telefono:'', correo:'', logo:''};
  }
}
// Aplica el branding (logo + nombre) al sidebar y login
async function applyCompanyBranding(){
  try {
    const emp = await getCompanyData();
    // Sidebar: actualizar logo y nombre
    const sidebarLogo = document.getElementById('sidebar-logo-container');
    const sidebarName = document.getElementById('sidebar-empresa-name');
    if(sidebarLogo){
      if(emp.logo){
        sidebarLogo.innerHTML = `<img src="${emp.logo}" alt="Logo" style="max-width:48px;max-height:48px;object-fit:contain;border-radius:6px">`;
      } else {
        sidebarLogo.innerHTML = `<div style="width:48px;height:48px;background:linear-gradient(135deg,#354a5f,#0854a0);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#d1e8ff;font-size:24px;font-weight:700">📊</div>`;
      }
    }
    if(sidebarName){
      sidebarName.textContent = emp.nombre || 'Sistema de Inventario';
    }
    // Login: actualizar logo si existe
    const loginLogo = document.getElementById('login-logo-container');
    if(loginLogo){
      if(emp.logo){
        loginLogo.innerHTML = `<img src="${emp.logo}" alt="Logo" style="max-width:80px;max-height:80px;object-fit:contain">`;
      } else {
        loginLogo.innerHTML = `<div style="width:80px;height:80px;background:linear-gradient(135deg,#354a5f,#0854a0);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#d1e8ff;font-size:36px;font-weight:700">📊</div>`;
      }
    }
    // Title del navegador
    if(emp.nombre){
      document.title = 'SCI · ' + emp.nombre;
    } else {
      document.title = 'SCI · Sistema de Control de Inventario';
    }
    // Cachear en STATE para acceso síncrono
    if(typeof STATE !== 'undefined' && STATE.cache){
      STATE.cache.config = STATE.cache.config || {};
      STATE.cache.config.empresa = emp;
    }
  } catch(e){
    console.error('Error al aplicar branding:', e);
  }
}
function dbDelLocal(store,key){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').delete(key);
    r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
  });
}
function dbDel(store,key){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').delete(key);
    r.onsuccess=()=>{
      if(typeof SCIFB!=='undefined' && SCIFB.ready && !SCIFB.applyingRemote && !SCIFB.bootingUp){
        try{ sciFbPush(false); }catch(e){}
      }
      res();
    };
    r.onerror=()=>rej(r.error);
  });
}
function dbClear(store){
  return new Promise((res,rej)=>{
    const r=tx(store,'readwrite').clear();
    r.onsuccess=()=>res();r.onerror=()=>rej(r.error);
  });
}

// ══════════════════════════════════════════════════════════════════
//  SINCRONIZACIÓN EN LA NUBE DEL SCI — Firebase Firestore
//  Documento compartido: sci/main (espeja todas las tablas del SCI)
// ══════════════════════════════════════════════════════════════════
var SCIFB = {
  ready: false,
  online: false,
  // Mientras es true, las escrituras locales NO se suben a la nube
  // (evita que la inicialización por defecto pise los datos remotos al arrancar)
  bootingUp: true,
  // Indica si ya recibimos al menos una respuesta de la nube
  firstSnapshotReceived: false,
  clientId: 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
  lastVersion: 0,
  unsubscribe: null,
  applyingRemote: false,
  saveTimer: null,
  // Tablas que se sincronizan (todas las del SCI)
  stores: ['users','products','warehouses','groups','productTypes','providers','customers','costCenters','inventoryCounts','movements','stock','lots','config','mantenciones','conteos','estimaciones','invplantas']
};

function sciFbDocRef(){
  if(typeof firebase==='undefined' || !firebase.apps.length) return null;
  return firebase.firestore().collection('sci').doc('main');
}

// Inicializa la sincronización del SCI (Firebase ya debe estar inicializado por el Cuaderno)
function sciFbInit(){
  try {
    if(typeof firebase === 'undefined'){
      console.warn('[SCI-Firebase] SDK no cargado. Inventario solo local.');
      sciFbIndicator('offline', 'Sin conexión a la nube');
      return;
    }
    if(!firebase.apps.length){
      // Si el Cuaderno no lo inicializó aún, lo hacemos con la misma config
      if(typeof FB !== 'undefined' && FB.config){
        firebase.initializeApp(FB.config);
      } else {
        console.warn('[SCI-Firebase] Sin configuración de Firebase');
        return;
      }
    }
    // Login anónimo (si aún no se hizo desde el Cuaderno)
    try{
      if(firebase.auth && !(firebase.auth().currentUser)){
        firebase.auth().signInAnonymously().catch(function(e){
          console.warn('[SCI-Firebase] Login anónimo falló:', e && e.code);
        });
      }
    }catch(e){ console.warn('[SCI-Firebase] Auth no disponible:', e); }
    SCIFB.ready = true;
    console.log('[SCI-Firebase] Inicializado');
    sciFbIndicator('connecting', 'Conectando inventario a la nube...');
    // Arrancar el listener solo cuando la autenticación anónima esté lista
    if(firebase.auth){
      var _sciListenerOk = false;
      firebase.auth().onAuthStateChanged(function(user){
        if(user && !_sciListenerOk){
          _sciListenerOk = true;
          sciFbStartListener();
        }
      });
      setTimeout(function(){
        if(!_sciListenerOk){ _sciListenerOk = true; sciFbStartListener(); }
      }, 6000);
    } else {
      sciFbStartListener();
    }
    // Red de seguridad: si en 10s no llegó respuesta de la nube (sin internet, etc.),
    // desactivar el modo arranque para que las escrituras locales puedan subir cuando se reconecte.
    setTimeout(function(){
      if(!SCIFB.firstSnapshotReceived){
        console.log('[SCI-Firebase] Sin respuesta de la nube en 10s. Habilitando subidas locales.');
        SCIFB.bootingUp = false;
      }
    }, 10000);
  } catch(e){
    console.error('[SCI-Firebase] Error al inicializar:', e);
    sciFbIndicator('offline', 'Error: ' + e.message);
  }
}

// Escucha cambios remotos en tiempo real
function sciFbStartListener(){
  var ref = sciFbDocRef();
  if(!ref) return;
  if(SCIFB.unsubscribe){ try{ SCIFB.unsubscribe(); }catch(e){} }
  SCIFB.unsubscribe = ref.onSnapshot(
    {includeMetadataChanges: false},
    function(doc){
      try{FBCOUNT.read();}catch(e){}
      SCIFB.online = true;
      if(!doc.exists){
        // La nube está vacía. Recién aquí permitimos subir los datos locales.
        console.log('[SCI-Firebase] Documento no existe. Creando con datos locales...');
        SCIFB.firstSnapshotReceived = true;
        SCIFB.bootingUp = false;
        sciFbIndicator('online', 'Creando base de inventario en la nube');
        sciFbPush(true);
        return;
      }
      var data = doc.data();
      if(data._clientId === SCIFB.clientId && data._version === SCIFB.lastVersion){
        SCIFB.firstSnapshotReceived = true;
        SCIFB.bootingUp = false;
        sciFbIndicator('online', 'Sincronizado');
        return;
      }
      // Hay datos en la nube: SIEMPRE ganan sobre el estado local de arranque.
      if(data._version && data._version !== SCIFB.lastVersion){
        console.log('[SCI-Firebase] Cambio remoto detectado (v'+data._version+')');
        SCIFB.firstSnapshotReceived = true;
        sciFbApplyRemote(data);
        // Tras aplicar la primera vez, ya se pueden subir cambios locales
        SCIFB.bootingUp = false;
      }
    },
    function(err){
      SCIFB.online = false;
      console.error('[SCI-Firebase] Error en listener:', err);
      sciFbIndicator('offline', 'Sin conexión: ' + err.code);
    }
  );
}

// Aplica el estado remoto a IndexedDB local
async function sciFbApplyRemote(data){
  try {
    SCIFB.applyingRemote = true;
    if(data.payload){
      var remote = (typeof data.payload === 'string') ? JSON.parse(data.payload) : data.payload;
      // Stores acumulativos: fusión por clave (definido globalmente en
      // SCI_STORES_ACUMULATIVOS) para que ningún dispositivo borre datos de otro.
      for(var i=0;i<SCIFB.stores.length;i++){
        var store = SCIFB.stores[i];
        if(remote[store] !== undefined && Array.isArray(remote[store])){
          // Protección: si el store remoto llega VACÍO pero localmente hay datos,
          // no borrar (evita perder datos por una sincronización incompleta).
          if(remote[store].length===0){
            try{
              const localActual = await dbAll(store);
              if(localActual && localActual.length>0){
                console.warn('[SCI-Firebase] Store remoto "'+store+'" llegó vacío pero hay '+localActual.length+' local(es). Se conservan los locales.');
                continue;
              }
            }catch(e){}
          }
          if(SCI_STORES_ACUMULATIVOS[store]){
            var key = _sciStoreKey(store);
            var localArr = [];
            try{ localArr = await dbAll(store); }catch(e){ localArr = []; }
            var fusionado = _sciMergeArrays(localArr, remote[store], key, store);
            await dbClear(store);
            for(var j=0;j<fusionado.length;j++){
              try{ await dbPutLocal(store, fusionado[j]); }catch(e){}
            }
          } else {
            // Stores de catálogo/configuración: reemplazo directo.
            await dbClear(store);
            for(var j2=0;j2<remote[store].length;j2++){
              try{ await dbPutLocal(store, remote[store][j2]); }catch(e){}
            }
          }
        }
      }
      SCIFB.lastVersion = data._version || SCIFB.lastVersion;
      await reloadCache();
      // Refrescar la pantalla actual del SCI
      if(typeof navigate === 'function' && typeof STATE !== 'undefined' && STATE.page){
        try{ navigate(STATE.page); }catch(e){}
      }
      sciFbIndicator('online', 'Inventario actualizado desde la nube');
    }
  } catch(e){
    console.error('[SCI-Firebase] Error al aplicar cambio remoto:', e);
  } finally {
    SCIFB.applyingRemote = false;
  }
}

// Envía todo el estado del SCI a la nube
/* ─── Lápidas de eliminación (tombstones) ───────────────────────────────
   Cuando se elimina un registro de un store acumulativo, registramos su ID con
   un timestamp. Esa marca se sincroniza (vía store 'config') y la fusión la
   respeta: un registro con lápida más reciente que el propio registro NO
   reaparece, aunque otro dispositivo todavía lo tenga. Así las eliminaciones
   se propagan sin sacrificar la protección contra pérdida de datos nuevos. */
var _SCI_TOMB_KEY = 'sci_tombstones';
function _sciGetTombstones(){
  try{
    var c = (STATE.cache.config && STATE.cache.config[_SCI_TOMB_KEY]) || null;
    return (c && c.tombs && typeof c.tombs==='object') ? c.tombs : {};
  }catch(e){ return {}; }
}
/* Marca un id como eliminado en un store (registra timestamp) y sincroniza. */
async function sciMarcarEliminado(store, id){
  try{
    var tombs = _sciGetTombstones();
    if(!tombs[store]) tombs[store] = {};
    tombs[store][String(id)] = Date.now();
    var obj = { key:_SCI_TOMB_KEY, tombs: tombs, _updatedAt:new Date().toISOString() };
    STATE.cache.config = STATE.cache.config || {};
    STATE.cache.config[_SCI_TOMB_KEY] = obj;
    await dbPut('config', obj); // dbPut sincroniza config a la nube
  }catch(e){ console.error('tombstone error:', e); }
}
/* ¿El registro (rec) está eliminado? True si hay lápida con timestamp >= _mod. */
function _sciEstaEliminado(store, rec, key){
  if(!rec || rec[key]===undefined) return false;
  var tombs = _sciGetTombstones();
  var st = tombs[store]; if(!st) return false;
  var tomb = st[String(rec[key])];
  if(tomb==null) return false;
  var mod = rec._mod || 0;
  // Si el registro fue modificado DESPUÉS de la lápida, significa que se re-creó
  // intencionalmente → no se considera eliminado. Si no, está eliminado.
  return mod <= tomb;
}

/* Mapa de stores acumulativos (donde perder un registro es grave) y sus claves.
   Compartido por la recepción (applyRemote) y la subida (push) para que ningún
   dispositivo borre datos que otro creó. */
var SCI_STORES_ACUMULATIVOS = {
  'invplantas':1,'conteos':1,'estimaciones':1,'movements':1,
  'mantenciones':1,'inventoryCounts':1,'audit':1,'lots':1
};
function _sciStoreKey(store){
  try{ for(var i=0;i<STORES.length;i++){ if(STORES[i][0]===store) return STORES[i][1]; } }catch(e){}
  return 'id';
}
/* Fusiona dos arrays de registros por clave, conservando todos. Ante misma
   clave, gana el de _mod más reciente (o el segundo si no hay _mod).
   Excluye los registros marcados como eliminados (lápidas) para ese store. */
function _sciMergeArrays(localArr, remoteArr, key, store){
  var mapa = {};
  (localArr||[]).forEach(function(rec){ if(rec && rec[key]!==undefined) mapa[rec[key]] = rec; });
  (remoteArr||[]).forEach(function(rrec){
    if(!rrec || rrec[key]===undefined) return;
    var ex = mapa[rrec[key]];
    if(!ex){ mapa[rrec[key]] = rrec; return; }
    var lm = (ex && ex._mod) ? ex._mod : 0;
    var rm = (rrec && rrec._mod) ? rrec._mod : 0;
    mapa[rrec[key]] = (lm > rm) ? ex : rrec;
  });
  // Filtrar los eliminados (lápidas), si se indicó el store.
  var arr = Object.keys(mapa).map(function(k){ return mapa[k]; });
  if(store){
    arr = arr.filter(function(rec){ return !_sciEstaEliminado(store, rec, key); });
  }
  return arr;
}

async function sciFbPush(immediate){
  var ref = sciFbDocRef();
  if(!ref){ return; }
  if(SCIFB.applyingRemote){ return; }
  if(SCIFB.saveTimer){ clearTimeout(SCIFB.saveTimer); }
  var doSave = async function(){
    try {
      sciFbIndicator('syncing', 'Guardando inventario en la nube...');
      // ── Leer primero el documento remoto actual y FUSIONAR con lo local ──
      // Esto evita que este dispositivo borre registros que otro creó y que
      // aún no hemos recibido. Para los stores acumulativos se fusiona por
      // clave; el resto se sube tal cual está localmente.
      var remoteObj = null;
      try{
        var snap = await ref.get(); try{FBCOUNT.read();}catch(e){}
        if(snap && snap.exists){
          var rdata = snap.data();
          if(rdata && rdata.payload){
            remoteObj = (typeof rdata.payload==='string') ? JSON.parse(rdata.payload) : rdata.payload;
          }
        }
      }catch(e){ /* si no se puede leer, se sube lo local */ }

      var newVersion = Date.now();
      SCIFB.lastVersion = newVersion;
      var payloadObj = {};
      for(var i=0;i<SCIFB.stores.length;i++){
        var store = SCIFB.stores[i];
        var localData = await dbAll(store);
        if(remoteObj && SCI_STORES_ACUMULATIVOS[store] && Array.isArray(remoteObj[store])){
          // Fusionar local + remoto: no perder lo que el otro dispositivo subió.
          payloadObj[store] = _sciMergeArrays(localData, remoteObj[store], _sciStoreKey(store), store);
          // Reflejar la fusión también en la base local, para quedar consistentes.
          try{
            if(payloadObj[store].length !== localData.length){
              SCIFB.applyingRemote = true;
              await dbClear(store);
              for(var m=0;m<payloadObj[store].length;m++){ try{ await dbPutLocal(store, payloadObj[store][m]); }catch(e){} }
              SCIFB.applyingRemote = false;
            }
          }catch(e){ SCIFB.applyingRemote = false; }
        } else {
          payloadObj[store] = localData;
        }
      }
      var payload = JSON.stringify(payloadObj);
      // Guarda de tamaño: Firestore limita cada documento a ~1 MB. Si el payload
      // se acerca, avisar (el guardado fallaría y no se sincronizaría nada).
      if(payload.length > 950000){
        try{ sciFbIndicator('error','Datos demasiado grandes para la nube'); }catch(e){}
        try{ toast('⚠ Sincronización en riesgo','Los datos se acercan al límite de la nube (1 MB). Contacte al administrador para depurar registros antiguos.','warning'); }catch(e){}
        console.warn('Payload SCI cercano al límite:', payload.length, 'bytes');
      }
      var userName = '';
      try { if(STATE && STATE.user){ userName = STATE.user.nombre || STATE.user.id || ''; } }catch(e){}
      try{FBCOUNT.write();}catch(e){}
      await ref.set({
        payload: payload,
        _version: newVersion,
        _clientId: SCIFB.clientId,
        _updatedBy: userName,
        _updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      SCIFB.online = true;
      sciFbIndicator('online', 'Inventario guardado en la nube');
      // Si fusionamos algo nuevo desde la nube, refrescar el cache y la vista.
      try{ if(typeof reloadCache==='function'){ await reloadCache(); } }catch(e){}
    } catch(err){
      SCIFB.online = false;
      console.error('[SCI-Firebase] Error al guardar:', err);
      sciFbIndicator('offline', 'Error al guardar (datos locales OK)');
    }
  };
  if(immediate){ await doSave(); }
  else { SCIFB.saveTimer = setTimeout(doSave, 1000); }
}

// Indicador visual del SCI (en el topbar)
function sciFbIndicator(state, msg){
  var el = document.getElementById('sci-sync-indicator');
  if(!el) return;
  var colors = { online:'#22c55e', syncing:'#eab308', connecting:'#3b82f6', offline:'#ef4444' };
  var labels = { online:'En línea', syncing:'Guardando...', connecting:'Conectando...', offline:'Sin conexión' };
  var color = colors[state] || '#999';
  var label = labels[state] || state;
  el.style.display = 'flex';
  el.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+color+';margin-right:5px;'+(state==='syncing'||state==='connecting'?'animation:ccPulse 1s infinite':'')+'"></span>'+
    '<span style="font-size:11px;color:var(--mu)">'+label+'</span>';
  el.title = msg || label;
}

/* ═══════════════ HASH (SHA-256) ═══════════════ */
async function sha256(text){
  const buf=new TextEncoder().encode(text);
  const hash=await crypto.subtle.digest('SHA-256',buf);
  return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* ═══════════════ STATE ═══════════════ */
const STATE={
  user:null,
  page:'dashboard',
  cache:{products:[],warehouses:[],groups:[],productTypes:[],providers:[],customers:[],costCenters:[],inventoryCounts:[],movements:[],stock:[],lots:[],users:[],config:{},mantenciones:[],conteos:[],estimaciones:[],invplantas:[]}
};

// ── Advertencia al cerrar / recargar / volver atrás (evita salir por error) ──
// ═══════════════ SISTEMA DE TEMAS (SAP azul / Forestal verde) ═══════════════
function getTema(){ try{ return localStorage.getItem('sci_tema')||'sap'; }catch(e){ return 'sap'; } }
function cambiarTema(tema){
  aplicarTema(tema);
  _resaltarTemaCard(tema);
  if(typeof toast==='function') toast('Apariencia actualizada', tema==='forestal'?'Paleta verde forestal aplicada':'Paleta azul corporativo aplicada','success');
}
function _resaltarTemaCard(tema){
  var sap=document.getElementById('tema-card-sap');
  var fore=document.getElementById('tema-card-forestal');
  if(sap) sap.style.borderColor = (tema==='sap')?'#0a6ed1':'var(--bo)';
  if(sap) sap.style.background = (tema==='sap')?'#f5f9fd':'transparent';
  if(fore) fore.style.borderColor = (tema==='forestal')?'#2d5a1b':'var(--bo)';
  if(fore) fore.style.background = (tema==='forestal')?'#f0f7f2':'transparent';
}
function aplicarTema(tema){
  try{ localStorage.setItem('sci_tema', tema); }catch(e){}
  var styleEl = document.getElementById('tema-forestal-css');
  if(!styleEl) return;
  if(tema==='forestal'){
    // Sobreescribe variables CSS y los colores SAP hardcodeados más visibles → verde forestal.
    // Usa atributo [style*="..."] para alcanzar los colores en línea sin recorrer el DOM.
    var css =
      ':root{--gd:#0a3622 !important;--gm:#2d5a1b !important;--gl:#2d5a1b !important;--ga:#84c49a !important;--gp:#f0f7f2 !important;--bg:#f5f8f4 !important;--gold:#b8860b !important;}'+
      '.topbar{background:#1e3d0f !important;border-bottom-color:#143007 !important}'+
      '.nav-item.active{background:linear-gradient(135deg,#2d5a1b,#1e3d0f) !important}'+
      '.cc-nav-btn.cc-act,.cc-nav-btn.active{background:#1e3d0f !important}'+
      '.fr-subtab.fr-act{background:#2d5a1b !important;color:#fff !important}'+
      '.btn-primary{background:#2d5a1b !important;border-color:#2d5a1b !important}'+
      '.cc-btn-g{background:#2d5a1b !important}'+
      // Colores hardcodeados frecuentes mediante selector de atributo
      '[style*="#354a5f"]{--x:0}'+
      'body [style*="background:#354a5f"],body [style*="background:linear-gradient(90deg,#23303d,#0854a0)"]{background:#1e3d0f !important}'+
      'body [style*="background:linear-gradient(135deg,#23303d,#0854a0)"]{background:linear-gradient(135deg,#0a3622,#2d5010) !important}'+
      'body [style*="color:#0a6ed1"]{color:#2d5a1b !important}'+
      'body [style*="color:#0854a0"]{color:#2d5010 !important}'+
      'body [style*="background:#0a6ed1"]{background:#2d5a1b !important}'+
      'body [style*="background:#0854a0"]{background:#2d5010 !important}'+
      'body [style*="background:#d1e8ff"]{background:#d4f0b8 !important}'+
      'body [style*="background:#f5f9fd"],body [style*="background:#fafcff"],body [style*="background:#f0f7ff"],body [style*="background:#eef3f8"]{background:#f0f7f2 !important}'+
      'body [style*="border:1px solid #d1e8ff"]{border-color:#c8e0b8 !important}';
    styleEl.textContent = css;
    document.documentElement.setAttribute('data-tema','forestal');
  } else {
    styleEl.textContent = '';
    document.documentElement.setAttribute('data-tema','sap');
  }
}

// ── Botón atrás en móvil: mantener la app activa (history.pushState/popstate) ──
// Estrategia con pila interna de navegación (_sciNavStack):
//   • Cada navigate() que NO viene del history apila la página visitada.
//   • Al presionar 'atrás', popstate saca la página actual y navega a la
//     anterior de la pila (retroceso real dentro de la app).
//   • Si la pila ya está en la raíz (una sola página), re-apilamos un estado
//     para NO salir de la app: cerrar solo ocurre vía 'Cerrar sesión'.
var _sciNavStack = [];
function sciSeedHistory(){
  // Siembra el estado base al iniciar sesión (idempotente).
  try{
    if(STATE && STATE.user){
      // Para OP. CONTEOS la raíz es el MENÚ (no el dashboard): usamos el marcador
      // '__menu__' para que el botón atrás vuelva al menú de elección, no al dashboard.
      var p = (STATE.user.role==='opconteos') ? '__menu__' : (STATE.page || 'dashboard');
      _sciNavStack = [p];
      history.replaceState({sciPage:p, depth:0}, '', location.pathname + location.search + '#' + (p==='__menu__'?'menu':p));
    }
  }catch(e){}
}
window.addEventListener('popstate', function(ev){
  // Sin sesión: no interferir con el comportamiento normal del navegador.
  if(!STATE || !STATE.user) return;
  // Quitar la página actual de la pila.
  if(_sciNavStack.length > 1){
    _sciNavStack.pop();
    var anterior = _sciNavStack[_sciNavStack.length - 1] || 'dashboard';
    try{
      if(anterior==='__menu__'){ if(typeof mostrarMenuConteos==='function') mostrarMenuConteos(); }
      else { navigate(anterior, true); }
    }catch(e){ try{ navigate('dashboard', true); }catch(_e){} }
    // Reflejar la profundidad actual en el history (sin volver a apilar página).
    try{ history.replaceState({sciPage:anterior, depth:_sciNavStack.length-1}, '', location.pathname + location.search + '#' + anterior); }catch(e){}
  } else {
    // En la raíz: re-apilar para mantener la app abierta (atrás no la cierra).
    var raiz = _sciNavStack[0] || 'dashboard';
    if(raiz==='__menu__' && typeof mostrarMenuConteos==='function'){ mostrarMenuConteos(); }
    try{ history.pushState({sciPage:raiz, depth:0}, '', location.pathname + location.search + '#' + (raiz==='__menu__'?'menu':raiz)); }catch(e){}
  }
});

window.addEventListener('beforeunload', function(e){
  // Solo advertir si hay un usuario con sesión iniciada
  if(STATE && STATE.user){
    e.preventDefault();
    e.returnValue = ''; // requerido por algunos navegadores para mostrar el aviso
    return '';
  }
});

const PERMISSIONS=[
  ['productos.ver','Ver productos'],
  ['productos.crear','Crear/editar productos'],
  ['productos.eliminar','Eliminar productos'],
  ['bodegas.ver','Ver bodegas'],
  ['bodegas.crear','Crear/editar bodegas'],
  ['proveedores.ver','Ver proveedores'],
  ['proveedores.crear','Crear/editar proveedores'],
  ['clientes.ver','Ver clientes'],
  ['clientes.crear','Crear/editar clientes'],
  ['centrosCosto.ver','Ver centros de costo'],
  ['centrosCosto.crear','Crear/editar centros de costo'],
  ['tomas.ver','Ver tomas de inventario'],
  ['tomas.crear','Iniciar y capturar tomas de inventario'],
  ['tomas.autorizar','Autorizar y aplicar ajustes de inventario'],
  ['movimientos.ver','Ver movimientos'],
  ['movimientos.crear','Crear movimientos'],
  ['movimientos.editar','Editar movimientos'],
  ['movimientos.anular','Anular movimientos'],
  ['stock.ver','Ver stock'],
  ['usuarios.ver','Ver usuarios'],
  ['usuarios.crear','Crear/editar usuarios'],
  ['config.ver','Ver configuración'],
  ['config.editar','Editar configuración'],
  ['cuaderno.ver','Ver Cuaderno de Campo'],
  ['cuaderno.editar','Editar Cuaderno de Campo (registros, órdenes, paños)'],
  ['cuaderno.confirmar','Confirmar aplicaciones de órdenes'],
  ['cuaderno.panos','Gestionar paños (crear, editar, eliminar)'],
  ['presupuesto.ver','Ver Control de Presupuesto (Huerto Cerezos)'],
  ['presupuesto.editar','Actualizar datos del Control de Presupuesto (subir Excel)'],
  ['mantenciones.ver','Ver módulo de Servicio y Mantención'],
  ['mantenciones.crear','Crear y editar órdenes de trabajo'],
  ['mantenciones.facturar','Registrar facturas de servicio y mantención'],
  ['mantenciones.eliminar','Eliminar órdenes de trabajo y facturas'],
  ['conteos.ver','Acceder al módulo de Conteos en terreno'],
  ['conteos.revisar','Revisar conteos: exportar Excel y aplicar a estimación'],
  ['invplantas.ver','Acceder al Inventario de Huerto (conteo de plantas)'],
  ['invplantas.revisar','Revisar inventario de plantas: exportar y ver mapa'],
  ['invplantas.editar','Editar estado de árboles en el mapa de plantas'],
];
const ROLE_PERMS={
  'admin':PERMISSIONS.map(p=>p[0]),
  // Gerente: ve todo (solo lectura en general, pero acceso completo de visualización)
  'gerente':['productos.ver','bodegas.ver','proveedores.ver','clientes.ver','centrosCosto.ver','tomas.ver','movimientos.ver','stock.ver','usuarios.ver','config.ver','cuaderno.ver','mantenciones.ver','presupuesto.ver'],
  // Admin. Agrónomo: gestiona todo el Cuaderno de Campo + ve el inventario
  'agronomo':['productos.ver','bodegas.ver','stock.ver','movimientos.ver','config.ver','cuaderno.ver','cuaderno.editar','cuaderno.confirmar','cuaderno.panos','conteos.ver','conteos.revisar','invplantas.ver','invplantas.revisar','presupuesto.ver'],
  'operador':['productos.ver','productos.crear','bodegas.ver','proveedores.ver','proveedores.crear','clientes.ver','clientes.crear','centrosCosto.ver','centrosCosto.crear','movimientos.ver','movimientos.crear','stock.ver','tomas.ver','tomas.crear','config.ver'],
  'consulta':['productos.ver','bodegas.ver','proveedores.ver','clientes.ver','centrosCosto.ver','movimientos.ver','stock.ver','tomas.ver','config.ver'],
  // OP. CONTEOS: solo el módulo de conteos en terreno
  'opconteos':['conteos.ver','invplantas.ver']
};
// Etiquetas legibles de cada rol
const ROLE_LABELS={
  'admin':'Administrador',
  'gerente':'Gerente',
  'agronomo':'Admin. Agrónomo',
  'operador':'Operador',
  'consulta':'Consulta',
  'opconteos':'OP. CONTEOS'
};

function can(perm){
  if(!STATE.user)return false;
  return (STATE.user.permissions||[]).includes(perm);
}

/* ── Tipos de documento tributario que respaldan ciertos movimientos ── */
const TIPOS_DOC=['FACTURA','FACTURA EXENTA','GUIA DE DESPACHO','BOLETA','NOTA DE CREDITO','NOTA DE DEBITO'];

/* ── Tipos de movimiento operativo (cada uno con su correlativo) ──
   Cada tipo declara qué campos requiere:
   - reqDoc: documento tributario obligatorio (con regla de unicidad)
   - reqProv: proveedor obligatorio
   - reqCli: cliente obligatorio
   - reqCC: centro de costo obligatorio
   - reqBodDest: bodega destino obligatoria (para traspasos) */

const TIPOS_MOV_ENT=[
  {tipo:'COMPRA',                prefijo:'COMP',label:'Compra',                       icon:'🛒', reqDoc:true,  reqProv:true,  reqCC:false, validaUnicidadDoc:true},
  {tipo:'COSECHA A STOCK',       prefijo:'COS', label:'Producto cosechado a stock',   icon:'🍒', reqDoc:false, reqProv:false, reqCC:false, validaUnicidadDoc:false, reqFechaCosecha:true, simple:true},
  {tipo:'DEVOLUCION CC',         prefijo:'DCC', label:'Devolución de centro de costo',icon:'↩️', reqDoc:false, reqProv:false, reqCC:true,  validaUnicidadDoc:false},
  {tipo:'TOMA INVENTARIO ENT',   prefijo:'TIE', label:'Toma de inventario (entrada)', icon:'📋', reqDoc:false, reqProv:false, reqCC:false, validaUnicidadDoc:false},
  {tipo:'MUESTRA GRATIS',        prefijo:'MUE', label:'Muestra gratis',               icon:'🎁', reqDoc:false, reqProv:true,  reqCC:false, validaUnicidadDoc:false}
];

const TIPOS_MOV_SAL=[
  {tipo:'VENTA',                 prefijo:'VTA', label:'Venta',                        icon:'💰', reqDoc:true,  reqCli:true,  reqCC:false, reqBodDest:false, validaUnicidadDoc:true},
  {tipo:'CONSUMO CC',            prefijo:'CCC', label:'Consumo de centro de costo',   icon:'📤', reqDoc:false, reqCli:false, reqCC:true,  reqBodDest:false, validaUnicidadDoc:false},
  {tipo:'TRASPASO BODEGA',       prefijo:'TRB', label:'Traspaso entre bodega',        icon:'🔄', reqDoc:false, reqCli:false, reqCC:false, reqBodDest:true,  validaUnicidadDoc:false},
  {tipo:'MERMA',                 prefijo:'MER', label:'Merma',                        icon:'🗑️', reqDoc:false, reqCli:false, reqCC:false, reqBodDest:false, validaUnicidadDoc:false},
  {tipo:'DEVOLUCION PROVEEDOR',  prefijo:'DEV', label:'Devolución a proveedor',       icon:'↪️', reqDoc:true,  reqCli:false, reqCC:false, reqBodDest:false, validaUnicidadDoc:false, reqProv:true},
  {tipo:'TOMA INVENTARIO SAL',   prefijo:'TIS', label:'Salida por toma de inventario',icon:'📋', reqDoc:false, reqCli:false, reqCC:false, reqBodDest:false, validaUnicidadDoc:false}
];

function getMovCfg(tipo,tipoMov){
  const arr=tipo==='ENT'?TIPOS_MOV_ENT:TIPOS_MOV_SAL;
  return arr.find(x=>x.tipo===tipoMov)||null;
}
function getMovPrefix(tipo,tipoMov){
  const c=getMovCfg(tipo,tipoMov);
  return c?c.prefijo:tipo;
}
function getMovLabel(tipo,tipoMov){
  const c=getMovCfg(tipo,tipoMov);
  return c?c.label:(tipoMov||'');
}

/* ═══════════════ INIT / SEED ═══════════════ */
async function initDB(){
  await openDB();
  const users=await dbAll('users');
  if(users.length===0){
    const adminPass=await sha256('admin123');
    await dbPut('users',{
      id:'admin',
      nombre:'Administrador',
      passwordHash:adminPass,
      role:'admin',
      permissions:ROLE_PERMS.admin,
      activo:true,
      creado:new Date().toISOString()
    });
    await dbPut('warehouses',{id:'B001',nombre:'Bodega Central',direccion:'',activo:true});
    await dbPut('groups',{nombre:'GENERAL',subgrupos:['VARIOS']});
    await dbPut('config',{key:'counters',ENT:0,SAL:0,TRA:0,AJU:0,COMP:0,DCC:0,TIE:0,MUE:0,VTA:0,CCC:0,TRB:0,MER:0,DEV:0,TIS:0,TOMA:0});
    await dbPut('config',{key:'productCounter',value:0});
    await dbPut('config',{key:'empresa',nombre:'',rut:'',direccion:'',giro:'',telefono:'',correo:'',logo:''});
  }
  const _types=await dbAll('productTypes');
  if(_types.length===0){
    const _defaults=['MERCADERIA','MATERIA PRIMA','PRODUCTO TERMINADO','INSUMO','ACTIVO FIJO','SERVICIO'];
    for(const t of _defaults){
      await dbPut('productTypes',{nombre:t,descripcion:'',activo:true,creado:new Date().toISOString()});
    }
  }
  await reloadCache();
}
async function reloadCache(){
  STATE.cache.products=await dbAll('products');
  STATE.cache.warehouses=await dbAll('warehouses');
  STATE.cache.groups=await dbAll('groups');
  STATE.cache.productTypes=await dbAll('productTypes');
  STATE.cache.providers=await dbAll('providers');
  STATE.cache.customers=await dbAll('customers');
  STATE.cache.costCenters=await dbAll('costCenters');
  STATE.cache.inventoryCounts=await dbAll('inventoryCounts');
  STATE.cache.movements=await dbAll('movements');
  STATE.cache.mantenciones=await dbAll('mantenciones');
  STATE.cache.conteos=await dbAll('conteos');
  STATE.cache.invplantas=await dbAll('invplantas');
  STATE.cache.stock=await dbAll('stock');
  STATE.cache.lots=await dbAll('lots');
  STATE.cache.users=await dbAll('users');
  const cfgs=await dbAll('config');
  STATE.cache.config={};
  cfgs.forEach(c=>STATE.cache.config[c.key]=c);
}

/* ═══════════════ AUDIT LOG ═══════════════ */
async function audit(accion,detalle,referencia=''){
  const entry={
    id:Date.now()+'-'+Math.random().toString(36).slice(2,8),
    fecha:new Date().toISOString(),
    usuario:STATE.user?STATE.user.id:'system',
    accion,detalle,referencia
  };
  await dbPut('audit',entry);
  // Auto-purga: mantener solo los 300 registros más recientes (audit es local,
  // no se sincroniza; evita que crezca sin control y sobrecargue IndexedDB).
  try{
    const all=await dbAll('audit');
    if(all.length>350){
      all.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
      const borrar=all.slice(300);
      for(const r of borrar){ try{ await dbDelLocal('audit', r.id); }catch(e){} }
    }
  }catch(e){}
}

/* ═══════════════ TOAST ═══════════════ */
function toast(title,msg='',type='success'){
  const el=document.createElement('div');
  el.className='toast '+type;
  el.innerHTML=`<div class="toast-title">${title}</div>${msg?`<div class="toast-msg">${msg}</div>`:''}`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(()=>{el.style.animation='toastOut .25s ease forwards';setTimeout(()=>el.remove(),250)},3500);
}

/* ═══════════════ LOGIN ═══════════════ */
async function doLogin(){
  const userId=document.getElementById('loginUser').value.trim().toLowerCase();
  const pass=document.getElementById('loginPass').value;
  const errEl=document.getElementById('loginError');
  errEl.classList.remove('show');
  if(!userId||!pass){errEl.textContent='Ingrese usuario y contraseña';errEl.classList.add('show');return}
  let u=await dbGet('users',userId);
  // Si no se encuentra el usuario y Firebase aún no terminó de sincronizar, esperar y reintentar
  if((!u||!u.activo) && typeof SCIFB!=='undefined' && SCIFB.ready && !SCIFB.firstSnapshotReceived){
    errEl.textContent='Conectando con la nube, espere un momento...';errEl.classList.add('show');
    if(typeof sciFbWaitForSync==='function'){ await sciFbWaitForSync(5000); }
    errEl.classList.remove('show');
    u=await dbGet('users',userId); // reintentar tras sincronizar
  }
  if(!u||!u.activo){errEl.textContent='Usuario no encontrado o inactivo';errEl.classList.add('show');return}
  const hash=await sha256(pass);
  if(hash!==u.passwordHash){errEl.textContent='Contraseña incorrecta';errEl.classList.add('show');return}
  STATE.user=u;
  await audit('login','Inicio de sesión',u.id);
  try{ _startInactivityWatch(); }catch(e){}
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').classList.add('show');
  // OP. CONTEOS: modo pantalla completa para móvil (oculta menú lateral y barra superior)
  if(STATE.user && STATE.user.role==='opconteos'){
    document.body.classList.add('solo-conteos');
  } else {
    document.body.classList.remove('solo-conteos');
  }
  setTimeout(refreshBackupAlert,100);
  // Verificación de consistencia silenciosa al iniciar (solo admin)
  if(u.role==='admin'){
    setTimeout(async()=>{
      try{
        const check=await detectarInconsistenciaStock();
        if(!check.ok&&check.diferencias.length>0){
          // Mostrar alerta no bloqueante con el detalle del primer producto afectado
          const total=check.diferencias.length;
          const d0=check.diferencias[0];
          let nom='';
          try{ const cod=String(d0.key).split('|')[0]; const p=getProduct(cod); nom=p?(p.descripcion||cod):cod; }catch(e){}
          const detalle=nom?` Ej: ${nom} (actual ${d0.cantActual}, esperado ${d0.cantEsperada}).`:'';
          toast('⚠ Inconsistencia detectada en stock',`${total} producto(s) con saldo distinto al esperado.${detalle} Ve a Configuración → Recalcular stock.`,'warning');
          console.warn('Inconsistencias de stock:',check.diferencias);
        }
      }catch(e){console.error('Error verificando consistencia:',e)}
    },1500);
  }
  document.getElementById('userChipName').textContent=u.nombre||u.id;
  document.getElementById('userChipRole').textContent=(ROLE_LABELS[u.role]||u.role);
  document.getElementById('userAvatar').textContent=(u.nombre||u.id).charAt(0).toUpperCase();
  renderSidebar();
  applyCompanyBranding();
  // Firebase del SCI ya fue inicializado al arrancar (antes del login)
  if(typeof sciFbInit === 'function' && (typeof SCIFB==='undefined' || !SCIFB.ready)){
    try{ sciFbInit(); }catch(e){ console.error('Error al iniciar sync SCI:', e); }
  }
  // OP. CONTEOS: en móvil mostrar PRIMERO la barra lateral (sus 2 opciones:
  // Conteos en terreno / Inventario de Huerto) para que elija qué conteo
  // realizar. En escritorio el menú ya es visible, así que entra a conteos.
  if(STATE.user && STATE.user.role==='opconteos'){
    // OP. CONTEOS SIEMPRE ve primero la barra lateral con sus 2 opciones
    // (Conteos en terreno / Inventario de Huerto). No entra a ningún módulo
    // ni al dashboard. Funciona igual en móvil y escritorio.
    mostrarMenuConteos();
  } else {
    navigate('dashboard');
  }
  // Sembrar el history para el botón atrás (móvil)
  try{ sciSeedHistory(); }catch(e){}
  // Aplicar el tema de color guardado
  try{ if(typeof aplicarTema==='function') aplicarTema(getTema()); }catch(e){}
  if(userId==='admin'&&pass==='admin123'){
    setTimeout(()=>toast('Cambia tu contraseña','Estás usando la clave por defecto. Ve a Usuarios para actualizarla.','warning'),800);
  }
}
async function logout(){
  // Los datos se sincronizan automáticamente en la nube (Firebase),
  // por lo que ya no es necesario forzar un backup al cerrar sesión.
  await _doLogout();
}

/* ═══════════════ AUTO-CIERRE POR INACTIVIDAD (5 min) ═══════════════ */
/* Cierra la sesión automáticamente tras 5 minutos sin actividad del usuario.
   Antes de cerrar, fuerza el guardado de cualquier dato pendiente en la nube,
   para no perder información. La actividad (mouse, teclado, toque, scroll)
   reinicia el contador. */
var INACTIVITY_MS = 5 * 60 * 1000; // 5 minutos
var _inactivityTimer = null;
var _inactivityBound = false;
function _resetInactivityTimer(){
  if(!STATE.user) return; // solo cuenta si hay sesión activa
  if(_inactivityTimer){ clearTimeout(_inactivityTimer); }
  _inactivityTimer = setTimeout(_autoLogoutPorInactividad, INACTIVITY_MS);
}
async function _autoLogoutPorInactividad(){
  if(!STATE.user) return;
  // Antes de cerrar, intentar subir lo pendiente a la nube (no perder datos).
  try{ if(typeof sciFbPush==='function' && typeof SCIFB!=='undefined' && SCIFB.ready){ sciFbPush(true); } }catch(e){}
  try{ if(typeof fbPush==='function' && typeof FB!=='undefined' && FB.ready){ fbPush(true); } }catch(e){}
  // Pequeña espera para dar tiempo al guardado, luego cerrar.
  setTimeout(async function(){
    try{ await _doLogout(); }catch(e){}
    try{ if(typeof toast==='function'){ toast('Sesión cerrada','Tu sesión se cerró automáticamente por inactividad (5 min).','info'); } }catch(e){}
  }, 600);
}
function _startInactivityWatch(){
  // Cierre automático por inactividad DESACTIVADO: en terreno pueden ocurrir
  // pausas largas (distracciones, traslados) sin que deba cerrarse la sesión.
  // Se deja la función como no-op para no romper las llamadas existentes.
  return;
}
function _stopInactivityWatch(){
  if(_inactivityTimer){ clearTimeout(_inactivityTimer); _inactivityTimer = null; }
}

async function _doLogout(){
  try{ _stopInactivityWatch(); }catch(e){}
  if(STATE.user)await audit('logout','Cierre de sesión',STATE.user.id);
  STATE.user=null;
  document.getElementById('app').classList.remove('show');
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginUser').value='';
  document.getElementById('loginPass').value='';
}

/* ═══════════════ NAV ═══════════════ */
const PAGES=[
  {section:'PRINCIPAL',items:[
    {id:'dashboard',label:'Dashboard',icon:'📊',perm:null},
  ]},
  {section:'INVENTARIO',items:[
    {id:'productos',label:'Productos',icon:'📦',perm:'productos.ver'},
    {id:'bodegas',label:'Bodegas',icon:'🏭',perm:'bodegas.ver'},
    {id:'proveedores',label:'Proveedores',icon:'🚚',perm:'proveedores.ver'},
    {id:'clientes',label:'Clientes',icon:'👤',perm:'clientes.ver'},
    {id:'centrosCosto',label:'Centros de Costo',icon:'🏢',perm:'centrosCosto.ver'},
    {id:'stock',label:'Stock por Bodega',icon:'📋',perm:'stock.ver'},
  ]},
  {section:'OPERACIÓN',items:[
    {id:'movimientos',label:'Movimientos',icon:'🔄',perm:'movimientos.ver'},
    {id:'entradas',label:'Nueva Entrada',icon:'⬇️',perm:'movimientos.crear'},
    {id:'salidas',label:'Nueva Salida',icon:'⬆️',perm:'movimientos.crear'},
    {id:'tomas',label:'Tomas de Inventario',icon:'📋',perm:'tomas.ver'},
  ]},
  {section:'CUADERNO DE CAMPO',items:[
    {id:'cuaderno',label:'Cuaderno de Campo',icon:'🌳',perm:'cuaderno.ver'},
  ]},
  {section:'MANTENCIONES',items:[
    {id:'mantenciones',label:'Servicio y Mantención',icon:'🔧',perm:'mantenciones.ver'},
  ]},
  {section:'TERRENO',items:[
    {id:'conteos',label:'Conteos en terreno',icon:'🌸',perm:'conteos.ver'},
    {id:'invplantas',label:'Inventario de Huerto',icon:'🌳',perm:'invplantas.ver'},
  ]},
  {section:'CONTROL DE PRESUPUESTO',items:[
    {id:'presupuesto',label:'Control de Presupuesto',icon:'📊',perm:'presupuesto.ver'},
  ]},
  {section:'ADMINISTRACIÓN',items:[
    {id:'usuarios',label:'Usuarios',icon:'👥',perm:'usuarios.ver'},
    {id:'config',label:'Configuración',icon:'⚙️',perm:'config.ver'},
    {id:'auditoria',label:'Auditoría',icon:'📜',perm:null,adminOnly:true},
  ]},
];

function renderSidebar(){
  const nav=document.getElementById('sideNav');
  let html='';
  PAGES.forEach(sec=>{
    const visibleItems=sec.items.filter(it=>{
      if(it.adminOnly && STATE.user.role!=='admin')return false;
      // OP. CONTEOS solo ve sus módulos de terreno (no el Dashboard ni otros)
      if(STATE.user.role==='opconteos' && it.id!=='conteos' && it.id!=='invplantas')return false;
      return !it.perm || can(it.perm);
    });
    if(visibleItems.length===0)return;
    // ¿Esta sección contiene la página activa? Si sí, forzar expandida
    const tieneActiva = visibleItems.some(it=>it.id===STATE.page);
    const colapsada = _navColapsadas[sec.section] && !tieneActiva;
    html+=`<div class="nav-section ${colapsada?'nav-collapsed':''}" data-section="${escapeHtml(sec.section)}">`+
      `<div class="nav-label nav-label-toggle" onclick="toggleNavSection('${escapeHtml(sec.section)}')">`+
        `<span>${sec.section}</span><span class="nav-chevron">${colapsada?'▸':'▾'}</span>`+
      `</div>`+
      `<div class="nav-section-items">`;
    visibleItems.forEach(it=>{
      html+=`<div class="nav-item ${STATE.page===it.id?'active':''}" onclick="navigate('${it.id}')">
        <span class="nav-item-icon">${it.icon}</span>${it.label}
      </div>`;
    });
    html+=`</div></div>`;
  });
  html+=`<div class="nav-section" style="margin-top:auto"><div class="nav-item" onclick="logout()" style="color:rgba(255,180,180,.85)"><span class="nav-item-icon">🚪</span>Cerrar sesión</div></div>`;
  nav.innerHTML=html;
}
// Estado de secciones colapsadas (persiste en localStorage)
var _navColapsadas = (function(){
  try{ return JSON.parse(localStorage.getItem('sci_nav_colapsadas')||'{}'); }catch(e){ return {}; }
})();
function toggleNavSection(seccion){
  _navColapsadas[seccion] = !_navColapsadas[seccion];
  try{ localStorage.setItem('sci_nav_colapsadas', JSON.stringify(_navColapsadas)); }catch(e){}
  renderSidebar();
}

/* ── Puente: superficie total (ha) de cerezos Plantación 2018 del Cuaderno ──
   El módulo de presupuesto está encapsulado y no ve S.panos directamente; esta
   función global le permite obtener la suma de hectáreas de los paños 2018. */
function pzSumaHa2018(){
  try{
    // Asegurar que el estado del Cuaderno (S.panos) esté cargado: el Cuaderno
    // lee sus datos de localStorage vía load(); si aún no se ha entrado al
    // módulo Cuaderno en esta sesión, S.panos puede estar vacío.
    var panos = (typeof S!=='undefined' && S && Array.isArray(S.panos)) ? S.panos : null;
    if((!panos || !panos.length) && typeof load==='function'){
      try{ load(); panos = (typeof S!=='undefined' && S && Array.isArray(S.panos)) ? S.panos : panos; }catch(e){}
    }
    if(!panos || !panos.length) return null;
    var suma = panos.filter(function(p){ return String(p.anio)==='2018'; })
                    .reduce(function(s,p){ return s + (parseFloat(p.hectareas)||0); }, 0);
    return (suma>0) ? suma : null;
  }catch(e){ return null; }
}
window.pzSumaHa2018 = pzSumaHa2018;

/* ── OP. CONTEOS: mostrar la barra lateral con las 2 opciones para elegir ── */
function mostrarMenuConteos(){
  STATE.page = null;                 // ninguna página activa todavía
  if(typeof renderSidebar==='function') renderSidebar();
  var _sb = document.getElementById('sidebar');
  if(_sb) _sb.classList.add('open'); // abrir el menú (en móvil estaba oculto)
  var _tt = document.getElementById('topTitle');
  if(_tt) _tt.textContent = 'Elige el tipo de conteo';
  var _mc = document.getElementById('mainContent');
  if(_mc) _mc.innerHTML = '<div style="padding:32px 20px;text-align:center;color:var(--mu)">'
    + '<div style="font-size:40px;margin-bottom:10px">📋</div>'
    + '<div style="font-size:16px;font-weight:600;color:var(--tx);margin-bottom:6px">Elige el tipo de conteo</div>'
    + '<div style="font-size:13px">Abre el menú ☰ y selecciona <b>Conteos en terreno</b> o <b>Inventario de Huerto</b>.</div>'
    + '</div>';
}

function navigate(page, fromHistory){
  // ── Guard OP. CONTEOS: solo puede entrar a 'conteos' o 'invplantas'.
  // Cualquier otro destino (p.ej. 'dashboard') lo devuelve al menú. ──
  if(STATE.user && STATE.user.role==='opconteos' && page!=='conteos' && page!=='invplantas'){
    mostrarMenuConteos();
    return;
  }
  // Refrescar alerta de backup en cada navegación
  setTimeout(refreshBackupAlert,50);
  STATE.page=page;
  // ── Botón atrás (móvil): registrar la navegación en el history ──
  // Si la navegación NO proviene de un evento popstate, apilamos la
  // página (en _sciNavStack y en history) para que el botón 'atrás'
  // del navegador vuelva dentro de la app en vez de cerrarla.
  try{
    if(!fromHistory && STATE.user){
      if(typeof _sciNavStack === 'undefined' || !_sciNavStack){ window._sciNavStack = []; }
      // Evitar apilar la misma página consecutivamente.
      if(_sciNavStack[_sciNavStack.length-1] !== page){ _sciNavStack.push(page); }
      history.pushState({sciPage:page, depth:_sciNavStack.length-1}, '', location.pathname + location.search + '#' + page);
    }
  }catch(e){ /* history no disponible: degradar silenciosamente */ }
  // Toggle de visibilidad: wrapper del Cuaderno vs mainContent del SCI
  const _ccWrap = document.getElementById('cc-app-wrapper');
  const _mc = document.getElementById('mainContent');
  if(page === 'cuaderno'){
    if(_mc) _mc.style.display = 'none';
    if(_ccWrap) _ccWrap.style.display = 'block';
  } else {
    if(_ccWrap) _ccWrap.style.display = 'none';
    if(_mc) _mc.style.display = '';
  }
  renderSidebar();
  if(window.innerWidth<880)document.getElementById('sidebar').classList.remove('open');
  const titles={
    dashboard:'Dashboard',productos:'Productos',bodegas:'Bodegas',
    proveedores:'Proveedores',clientes:'Clientes',centrosCosto:'Centros de Costo',stock:'Stock por Bodega',movimientos:'Movimientos',
    entradas:'Nueva Entrada',salidas:'Nueva Salida',
    tomas:'Tomas de Inventario',tomaCapturar:'Capturando Toma',tomaVer:'Detalle de Toma',
    usuarios:'Usuarios',config:'Configuración',auditoria:'Auditoría',cuaderno:'Cuaderno de Campo — Cerezos',
    mantenciones:'Servicio y Mantención',
    conteos:'Conteos en terreno',
    invplantas:'Inventario de Huerto · Conteo de Plantas',
    presupuesto:'Control de Presupuesto — Huerto Cerezos 2018'
  };
  document.getElementById('topTitle').textContent=titles[page]||'';
  const main=document.getElementById('mainContent');
  main.scrollTop=0;
  switch(page){
    case 'dashboard':renderDashboard(main);break;
    case 'productos':renderProductos(main);break;
    case 'bodegas':renderBodegas(main);break;
    case 'proveedores':renderProveedores(main);break;
    case 'clientes':renderClientes(main);break;
    case 'centrosCosto':renderCentrosCosto(main);break;
    case 'stock':renderStock(main);break;
    case 'movimientos':renderMovimientos(main);break;
    case 'entradas':renderMovimientoForm(main,'ENT');break;
    case 'salidas':renderMovimientoForm(main,'SAL');break;
    case 'tomas':renderTomas(main);break;
    case 'tomaCapturar':renderTomaCapturar(main);break;
    case 'tomaVer':renderTomaVer(main);break;
    case 'usuarios':renderUsuarios(main);break;
    case 'config':renderConfig(main);break;
    case 'auditoria':renderAuditoria(main);break;
    case 'cuaderno':renderCuaderno(main);break;
    case 'mantenciones':renderMantenciones(main);break;
    case 'conteos':renderConteos(main);break;
    case 'invplantas':renderInvPlantas(main);break;
    case 'presupuesto':renderPresupuesto(main);break;
  }
}
