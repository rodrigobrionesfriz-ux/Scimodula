/* ═══════════════════════════════════════════════════════════════════
   MÓDULO CONTEOS EN TERRENO (optimizado para celular, offline-first)
   - Selección especie/variedad → paño → sesión de conteo de árboles
   - Cada árbol: centros florales + georreferencia + fecha
   - Guarda local (IndexedDB) y sincroniza con la nube (Firebase) cuando hay internet
   - Alimenta la Estimación de Producción (centros florales del paño)
   ═══════════════════════════════════════════════════════════════════ */
var _cteVarFiltro = '';
function cteSetVariedad(v){ _cteVarFiltro = v||''; cteRender(); }
var _cteSesion = null;       // sesión activa de conteo
var _ctePanoSel = null;      // paño seleccionado
var _cteVista = 'inicio';    // inicio | sesion | lista
// ── Mejoras: etapa fenológica + árboles fijos/aleatorios ──
var CTE_ETAPAS = ['Yema hinchada','Yema algodonosa','Botón blanco','Plena flor','Caída de pétalos','Cuaja','Post-cuaja','Fruto en crecimiento'];
var CTE_N_FIJOS = 3;       // árboles fijos representativos por paño
var CTE_N_ALEATORIOS = 5;  // árboles al azar por conteo
var _cteEtapa = '';          // etapa fenológica de la sesión
var _cteTipoArbol = null;    // 'fijo' | 'aleatorio' en el árbol actual
var _cteEstimActual = null;  // estimación en edición (hoja propia del módulo)

// Lee los paños del Cuaderno de Campo (objeto global S)
function ctePanos(){
  try{ return (typeof S!=='undefined' && Array.isArray(S.panos)) ? S.panos : []; }catch(e){ return []; }
}
function cteVariedades(){
  var vs = ctePanos().map(function(p){ return p.variedad||''; }).filter(Boolean);
  return [...new Set(vs)].sort();
}

async function renderConteos(c){
  // Asegurar que los paños del Cuaderno estén cargados (necesarios para seleccionar)
  try{ if(typeof load==='function' && (typeof S==='undefined' || !S.panos || !S.panos.length)){ load(); } }catch(e){}
  // Iniciar la sincronización del Cuaderno con Firebase si aún no está activa.
  // Necesario en dispositivos nuevos: los paños viven en la nube (cuaderno/main)
  // y sin esto no se cargarían hasta abrir el módulo Cuaderno de Campo.
  try{ if((typeof FB==='undefined' || !FB.ready) && typeof fbInit==='function'){ fbInit(); } }catch(e){}
  // Cargar conteos del cache
  if(!STATE.cache.conteos){ try{ STATE.cache.conteos = await dbAll('conteos'); }catch(e){ STATE.cache.conteos=[]; } }
  // Cargar estimaciones guardadas (hoja de estimación propia)
  if(!STATE.cache.estimaciones){ try{ STATE.cache.estimaciones = await dbAll('estimaciones'); }catch(e){ STATE.cache.estimaciones=[]; } }
  cteRender(c);
}

function cteRender(c){
  var cont = c || document.getElementById('mainContent'); if(!cont) return;
  // Estilos del módulo (botones grandes, móvil)
  var estilos = '<style>'+
    '.cte-wrap{max-width:560px;margin:0 auto;padding:8px 4px}'+
    '.cte-big-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:20px;font-size:18px;font-weight:700;border:none;border-radius:14px;cursor:pointer;margin-bottom:12px;box-shadow:0 2px 6px rgba(0,0,0,.12);transition:.1s}'+
    '.cte-row-btn{display:flex;align-items:center;justify-content:center;gap:6px;flex:1;padding:13px 10px;font-size:14px;font-weight:700;border:none;border-radius:12px;cursor:pointer;margin-bottom:12px;box-shadow:0 2px 6px rgba(0,0,0,.1);color:#fff}'+
    '.cte-big-btn:active{transform:scale(.98)}'+
    '.cte-btn-primary{background:#0a6ed1;color:#fff}'+
    '.cte-btn-green{background:#1a7e3e;color:#fff}'+
    '.cte-btn-gray{background:#fff;color:#333;border:2px solid #d9d9d9}'+
    '.cte-btn-amber{background:#e9730c;color:#fff}'+
    '.cte-field{margin-bottom:14px}'+
    '.cte-field label{display:block;font-size:13px;font-weight:700;color:#444;margin-bottom:6px}'+
    '.cte-field select,.cte-field input{width:100%;padding:14px;font-size:17px;border:2px solid #d9d9d9;border-radius:10px;background:#fff}'+
    '.cte-counter{display:flex;align-items:center;justify-content:center;gap:16px;margin:18px 0}'+
    '.cte-counter button{width:72px;height:72px;border-radius:50%;border:none;font-size:32px;font-weight:700;cursor:pointer;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,.2)}'+
    '.cte-counter .minus{background:#c0392b}.cte-counter .plus{background:#1a7e3e}'+
    '.cte-counter .val{font-size:54px;font-weight:800;min-width:120px;text-align:center;color:#23303d}'+
    '.cte-card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:16px;margin-bottom:12px}'+
    '.cte-sync-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:10px;font-size:13px;font-weight:600;margin-bottom:12px}'+
    '.cte-arbol-row{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #eee;font-size:15px}'+
    '</style>';

  var online = navigator.onLine;
  var pend = (STATE.cache.conteos||[]).filter(function(x){ return !x.sincronizado; }).length;
  var syncBar = '<div class="cte-sync-bar" style="background:'+(online?'#d1f0d8':'#fde8c8')+';color:'+(online?'#0a6e2e':'#7a4200')+'">'+
    (online?'🟢 Con conexión':'🔴 Sin conexión (modo terreno)')+
    (pend>0?(' · '+pend+' registro(s) por subir'):' · todo sincronizado')+
    '</div>';

  var html = estilos + '<div class="cte-wrap">' + syncBar;

  if(_cteVista==='sesion' && _cteSesion){
    html += cteRenderSesion();
  } else if(_cteVista==='lista'){
    html += cteRenderLista();
  } else if(_cteVista==='estim'){
    html += cteRenderEstim();
  } else if(_cteVista==='estimVer' && _cteEstimActual){
    html += cteRenderEstimVer();
  } else {
    html += cteRenderInicio();
  }
  html += '</div>';
  cont.innerHTML = html;
}

function cteRenderInicio(){
  var vars = cteVariedades();
  var pend = (STATE.cache.conteos||[]).filter(function(x){ return !x.sincronizado; }).length;
  var esSoloConteos = STATE.user && STATE.user.role==='opconteos';
  var header = esSoloConteos ? ('<div style="display:flex;justify-content:space-between;align-items:center;background:#354a5f;color:#fff;padding:12px 16px;border-radius:0 0 12px 12px;margin-bottom:12px">'+
      '<div><div style="font-size:15px;font-weight:800">🌸 Conteo de centros</div><div style="font-size:11px;opacity:.8">'+escapeHtml(STATE.user.nombre||'')+'</div></div>'+
      '<button onclick="logout()" style="background:rgba(255,255,255,.2);border:none;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Salir</button>'+
    '</div>') : '';
  return header+'<div class="cte-card">'+
      '<div style="font-size:20px;font-weight:800;color:#23303d;margin-bottom:4px">🌸 Conteo de centros florales</div>'+
      '<div style="font-size:13px;color:#777;margin-bottom:16px">Seleccione el paño y cuente los árboles. Funciona sin internet.</div>'+
      '<div class="cte-field"><label>Variedad</label><select id="cte-var" onchange="cteSetVariedad(this.value)">'+
        '<option value="">— Todas —</option>'+vars.map(function(v){return '<option '+(_cteVarFiltro===v?'selected':'')+'>'+escapeHtml(v)+'</option>';}).join('')+
      '</select></div>'+
      '<div class="cte-field"><label>Paño</label><select id="cte-pano">'+
        '<option value="">— Seleccione paño —</option>'+
        ctePanos().filter(function(p){ return !_cteVarFiltro || p.variedad===_cteVarFiltro; }).map(function(p){
          return '<option value="'+p.id+'">'+escapeHtml(p.nombre)+' ('+escapeHtml(p.variedad||'')+')</option>';
        }).join('')+
      '</select></div>'+
      '<div class="cte-field"><label>Etapa fenológica</label><select id="cte-etapa">'+
        CTE_ETAPAS.map(function(e){return '<option value="'+escapeHtml(e)+'">'+escapeHtml(e)+'</option>';}).join('')+
      '</select></div>'+
      '<div style="font-size:12px;color:#888;margin-bottom:10px">Se cuentan '+CTE_N_FIJOS+' árboles fijos (representativos) + '+CTE_N_ALEATORIOS+' al azar = '+(CTE_N_FIJOS+CTE_N_ALEATORIOS)+' árboles.</div>'+
      '<button class="cte-big-btn cte-btn-green" onclick="cteIniciarSesion()">▶️ Iniciar conteo</button>'+
    '</div>'+
    '<div style="display:flex;gap:8px">'+
      '<button class="cte-row-btn cte-btn-gray" onclick="cteVerLista()">📋 Registros'+(pend>0?(' ('+pend+')'):'')+'</button>'+
      (navigator.onLine?'<button class="cte-row-btn cte-btn-primary" onclick="cteSincronizar()">☁️ Subir a la nube</button>':'')+
    '</div>';
}



// ── Iniciar sesión de conteo ──
function cteIniciarSesion(){
  var sel = document.getElementById('cte-pano');
  var panoId = sel ? sel.value : '';
  if(!panoId){ toast('Falta paño','Seleccione un paño antes de iniciar','error'); return; }
  var pano = ctePanos().find(function(p){ return String(p.id)===String(panoId); });
  if(!pano){ toast('Error','Paño no encontrado','error'); return; }
  _ctePanoSel = pano;
  var etapaSel = document.getElementById('cte-etapa');
  _cteEtapa = etapaSel ? etapaSel.value : '';
  _cteTipoArbol = null;
  _cteSesion = {
    id: uid(),
    panoId: pano.id,
    panoNombre: pano.nombre,
    variedad: pano.variedad||'',
    especie: 'Cerezo',
    etapa: _cteEtapa,
    fijosCodigos: (pano.fijos && pano.fijos.length) ? pano.fijos.slice() : ['F1','F2','F3'],
    fechaInicio: new Date().toISOString(),
    usuario: STATE.user ? (STATE.user.nombre||STATE.user.id) : '',
    arboles: [],   // {n, centros, tipo, codigo, lat, lng, fecha}
    sincronizado: false
  };
  _cteVista = 'sesion';
  cteRender();
}

function cteRenderSesion(){
  var s = _cteSesion;
  var nArboles = s.arboles.length;
  var sumC = s.arboles.reduce(function(a,x){ return a+(parseFloat(x.centros)||0); },0);
  var prom = nArboles ? (sumC/nArboles) : 0;
  var numActual = nArboles + 1;
  // Conteo de fijos y aleatorios ya registrados
  var nFijos = s.arboles.filter(function(a){return a.tipo==='fijo';}).length;
  var nAzar = s.arboles.filter(function(a){return a.tipo==='aleatorio';}).length;
  // Sugerir tipo: primero completar fijos, luego aleatorios
  var sugerido;
  if(nFijos < CTE_N_FIJOS){ sugerido='fijo'; }
  else if(nAzar < CTE_N_ALEATORIOS){ sugerido='aleatorio'; }
  else { sugerido='aleatorio'; }
  var tipoActivo = _cteTipoArbol || sugerido;
  var codigoActual = tipoActivo==='fijo' ? ((s.fijosCodigos&&s.fijosCodigos[nFijos])||('F'+(nFijos+1))) : ('Azar '+(nAzar+1));

  return '<div class="cte-card" style="background:#eef6ff;border-color:#bcd9f5">'+
      '<div style="font-size:13px;color:#0854a0;font-weight:700">PAÑO EN CONTEO</div>'+
      '<div style="font-size:22px;font-weight:800;color:#23303d">'+escapeHtml(s.panoNombre)+'</div>'+
      '<div style="font-size:14px;color:#666">'+escapeHtml(s.variedad)+(s.etapa?(' · '+escapeHtml(s.etapa)):'')+'</div>'+
      '<div style="font-size:11px;color:#0854a0;margin-top:3px">Fijos: '+nFijos+'/'+CTE_N_FIJOS+' · Al azar: '+nAzar+'/'+CTE_N_ALEATORIOS+' · Total: '+nArboles+'</div>'+
    '</div>'+
    '<div class="cte-card">'+
      '<div style="display:flex;gap:8px;margin-bottom:12px">'+
        '<button onclick="cteSetTipo(\'fijo\')" style="flex:1;padding:11px;border-radius:10px;border:2px solid '+(tipoActivo==='fijo'?'#0a6ed1':'#d9d9d9')+';background:'+(tipoActivo==='fijo'?'#f0f7ff':'#fff')+';font-weight:700;font-size:13px;cursor:pointer;color:#0a6ed1">📍 Fijo ('+nFijos+'/'+CTE_N_FIJOS+')</button>'+
        '<button onclick="cteSetTipo(\'aleatorio\')" style="flex:1;padding:11px;border-radius:10px;border:2px solid '+(tipoActivo==='aleatorio'?'#e9730c':'#d9d9d9')+';background:'+(tipoActivo==='aleatorio'?'#fff7ef':'#fff')+';font-weight:700;font-size:13px;cursor:pointer;color:#e9730c">🎲 Al azar ('+nAzar+'/'+CTE_N_ALEATORIOS+')</button>'+
      '</div>'+
      '<div style="text-align:center;font-size:15px;font-weight:700;color:#444">🌳 Árbol N° '+numActual+' · <span style="color:'+(tipoActivo==='fijo'?'#0a6ed1':'#e9730c')+'">'+escapeHtml(codigoActual)+'</span></div>'+
      '<div style="text-align:center;font-size:13px;color:#888;margin-bottom:4px">Centros florales</div>'+
      '<div class="cte-counter">'+
        '<button class="minus" onclick="cteAjustar(-1)">−</button>'+
        '<div class="val" id="cte-val">0</div>'+
        '<button class="plus" onclick="cteAjustar(1)">+</button>'+
      '</div>'+
      '<input type="number" id="cte-centros-input" inputmode="numeric" value="0" onchange="cteSetVal(this.value)" style="width:100%;padding:12px;font-size:18px;text-align:center;border:2px solid #d9d9d9;border-radius:10px;margin-bottom:14px">'+
      '<button class="cte-big-btn cte-btn-green" onclick="cteGuardarArbol()">✓ Guardar árbol y siguiente</button>'+
      '<div id="cte-gps-status" style="font-size:12px;color:#888;text-align:center;margin-top:4px">📍 GPS: se captura al guardar</div>'+
    '</div>'+
    (nArboles>0?'<div class="cte-card">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
        '<div style="font-weight:700;color:#23303d">Árboles contados</div>'+
        '<div style="background:#0a6ed1;color:#fff;padding:4px 12px;border-radius:12px;font-size:14px;font-weight:700">Prom: '+prom.toFixed(1)+'</div>'+
      '</div>'+
      s.arboles.map(function(a,i){
        var et = a.tipo==='fijo'?'#0a6ed1':'#e9730c';
        return '<div class="cte-arbol-row"><span><span style="color:'+et+';font-weight:700">'+escapeHtml(a.codigo||('Árbol '+a.n))+'</span></span><span style="font-weight:700">'+a.centros+' centros'+(a.lat?' 📍':'')+'</span>'+
          '<button onclick="cteEliminarArbol('+i+')" style="background:none;border:none;color:#c0392b;font-size:18px;cursor:pointer">✕</button></div>';
      }).join('')+
    '</div>':'')+
    '<button class="cte-big-btn cte-btn-primary" onclick="cteFinalizarSesion()">🏁 Finalizar y guardar sesión</button>'+
    '<button class="cte-big-btn cte-btn-gray" onclick="cteCancelarSesion()">Cancelar</button>';
}
function cteSetTipo(t){ _cteTipoArbol=t; cteRender(); }

var _cteValActual = 0;
function cteAjustar(d){
  _cteValActual = Math.max(0, _cteValActual + d);
  var v=document.getElementById('cte-val'); if(v) v.textContent=_cteValActual;
  var inp=document.getElementById('cte-centros-input'); if(inp) inp.value=_cteValActual;
}
function cteSetVal(val){
  _cteValActual = Math.max(0, parseInt(val)||0);
  var v=document.getElementById('cte-val'); if(v) v.textContent=_cteValActual;
}

function cteGuardarArbol(){
  var centros = _cteValActual;
  if(centros<=0){ toast('Sin valor','Ingrese los centros florales del árbol','error'); return; }
  var n = _cteSesion.arboles.length + 1;
  // Determinar tipo y código según lo ya contado
  var nFijos = _cteSesion.arboles.filter(function(a){return a.tipo==='fijo';}).length;
  var nAzar = _cteSesion.arboles.filter(function(a){return a.tipo==='aleatorio';}).length;
  var tipo = _cteTipoArbol;
  if(!tipo){ tipo = nFijos<CTE_N_FIJOS ? 'fijo' : 'aleatorio'; }
  var codigo = tipo==='fijo' ? ((_cteSesion.fijosCodigos&&_cteSesion.fijosCodigos[nFijos])||('F'+(nFijos+1))) : ('Azar '+(nAzar+1));
  var registro = { n:n, centros:centros, tipo:tipo, codigo:codigo, lat:null, lng:null, fecha:new Date().toISOString() };
  var gpsEl = document.getElementById('cte-gps-status');
  if(!navigator.geolocation){
    if(gpsEl) gpsEl.textContent='📍 Este dispositivo no soporta GPS';
    _cteFinalizarArbol(registro);
    return;
  }
  // Verificar contexto seguro (la geolocalización requiere HTTPS, salvo en localhost)
  var contextoSeguro = (window.isSecureContext===true) || location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1';
  if(!contextoSeguro){
    if(gpsEl) gpsEl.innerHTML='<span style="color:#c0392b">⚠️ El GPS requiere conexión segura (https). En Netlify funcionará; abriendo el archivo local no.</span>';
    _cteFinalizarArbol(registro);
    return;
  }
  if(gpsEl) gpsEl.textContent='📍 Obteniendo ubicación... (espere)';
  // Bloquear doble toque mientras captura
  navigator.geolocation.getCurrentPosition(function(pos){
    registro.lat = pos.coords.latitude;
    registro.lng = pos.coords.longitude;
    registro.precision = pos.coords.accuracy;
    _cteFinalizarArbol(registro);
  }, function(err){
    var msg = 'sin ubicación';
    if(err){
      if(err.code===1) msg='permiso de ubicación denegado';
      else if(err.code===2) msg='señal GPS no disponible';
      else if(err.code===3) msg='tiempo de espera agotado';
    }
    if(gpsEl) gpsEl.innerHTML='<span style="color:#e9730c">📍 Guardado sin GPS ('+msg+')</span>';
    if(typeof toast==='function') toast('Sin GPS','Árbol guardado, pero '+msg,'warning');
    _cteFinalizarArbol(registro);
  }, { timeout:15000, enableHighAccuracy:true, maximumAge:0 });
}
function _cteFinalizarArbol(registro){
  _cteSesion.arboles.push(registro);
  _cteValActual = 0;
  _cteTipoArbol = null;
  cteRender();
  if(typeof toast==='function' && registro.lat) toast('Árbol guardado','Árbol N° '+registro.n+' con GPS ✓','success');
  else if(typeof toast==='function' && !registro.lat) {} // ya se avisó el motivo
}

function cteEliminarArbol(i){
  _cteSesion.arboles.splice(i,1);
  // Renumerar
  _cteSesion.arboles.forEach(function(a,idx){ a.n=idx+1; });
  cteRender();
}

async function cteFinalizarSesion(){
  if(!_cteSesion.arboles.length){ toast('Sin árboles','Cuente al menos un árbol antes de finalizar','error'); return; }
  _cteSesion.fechaFin = new Date().toISOString();
  var sumC = _cteSesion.arboles.reduce(function(a,x){ return a+(parseFloat(x.centros)||0); },0);
  _cteSesion.promedioCentros = sumC / _cteSesion.arboles.length;
  _cteSesion.nArboles = _cteSesion.arboles.length;
  // Si hay internet al finalizar, se marca como sincronizado (sube a la nube al guardar)
  var online = navigator.onLine;
  _cteSesion.sincronizado = online;
  if(online) _cteSesion.fechaSync = new Date().toISOString();
  // Guardar local SIEMPRE (offline-first). dbPut sincroniza a Firebase si hay conexión.
  // Blindaje para terreno: garantizar id, y si el guardado falla, reintentar y
  // NUNCA perder el conteo en silencio.
  if(!_cteSesion.id){ try{ _cteSesion.id = uid(); }catch(e){ _cteSesion.id = 'cte_'+Date.now()+'_'+Math.random().toString(36).slice(2); } }
  var _guardadoOk = false;
  for(var _intento=0; _intento<2 && !_guardadoOk; _intento++){
    try{
      await dbPut('conteos', _cteSesion);
      STATE.cache.conteos = await dbAll('conteos');
      _guardadoOk = true;
    }catch(e){
      console.error('Error guardando conteo (intento '+(_intento+1)+'):', e);
      if(_intento===0){ try{ _cteSesion.id = (_cteSesion.id||'cte')+'_r'+Date.now(); }catch(_){} }
    }
  }
  if(!_guardadoOk){
    // Último recurso: avisar fuerte y conservar la sesión en memoria para que el
    // operador pueda reintentar (no se borra _cteSesion).
    if(typeof confirmDialog==='function'){
      confirmDialog('⚠️ No se pudo guardar','El conteo NO se guardó en el dispositivo. Anote los datos y reintente. ¿Reintentar ahora?', function(){ cteFinalizarSesion(); }, 'Reintentar', true);
    } else {
      toast('Error','No se pudo guardar el conteo. No cierre la app, reintente.','error');
    }
    return;
  }
  var prom = _cteSesion.promedioCentros.toFixed(1);
  var nA = _cteSesion.nArboles;
  _cteSesion = null; _cteVista='inicio';
  cteRender();
  if(online){
    toast('Sesión guardada y subida', nA+' árbol(es) · promedio '+prom+' centros. Registro enviado a la nube.','success');
  } else {
    toast('Sesión guardada (sin conexión)', nA+' árbol(es) · promedio '+prom+'. Quedó en el teléfono; súbala manualmente cuando tenga internet.','success');
  }
}

function cteCancelarSesion(){
  confirmDialog('Cancelar conteo','¿Descartar el conteo en curso? Se perderán los árboles no guardados.',function(){
    _cteSesion=null; _cteVista='inicio'; cteRender();
  },'Descartar',true);
}
function cteVerLista(){ _cteVista='lista'; cteRender(); }
function cteVolverInicio(){ _cteVista='inicio'; cteRender(); }
function cteVerEstim(){ _cteVista='estim'; cteRender(); }


// ── Lista de sesiones guardadas ──
function cteRenderLista(){
  var sesiones = (STATE.cache.conteos||[]).slice().sort(function(a,b){ return (b.fechaInicio||'').localeCompare(a.fechaInicio||''); });
  var html = '<button class="cte-big-btn cte-btn-gray" onclick="cteVolverInicio()" style="padding:14px;font-size:16px">‹ Volver</button>';
  if(can('conteos.revisar')){
    html += '<button class="cte-big-btn cte-btn-primary" onclick="cteVerEstim()">📈 Estimación de producción</button>';
  }
  if(can('conteos.revisar') && sesiones.length){
    html += '<button class="cte-big-btn cte-btn-amber" onclick="cteExportarExcel()">📊 Exportar registros a Excel</button>';
  }
  if(!sesiones.length){
    html += '<div class="cte-card" style="text-align:center;color:#999;padding:30px">Sin conteos guardados todavía.</div>';
    return html;
  }
  html += sesiones.map(function(s){
    var fecha = (s.fechaInicio||'').slice(0,10);
    var hora = (s.fechaInicio||'').slice(11,16);
    var sync = s.sincronizado ? '<span style="color:#0a6e2e;font-weight:700">☁️ Subido</span>' : '<span style="color:#e9730c;font-weight:700">📱 Local</span>';
    // Buscar la primera ubicación GPS disponible entre los árboles de la sesión
    var arbolGps = (s.arboles||[]).find(function(a){ return a.lat!=null && a.lng!=null; });
    var conGps = (s.arboles||[]).filter(function(a){ return a.lat!=null && a.lng!=null; }).length;
    var gpsHtml = '';
    if(arbolGps){
      var lat = arbolGps.lat.toFixed(6), lng = arbolGps.lng.toFixed(6);
      gpsHtml = '<div style="margin-top:10px;padding:10px;background:#f0f7ff;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:8px">'+
        '<div style="font-size:12px;color:#666"><span style="color:#888">📍 Georreferencia</span><br>'+lat+', '+lng+(conGps>1?(' <span style="color:#888">('+conGps+' puntos)</span>'):'')+'</div>'+
        '<button onclick="cteAbrirMapa('+arbolGps.lat+','+arbolGps.lng+')" style="padding:10px 14px;background:#0a6ed1;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">🗺️ Ver en mapa</button>'+
      '</div>';
    } else {
      gpsHtml = '<div style="margin-top:10px;font-size:12px;color:#aaa">📍 Sin georreferencia capturada</div>';
    }
    return '<div class="cte-card">'+
      '<div style="display:flex;justify-content:space-between;align-items:start">'+
        '<div><div style="font-size:17px;font-weight:800;color:#23303d">'+escapeHtml(s.panoNombre||'')+'</div>'+
          '<div style="font-size:13px;color:#666">'+escapeHtml(s.variedad||'')+' · '+fecha+' '+hora+'</div></div>'+
        '<div style="text-align:right;font-size:12px">'+sync+(s.aplicadoEstim?'<br><span style="color:#1a7e3e;font-weight:700">📈 Aplicado</span>':'')+'</div>'+
      '</div>'+
      '<div style="display:flex;gap:16px;margin-top:10px;font-size:14px">'+
        '<div><span style="color:#888">Árboles:</span> <strong>'+(s.nArboles||s.arboles.length)+'</strong></div>'+
        '<div><span style="color:#888">Prom. centros:</span> <strong style="color:#0a6ed1">'+(s.promedioCentros!=null?s.promedioCentros.toFixed(1):'-')+'</strong></div>'+
      '</div>'+
      gpsHtml+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
        (can('conteos.revisar')?'<button onclick="cteAplicarEstimacion(\''+s.id+'\')" style="flex:1;padding:12px;background:#1a7e3e;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">📈 Aplicar a estimación</button>':'')+
        '<button onclick="cteEliminarSesion(\''+s.id+'\')" style="padding:12px 16px;background:#fff;color:#c0392b;border:2px solid #f0b8b8;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">🗑️</button>'+
      '</div>'+
    '</div>';
  }).join('');
  return html;
}

// Abrir una ubicación en Google Maps (nueva pestaña / app)
function cteAbrirMapa(lat, lng){
  var url = 'https://www.google.com/maps/search/?api=1&query='+lat+','+lng;
  window.open(url, '_blank');
}

// ── Exportar registros a Excel (solo con permiso de revisión) ──
function cteExportarExcel(){
  if(!can('conteos.revisar')){ toast('Sin permiso','No tiene permiso para exportar','error'); return; }
  if(typeof XLSX==='undefined'){ toast('Sin librería','Excel no disponible','error'); return; }
  var sesiones = STATE.cache.conteos||[];
  if(!sesiones.length){ toast('Sin datos','No hay conteos para exportar','error'); return; }
  // Hoja resumen por sesión
  var resumen=[['Paño','Variedad','Especie','Fecha','Usuario','N° árboles','Promedio centros','Estado','Aplicado a estimación']];
  sesiones.forEach(function(s){
    resumen.push([s.panoNombre||'', s.variedad||'', s.especie||'Cerezo', (s.fechaInicio||'').slice(0,10),
      s.usuario||'', s.nArboles||(s.arboles?s.arboles.length:0),
      s.promedioCentros!=null?Number(s.promedioCentros.toFixed(2)):'',
      s.sincronizado?'Subido':'Local', s.aplicadoEstim?'SÍ':'NO']);
  });
  // Hoja detalle por árbol (con GPS)
  var detalle=[['Paño','Variedad','Fecha','N° árbol','Centros florales','Latitud','Longitud']];
  sesiones.forEach(function(s){
    (s.arboles||[]).forEach(function(a){
      detalle.push([s.panoNombre||'', s.variedad||'', (a.fecha||'').slice(0,10), a.n, a.centros,
        a.lat!=null?a.lat:'', a.lng!=null?a.lng:'']);
    });
  });
  var wb=XLSX.utils.book_new();
  var ws1=XLSX.utils.aoa_to_sheet(resumen);
  ws1['!cols']=[{wch:18},{wch:14},{wch:10},{wch:12},{wch:18},{wch:11},{wch:15},{wch:10},{wch:18}];
  var ws2=XLSX.utils.aoa_to_sheet(detalle);
  ws2['!cols']=[{wch:18},{wch:14},{wch:12},{wch:9},{wch:15},{wch:14},{wch:14}];
  XLSX.utils.book_append_sheet(wb,ws1,'Resumen conteos');
  XLSX.utils.book_append_sheet(wb,ws2,'Detalle por árbol');
  XLSX.writeFile(wb,'Conteos_Centros_Florales_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('Exportado','Archivo Excel generado','success');
}

// ── Sincronizar (subir a la nube) ──
async function cteSincronizar(){
  if(!navigator.onLine){ toast('Sin conexión','Conéctese a internet para subir los registros','error'); return; }
  var pend = (STATE.cache.conteos||[]).filter(function(x){ return !x.sincronizado; });
  if(!pend.length){ toast('Todo al día','No hay registros pendientes de subir','info'); return; }
  var n=0;
  for(var i=0;i<pend.length;i++){
    pend[i].sincronizado = true;
    pend[i].fechaSync = new Date().toISOString();
    try{ await dbPut('conteos', pend[i]); n++; }catch(e){ console.error(e); }
  }
  STATE.cache.conteos = await dbAll('conteos');
  cteRender();
  toast('Registros subidos', n+' conteo(s) sincronizados con la nube','success');
}

// ── Aplicar el promedio a la Estimación de Producción del paño ──
// ════════ HOJA DE ESTIMACIÓN PROPIA DEL MÓDULO DE CONTEOS EN TERRENO ════════
// Promedio de centros florales de un paño, calculado desde todos los conteos guardados de ese paño
function ctePromedioCentrosPano(panoId){
  var conteos = (STATE.cache.conteos||[]).filter(function(c){ return String(c.panoId)===String(panoId) && c.promedioCentros!=null; });
  if(!conteos.length) return null;
  var suma = conteos.reduce(function(a,c){ return a+(parseFloat(c.promedioCentros)||0); }, 0);
  return suma / conteos.length;
}

// Lista de versiones de estimación guardadas
function cteRenderEstim(){
  var ess = (STATE.cache.estimaciones||[]).slice().sort(function(a,b){ return (b.fecha||'').localeCompare(a.fecha||''); });
  var html = '<button class="cte-big-btn cte-btn-gray" onclick="cteVerLista()" style="padding:14px;font-size:16px">‹ Volver</button>'+
    '<button class="cte-big-btn cte-btn-green" onclick="cteNuevaEstim()">+ Nueva estimación</button>';
  if(!ess.length){
    html += '<div class="cte-card" style="text-align:center;color:#999;padding:24px">Sin estimaciones guardadas. Cree una nueva: tomará los promedios de los conteos registrados.</div>';
    return html;
  }
  html += '<div style="font-weight:800;color:#23303d;margin:8px 0">Versiones guardadas ('+ess.length+')</div>';
  html += ess.map(function(e){
    return '<div class="cte-card">'+
      '<div style="display:flex;justify-content:space-between;align-items:start">'+
        '<div><div style="font-size:16px;font-weight:800;color:#23303d">'+escapeHtml(e.nombre)+'</div>'+
          '<div style="font-size:12px;color:#666">'+(e.fecha||'').slice(0,10)+' · '+escapeHtml(e.usuario||'')+'</div></div>'+
        '<div style="text-align:right"><div style="font-size:18px;font-weight:800;color:#0a6ed1">'+(e.totalKg!=null?Math.round(e.totalKg).toLocaleString('es-CL'):'-')+'</div><div style="font-size:11px;color:#888">kg total</div></div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;margin-top:10px">'+
        '<button class="cte-big-btn cte-btn-primary" style="flex:1;margin:0" onclick="cteVerEstimDetalle(\''+e.id+'\')">Ver detalle</button>'+
        (can('conteos.revisar')?'<button class="cte-big-btn cte-btn-gray" style="margin:0;max-width:60px" onclick="cteEliminarEstim(\''+e.id+'\')">🗑️</button>':'')+
      '</div>'+
    '</div>';
  }).join('');
  return html;
}

// Calcula el N° de plantas "productivas equivalentes" de un paño, ponderando por estado
// usando el inventario de huerto y los % configurados en el Cuaderno.
// Devuelve {equiv, total, desglose} o null si no hay inventario para ese paño.
function ctePlantasProductivas(pano){
  var regs = (STATE.cache.invplantas)||[];
  function norm(x){ return (x||'').toString().trim().toLowerCase(); }
  // Hileras del inventario que corresponden a este paño (mismo cuartel-nombre + variedad)
  var hileras = regs.filter(function(r){
    return norm(r.cuartel)===norm(pano.nombre) && norm(r.variedad)===norm(pano.variedad);
  });
  if(!hileras.length) return null;
  var pct = getProdPorEstado(pano);
  var conteo = { sano:0, debil:0, muerto:0, replante:0, falta:0 };
  var total = 0;
  hileras.forEach(function(h){
    (h.plantas||[]).forEach(function(p){
      var est = p.estado || 'sano';
      if(conteo[est]===undefined) conteo[est]=0;
      conteo[est]++; total++;
    });
  });
  if(!total) return null;
  var equiv = 0;
  Object.keys(conteo).forEach(function(est){
    var factor = (pct[est]!=null ? pct[est] : 100)/100;
    equiv += conteo[est]*factor;
  });
  return { equiv: Math.round(equiv*10)/10, total: total, desglose: conteo };
}

// Crear nueva estimación: precarga centros desde el promedio de conteos de cada paño
function cteNuevaEstim(){
  var panos = ctePanos();
  var lineas = panos.map(function(p){
    var centros = ctePromedioCentrosPano(p.id);
    var prod = ctePlantasProductivas(p);  // equivalente ponderado por estado (si hay inventario)
    var plantasBase = p.plantas || p.nPlantas || 0;
    return {
      panoId:p.id, panoNombre:p.nombre, variedad:p.variedad||'',
      plantas: plantasBase,
      plantasEquiv: prod ? prod.equiv : null,     // plantas productivas equivalentes
      plantasInvTotal: prod ? prod.total : null,  // total contado en inventario de huerto
      usarEquiv: prod ? true : false,             // si hay inventario, usar el equivalente
      centros: centros!=null ? Number(centros.toFixed(1)) : 0,
      tieneCont: centros!=null,
      frutosCentro: 2,
      kgFruto: 0.011
    };
  });
  _cteEstimActual = {
    id: uid(),
    nombre: 'Estimación '+new Date().toLocaleDateString('es-CL'),
    fecha: new Date().toISOString(),
    usuario: STATE.user ? (STATE.user.nombre||STATE.user.id) : '',
    lineas: lineas
  };
  _cteVista='estimVer'; cteRender();
}

// Detalle / edición de una estimación con cálculo de kg
function cteRenderEstimVer(){
  var e=_cteEstimActual;
  var totalKg=0, totalCajas=0;
  e.lineas.forEach(function(l){
    var nPlantas = (l.usarEquiv && l.plantasEquiv!=null) ? l.plantasEquiv : (l.plantas||0);
    l.plantasUsadas = nPlantas;
    l.kgPano = (l.centros||0)*(l.frutosCentro||0)*(l.kgFruto||0)*nPlantas;
    totalKg += l.kgPano;
  });
  totalCajas = totalKg/5;

  var html='<button class="cte-big-btn cte-btn-gray" onclick="cteVerEstim()" style="padding:14px;font-size:16px">‹ Volver a versiones</button>'+
    '<div class="cte-card">'+
      '<div class="cte-field"><label>Nombre de la versión</label><input type="text" id="cte-es-nombre" value="'+escapeHtml(e.nombre)+'" style="width:100%;padding:10px;border:1px solid #d9d9d9;border-radius:8px"></div>'+
      '<div style="font-size:12px;color:#888">Fórmula: centros florales × frutos/centro × kg/fruto × N° plantas. Los centros vienen del promedio de los conteos; ajuste los demás valores.</div>'+
    '</div>';

  e.lineas.forEach(function(l,i){
    var infoEquiv = '';
    if(l.plantasEquiv!=null){
      infoEquiv = '<div style="font-size:11px;color:#0854a0;background:#f0f7ff;border:1px solid #cfe2f5;border-radius:6px;padding:6px 8px;margin-bottom:8px">'+
        '🌳 Inventario: '+(l.plantasInvTotal||0).toLocaleString('es-CL')+' plantas · productivas equivalentes (según % por estado): <strong>'+l.plantasEquiv.toLocaleString('es-CL')+'</strong>'+
        '<label style="display:flex;align-items:center;gap:6px;margin-top:5px;cursor:pointer;color:#333"><input type="checkbox" '+(l.usarEquiv?'checked':'')+' onchange="cteEstimToggleEquiv('+i+',this.checked)"> Usar plantas productivas equivalentes en el cálculo</label>'+
      '</div>';
    }
    var plantasMostrar = (l.usarEquiv && l.plantasEquiv!=null) ? l.plantasEquiv : (l.plantas||0);
    var plantasEditable = !(l.usarEquiv && l.plantasEquiv!=null);
    html+='<div class="cte-card">'+
      '<div style="font-weight:800;color:#23303d;margin-bottom:2px">'+escapeHtml(l.panoNombre)+' <span style="font-size:12px;font-weight:400;color:#888">· '+escapeHtml(l.variedad)+'</span></div>'+
      '<div style="font-size:11px;color:'+(l.tieneCont?'#0a6e2e':'#c0392b')+';margin-bottom:8px">'+(l.tieneCont?'✓ Centros desde conteos':'⚠ Sin conteos: ingrese centros manualmente')+'</div>'+
      infoEquiv+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:7px">'+
        '<div><label style="font-size:10px;color:#888;font-weight:700">CENTROS FLORALES</label><input type="number" step="any" value="'+(l.centros||0)+'" onchange="cteEstimSet('+i+',\'centros\',this.value)" style="width:100%;padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px"></div>'+
        '<div><label style="font-size:10px;color:#888;font-weight:700">FRUTOS/CENTRO</label><input type="number" step="any" value="'+(l.frutosCentro||0)+'" onchange="cteEstimSet('+i+',\'frutosCentro\',this.value)" style="width:100%;padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px"></div>'+
        '<div><label style="font-size:10px;color:#888;font-weight:700">KG/FRUTO</label><input type="number" step="any" value="'+(l.kgFruto||0)+'" onchange="cteEstimSet('+i+',\'kgFruto\',this.value)" style="width:100%;padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px"></div>'+
        '<div><label style="font-size:10px;color:#888;font-weight:700">N° PLANTAS'+(plantasEditable?'':' (equiv.)')+'</label><input type="number" value="'+plantasMostrar+'" '+(plantasEditable?'':'readonly style="background:#f0f7ff;"')+' onchange="cteEstimSet('+i+',\'plantas\',this.value)" style="width:100%;padding:8px;border:1px solid #d9d9d9;border-radius:6px;font-size:14px'+(plantasEditable?'':';color:#0854a0;font-weight:700')+'"></div>'+
      '</div>'+
      '<div style="margin-top:8px;text-align:right;font-size:14px"><span style="color:#888">kg paño:</span> <strong style="color:#0a6ed1;font-size:17px">'+Math.round(l.kgPano).toLocaleString('es-CL')+'</strong></div>'+
    '</div>';
  });

  html+='<div class="cte-card" style="background:#354a5f;color:#fff">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-size:13px;opacity:.85">PRODUCCIÓN ESTIMADA TOTAL</div>'+
          '<div style="font-size:11px;opacity:.7">'+Math.round(totalCajas).toLocaleString('es-CL')+' cajas de 5 kg · '+(totalKg/1000).toFixed(1)+' toneladas</div></div>'+
        '<div style="font-size:26px;font-weight:800">'+Math.round(totalKg).toLocaleString('es-CL')+'<span style="font-size:14px;font-weight:400"> kg</span></div>'+
      '</div>'+
    '</div>'+
    (can('conteos.revisar')?'<button class="cte-big-btn cte-btn-green" onclick="cteGuardarEstim()">💾 Guardar versión</button>':'')+
    '<button class="cte-big-btn cte-btn-amber" onclick="cteExportarEstim()">📊 Exportar a Excel</button>';
  return html;
}

function cteEstimSet(i, campo, val){
  if(!_cteEstimActual||!_cteEstimActual.lineas[i]) return;
  _cteEstimActual.lineas[i][campo] = parseFloat(val)||0;
  cteRender();
}
function cteEstimToggleEquiv(i, usar){
  if(!_cteEstimActual||!_cteEstimActual.lineas[i]) return;
  _cteEstimActual.lineas[i].usarEquiv = !!usar;
  cteRender();
}

async function cteGuardarEstim(){
  var e=_cteEstimActual;
  var inp=document.getElementById('cte-es-nombre');
  e.nombre = (inp && inp.value ? inp.value.trim() : '') || e.nombre;
  var totalKg=0;
  e.lineas.forEach(function(l){ l.kgPano=(l.centros||0)*(l.frutosCentro||0)*(l.kgFruto||0)*(l.plantas||0); totalKg+=l.kgPano; });
  e.totalKg = totalKg;
  e.modificado = new Date().toISOString();
  if(!STATE.cache.estimaciones) STATE.cache.estimaciones=[];
  var idx = STATE.cache.estimaciones.findIndex(function(x){return x.id===e.id;});
  if(idx>=0){ STATE.cache.estimaciones[idx]=e; } else { STATE.cache.estimaciones.push(e); }
  try{ await dbPut('estimaciones', e); STATE.cache.estimaciones = await dbAll('estimaciones'); }catch(err){ console.warn('estim local:',err); }
  _cteVista='estim'; cteRender();
  toast('Estimación guardada','Versión "'+e.nombre+'" guardada','success');
}

function cteVerEstimDetalle(id){
  var e=(STATE.cache.estimaciones||[]).find(function(x){return x.id===id;});
  if(!e) return;
  _cteEstimActual = JSON.parse(JSON.stringify(e));
  _cteVista='estimVer'; cteRender();
}

function cteEliminarEstim(id){
  if(!can('conteos.revisar')){ toast('Sin permiso','No puede eliminar estimaciones','error'); return; }
  confirmDialog('Eliminar estimación','¿Eliminar esta versión de estimación?',async function(){
    try{ await sciMarcarEliminado('estimaciones', id); await dbDel('estimaciones', id); STATE.cache.estimaciones = await dbAll('estimaciones'); }catch(e){}
    cteRender();
    toast('Estimación eliminada','','success');
  },'Eliminar',true);
}

function cteExportarEstim(){
  var e=_cteEstimActual;
  if(!e){ return; }
  if(typeof XLSX==='undefined'){ toast('No disponible','La librería de Excel no está cargada','error'); return; }
  var filas = e.lineas.map(function(l){
    return {
      'Paño': l.panoNombre, 'Variedad': l.variedad, 'N° plantas': l.plantas,
      'Centros florales/árbol': l.centros, 'Frutos/centro': l.frutosCentro,
      'Kg/fruto': l.kgFruto, 'Kg paño': Math.round(l.kgPano)
    };
  });
  var totalKg = e.lineas.reduce(function(a,l){return a+(l.kgPano||0);},0);
  filas.push({});
  filas.push({'Paño':'TOTAL','Kg paño':Math.round(totalKg)});
  filas.push({'Paño':'Cajas de 5 kg','Kg paño':Math.round(totalKg/5)});
  var ws = XLSX.utils.json_to_sheet(filas);
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Estimación');
  XLSX.writeFile(wb, 'Estimacion_'+(e.nombre||'centros').replace(/[^a-z0-9]/gi,'_')+'.xlsx');
}

function cteAplicarEstimacion(id){
  if(!can('conteos.revisar')){ toast('Sin permiso','Solo usuarios con permiso de revisión pueden aplicar a estimación','error'); return; }
  var s = (STATE.cache.conteos||[]).find(function(x){ return String(x.id)===String(id); });
  if(!s){ return; }
  if(typeof S==='undefined' || !Array.isArray(S.panos)){ toast('No disponible','El Cuaderno no está cargado','error'); return; }
  var pano = S.panos.find(function(p){ return String(p.id)===String(s.panoId); });
  if(!pano){ toast('Paño no encontrado','El paño de este conteo ya no existe','error'); return; }
  confirmDialog('Aplicar a estimación','¿Aplicar el promedio de '+s.promedioCentros.toFixed(1)+' centros florales al paño "'+pano.nombre+'"? Esto actualizará su estimación de producción.',async function(){
    pano.centrosFlorales = parseFloat(s.promedioCentros.toFixed(2));
    if(typeof save==='function') save();
    // Marcar el conteo como aplicado (queda registrado en la tabla y en el Excel)
    s.aplicadoEstim = true;
    s.aplicadoFecha = new Date().toISOString();
    s.aplicadoPor = STATE.user ? (STATE.user.nombre||STATE.user.id) : '';
    try{ await dbPut('conteos', s); STATE.cache.conteos = await dbAll('conteos'); }catch(e){}
    cteRender();
    toast('Estimación actualizada','"'+pano.nombre+'" → '+s.promedioCentros.toFixed(1)+' centros florales','success');
  },'Aplicar',false);
}

function cteEliminarSesion(id){
  var s = (STATE.cache.conteos||[]).find(function(x){ return String(x.id)===String(id); });
  if(!s) return;
  confirmDialog('Eliminar conteo','¿Eliminar este conteo de "'+(s.panoNombre||'')+'"? '+(s.sincronizado?'':'Aún no se ha subido a la nube.'),async function(){
    await sciMarcarEliminado('conteos', id); // lápida: evita que reaparezca al sincronizar
    await dbDel('conteos', id);
    STATE.cache.conteos = await dbAll('conteos');
    // Forzar subida INMEDIATA del estado sin el conteo, para que el listener remoto no lo restaure
    if(typeof SCIFB!=='undefined' && SCIFB.ready && typeof sciFbPush==='function'){
      try{ await sciFbPush(true); }catch(e){ console.warn('Error sincronizando borrado:', e); }
    }
    cteRender();
    toast('Conteo eliminado','','success');
  },'Eliminar',true);
}

// Re-renderizar al recuperar/perder conexión
window.addEventListener('online', function(){ if(STATE.page==='conteos') cteRender(); });
window.addEventListener('offline', function(){ if(STATE.page==='conteos') cteRender(); });



/* ═══════════════════════════════════════════════════════════════════
   MÓDULO INVENTARIO DE HUERTO — CONTEO DE PLANTAS (offline-first, móvil)
   - Selección: cuartel, variedad, portainjerto, polinizante, hilera
   - Dos contadores (principal / polinizante) al caminar la entrehilera
   - GPS al inicio y fin de hilera; plantas intermedias interpoladas
   - Código de árbol: CUARTEL+VARIEDAD+HILERA+secuencia (ej: C1REGH1-005)
   - Mapa 2D con estado editable por árbol (sano/débil/muerto/replante)
   ═══════════════════════════════════════════════════════════════════ */
var _ipVista = 'inicio';      // inicio | conteo | lista | mapa
// Cambia la sub-vista del módulo y registra el paso en el historial del
// navegador, para que el botón 'atrás' vuelva a la sub-vista previa (y no
// salga de todo el módulo al dashboard).
function ipSetVista(v, fromHistory){
  _ipVista = v;
  try{
    if(!fromHistory && window.history){
      history.pushState({sciPage:'invplantas', ipVista:v}, '', location.pathname+location.search+'#invplantas/'+v);
    }
  }catch(e){}
  ipRender();
}
// Manejador del botón atrás cuando estamos dentro del huerto: si hay una
// sub-vista abierta (no 'inicio'), vuelve al inicio del módulo en vez de salir.
function ipManejarAtras(){
  if(STATE.page!=='invplantas') return false;
  if(_ipVista && _ipVista!=='inicio'){
    // Cerrar sesión de conteo activa sin perder datos: solo volver a inicio.
    _ipVista='inicio';
    ipRender();
    return true; // atrás consumido dentro del módulo
  }
  return false; // dejar que el atrás global maneje (salir del módulo)
}
try{ window.ipSetVista=ipSetVista; window.ipManejarAtras=ipManejarAtras; }catch(e){}
var _ipSesion = null;         // hilera en conteo
var _ipMapaReg = null;        // registro mostrado en el mapa

// Abreviaturas de variedad para el código
var IP_VAR_ABBR = { 'Regina':'REG','Skeena':'SKE','Lapins':'LAP','Kordia':'KOR','Bing':'BIN','Santina':'SAN','Sweetheart':'SWE','Rainier':'RAI' };
function ipAbrevVariedad(v){
  if(!v) return 'VAR';
  if(IP_VAR_ABBR[v]) return IP_VAR_ABBR[v];
  return _ipNorm(v).slice(0,3).toUpperCase();
}
function _ipNorm(s){ return (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

// Datos del Cuaderno
function ipPanos(){ try{ return (typeof S!=='undefined' && Array.isArray(S.panos)) ? S.panos : []; }catch(e){ return []; } }
function ipVariedades(){ return [...new Set(ipPanos().map(function(p){return p.variedad||'';}).filter(Boolean))].sort(); }

// Estados posibles de un árbol en el mapa
var IP_ESTADOS = {
  'sano':    { label:'Sano',     color:'#1a7e3e' },
  'debil':   { label:'Débil',    color:'#f1c40f' },
  'muerto':  { label:'Muerto',   color:'#000000' },
  'replante':{ label:'Replante', color:'#ffffff' },
  'falta':   { label:'Falla/vacío', color:'#999999' }
};
// Colores de polinizantes por variedad (mapa general)
function ipColorPoliniz(nombre){
  var n = String(nombre||'').toLowerCase();
  if(n.indexOf('skeena')>=0) return '#d32f2f'; // rojo
  if(n.indexOf('kordia')>=0) return '#4fc3f7'; // celeste
  return '#e9730c'; // otros: naranja
}

// Listas para editar a nivel de árbol individual
var IP_PORTAINJERTOS = ['Colt','MaxMa 14','MaxMa 60','Gisela 5','Gisela 6','Gisela 12','CAB','Santa Lucía','Mahaleb','Pontaleb'];
function ipVariedadesLista(){
  // Combina variedades del Cuaderno con las conocidas
  var base = ['Regina','Skeena','Lapins','Kordia','Bing','Santina','Sweetheart','Rainier'];
  var delCuaderno = ipVariedades();
  return [...new Set(base.concat(delCuaderno))].sort();
}

async function renderInvPlantas(c){
  try{ if(typeof load==='function' && (typeof S==='undefined' || !S.panos || !S.panos.length)){ load(); } }catch(e){}
  // Iniciar sincronización del Cuaderno con Firebase si no está activa (los paños
  // viven en la nube; en un dispositivo nuevo no están en localStorage todavía).
  try{ if((typeof FB==='undefined' || !FB.ready) && typeof fbInit==='function'){ fbInit(); } }catch(e){}
  if(!STATE.cache.invplantas){ try{ STATE.cache.invplantas = await dbAll('invplantas'); }catch(e){ STATE.cache.invplantas=[]; } }
  ipRender(c);
}

function ipRender(c){
  var cont = c || document.getElementById('mainContent'); if(!cont) return;
  var estilos = '<style>'+
    '.ip-wrap{max-width:600px;margin:0 auto;padding:6px 4px}'+
    '.ip-big-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;font-size:16px;font-weight:700;border:none;border-radius:12px;cursor:pointer;margin-bottom:9px;box-shadow:0 2px 6px rgba(0,0,0,.12)}'+
    '.ip-big-btn:active{transform:scale(.98)}'+
    '.ip-btn-primary{background:#0a6ed1;color:#fff}.ip-btn-green{background:#0a6ed1;color:#fff}'+
    '.ip-btn-gray{background:#fff;color:#354a5f;border:2px solid #d9d9d9}.ip-btn-amber{background:#e9730c;color:#fff}'+
    '.ip-field{margin-bottom:10px}.ip-field label{display:block;font-size:13px;font-weight:700;color:#354a5f;margin-bottom:4px}'+
    '.ip-field select,.ip-field input{width:100%;padding:12px;font-size:16px;border:2px solid #d9d9d9;border-radius:10px;background:#fff;color:#32363a}'+
    '.ip-card{background:#fff;border:1px solid #e5e5e5;border-radius:12px;padding:14px;margin-bottom:10px}'+
    '.ip-sync-bar{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:600;margin-bottom:10px}'+
    // Contadores compactos en paleta SAP
    '.ip-counter-box{border:2px solid #e5e5e5;border-radius:14px;padding:10px 12px;margin-bottom:10px}'+
    '.ip-counter-box.principal{border-color:#0a6ed1;background:#f0f7ff}'+
    '.ip-counter-box.poliniz{border-color:#e9730c;background:#fff7ef}'+
    '.ip-counter-title{text-align:center;font-weight:800;font-size:14px;margin-bottom:6px}'+
    '.ip-counter{display:flex;align-items:center;justify-content:space-between;gap:10px}'+
    '.ip-counter button{width:68px;height:68px;border-radius:16px;border:none;font-size:34px;font-weight:700;cursor:pointer;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,.2);flex-shrink:0}'+
    '.ip-counter button:active{transform:scale(.94)}'+
    '.ip-counter .minus{background:#c0392b}.ip-counter .plus{background:#0a6ed1}'+
    '.ip-counter-box.poliniz .plus{background:#e9730c}'+
    '.ip-counter .val{font-size:52px;font-weight:800;flex:1;text-align:center;color:#23303d;line-height:1}'+
    '.ip-gps-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px}'+
    '.ip-hdr-mini{background:#354a5f;color:#fff;border-radius:10px;padding:8px 12px;margin-bottom:10px}'+
    '</style>';

  var online = navigator.onLine;
  var pend = (STATE.cache.invplantas||[]).filter(function(x){ return !x.sincronizado; }).length;
  var syncBar = '<div class="ip-sync-bar" style="background:'+(online?'#d1f0d8':'#fde8c8')+';color:'+(online?'#0a6e2e':'#7a4200')+'">'+
    (online?'🟢 Con conexión':'🔴 Sin conexión (modo terreno)')+
    (pend>0?(' · '+pend+' hilera(s) por subir'):' · todo sincronizado')+'</div>';

  var html = estilos + '<div class="ip-wrap">' + syncBar;
  if(_ipVista==='conteo' && _ipSesion){ html += ipRenderConteo(); }
  else if(_ipVista==='lista'){ html += ipRenderLista(); }
  else if(_ipVista==='mapa'){ html += ipRenderMapa(); }
  else { html += ipRenderInicio(); }
  html += '</div>';
  cont.innerHTML = html;
}

var _ipCuartelSel='', _ipVarSel='', _ipCuartelNombre='';
function ipRenderInicio(){
  var panos = ipPanos();
  var pend = (STATE.cache.invplantas||[]).filter(function(x){ return !x.sincronizado; }).length;
  // Cuarteles = nombres de paños
  var cuarteles = panos.map(function(p){ return p.nombre; });
  return '<div style="display:flex;gap:8px;margin-bottom:10px">'+
      '<button class="ip-big-btn ip-btn-gray" style="flex:1;margin:0" onclick="ipVerLista()">📋 Hileras registradas'+(pend>0?(' ('+pend+')'):'')+'</button>'+
      (can('invplantas.revisar')?'<button class="ip-big-btn ip-btn-primary" style="flex:1;margin:0" onclick="ipAbrirMapaGeneral()">🗺️ Mapa general</button>':'')+
    '</div>'+
    '<div class="ip-card">'+
      '<div style="font-size:20px;font-weight:800;color:#23303d;margin-bottom:4px">🌳 Inventario de Huerto</div>'+
      '<div style="font-size:13px;color:#777;margin-bottom:16px">Conteo de plantas por hilera. Seleccione los datos y comience a caminar la entrehilera.</div>'+
      '<div class="ip-field"><label>Cuartel</label><select id="ip-cuartel" onchange="ipSetCuartel(this.value)">'+
        '<option value="">— Seleccione cuartel —</option>'+
        panos.map(function(p){ return '<option value="'+escapeHtml(p.id)+'" '+(String(_ipCuartelSel)===String(p.id)?'selected':'')+'>'+escapeHtml(p.nombre)+' ('+escapeHtml(p.variedad||'')+')</option>'; }).join('')+
      '</select></div>'+
      '<div class="ip-field"><label>Variedad principal'+(_ipVarFija?' <span style="color:#0a6ed1;font-size:11px">(fija para este cuartel)</span>':'')+'</label><input type="text" id="ip-variedad" list="ip-var-dl" value="'+escapeHtml(_ipVarSel)+'" placeholder="Ej: Regina"'+(_ipVarFija?' readonly style="background:#f0f0f0;color:#666"':'')+'><datalist id="ip-var-dl">'+ipVariedades().map(function(v){return '<option value="'+escapeHtml(v)+'">';}).join('')+'</datalist></div>'+
      '<div class="ip-field"><label>Portainjerto'+(_ipVarFija?' <span style="color:#e9730c;font-size:11px">(confirme o ajuste)</span>':'')+'</label><input type="text" id="ip-porta" list="ip-porta-dl" value="'+escapeHtml(_ipPresetPorta)+'" placeholder="Ej: Colt, MaxMa, Gisela 6"><datalist id="ip-porta-dl"><option value="Colt"><option value="MaxMa 14"><option value="Gisela 6"><option value="Gisela 12"><option value="CAB"><option value="Maxma 60"></datalist></div>'+
      '<div class="ip-field"><label>Variedad polinizante'+(_ipVarFija?' <span style="color:#e9730c;font-size:11px">(confirme o ajuste)</span>':'')+'</label><input type="text" id="ip-poliniz" list="ip-var-dl" value="'+escapeHtml(_ipPresetPoliniz)+'" placeholder="Ej: Lapins (opcional)"></div>'+
      '<div class="ip-field"><label>N° de hilera</label><input type="number" id="ip-hilera" inputmode="numeric" min="1" value="'+(_ipPresetHilera!=null?_ipPresetHilera:'')+'" placeholder="Ej: 1"></div>'+
      '<button class="ip-big-btn ip-btn-green" onclick="ipIniciarHilera()">📍 Marcar inicio y comenzar</button>'+
    '</div>'+
    (navigator.onLine?'<button class="ip-big-btn ip-btn-primary" onclick="ipSincronizar()">☁️ Subir registros a la nube</button>':'');
}
function ipSetCuartel(idPano){
  _ipCuartelSel=idPano;
  // Buscar el paño por id (único) y autocompletar variedad y nombre del cuartel
  var pano=ipPanos().find(function(p){return String(p.id)===String(idPano);});
  if(pano){
    _ipCuartelNombre = pano.nombre;
    if(pano.variedad){ _ipVarSel=pano.variedad; }
  } else {
    _ipCuartelNombre='';
  }
  // Actualizar solo el campo de variedad, SIN re-renderizar todo
  // (re-renderizar reseteaba el selector y lo dejaba en blanco)
  var inpVar=document.getElementById('ip-variedad');
  if(inpVar) inpVar.value=_ipVarSel||'';
}


// ── Iniciar hilera: captura GPS de inicio ──
function ipIniciarHilera(){
  var cuartelId=(document.getElementById('ip-cuartel').value||'').trim();
  // Convertir el id del paño a su nombre real (el value del select es el id)
  var panoSel = ipPanos().find(function(p){ return String(p.id)===String(cuartelId); });
  var cuartel = panoSel ? panoSel.nombre : (_ipCuartelNombre||cuartelId);
  var variedad=(document.getElementById('ip-variedad').value||'').trim();
  var porta=(document.getElementById('ip-porta').value||'').trim();
  var poliniz=(document.getElementById('ip-poliniz').value||'').trim();
  var hilera=(document.getElementById('ip-hilera').value||'').trim();
  if(!cuartelId){ toast('Falta cuartel','Seleccione el cuartel','error'); return; }
  if(!variedad){ toast('Falta variedad','Ingrese la variedad principal','error'); return; }
  if(!hilera){ toast('Falta hilera','Ingrese el número de hilera','error'); return; }

  _ipEstadoActual = 'sano'; // cada hilera nueva parte con estado Sano por defecto
  _ipSesion = {
    id: uid(),
    cuartelId: cuartelId,
    cuartel: cuartel, variedad: variedad, portainjerto: porta,
    polinizante: poliniz, hilera: hilera,
    codigoBase: ipGenerarCodigoBase(cuartel, variedad, hilera),
    fechaInicio: new Date().toISOString(),
    usuario: STATE.user ? (STATE.user.nombre||STATE.user.id) : '',
    countPrincipal: 0, countPoliniz: 0,
    secuencia: [],   // orden real: ['principal','poliniz',...] tal como se cuenta caminando
    gpsInicio: null, gpsFin: null,
    sincronizado: false
  };
  // Limpiar banderas de preset (ya se leyeron los valores)
  _ipVarFija=false; _ipPresetHilera=null; _ipPresetPorta=''; _ipPresetPoliniz='';
  // Capturar GPS de inicio
  _ipCapturarGps('inicio', function(){
    ipSetVista('conteo');
  });
}

// Genera el código base de la hilera: C1REGH1 (cuartel abreviado + variedad + hilera)
function ipGenerarCodigoBase(cuartel, variedad, hilera){
  // Cuartel: tomar dígitos o iniciales (Cuartel 1 -> C1; "Paño Norte" -> PN)
  var cu = _ipNorm(cuartel).toUpperCase();
  var mDig = cu.match(/(\d+)/);
  var cuCode;
  if(mDig){ cuCode = 'C'+mDig[1]; }
  else { cuCode = cu.replace(/[^A-Z]/g,'').slice(0,3); }
  var vCode = ipAbrevVariedad(variedad);
  var hCode = 'H'+String(hilera).replace(/[^0-9]/g,'');
  return cuCode+vCode+hCode;
}

// Captura GPS con manejo de contexto seguro
function _ipCapturarGps(tipo, cb){
  var contextoSeguro = (window.isSecureContext===true) || location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1';
  if(!navigator.geolocation || !contextoSeguro){
    if(!contextoSeguro && typeof toast==='function') toast('GPS no disponible','El GPS requiere conexión segura (https). En Netlify funcionará.','warning');
    if(cb) cb();
    return;
  }
  if(typeof toast==='function') toast('Capturando GPS','Obteniendo ubicación de '+tipo+'...','info');
  navigator.geolocation.getCurrentPosition(function(pos){
    var punto = { lat:pos.coords.latitude, lng:pos.coords.longitude, precision:pos.coords.accuracy, hora:new Date().toISOString() };
    if(_ipSesion){
      if(tipo==='inicio') _ipSesion.gpsInicio = punto;
      else _ipSesion.gpsFin = punto;
    }
    if(typeof toast==='function') toast('GPS '+tipo+' ✓', punto.lat.toFixed(6)+', '+punto.lng.toFixed(6),'success');
    if(cb) cb();
  }, function(err){
    var msg = err && err.code===1 ? 'permiso denegado' : (err && err.code===2 ? 'sin señal' : 'tiempo agotado');
    if(typeof toast==='function') toast('Sin GPS de '+tipo, msg,'warning');
    if(cb) cb();
  }, { timeout:15000, enableHighAccuracy:true, maximumAge:0 });
}

// ── Pantalla de conteo (compacta, cabe en pantalla de 6.7") ──
function ipRenderConteo(){
  var s=_ipSesion;
  var total = s.countPrincipal + s.countPoliniz;
  var gpsIni = s.gpsInicio ? '<span class="ip-gps-dot" style="background:#43a047"></span>Inicio ✓' : '<span class="ip-gps-dot" style="background:#ccc"></span>Inicio s/GPS';
  var gpsFin = s.gpsFin ? '<span class="ip-gps-dot" style="background:#43a047"></span>Fin ✓' : '<span class="ip-gps-dot" style="background:#ccc"></span>Fin pend.';

  return '<div class="ip-hdr-mini">'+
      '<div style="display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-size:17px;font-weight:800">'+escapeHtml(s.codigoBase)+'</div>'+
          '<div style="font-size:11px;opacity:.85">'+escapeHtml(s.cuartel)+' · '+escapeHtml(s.variedad)+' · H'+escapeHtml(s.hilera)+'</div></div>'+
        '<div style="font-size:11px;text-align:right">'+gpsIni+'<br>'+gpsFin+'</div>'+
      '</div>'+
    '</div>'+
    // Selector de estado: se aplica a las plantas que se sumen a continuación.
    '<div style="background:#fff;border:1px solid #e3e8ee;border-radius:10px;padding:10px 12px;margin-bottom:10px">'+
      '<div style="font-size:12px;color:#6a7889;font-weight:700;margin-bottom:7px">Estado de la planta a contar (por defecto Sano)</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
        Object.keys(IP_ESTADOS).map(function(k){
          var e=IP_ESTADOS[k];
          var act = (k===(_ipEstadoActual||'sano'));
          return '<button class="ip-estado-btn" data-estado="'+k+'" onclick="ipSetEstadoConteo(\''+k+'\')" '+
            'style="flex:1;min-width:80px;padding:9px 6px;border:2px solid '+e.color+';border-radius:9px;background:#fff;cursor:pointer;font-size:12.5px;'+
            (act?'outline:3px solid #23303d;transform:scale(1.05);font-weight:800;':'font-weight:600;')+'">'+
            '<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:'+e.color+';margin-right:5px;vertical-align:middle"></span>'+e.label+'</button>';
        }).join('')+
      '</div>'+
      '<div id="ip-conteo-estados" style="margin-top:9px;min-height:16px">'+(function(){
        // Resumen inicial por estado (por si ya hay plantas contadas)
        if(!s.secuencia||!s.secuencia.length) return '';
        var por={}; s.secuencia.forEach(function(el){ var e=_ipSeqEstado(el); por[e]=(por[e]||0)+1; });
        return Object.keys(IP_ESTADOS).map(function(k){ var n=por[k]||0; if(!n) return ''; var e=IP_ESTADOS[k];
          return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#3a4a5a;margin-right:10px"><span style="width:9px;height:9px;border-radius:50%;background:'+e.color+';display:inline-block"></span>'+e.label+': <strong>'+n+'</strong></span>';
        }).join('');
      })()+'</div>'+
    '</div>'+
    // Contador variedad principal
    '<div class="ip-counter-box principal">'+
      '<div class="ip-counter-title" style="color:#0a6ed1">🌳 '+escapeHtml(s.variedad)+'</div>'+
      '<div class="ip-counter">'+
        '<button class="minus" onclick="ipContar(\'principal\',-1)">−</button>'+
        '<div class="val" id="ip-val-principal">'+s.countPrincipal+'</div>'+
        '<button class="plus" onclick="ipContar(\'principal\',1)">+</button>'+
      '</div>'+
    '</div>'+
    // Contador polinizante
    '<div class="ip-counter-box poliniz">'+
      '<div class="ip-counter-title" style="color:#e9730c">🐝 '+(s.polinizante?escapeHtml(s.polinizante):'Polinizante')+'</div>'+
      '<div class="ip-counter">'+
        '<button class="minus" onclick="ipContar(\'poliniz\',-1)">−</button>'+
        '<div class="val" id="ip-val-poliniz">'+s.countPoliniz+'</div>'+
        '<button class="plus" onclick="ipContar(\'poliniz\',1)">+</button>'+
      '</div>'+
    '</div>'+
    // Total compacto
    '<div style="text-align:center;padding:6px;margin-bottom:10px">'+
      '<span style="color:#6a7889;font-size:13px">Total hilera: </span><strong style="font-size:24px;color:#354a5f" id="ip-total-hilera">'+total+'</strong>'+
    '</div>'+
    // Botón de guardar (marca GPS de fin automáticamente al presionarlo)
    '<button class="ip-big-btn ip-btn-primary" style="margin-bottom:9px" onclick="ipGuardarHilera()">💾 Guardar y marcar fin de hilera</button>'+
    '<button class="ip-big-btn ip-btn-gray" style="padding:10px;font-size:14px" onclick="ipCancelarHilera()">Cancelar</button>';
}

// Estado seleccionado actualmente para las plantas que se vayan sumando.
// Por defecto 'sano'. El operador puede cambiarlo antes de sumar.
var _ipEstadoActual = 'sano';
function ipSetEstadoConteo(estado){
  _ipEstadoActual = estado || 'sano';
  // Resaltar el botón de estado activo
  document.querySelectorAll('.ip-estado-btn').forEach(function(b){
    var act = b.getAttribute('data-estado')===_ipEstadoActual;
    b.style.outline = act ? '3px solid #23303d' : 'none';
    b.style.transform = act ? 'scale(1.05)' : 'none';
    b.style.fontWeight = act ? '800' : '600';
  });
}
// Normaliza un elemento de secuencia (compatibilidad: antes era string 'principal').
function _ipSeqTipo(el){ return (el && typeof el==='object') ? el.tipo : el; }
function _ipSeqEstado(el){ return (el && typeof el==='object' && el.estado) ? el.estado : 'sano'; }

function ipContar(tipo, d){
  if(!_ipSesion.secuencia) _ipSesion.secuencia=[];
  if(d>0){
    // Sumar: agregar al final con el estado seleccionado (orden real de la caminata)
    _ipSesion.secuencia.push({ tipo: tipo, estado: _ipEstadoActual||'sano' });
  } else if(d<0){
    // Restar: quitar el ÚLTIMO de ese tipo en la secuencia (deshacer el más reciente)
    for(var i=_ipSesion.secuencia.length-1;i>=0;i--){
      if(_ipSeqTipo(_ipSesion.secuencia[i])===tipo){ _ipSesion.secuencia.splice(i,1); break; }
    }
  }
  // Recalcular contadores desde la secuencia (fuente de verdad)
  _ipSesion.countPrincipal = _ipSesion.secuencia.filter(function(t){return _ipSeqTipo(t)==='principal';}).length;
  _ipSesion.countPoliniz = _ipSesion.secuencia.filter(function(t){return _ipSeqTipo(t)==='poliniz';}).length;
  var e1=document.getElementById('ip-val-principal'); if(e1) e1.textContent=_ipSesion.countPrincipal;
  var e2=document.getElementById('ip-val-poliniz'); if(e2) e2.textContent=_ipSesion.countPoliniz;
  var box=document.getElementById('ip-total-hilera'); if(box) box.textContent=(_ipSesion.countPrincipal+_ipSesion.countPoliniz);
  // Actualizar el desglose por estado en vivo
  ipActualizarResumenEstadoConteo();
}
// Muestra, durante el conteo, cuántas plantas se llevan por estado.
function ipActualizarResumenEstadoConteo(){
  var cont = document.getElementById('ip-conteo-estados');
  if(!cont || !_ipSesion || !_ipSesion.secuencia) return;
  var por = {};
  _ipSesion.secuencia.forEach(function(el){ var e=_ipSeqEstado(el); por[e]=(por[e]||0)+1; });
  cont.innerHTML = Object.keys(IP_ESTADOS).map(function(k){
    var n = por[k]||0; if(n===0) return '';
    var e = IP_ESTADOS[k];
    return '<span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#3a4a5a;margin-right:10px">'+
      '<span style="width:9px;height:9px;border-radius:50%;background:'+e.color+';display:inline-block"></span>'+e.label+': <strong>'+n+'</strong></span>';
  }).join('');
}

function ipMarcarFin(){
  _ipCapturarGps('fin', function(){ ipRender(); });
}

async function ipGuardarHilera(){
  var s=_ipSesion;
  if(s.countPrincipal+s.countPoliniz<=0){ toast('Sin plantas','Cuente al menos una planta','error'); return; }
  // Restricción: no permitir duplicados con el mismo cuartel + variedad + hilera
  function _norm(x){ return (x||'').toString().trim().toLowerCase(); }
  var dup = (STATE.cache.invplantas||[]).find(function(r){
    return String(r.id)!==String(s.id)
      && _norm(r.cuartel)===_norm(s.cuartel)
      && _norm(r.variedad)===_norm(s.variedad)
      && _norm(r.hilera)===_norm(s.hilera);
  });
  if(dup){
    toast('Conteo duplicado','Ya existe un registro de '+escapeHtml(s.cuartel)+' · '+escapeHtml(s.variedad)+' · Hilera '+escapeHtml(s.hilera)+'. No se puede guardar otro igual.','error');
    return;
  }
  // Marcar AUTOMÁTICAMENTE el GPS de fin (esta es la última planta de la hilera) y luego guardar
  _ipCapturarGps('fin', function(){
    // Tras intentar capturar el GPS (haya o no señal), guardar
    if(!_ipSesion.gpsFin){
      confirmDialog('Sin GPS de fin','No se pudo capturar la ubicación de la última planta. ¿Guardar de todos modos? El mapa será menos preciso.',function(){ _ipDoGuardarHilera(); },'Guardar igual',false);
    } else {
      _ipDoGuardarHilera();
    }
  });
}
async function _ipDoGuardarHilera(){
  var s=_ipSesion;
  s.fechaFin=new Date().toISOString();
  s.total = s.countPrincipal + s.countPoliniz;
  // Generar las plantas individuales con código y posición interpolada
  s.plantas = ipGenerarPlantas(s);
  var online = navigator.onLine;
  s.sincronizado = online;
  if(online) s.fechaSync=new Date().toISOString();
  // Blindaje para terreno: garantizar id y reintentar; nunca perder la hilera en silencio.
  if(!s.id){ try{ s.id = uid(); }catch(e){ s.id = 'ip_'+Date.now()+'_'+Math.random().toString(36).slice(2); } }
  var _ipOk = false;
  for(var _it=0; _it<2 && !_ipOk; _it++){
    try{
      await dbPut('invplantas', s);
      STATE.cache.invplantas = await dbAll('invplantas');
      _ipOk = true;
    }catch(e){
      console.error('Error guardando hilera (intento '+(_it+1)+'):', e);
      if(_it===0){ try{ s.id = (s.id||'ip')+'_r'+Date.now(); }catch(_){} }
    }
  }
  if(!_ipOk){
    if(typeof confirmDialog==='function'){
      confirmDialog('⚠️ No se pudo guardar','La hilera NO se guardó en el dispositivo. Anote los datos y reintente. ¿Reintentar ahora?', function(){ _ipDoGuardarHilera(); }, 'Reintentar', true);
    } else {
      toast('Error','No se pudo guardar la hilera. No cierre la app, reintente.','error');
    }
    return;
  }
  var cod=s.codigoBase, tot=s.total;
  // Guardar los datos del cuartel para la posible siguiente hilera
  var datosCuartel = {
    cuartelId: s.cuartelId, cuartel: s.cuartel, variedad: s.variedad,
    portainjerto: s.portainjerto, polinizante: s.polinizante,
    hilera: s.hilera
  };
  var sigHilera = (parseInt(String(s.hilera).replace(/[^0-9]/g,''))||0) + 1;
  _ipSesion=null;
  _ipVista='inicio';
  ipRender();
  toast('Hilera guardada', cod+' · '+tot+' plantas'+(online?'. Subida a la nube.':' (guardada en el teléfono).'),'success');
  // Preguntar si continuar con la siguiente hilera del mismo cuartel
  confirmDialog('Hilera '+s.hilera+' guardada',
    '¿Continuar con la hilera '+sigHilera+' manteniendo los mismos datos del cuartel ('+escapeHtml(datosCuartel.cuartel)+' · '+escapeHtml(datosCuartel.variedad)+')?',
    function(){
      // Preconfigurar el inicio con los datos del cuartel y la hilera siguiente
      _ipCuartelSel = datosCuartel.cuartelId;
      _ipCuartelNombre = datosCuartel.cuartel;
      _ipVarSel = datosCuartel.variedad;
      _ipVarFija = true;  // la variedad principal es una sola por cuartel: se bloquea
      _ipPresetHilera = sigHilera;
      _ipPresetPorta = datosCuartel.portainjerto||'';
      _ipPresetPoliniz = '';  // EN BLANCO: obliga a seleccionar la variedad polinizante en cada hilera
      _ipVista='inicio';
      ipRender();
      // Rellenar los campos editables tras render (el polinizante queda vacío a propósito)
      setTimeout(function(){
        if(document.getElementById('ip-porta')) document.getElementById('ip-porta').value = datosCuartel.portainjerto||'';
        if(document.getElementById('ip-poliniz')){ document.getElementById('ip-poliniz').value = ''; document.getElementById('ip-poliniz').focus(); }
        if(document.getElementById('ip-hilera')) document.getElementById('ip-hilera').value = sigHilera;
      },50);
    },
    'Sí, hilera '+sigHilera, false);
}
var _ipVarFija=false, _ipPresetHilera=null, _ipPresetPorta='', _ipPresetPoliniz='';

function ipCancelarHilera(){
  confirmDialog('Cancelar hilera','¿Descartar el conteo de esta hilera?',function(){ _ipSesion=null; _ipVista='inicio'; ipRender(); },'Descartar',true);
}
function ipVerLista(){ ipSetVista('lista'); }
function ipVolverInicio(){ _ipVarFija=false; _ipPresetHilera=null; _ipPresetPorta=''; _ipPresetPoliniz=''; _ipVista='inicio'; ipRender(); }


// ── Generar plantas individuales con código y posición interpolada ──
function ipGenerarPlantas(s){
  // Usar la secuencia real de la caminata; si no existe (datos viejos), reconstruir principal+poliniz
  var seq = (s.secuencia && s.secuencia.length) ? s.secuencia.slice()
            : [].concat(
                Array(s.countPrincipal).fill('principal'),
                Array(s.countPoliniz).fill('poliniz')
              );
  // Zigzag: en hileras PARES se camina en sentido inverso, así que se invierte
  // la secuencia para que la numeración coincida con la posición física real.
  var hileraNum = parseInt(String(s.hilera).replace(/[^0-9]/g,'')) || 0;
  var invertida = (hileraNum % 2 === 0);
  if(invertida){ seq.reverse(); }
  s.invertida = invertida; // se guarda para referencia

  var total = seq.length;
  var plantas = [];
  var ini = s.gpsInicio, fin = s.gpsFin;
  for(var i=0;i<total;i++){
    var frac = total>1 ? i/(total-1) : 0;
    var lat=null, lng=null;
    if(ini && fin){
      lat = ini.lat + (fin.lat-ini.lat)*frac;
      lng = ini.lng + (fin.lng-ini.lng)*frac;
    } else if(ini){ lat=ini.lat; lng=ini.lng; }
  // El tipo y ESTADO respetan el ORDEN REAL en que se contó (ya invertido si par)
    var el = seq[i];
    var tipo = (el && typeof el==='object') ? el.tipo : el;
    var estado = (el && typeof el==='object' && el.estado) ? el.estado : 'sano';
    // Formato compacto: NO guardamos 'codigo' (se deriva de codigoBase+seq) ni
    // lat/lng por planta (se interpolan desde gpsInicio/gpsFin de la hilera).
    // Esto reduce ~40% el tamaño de invplantas en la nube.
    var pl = { seq: i+1, tipo: tipo, estado: estado };
    plantas.push(pl);
  }
  return plantas;
}

// Deriva el código de una planta a partir del código base de su hilera.
function ipCodigoPlanta(reg, p){
  if(p && p.codigo) return p.codigo; // compat: plantas viejas que lo tienen
  var base = reg ? (reg.codigoBase||'') : '';
  return base + '-' + String((p&&p.seq)||0).padStart(6,'0');
}
// Compacta una hilera quitando campos redundantes de sus plantas (codigo, lat,
// lng) que se pueden derivar. Reduce ~40% el tamaño. Se aplica al guardar.
function ipCompactarRegistro(reg){
  if(reg && Array.isArray(reg.plantas)){
    reg.plantas = reg.plantas.map(function(p){
      return { seq:p.seq, tipo:p.tipo, estado:p.estado||'sano',
               polinizante: p.polinizante || undefined };
    });
  }
  return reg;
}
try{ window.ipCompactarRegistro = ipCompactarRegistro; }catch(e){}
try{ window.ipCodigoPlanta = ipCodigoPlanta; }catch(e){}

// ── Lista de hileras registradas ──
// Resumen por paño/variedad: total real contado vs registrado, con botón para actualizar el paño
function ipRenderResumenPanos(){
  var regs = STATE.cache.invplantas||[];
  if(!regs.length) return '';
  // Agrupar conteos reales por cuartel+variedad principal
  var grupos = {};
  regs.forEach(function(r){
    var key = (r.cuartel||'')+'||'+(r.variedad||'');
    if(!grupos[key]) grupos[key] = { cuartel:r.cuartel||'', variedad:r.variedad||'', total:0, hileras:0, principal:0, poliniz:{}, estados:{ sano:0, debil:0, muerto:0, replante:0, falta:0 } };
    var cp = r.countPrincipal||0, cz = r.countPoliniz||0;
    grupos[key].total += (r.total || cp+cz);
    grupos[key].principal += cp;
    // Acumular polinizantes por nombre de variedad
    var nomPol = (r.polinizante||'').trim() || 'Polinizante';
    if(cz>0){ grupos[key].poliniz[nomPol] = (grupos[key].poliniz[nomPol]||0) + cz; }
    // Acumular conteo de plantas por estado (Sano, Débil, Muerto, Replante, Falla)
    (r.plantas||[]).forEach(function(p){
      var est = (p && p.estado) ? p.estado : 'sano';
      if(grupos[key].estados[est]===undefined) grupos[key].estados[est] = 0;
      grupos[key].estados[est]++;
    });
    grupos[key].hileras += 1;
  });
  var keys = Object.keys(grupos);
  if(!keys.length) return '';
  var html = '<div class="ip-card" style="background:#f0f7ff;border-color:#bcd9f5">'+
    '<div style="font-weight:800;color:#0854a0;margin-bottom:4px">📊 Resumen de plantas contadas</div>'+
    '<div style="font-size:12px;color:#5a7da0;margin-bottom:12px">Detalle por variedad (principal y polinizantes). Puedes actualizar el N° de plantas del paño con el valor contado.</div>';
  html += keys.map(function(k){
    var g = grupos[k];
    var pano = ipBuscarPano(g.cuartel, g.variedad);
    var registrado = pano ? (parseInt(pano.plantas)|| (pano.densidad&&pano.hectareas?Math.round(pano.densidad*pano.hectareas):0)) : null;
    var dif = (registrado!=null) ? (g.total - registrado) : null;
    var difTxt = '';
    if(dif!=null && dif!==0){ difTxt = '<span style="color:'+(dif>0?'#0a6e2e':'#c0392b')+';font-weight:700">'+(dif>0?'+':'')+dif+'</span>'; }
    // Desglose: principal con su variedad + cada polinizante con su nombre
    var desglose = '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #dbe7f3">';
    desglose += '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">'+
      '<span style="color:#1a7e3e;font-weight:700">🌳 '+escapeHtml(g.variedad||'Principal')+' <span style="font-size:11px;color:#888;font-weight:400">(principal)</span></span>'+
      '<strong style="color:#1a7e3e">'+g.principal.toLocaleString('es-CL')+'</strong></div>';
    var polKeys = Object.keys(g.poliniz);
    if(polKeys.length){
      polKeys.forEach(function(nom){
        desglose += '<div style="display:flex;justify-content:space-between;font-size:13px;padding:3px 0">'+
          '<span style="color:#e9730c;font-weight:700">🐝 '+escapeHtml(nom)+' <span style="font-size:11px;color:#888;font-weight:400">(polinizante)</span></span>'+
          '<strong style="color:#e9730c">'+g.poliniz[nom].toLocaleString('es-CL')+'</strong></div>';
      });
    }
    desglose += '</div>';

    // Desglose por estado (Sano, Débil, Muerto, Replante, Falla/vacío)
    var totalEstados = 0;
    Object.keys(IP_ESTADOS).forEach(function(kk){ totalEstados += (g.estados[kk]||0); });
    var estadosHtml = '';
    if(totalEstados>0){
      estadosHtml = '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #dbe7f3">'+
        '<div style="font-size:11px;color:#5a7da0;font-weight:700;text-transform:uppercase;letter-spacing:.3px;margin-bottom:6px">Estado de las plantas</div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap">'+
          Object.keys(IP_ESTADOS).map(function(kk){
            var e = IP_ESTADOS[kk];
            var n = g.estados[kk]||0;
            return '<div style="flex:1;min-width:78px;background:#f8fafb;border:1px solid #e3e8ee;border-left:3px solid '+e.color+';border-radius:7px;padding:6px 8px">'+
              '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">'+
                '<span style="width:9px;height:9px;border-radius:50%;background:'+e.color+';display:inline-block"></span>'+
                '<span style="font-size:10.5px;color:#5a7da0;font-weight:600">'+e.label+'</span>'+
              '</div>'+
              '<div style="font-size:16px;font-weight:800;color:#23303d;line-height:1.1">'+n.toLocaleString('es-CL')+'</div>'+
            '</div>';
          }).join('')+
        '</div>'+
      '</div>';
    }
    desglose += estadosHtml;
    return '<div style="background:#fff;border:1px solid #dbe7f3;border-radius:10px;padding:11px 13px;margin-bottom:8px">'+
      '<div style="display:flex;justify-content:space-between;align-items:start">'+
        '<div><div style="font-weight:800;color:#23303d">'+escapeHtml(g.cuartel)+' · '+escapeHtml(g.variedad)+'</div>'+
          '<div style="font-size:12px;color:#888">'+g.hileras+' hilera(s) contada(s)</div></div>'+
        '<div style="text-align:right"><div style="font-size:20px;font-weight:800;color:#0854a0">'+g.total.toLocaleString('es-CL')+'</div><div style="font-size:11px;color:#888">total plantas</div></div>'+
      '</div>'+
      desglose+
      (registrado!=null ?
        '<div style="font-size:12px;color:#666;margin-top:6px;padding-top:6px;border-top:1px dashed #dbe7f3">Registrado en el paño: <strong>'+registrado.toLocaleString('es-CL')+'</strong>'+(difTxt?(' · diferencia: '+difTxt):' · <span style="color:#0a6e2e">coincide ✓</span>')+'</div>'
        : '<div style="font-size:12px;color:#c0392b;margin-top:6px">⚠ No se encontró un paño con este cuartel y variedad en el Cuaderno</div>')+
      (pano && dif!==0 && can('cuaderno.panos') ?
        '<button onclick="ipActualizarPlantasPano(\''+escapeHtml(pano.id)+'\','+g.total+')" style="width:100%;margin-top:10px;padding:10px;background:#0a6ed1;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer">⟳ Actualizar paño a '+g.total.toLocaleString('es-CL')+' plantas</button>'
        : '')+
    '</div>';
  }).join('');
  html += '</div>';
  return html;
}

// Busca un paño del Cuaderno por cuartel (nombre) + variedad
function ipBuscarPano(cuartel, variedad){
  function norm(x){ return (x||'').toString().trim().toLowerCase(); }
  return ipPanos().find(function(p){
    return norm(p.nombre)===norm(cuartel) && norm(p.variedad)===norm(variedad);
  }) || null;
}

// Actualiza el N° de plantas de un paño con el valor contado (con confirmación)
function ipActualizarPlantasPano(panoId, nuevoTotal){
  if(!can('cuaderno.panos')){ toast('Sin permiso','No tiene permiso para editar paños','error'); return; }
  var pano = ipPanos().find(function(p){ return String(p.id)===String(panoId); });
  if(!pano){ toast('No encontrado','No se encontró el paño','error'); return; }
  var anterior = parseInt(pano.plantas)|| (pano.densidad&&pano.hectareas?Math.round(pano.densidad*pano.hectareas):0);
  confirmDialog('Actualizar N° de plantas',
    'Paño "'+escapeHtml(pano.nombre)+' · '+escapeHtml(pano.variedad)+'":\n\nN° de plantas actual: '+anterior.toLocaleString('es-CL')+'\nNuevo (conteo real): '+nuevoTotal.toLocaleString('es-CL')+'\n\n¿Actualizar el paño con el valor contado? Esto se reflejará en el Cuaderno de Campo, los Conteos en terreno y el Inventario de huerto.',
    function(){
      pano.plantas = nuevoTotal;
      // Persistir en el Cuaderno
      try{ if(typeof save==='function') save(); }catch(e){ console.warn('save:',e); }
      try{ if(typeof fbPush==='function') fbPush(true); }catch(e){}
      ipRender();
      toast('Paño actualizado','"'+pano.nombre+' · '+pano.variedad+'" ahora tiene '+nuevoTotal.toLocaleString('es-CL')+' plantas','success');
    },'Actualizar', false);
}

function ipToggleHilera(idx){
  var d=document.getElementById('ip-hil-det-'+idx);
  var ch=document.getElementById('ip-hil-chev-'+idx);
  if(!d) return;
  var open = d.style.display!=='none';
  d.style.display = open?'none':'block';
  if(ch) ch.textContent = open?'▸':'▾';
}
try{ window.ipToggleHilera = ipToggleHilera; }catch(e){}
function ipRenderLista(){
  var regs = (STATE.cache.invplantas||[]).slice().sort(function(a,b){ return (b.fechaInicio||'').localeCompare(a.fechaInicio||''); });
  var html = '<button class="ip-big-btn ip-btn-gray" onclick="ipVolverInicio()" style="padding:14px;font-size:16px">‹ Volver</button>';
  if(can('invplantas.revisar') && regs.length){
    html += '<button class="ip-big-btn ip-btn-primary" onclick="ipAbrirMapaGeneral()">🗺️ Mapa general del cuartel</button>';
    html += '<button class="ip-big-btn ip-btn-amber" onclick="ipExportarExcel()">📊 Exportar a Excel</button>';
  }
  if(!regs.length){
    html += '<div class="ip-card" style="text-align:center;color:#999;padding:30px">Sin hileras registradas todavía.</div>';
    return html;
  }
  // ── Resumen por paño/variedad con opción de actualizar el N° de plantas del paño ──
  html += ipRenderResumenPanos();
  html += '<div style="font-weight:800;color:#23303d;margin:14px 0 8px">Hileras registradas ('+regs.length+')</div>';
  html += regs.map(function(s,idx){
    var fecha=(s.fechaInicio||'').slice(0,10);
    var sync = s.sincronizado ? '☁️' : '📱';
    var tieneGps = s.gpsInicio && s.gpsFin;
    var det =
      '<div style="font-size:12px;color:#999;margin-top:6px">'+fecha+(s.portainjerto?(' · '+escapeHtml(s.portainjerto)):'')+(s.sincronizado?' · <span style="color:#0a6e2e;font-weight:700">Subido</span>':' · <span style="color:#e9730c;font-weight:700">Local</span>')+'</div>'+
      '<div style="display:flex;gap:16px;margin-top:8px;font-size:14px;flex-wrap:wrap">'+
        '<div><span style="color:#888">🌳 Principal:</span> <strong style="color:#1a7e3e">'+s.countPrincipal+'</strong></div>'+
        '<div><span style="color:#888">🐝 Poliniz.:</span> <strong style="color:#e9730c">'+s.countPoliniz+'</strong></div>'+
        '<div><span style="color:#888">Total:</span> <strong>'+(s.total||(s.countPrincipal+s.countPoliniz))+'</strong></div>'+
      '</div>'+
      '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">'+
        (tieneGps?'<button onclick="event.stopPropagation();ipAbrirMapaPunto('+s.gpsInicio.lat+','+s.gpsInicio.lng+')" style="padding:8px 12px;background:#f0f7ff;color:#0854a0;border:1px solid #bcd9f5;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">📍 Ubicación</button>':'<span style="font-size:12px;color:#aaa;align-self:center">📍 Sin georreferencia</span>')+
        (can('invplantas.editar')?'<button onclick="event.stopPropagation();ipMarcarGpsMapa(\''+s.id+'\')" style="padding:8px 12px;background:#eefaf0;color:#1a7e3e;border:1px solid #bfe3c8;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">🎯 Marcar GPS en mapa</button>':'')+
      '</div>'+
      '<div style="display:flex;gap:8px;margin-top:12px">'+
        (can('invplantas.revisar')||can('invplantas.editar')?'<button onclick="event.stopPropagation();ipVerMapa(\''+s.id+'\')" style="flex:1;padding:11px;background:#0a6ed1;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">🗺️ Ver mapa 2D</button>':'')+
        (can('invplantas.editar')?'<button onclick="event.stopPropagation();ipEditarRegistro(\''+s.id+'\')" style="padding:11px 15px;background:#fff;color:#0854a0;border:2px solid #bcd9f5;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">✏️</button>':'')+
        (can('invplantas.editar')?'<button onclick="event.stopPropagation();ipEliminar(\''+s.id+'\')" style="padding:11px 15px;background:#fff;color:#c0392b;border:2px solid #f0b8b8;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer">🗑️</button>':'')+
      '</div>';
    return '<div class="ip-card" style="padding:0;overflow:hidden;margin-bottom:8px">'+
      '<div onclick="ipToggleHilera('+idx+')" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;cursor:pointer;-webkit-tap-highlight-color:rgba(10,110,209,.1)">'+
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<span id="ip-hil-chev-'+idx+'" style="color:#7a8794;font-size:13px">▸</span>'+
          '<div><div style="font-size:15px;font-weight:800;color:#23303d">'+escapeHtml(s.codigoBase||'')+'</div>'+
          '<div style="font-size:12px;color:#666">'+escapeHtml(s.cuartel||'')+' · '+escapeHtml(s.variedad||'')+' · Hilera '+escapeHtml(s.hilera||'')+'</div></div>'+
        '</div>'+
        '<div style="font-size:13px">'+sync+' <strong>'+(s.total||(s.countPrincipal+s.countPoliniz))+'</strong></div>'+
      '</div>'+
      '<div id="ip-hil-det-'+idx+'" style="display:none;padding:0 14px 14px">'+det+'</div>'+
    '</div>';
  }).join('');
  return html;
}

/* ── Marcar georreferencia real de una hilera tocando un mapa satelital ──
   Usa Leaflet + imagen satelital Esri (gratuito, sin API key). */
var _ipLeafletCargado = false;
function _ipCargarLeaflet(cb){
  if(_ipLeafletCargado && window.L){ cb(); return; }
  var css=document.createElement('link'); css.rel='stylesheet';
  css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(css);
  var js=document.createElement('script');
  js.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  js.onload=function(){ _ipLeafletCargado=true; cb(); };
  js.onerror=function(){ toast('Sin conexión','No se pudo cargar el mapa (requiere internet)','error'); };
  document.head.appendChild(js);
}
var _ipGpsPick = null; // {reg, mIni, mFin, modo}
function ipMarcarGpsMapa(id){
  var r=(STATE.cache.invplantas||[]).find(function(x){ return String(x.id)===String(id); });
  if(!r){ toast('Error','Hilera no encontrada','error'); return; }
  _ipCargarLeaflet(function(){
    var prev=document.getElementById('ip-gpsmap-modal'); if(prev) prev.remove();
    var m=document.createElement('div');
    m.id='ip-gpsmap-modal';
    m.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:10005;display:flex;flex-direction:column';
    m.innerHTML=
      '<div style="background:#354a5f;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">'+
        '<div><div style="font-weight:800">🎯 '+escapeHtml(r.codigoBase||'Hilera')+'</div>'+
        '<div id="ip-gpsmap-hint" style="font-size:12px;opacity:.9">Toque el mapa para marcar el INICIO (sur)</div></div>'+
        '<div style="display:flex;gap:6px">'+
          '<button id="ip-gpsmap-modo" onclick="ipGpsPickModo()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-weight:700;padding:8px 12px;border-radius:8px;cursor:pointer">Marcando: INICIO</button>'+
          '<button onclick="ipGpsPickGuardar()" style="background:#1a7e3e;border:none;color:#fff;font-weight:700;padding:8px 14px;border-radius:8px;cursor:pointer">💾 Guardar</button>'+
          '<button onclick="document.getElementById(\'ip-gpsmap-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:20px;width:38px;border-radius:8px;cursor:pointer">×</button>'+
        '</div>'+
      '</div>'+
      '<div id="ip-gpsmap" style="flex:1"></div>';
    document.body.appendChild(m);
    // Centro: gps existente, u otra hilera del cuartel, o Angol
    var c = (r.gpsInicio) || (function(){
      var o=(STATE.cache.invplantas||[]).find(function(x){ return x.cuartel===r.cuartel && x.gpsInicio; });
      return o ? o.gpsInicio : {lat:-37.795, lng:-72.716};
    })();
    var map=L.map('ip-gpsmap').setView([c.lat,c.lng], r.gpsInicio?19:16);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:19, attribution:'Esri World Imagery'}).addTo(map);
    _ipGpsPick={reg:r, map:map, mIni:null, mFin:null, modo:'inicio'};
    function poner(tipo, lat, lng){
      var col = tipo==='inicio' ? '#1a7e3e' : '#c0392b';
      var mk = L.circleMarker([lat,lng],{radius:9,color:'#fff',weight:2,fillColor:col,fillOpacity:1}).addTo(map)
        .bindTooltip(tipo==='inicio'?'▶ Inicio (sur)':'■ Fin (norte)',{permanent:true,direction:'top'});
      if(tipo==='inicio'){ if(_ipGpsPick.mIni) map.removeLayer(_ipGpsPick.mIni); _ipGpsPick.mIni=mk; }
      else { if(_ipGpsPick.mFin) map.removeLayer(_ipGpsPick.mFin); _ipGpsPick.mFin=mk; }
    }
    if(r.gpsInicio) poner('inicio', r.gpsInicio.lat, r.gpsInicio.lng);
    if(r.gpsFin) poner('fin', r.gpsFin.lat, r.gpsFin.lng);
    map.on('click', function(ev){
      poner(_ipGpsPick.modo, ev.latlng.lat, ev.latlng.lng);
      // pasar automáticamente a FIN tras marcar inicio
      if(_ipGpsPick.modo==='inicio'){ ipGpsPickModo('fin'); }
    });
  });
}
function ipGpsPickModo(forzar){
  if(!_ipGpsPick) return;
  _ipGpsPick.modo = forzar || (_ipGpsPick.modo==='inicio' ? 'fin' : 'inicio');
  var b=document.getElementById('ip-gpsmap-modo'); var h=document.getElementById('ip-gpsmap-hint');
  if(b) b.textContent='Marcando: '+(_ipGpsPick.modo==='inicio'?'INICIO':'FIN');
  if(h) h.textContent='Toque el mapa para marcar el '+(_ipGpsPick.modo==='inicio'?'INICIO (sur)':'FIN (norte)');
}
async function ipGpsPickGuardar(){
  if(!_ipGpsPick) return;
  var r=_ipGpsPick.reg;
  if(_ipGpsPick.mIni){ var a=_ipGpsPick.mIni.getLatLng(); r.gpsInicio={lat:a.lat,lng:a.lng}; }
  if(_ipGpsPick.mFin){ var b=_ipGpsPick.mFin.getLatLng(); r.gpsFin={lat:b.lat,lng:b.lng}; }
  r.sincronizado=false;
  try{ await dbPut('invplantas', r); STATE.cache.invplantas=await dbAll('invplantas'); }catch(e){}
  document.getElementById('ip-gpsmap-modal').remove();
  _ipGpsPick=null;
  toast('Guardado','Georreferencia actualizada','success');
  ipRender(document.getElementById('mainContent'));
}
try{ window.ipMarcarGpsMapa=ipMarcarGpsMapa; window.ipGpsPickModo=ipGpsPickModo; window.ipGpsPickGuardar=ipGpsPickGuardar; }catch(e){}
function ipAbrirMapaPunto(lat,lng){ window.open('https://www.google.com/maps/search/?api=1&query='+lat+','+lng, '_blank'); }

// ═══════════ MAPA GENERAL DEL CUARTEL (ventana emergente) ═══════════
// Paso 1: filtro para seleccionar uno o más cuarteles
function ipAbrirMapaGeneral(){
  if(!can('invplantas.revisar')){ toast('Sin permiso','No tiene permiso para ver el mapa','error'); return; }
  var regs = STATE.cache.invplantas||[];
  if(!regs.length){ toast('Sin datos','No hay hileras registradas','error'); return; }
  // Cuarteles disponibles
  var cuarteles = [...new Set(regs.map(function(r){ return r.cuartel||''; }).filter(Boolean))].sort();

  var modal=document.createElement('div');
  modal.id='ip-mapagen-filtro';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:420px;width:100%;padding:22px;max-height:90vh;overflow-y:auto">'+
    '<div style="font-size:18px;font-weight:800;color:#23303d;margin-bottom:4px">🗺️ Mapa general</div>'+
    '<div style="font-size:13px;color:#888;margin-bottom:14px">Seleccione uno o más cuarteles para visualizar</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:10px">'+
      '<button onclick="ipFiltroTodos(true)" style="flex:1;padding:8px;background:#f0f7ff;color:#0854a0;border:1px solid #bcd9f5;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">Todos</button>'+
      '<button onclick="ipFiltroTodos(false)" style="flex:1;padding:8px;background:#f5f5f5;color:#666;border:1px solid #ddd;border-radius:8px;cursor:pointer;font-size:12px;font-weight:700">Ninguno</button>'+
    '</div>'+
    '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">'+
      cuarteles.map(function(cu){
        var nHil = regs.filter(function(r){return r.cuartel===cu;}).length;
        return '<label style="display:flex;align-items:center;gap:10px;padding:11px;border:2px solid #e5e5e5;border-radius:10px;cursor:pointer;font-size:14px">'+
          '<input type="checkbox" class="ip-cuartel-chk" value="'+escapeHtml(cu)+'" checked style="width:18px;height:18px">'+
          '<span><strong>'+escapeHtml(cu)+'</strong> <span style="color:#888;font-size:12px">('+nHil+' hilera'+(nHil!==1?'s':'')+')</span></span>'+
        '</label>';
      }).join('')+
    '</div>'+
    '<button onclick="ipMostrarMapaGeneral()" style="width:100%;padding:14px;background:#0a6ed1;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:8px">Ver mapa</button>'+
    '<button onclick="document.getElementById(\'ip-mapagen-filtro\').remove()" style="width:100%;padding:12px;background:#f0f0f0;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700">Cancelar</button>'+
  '</div>';
  document.body.appendChild(modal);
}

function ipFiltroTodos(val){
  document.querySelectorAll('.ip-cuartel-chk').forEach(function(c){ c.checked=val; });
}

// Paso 2: mostrar el mapa con las hileras seleccionadas
// Registros actualmente visibles en el mapa general (para el detalle por estado).
var _ipMapaGenRegs = [];
/* Despliega el detalle de qué hileras y qué números de planta están en un
   estado dado (ej. Muerto), agrupado por cuartel e hilera, con opción de
   imprimir para medidas correctivas en el huerto. */
function ipDetalleEstado(estado){
  var e = IP_ESTADOS[estado] || {label:estado, color:'#888'};
  var regs = _ipMapaGenRegs || [];
  var porCuartel = {};
  var totalEstado = 0;
  regs.forEach(function(r){
    (r.plantas||[]).forEach(function(p){
      var est = (p && p.estado) ? p.estado : 'sano';
      if(est!==estado) return;
      var cuartel = r.cuartel || '—';
      var hilera = r.codigoBase || ('H'+r.hilera);
      var mHil = String(hilera).match(/H\d+$/i);
      var hilCorto = mHil ? mHil[0].toUpperCase() : hilera;
      if(!porCuartel[cuartel]) porCuartel[cuartel] = {};
      if(!porCuartel[cuartel][hilCorto]) porCuartel[cuartel][hilCorto] = [];
      porCuartel[cuartel][hilCorto].push(p.seq!=null ? p.seq : '?');
      totalEstado++;
    });
  });

  var detalleHtml = '';
  Object.keys(porCuartel).sort().forEach(function(cuartel){
    detalleHtml += '<div style="margin-bottom:14px">'+
      '<div style="font-size:15px;font-weight:800;color:#23303d;border-bottom:2px solid #e3e8ee;padding-bottom:4px;margin-bottom:8px">📍 '+escapeHtml(cuartel)+'</div>';
    var hileras = porCuartel[cuartel];
    Object.keys(hileras).sort(function(a,b){
      return (parseInt(a.replace(/[^0-9]/g,''))||0)-(parseInt(b.replace(/[^0-9]/g,''))||0);
    }).forEach(function(hil){
      var plantas = hileras[hil].sort(function(a,b){ return (a||0)-(b||0); });
      detalleHtml += '<div style="margin-bottom:6px;font-size:13px;color:#3a4a5a">'+
        '<strong style="color:#1a5288">'+escapeHtml(hil)+'</strong> '+
        '<span style="color:#7a8794">('+plantas.length+' planta'+(plantas.length!==1?'s':'')+'):</span> '+
        'N° '+plantas.join(', ')+
      '</div>';
    });
    detalleHtml += '</div>';
  });
  if(!detalleHtml) detalleHtml = '<div style="color:#7a8794">No hay plantas en este estado.</div>';

  var prev = document.getElementById('ip-estado-detalle-modal'); if(prev) prev.remove();
  var modal = document.createElement('div');
  modal.id = 'ip-estado-detalle-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="background:'+e.color+';color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-size:17px;font-weight:800">'+escapeHtml(e.label)+' — detalle</div>'+
          '<div style="font-size:12px;opacity:.9">'+totalEstado+' planta(s) en este estado</div></div>'+
        '<button onclick="document.getElementById(\'ip-estado-detalle-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
      '</div>'+
      '<div id="ip-estado-detalle-body" style="padding:18px;overflow:auto;flex:1">'+detalleHtml+'</div>'+
      '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;gap:10px;justify-content:flex-end">'+
        '<button onclick="document.getElementById(\'ip-estado-detalle-modal\').remove()" style="padding:11px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cerrar</button>'+
        '<button onclick="ipImprimirDetalleEstado(\''+estado+'\')" style="padding:11px 18px;border:none;border-radius:9px;background:#1565c0;color:#fff;cursor:pointer;font-size:14px;font-weight:700">🖨️ Imprimir detalle</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

/* Abre una ventana de impresión con el detalle del estado para llevar a terreno. */
function ipImprimirDetalleEstado(estado){
  var e = IP_ESTADOS[estado] || {label:estado, color:'#888'};
  var bodyEl = document.getElementById('ip-estado-detalle-body');
  var contenido = bodyEl ? bodyEl.innerHTML : '';
  var fecha = new Date().toLocaleString('es-CL');
  var usuario = (STATE.user ? (STATE.user.nombre||STATE.user.id) : '');
  var win = window.open('', '_blank');
  if(!win){ if(typeof toast==='function') toast('Impresión bloqueada','Permita las ventanas emergentes para imprimir','error'); return; }
  win.document.write(
    '<html><head><title>Detalle plantas '+e.label+'</title>'+
    '<meta charset="utf-8"><style>'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:24px;max-width:800px;margin:0 auto}'+
    'h1{font-size:20px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:16px}'+
    '.badge{display:inline-block;width:14px;height:14px;border-radius:50%;background:'+e.color+';vertical-align:middle;margin-right:6px}'+
    '@media print{button{display:none}}'+
    '</style></head><body>'+
    '<h1><span class="badge"></span>Detalle de plantas en estado: '+e.label+'</h1>'+
    '<div class="sub">Sociedad Agrícola y Forestal La Cabaña · Inventario de Huerto<br>'+
      'Generado: '+fecha+(usuario?(' · por '+escapeHtml(usuario)):'')+'</div>'+
    contenido+
    '<div style="margin-top:24px;font-size:12px;color:#6b7280;border-top:1px solid #ddd;padding-top:10px">Documento para medidas correctivas del huerto. Los números corresponden a la posición de la planta dentro de cada hilera.</div>'+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt>'+
    '</body></html>'
  );
  win.document.close();
}
// Exponer explícitamente en window para que el onclick inline de las tarjetas
// las encuentre de forma fiable en cualquier dispositivo/contexto.
try{ window.ipDetalleEstado = ipDetalleEstado; window.ipImprimirDetalleEstado = ipImprimirDetalleEstado; }catch(e){}

/* Detalle de polinizantes: variedad, cuartel, hilera y n° de planta. */
function ipDetallePoliniz(){
  var regs = _ipMapaGenRegs || [];
  var porVariedad = {}; var total = 0;
  regs.forEach(function(r){
    (r.plantas||[]).forEach(function(p){
      if(!p || p.tipo!=='poliniz') return;
      var vp = p.polinizante || r.polinizante || 'Sin variedad';
      var cuartel = r.cuartel || '—';
      var hilera = r.codigoBase || ('H'+r.hilera);
      var mHil = String(hilera).match(/H\d+$/i);
      var hilCorto = mHil ? mHil[0].toUpperCase() : hilera;
      if(!porVariedad[vp]) porVariedad[vp] = {};
      if(!porVariedad[vp][cuartel]) porVariedad[vp][cuartel] = {};
      if(!porVariedad[vp][cuartel][hilCorto]) porVariedad[vp][cuartel][hilCorto] = [];
      porVariedad[vp][cuartel][hilCorto].push(p.seq!=null ? p.seq : '?');
      total++;
    });
  });

  var detalleHtml = '';
  Object.keys(porVariedad).sort().forEach(function(vp){
    var color = ipColorPoliniz(vp);
    detalleHtml += '<div style="margin-bottom:18px">'+
      '<div style="font-size:15px;font-weight:800;color:#23303d;border-bottom:2px solid '+color+';padding-bottom:4px;margin-bottom:8px">'+
        '<span style="width:12px;height:12px;border-radius:50%;background:'+color+';border:1px solid #000;display:inline-block;margin-right:6px"></span>🐝 '+escapeHtml(vp)+'</div>';
    Object.keys(porVariedad[vp]).sort().forEach(function(cuartel){
      detalleHtml += '<div style="font-size:13px;font-weight:700;color:#1a5288;margin:6px 0 4px">📍 '+escapeHtml(cuartel)+'</div>';
      var hileras = porVariedad[vp][cuartel];
      Object.keys(hileras).sort(function(a,b){
        return (parseInt(a.replace(/[^0-9]/g,''))||0)-(parseInt(b.replace(/[^0-9]/g,''))||0);
      }).forEach(function(hil){
        var plantas = hileras[hil].sort(function(a,b){ return (a||0)-(b||0); });
        detalleHtml += '<div style="margin-bottom:6px;font-size:13px;color:#3a4a5a">'+
          '<strong style="color:#1a5288">'+escapeHtml(hil)+'</strong> '+
          '<span style="color:#7a8794">('+plantas.length+' planta'+(plantas.length!==1?'s':'')+'):</span> '+
          'N° '+plantas.join(', ')+
        '</div>';
      });
    });
    detalleHtml += '</div>';
  });
  if(!detalleHtml) detalleHtml = '<div style="color:#7a8794">No hay polinizantes registrados.</div>';

  var prev = document.getElementById('ip-poliniz-detalle-modal'); if(prev) prev.remove();
  var modal = document.createElement('div');
  modal.id = 'ip-poliniz-detalle-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="background:#e9730c;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-size:17px;font-weight:800">🐝 Polinizantes — detalle</div>'+
          '<div style="font-size:12px;opacity:.9">'+total+' planta(s) polinizante(s)</div></div>'+
        '<button onclick="document.getElementById(\'ip-poliniz-detalle-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
      '</div>'+
      '<div id="ip-poliniz-detalle-body" style="padding:18px;overflow:auto;flex:1">'+detalleHtml+'</div>'+
      '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;gap:10px;justify-content:flex-end">'+
        '<button onclick="document.getElementById(\'ip-poliniz-detalle-modal\').remove()" style="padding:11px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cerrar</button>'+
        '<button onclick="ipImprimirDetallePoliniz()" style="padding:11px 18px;border:none;border-radius:9px;background:#1565c0;color:#fff;cursor:pointer;font-size:14px;font-weight:700">🖨️ Imprimir detalle</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

/* Imprime el detalle de polinizantes (carta). */
function ipImprimirDetallePoliniz(){
  var bodyEl = document.getElementById('ip-poliniz-detalle-body');
  var contenido = bodyEl ? bodyEl.innerHTML : '';
  var fecha = new Date().toLocaleString('es-CL');
  var usuario = (STATE.user ? (STATE.user.nombre||STATE.user.id) : '');
  var win = window.open('', '_blank');
  if(!win){ if(typeof toast==='function') toast('Impresión bloqueada','Permita las ventanas emergentes para imprimir','error'); return; }
  win.document.write(
    '<html><head><title>Detalle polinizantes</title>'+
    '<meta charset="utf-8"><style>'+
    '@page{size:letter;margin:14mm}'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:24px;max-width:800px;margin:0 auto}'+
    'h1{font-size:20px;margin:0 0 4px} .sub{color:#6b7280;font-size:13px;margin-bottom:16px}'+
    '@media print{button{display:none}}'+
    '</style></head><body>'+
    '<h1>🐝 Detalle de plantas polinizantes</h1>'+
    '<div class="sub">Sociedad Agrícola y Forestal La Cabaña · Inventario de Huerto<br>'+
      'Generado: '+fecha+(usuario?(' · por '+escapeHtml(usuario)):'')+'</div>'+
    contenido+
    '<div style="margin-top:24px;font-size:12px;color:#6b7280;border-top:1px solid #ddd;padding-top:10px">Los números corresponden a la posición de la planta dentro de cada hilera. Skeena en rojo, Kordia en celeste.</div>'+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt>'+
    '</body></html>'
  );
  win.document.close();
}

/* Imprime el mapa general completo en hoja tamaño carta. */
function ipImprimirMapaGeneral(){
  var bodyEl = document.getElementById('ip-mapagen-body');
  var contenido = bodyEl ? bodyEl.innerHTML : '';
  var fecha = new Date().toLocaleString('es-CL');
  var usuario = (STATE.user ? (STATE.user.nombre||STATE.user.id) : '');
  var win = window.open('', '_blank');
  if(!win){ if(typeof toast==='function') toast('Impresión bloqueada','Permita las ventanas emergentes para imprimir','error'); return; }
  win.document.write(
    '<html><head><title>Mapa general del huerto</title>'+
    '<meta charset="utf-8"><style>'+
    '@page{size:letter;margin:10mm}'+
    'body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;padding:10px;margin:0}'+
    'h1{font-size:18px;margin:0 0 2px} .sub{color:#6b7280;font-size:12px;margin-bottom:12px}'+
    'svg{max-width:100%;height:auto}'+
    '.ip-map-svg-wrap{width:100% !important}'+
    '@media print{button{display:none} div[style*="margin-bottom:22px"]{page-break-inside:avoid}}'+
    '</style></head><body>'+
    '<h1>🗺️ Mapa general del huerto</h1>'+
    '<div class="sub">Sociedad Agrícola y Forestal La Cabaña · Inventario de Huerto · Generado: '+fecha+(usuario?(' · por '+escapeHtml(usuario)):'')+'</div>'+
    contenido+
    '<scr'+'ipt>window.onload=function(){window.print();}<\/scr'+'ipt>'+
    '</body></html>'
  );
  win.document.close();
}
try{ window.ipDetallePoliniz = ipDetallePoliniz; window.ipImprimirDetallePoliniz = ipImprimirDetallePoliniz; window.ipImprimirMapaGeneral = ipImprimirMapaGeneral; }catch(e){}

/* Edición masiva del polinizante asociado a cada hilera (mapa general). */
function ipEditarPolinizMasivo(){
  if(!STATE.user || STATE.user.role!=='admin'){ toast('Sin permiso','Solo el administrador puede editar polinizantes','error'); return; }
  var regs = _ipMapaGenRegs || [];
  if(!regs.length){ toast('Sin datos','No hay hileras en el mapa','error'); return; }
  var vars = ipVariedadesLista();
  var opts = function(sel){
    return '<option value="">— Sin polinizante —</option>'+vars.map(function(v){
      return '<option value="'+escapeHtml(v)+'"'+(v===sel?' selected':'')+'>'+escapeHtml(v)+'</option>';
    }).join('');
  };
  var rows='';
  regs.slice().sort(function(a,b){
    var c=(a.cuartel||'').localeCompare(b.cuartel||''); if(c) return c;
    return (parseInt(String(a.hilera).replace(/[^0-9]/g,''))||0)-(parseInt(String(b.hilera).replace(/[^0-9]/g,''))||0);
  }).forEach(function(r){
    var hil = String(r.codigoBase||('H'+r.hilera));
    var m = hil.match(/H\d+$/i); var hilCorto = m?m[0].toUpperCase():hil;
    var nPol = (r.plantas||[]).filter(function(p){return p&&p.tipo==='poliniz';}).length;
    rows += '<tr>'+
      '<td style="padding:6px 8px;font-size:13px">'+escapeHtml(r.cuartel||'—')+'</td>'+
      '<td style="padding:6px 8px;font-size:13px;font-weight:700;color:#1a5288">'+escapeHtml(hilCorto)+'</td>'+
      '<td style="padding:6px 8px;font-size:12px;color:#7a8794">'+nPol+'</td>'+
      '<td style="padding:6px 8px"><select class="ip-pol-sel" data-id="'+escapeHtml(r.id)+'" style="width:100%;padding:8px;border:1px solid #ccd;border-radius:7px;font-size:13px">'+opts(r.polinizante||'')+'</select></td>'+
    '</tr>';
  });
  var prev=document.getElementById('ip-polmasivo-modal'); if(prev) prev.remove();
  var modal=document.createElement('div');
  modal.id='ip-polmasivo-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10003;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML=
    '<div style="background:#fff;border-radius:12px;max-width:620px;width:100%;max-height:88vh;display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="background:#e9730c;color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center">'+
        '<div><div style="font-size:17px;font-weight:800">🐝 Cambiar polinizante por hilera</div>'+
          '<div style="font-size:12px;opacity:.9">'+regs.length+' hilera(s) · el cambio aplica a todas las plantas polinizantes de la hilera</div></div>'+
        '<button onclick="document.getElementById(\'ip-polmasivo-modal\').remove()" style="background:rgba(255,255,255,.25);border:none;color:#fff;font-size:24px;cursor:pointer;width:40px;height:40px;border-radius:8px">×</button>'+
      '</div>'+
      '<div style="padding:12px 18px;overflow:auto;flex:1">'+
        '<table style="width:100%;border-collapse:collapse">'+
          '<thead><tr style="border-bottom:2px solid #e3e8ee;text-align:left"><th style="padding:6px 8px;font-size:12px;color:#7a8794">Cuartel</th><th style="padding:6px 8px;font-size:12px;color:#7a8794">Hilera</th><th style="padding:6px 8px;font-size:12px;color:#7a8794">N° poliniz.</th><th style="padding:6px 8px;font-size:12px;color:#7a8794">Variedad polinizante</th></tr></thead>'+
          '<tbody>'+rows+'</tbody>'+
        '</table>'+
      '</div>'+
      '<div style="padding:12px 18px;border-top:1px solid #e3e8ee;display:flex;gap:10px;justify-content:flex-end">'+
        '<button onclick="document.getElementById(\'ip-polmasivo-modal\').remove()" style="padding:11px 16px;border:none;border-radius:9px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cancelar</button>'+
        '<button onclick="ipGuardarPolinizMasivo()" style="padding:11px 18px;border:none;border-radius:9px;background:#1a7e3e;color:#fff;cursor:pointer;font-size:14px;font-weight:700">💾 Guardar cambios</button>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
}

async function ipGuardarPolinizMasivo(){
  var sels=document.querySelectorAll('#ip-polmasivo-modal .ip-pol-sel');
  var cambios=0;
  for(var i=0;i<sels.length;i++){
    var id=sels[i].getAttribute('data-id');
    var val=sels[i].value;
    var r=(STATE.cache.invplantas||[]).find(function(x){return String(x.id)===String(id);});
    if(!r || (r.polinizante||'')===val) continue;
    r.polinizante=val;
    // Propagar a las plantas polinizantes (el mapa prioriza el valor por planta)
    (r.plantas||[]).forEach(function(p){ if(p && p.tipo==='poliniz') p.polinizante=val; });
    r.sincronizado=false;
    try{ await dbPut('invplantas',r); cambios++; }catch(e){}
  }
  document.getElementById('ip-polmasivo-modal').remove();
  if(cambios){
    STATE.cache.invplantas=await dbAll('invplantas');
    toast('Guardado',cambios+' hilera(s) actualizada(s)','success');
    // Refrescar el mapa con los nuevos colores
    var mg=document.getElementById('ip-mapagen-modal');
    if(mg){ mg.remove(); ipMostrarMapaGeneral(); }
  } else {
    toast('Sin cambios','No se modificó ninguna hilera','info');
  }
}
try{ window.ipEditarPolinizMasivo = ipEditarPolinizMasivo; window.ipGuardarPolinizMasivo = ipGuardarPolinizMasivo; }catch(e){}

// Filtro visual del mapa general: lista de claves activas (estados y 'pol:VARIEDAD').
// Vacío = mostrar todo. Las no seleccionadas se atenúan sin cambiar de posición.
var _ipMapaGenFiltro = [];
var _ipMapaGenCuarteles = [];
function ipToggleFiltroMapa(clave){
  var i=_ipMapaGenFiltro.indexOf(clave);
  if(i>=0) _ipMapaGenFiltro.splice(i,1); else _ipMapaGenFiltro.push(clave);
  // Re-render del mapa manteniéndolo abierto
  var mg=document.getElementById('ip-mapagen-modal');
  if(mg){ mg.remove(); ipMostrarMapaGeneral(); }
}
function ipLimpiarFiltroMapa(){
  _ipMapaGenFiltro=[];
  var mg=document.getElementById('ip-mapagen-modal');
  if(mg){ mg.remove(); ipMostrarMapaGeneral(); }
}
try{ window.ipToggleFiltroMapa=ipToggleFiltroMapa; window.ipLimpiarFiltroMapa=ipLimpiarFiltroMapa; }catch(e){}

function ipMostrarMapaGeneral(){
  _ipMapZoom = 100; // reiniciar zoom al abrir
  var seleccionados = [];
  document.querySelectorAll('.ip-cuartel-chk:checked').forEach(function(c){ seleccionados.push(c.value); });
  // Si no vienen de checkboxes (re-render por filtro/zoom), reusar los últimos.
  if(!seleccionados.length && _ipMapaGenCuarteles && _ipMapaGenCuarteles.length){
    seleccionados = _ipMapaGenCuarteles.slice();
  }
  if(!seleccionados.length){ toast('Seleccione','Marque al menos un cuartel','error'); return; }
  _ipMapaGenCuarteles = seleccionados.slice(); // recordar para re-renders
  var fm=document.getElementById('ip-mapagen-filtro'); if(fm)fm.remove();

  var regs = (STATE.cache.invplantas||[]).filter(function(r){ return seleccionados.indexOf(r.cuartel)>=0; });
  // Agrupar por cuartel
  var porCuartel = {};
  seleccionados.forEach(function(cu){ porCuartel[cu]=[]; });
  regs.forEach(function(r){ if(!porCuartel[r.cuartel]) porCuartel[r.cuartel]=[]; porCuartel[r.cuartel].push(r); });

  var modal=document.createElement('div');
  modal.id='ip-mapagen-modal';
  modal.style.cssText='position:fixed;left:0;top:0;width:100vw;height:100dvh;background:rgba(0,0,0,.5);z-index:10001;display:flex;flex-direction:column;padding:0';

  var header='<div style="background:#354a5f;color:#fff;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;flex-wrap:wrap;gap:6px">'+
    '<div><div style="font-size:18px;font-weight:800">🗺️ Mapa general del huerto</div>'+
      '<div style="font-size:12px;opacity:.85">'+seleccionados.length+' cuartel(es) · '+regs.length+' hilera(s)</div></div>'+
    '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">'+
      (STATE.user && STATE.user.role==='admin' ? '<button onclick="ipEditarPolinizMasivo()" title="Cambiar polinizante por hilera" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:13px;font-weight:700;cursor:pointer;height:44px;padding:0 14px;border-radius:8px">🐝 Polinizantes</button>' : '')+
      '<button onclick="ipImprimirMapaGeneral()" title="Imprimir en carta" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:13px;font-weight:700;cursor:pointer;height:44px;padding:0 14px;border-radius:8px">🖨️ Imprimir</button>'+
      '<div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.12);border-radius:10px;padding:3px">'+
        '<button onclick="ipMapZoom(-1)" title="Reducir" style="background:rgba(255,255,255,.18);border:none;color:#fff;font-size:20px;cursor:pointer;width:38px;height:38px;border-radius:8px;line-height:1">−</button>'+
        '<span id="ip-map-zoom-label" style="font-size:12px;min-width:42px;text-align:center;font-weight:700">100%</span>'+
        '<button onclick="ipMapZoom(1)" title="Aumentar" style="background:rgba(255,255,255,.18);border:none;color:#fff;font-size:20px;cursor:pointer;width:38px;height:38px;border-radius:8px;line-height:1">+</button>'+
      '</div>'+
      '<button onclick="document.getElementById(\'ip-mapagen-modal\').remove();_ipMapaGenFiltro=[];_ipMapaGenCuarteles=[];" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:26px;cursor:pointer;width:44px;height:44px;border-radius:8px">×</button>'+
    '</div>'+
  '</div>';

  var body='<div id="ip-mapagen-body" style="flex:1;overflow:auto;padding:20px;background:#f4f6f8">';

  // ── Resumen de cantidades de plantas por estado (parte superior) ──
  // Recorre todas las plantas de todas las hileras de los cuarteles
  // seleccionados y cuenta cuántas hay en cada estado (Sano, Débil, Muerto,
  // Replante, Falla/vacío).
  var conteoEstados = { sano:0, debil:0, muerto:0, replante:0, falta:0 };
  var totalPlantas = 0;
  var conteoPoliniz = {}; var totalPoliniz = 0;
  _ipMapaGenRegs = regs; // guardar para el detalle imprimible por estado
  regs.forEach(function(r){
    (r.plantas||[]).forEach(function(p){
      var est = (p && p.estado) ? p.estado : 'sano';
      if(conteoEstados[est]===undefined) conteoEstados[est] = 0;
      conteoEstados[est]++;
      totalPlantas++;
      if(p && p.tipo==='poliniz'){
        var vp = p.polinizante || r.polinizante || 'Sin variedad';
        conteoPoliniz[vp] = (conteoPoliniz[vp]||0)+1;
        totalPoliniz++;
      }
    });
  });
  body += '<div style="background:#fff;border:1px solid #e3e8ee;border-radius:10px;padding:14px 16px;margin-bottom:16px">'+
    '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">'+
      '<div style="font-size:14px;font-weight:800;color:#23303d">📊 Resumen de plantas por estado</div>'+
      '<div style="font-size:13px;color:#3a4a5a">Total: <strong style="color:#23303d;font-size:15px">'+totalPlantas.toLocaleString('es-CL')+'</strong> plantas</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;width:100%;max-width:100%">'+
      Object.keys(IP_ESTADOS).map(function(k){
        var e = IP_ESTADOS[k];
        var n = conteoEstados[k]||0;
        var pct = totalPlantas>0 ? Math.round((n/totalPlantas)*1000)/10 : 0;
        var clickable = n>0;
        var handler = clickable ? ('onclick="ipDetalleEstado(\''+k+'\')" ontouchend="event.preventDefault();ipDetalleEstado(\''+k+'\')" ') : '';
        return '<div '+handler+'style="min-width:0;overflow:hidden;background:#f8fafb;border:1px solid #e3e8ee;border-left:4px solid '+e.color+';border-radius:8px;padding:10px 12px'+(clickable?';cursor:pointer;-webkit-tap-highlight-color:rgba(21,101,192,.2)':'')+'">'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'+
            '<span style="width:11px;height:11px;border-radius:50%;background:'+e.color+';border:1px solid #999;display:inline-block"></span>'+
            '<span style="font-size:12px;color:#3a4a5a;font-weight:600">'+e.label+'</span>'+
          '</div>'+
          '<div style="font-size:22px;font-weight:800;color:#23303d;line-height:1.1">'+n.toLocaleString('es-CL')+'</div>'+
          '<div style="font-size:11px;color:#7a8794">'+pct+'% del total'+(clickable?' · ver detalle ›':'')+'</div>'+
        '</div>';
      }).join('')+
      (function(){
        var clickable = totalPoliniz>0;
        var handler = clickable ? 'onclick="ipDetallePoliniz()" ontouchend="event.preventDefault();ipDetallePoliniz()" ' : '';
        var pct = totalPlantas>0 ? Math.round((totalPoliniz/totalPlantas)*1000)/10 : 0;
        var chips = Object.keys(conteoPoliniz).sort().map(function(v){
          return '<span style="display:inline-flex;align-items:center;gap:3px;margin-right:6px"><span style="width:9px;height:9px;border-radius:50%;background:'+ipColorPoliniz(v)+';display:inline-block"></span>'+escapeHtml(v)+': '+conteoPoliniz[v]+'</span>';
        }).join('');
        return '<div '+handler+'style="min-width:0;overflow:hidden;background:#fff7ef;border:1px solid #e3e8ee;border-left:4px solid #e9730c;border-radius:8px;padding:10px 12px'+(clickable?';cursor:pointer;-webkit-tap-highlight-color:rgba(21,101,192,.2)':'')+'">'+
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'+
            '<span style="font-size:12px">🐝</span>'+
            '<span style="font-size:12px;color:#3a4a5a;font-weight:600">Polinizantes</span>'+
          '</div>'+
          '<div style="font-size:22px;font-weight:800;color:#23303d;line-height:1.1">'+totalPoliniz.toLocaleString('es-CL')+'</div>'+
          '<div style="font-size:11px;color:#7a8794">'+pct+'% del total'+(clickable?' · ver detalle ›':'')+'</div>'+
          (chips?'<div style="font-size:11px;color:#3a4a5a;margin-top:4px">'+chips+'</div>':'')+
        '</div>';
      })()+
    '</div>'+
  '</div>';

  // Barra de FILTROS: chips clicables para mostrar solo ciertos estados/variedades.
  // Las plantas no seleccionadas se atenúan pero conservan su posición real.
  var chip=function(clave,label,color){
    var activo = _ipMapaGenFiltro.indexOf(clave)>=0;
    return '<button onclick="ipToggleFiltroMapa(\''+clave+'\')" style="display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;border:2px solid '+(activo?color:'#e3e8ee')+';background:'+(activo?color:'#fff')+';color:'+(activo?'#fff':'#3a4a5a')+';border-radius:16px;padding:5px 12px;cursor:pointer">'+
      '<span style="width:11px;height:11px;border-radius:50%;background:'+color+';border:1px solid rgba(0,0,0,.3);display:inline-block"></span>'+label+'</button>';
  };
  var hayFiltro = _ipMapaGenFiltro.length>0;
  body += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;background:#f8fafb;border:1px solid #e3e8ee;padding:10px 14px;border-radius:8px">'+
    '<span style="font-size:12px;font-weight:800;color:#23303d;margin-right:4px">🔍 Filtrar:</span>'+
    Object.keys(IP_ESTADOS).map(function(k){return chip(k, IP_ESTADOS[k].label, IP_ESTADOS[k].color);}).join('')+
    chip('pol:SKEENA','🐝 Skeena','#d32f2f')+
    chip('pol:KORDIA','🐝 Kordia','#4fc3f7')+
    (hayFiltro?'<button onclick="ipLimpiarFiltroMapa()" style="font-size:12px;font-weight:700;border:none;background:#eee;color:#666;border-radius:16px;padding:5px 12px;cursor:pointer;margin-left:auto">✕ Ver todo</button>':'')+
  '</div>';

  // Leyenda de estados
  body += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px;background:#fff;border:1px solid #e3e8ee;padding:10px 14px;border-radius:8px">'+
    Object.keys(IP_ESTADOS).map(function(k){var e=IP_ESTADOS[k];return '<span style="display:inline-flex;align-items:center;gap:5px;color:#3a4a5a;font-size:12px"><span style="width:12px;height:12px;border-radius:50%;background:'+e.color+';border:1px solid #999;display:inline-block"></span>'+e.label+'</span>';}).join('')+
    '<span style="display:inline-flex;align-items:center;gap:5px;color:#3a4a5a;font-size:12px"><span style="width:12px;height:12px;border-radius:50%;background:#d32f2f;border:1px solid #000;display:inline-block"></span>🐝 Skeena</span>'+
    '<span style="display:inline-flex;align-items:center;gap:5px;color:#3a4a5a;font-size:12px"><span style="width:12px;height:12px;border-radius:50%;background:#4fc3f7;border:1px solid #000;display:inline-block"></span>🐝 Kordia</span>'+
    '<span style="color:#7a8794;font-size:12px;margin-left:auto">Toque una hilera para ver su ubicación en Google Maps</span>'+
  '</div>';

  seleccionados.forEach(function(cu){
    var hileras = (porCuartel[cu]||[]).slice().sort(function(a,b){
      return (parseInt(String(a.hilera).replace(/[^0-9]/g,''))||0) - (parseInt(String(b.hilera).replace(/[^0-9]/g,''))||0);
    });
    if(!hileras.length) return;
    body += ipRenderCuartelSVG(cu, hileras);
  });
  body += '</div>';

  modal.innerHTML = header + body;
  document.body.appendChild(modal);
}

// Nivel de zoom del mapa general (porcentaje del ancho base). El contenedor
// padre tiene overflow:auto, así que al ampliar aparece scroll para recorrer.
var _ipMapZoom = 100;
function ipMapZoom(delta){
  _ipMapZoom += (delta>0 ? 20 : -20);
  if(_ipMapZoom < 40) _ipMapZoom = 40;
  if(_ipMapZoom > 300) _ipMapZoom = 300;
  document.querySelectorAll('.ip-map-svg-wrap').forEach(function(wrap){
    wrap.style.width = _ipMapZoom + '%';
  });
  var lbl = document.getElementById('ip-map-zoom-label');
  if(lbl) lbl.textContent = _ipMapZoom + '%';
}

// Render de un cuartel como conjunto de hileras (líneas horizontales con plantas)
// El SVG usa viewBox + width:100% para AJUSTARSE al ancho del contenedor, de
// modo que el cuartel completo se ve sin scroll, tanto en PC como en móvil.
function ipRenderCuartelSVG(cuartel, hileras){
  var maxPlantas = Math.max.apply(null, hileras.map(function(h){ return (h.plantas||[]).length; }).concat([1]));
  var filas = hileras.length;
  // Tamaños base del sistema de coordenadas interno (viewBox). El SVG luego se
  // escala al ancho real disponible, así que estos valores son relativos.
  var anchoPlanta = 22, altoFila = 30, margenIzq = 56, margenSup = 8, margenDer = 24;
  var ancho = margenIzq + maxPlantas*anchoPlanta + margenDer;
  var alto = margenSup*2 + filas*altoFila + 16;

  // Resume el nombre de la hilera a su último campo: el "H+número" final.
  // Los códigos vienen concatenados sin separador (ej: "C1REGH1"), así que
  // extraemos el patrón H seguido de dígitos al final del nombre.
  function nombreCorto(h){
    var base = String(h.codigoBase || ('H'+h.hilera));
    var m = base.match(/H\d+$/i);
    if(m) return m[0].toUpperCase();
    // Respaldo: si no calza, usar el número de hilera.
    if(h.hilera!=null) return 'H'+String(h.hilera).replace(/[^0-9]/g,'');
    return base;
  }

  var svg = '<svg viewBox="0 0 '+ancho+' '+alto+'" preserveAspectRatio="xMidYMid meet" '+
            'style="display:block;width:100%;height:auto" xmlns="http://www.w3.org/2000/svg">';
  hileras.forEach(function(h, fi){
    var y = margenSup + fi*altoFila + altoFila/2;
    var plantas = h.plantas||[];
    var gpsIni = h.gpsInicio || (plantas[0] && plantas[0].lat!=null ? {lat:plantas[0].lat,lng:plantas[0].lng} : null);
    var gpsFin = h.gpsFin || (plantas.length && plantas[plantas.length-1].lat!=null ? {lat:plantas[plantas.length-1].lat,lng:plantas[plantas.length-1].lng} : null);
    var tieneGps = gpsIni || gpsFin;
    // Etiqueta de hilera resumida (solo el último campo, ej: H1)
    svg += '<text x="4" y="'+(y+4)+'" fill="#1a5288" font-size="12" font-weight="700">'+escapeHtml(nombreCorto(h))+(tieneGps?' 📍':'')+'</text>';
    // Línea base de la hilera — anclada al borde IZQUIERDO (la planta 1/sur queda
    // a la izquierda y las hileras de distinto largo se alinean por ese extremo).
    var xIzq = margenIzq;                               // extremo izquierdo útil
    var xDerHilera = xIzq + plantas.length*anchoPlanta; // donde termina (norte)
    svg += '<line x1="'+xIzq+'" y1="'+y+'" x2="'+xDerHilera+'" y2="'+y+'" stroke="#5b9bd5" stroke-width="2"/>';
    var ultIdx = plantas.length - 1;
    plantas.forEach(function(p, pi){
      // Orientación del huerto: la planta 1 es el extremo SUR y debe mostrarse a
      // la IZQUIERDA, alineada al borde izquierdo. pi=0 (planta 1) → posición más
      // a la izquierda; las siguientes hacia la derecha. (Eje vertical: H1 arriba.)
      var cx = xIzq + (pi*anchoPlanta + anchoPlanta/2);
      var e = IP_ESTADOS[p.estado]||IP_ESTADOS.sano;
      var esPoliniz = (p.tipo==='poliniz');
      var varPol = esPoliniz ? (p.polinizante || h.polinizante) : '';
      var fill = esPoliniz ? ipColorPoliniz(varPol) : e.color;
      var esInicio = (pi===0 && gpsIni);
      var esFin = (pi===ultIdx && gpsFin && ultIdx>0);
      var stroke = esPoliniz ? '#000' : 'rgba(0,0,0,.45)';
      var sw = esPoliniz ? 1.5 : 1;
      var link='', cursor='', extraTitle='';
      if(esInicio){ link='onclick="ipAbrirMapaPunto('+gpsIni.lat+','+gpsIni.lng+')"'; cursor='cursor:pointer'; stroke='#1565c0'; sw=3; extraTitle=' · 🟢 INICIO (toque para Google Maps)'; }
      else if(esFin){ link='onclick="ipAbrirMapaPunto('+gpsFin.lat+','+gpsFin.lng+')"'; cursor='cursor:pointer'; stroke='#1565c0'; sw=3; extraTitle=' · 🔴 FIN (toque para Google Maps)'; }
      var r = (esInicio||esFin) ? 8.5 : 7.5;
      // Filtro visual: si hay estados/variedades seleccionados, atenuar los no incluidos
      var op = 1;
      if(_ipMapaGenFiltro && _ipMapaGenFiltro.length>0){
        var clave = esPoliniz ? ('pol:'+(varPol||'').toUpperCase()) : (p.estado||'sano');
        if(_ipMapaGenFiltro.indexOf(clave)<0) op = 0.08;
      }
      svg += '<circle cx="'+cx+'" cy="'+y+'" r="'+r+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="'+sw+'" opacity="'+op+'" '+link+' style="'+cursor+'"><title>'+escapeHtml(ipCodigoPlanta(h,p))+(esPoliniz?' · 🐝 '+escapeHtml(varPol||'Polinizante'):'')+' · '+(IP_ESTADOS[p.estado]?IP_ESTADOS[p.estado].label:'')+extraTitle+'</title></circle>';
      if(esInicio){ svg += '<text x="'+cx+'" y="'+(y-11)+'" fill="#1565c0" font-size="8" font-weight="700" text-anchor="middle">▶</text>'; }
      else if(esFin){ svg += '<text x="'+cx+'" y="'+(y-11)+'" fill="#1565c0" font-size="8" font-weight="700" text-anchor="middle">■</text>'; }
    });
  });
  svg += '</svg>';

  return '<div style="margin-bottom:22px">'+
    (function(){
      // Estado general del cuartel: % de plantas sanas → color del chip
      var tot=0, sanas=0;
      hileras.forEach(function(h){ (h.plantas||[]).forEach(function(p){ if(!p) return; tot++; if((p.estado||'sano')==='sano') sanas++; }); });
      var pct = tot>0 ? Math.round(sanas*100/tot) : 0;
      var col = pct>=90 ? '#1a7e3e' : (pct>=75 ? '#7cb342' : (pct>=60 ? '#f1c40f' : (pct>=40 ? '#e9730c' : '#c0392b')));
      return '<div style="color:#23303d;font-size:16px;font-weight:800;margin-bottom:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">📍 '+escapeHtml(cuartel)+
        '<span style="font-size:12px;font-weight:400;opacity:.7">— '+hileras.length+' hileras</span>'+
        '<span style="font-size:11px;font-weight:800;color:#fff;background:'+col+';border-radius:10px;padding:2px 10px">'+pct+'% sano · '+tot+' plantas</span>'+
      '</div>';
    })()+
    '<div style="background:#fff;border:1px solid #e3e8ee;border-radius:10px;padding:12px;overflow:auto">'+
      '<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#7a8794;margin-bottom:4px;padding:0 4px"><span>← SUR (planta 1)</span><span>NORTE →</span></div>'+
      '<div class="ip-map-svg-wrap" style="width:100%;margin:0 auto">'+svg+'</div>'+
      '<div style="font-size:11px;color:#7a8794;margin-top:8px">▶ Inicio de hilera · ■ Fin de hilera — toque esos puntos para abrir Google Maps · La planta 1 (sur) se muestra a la izquierda.</div>'+
    '</div>'+
  '</div>';
}


// ── Sincronizar ──
async function ipSincronizar(){
  if(!navigator.onLine){ toast('Sin conexión','Conéctese a internet para subir','error'); return; }
  var pend=(STATE.cache.invplantas||[]).filter(function(x){return !x.sincronizado;});
  if(!pend.length){ toast('Todo al día','No hay hileras pendientes','info'); return; }
  var n=0;
  for(var i=0;i<pend.length;i++){ ipCompactarRegistro(pend[i]); pend[i].sincronizado=true; pend[i].fechaSync=new Date().toISOString(); try{ await dbPut('invplantas',pend[i]); n++; }catch(e){} }
  STATE.cache.invplantas=await dbAll('invplantas');
  ipRender();
  toast('Subido', n+' hilera(s) sincronizadas','success');
}

function ipEliminar(id){
  if(!can('invplantas.editar')){ toast('Sin permiso','No tiene permiso para eliminar','error'); return; }
  var s=(STATE.cache.invplantas||[]).find(function(x){return String(x.id)===String(id);});
  if(!s) return;
  confirmDialog('Eliminar hilera','¿Eliminar el registro de la hilera '+s.codigoBase+'?',async function(){
    await sciMarcarEliminado('invplantas', id); // lápida: evita que reaparezca al sincronizar
    await dbDel('invplantas', id);
    STATE.cache.invplantas=await dbAll('invplantas');
    ipRender();
    toast('Eliminado','','success');
  },'Eliminar',true);
}


// ── Editar registro: portainjerto, polinizante y gestión de plantas ──
var _ipEditId = null;
function ipEditarRegistro(id){
  if(!can('invplantas.editar')){ toast('Sin permiso','Solo administradores con permiso pueden editar','error'); return; }
  var s=(STATE.cache.invplantas||[]).find(function(x){return String(x.id)===String(id);});
  if(!s) return;
  _ipEditId = id;
  var plantas = s.plantas||[];

  var portaOpts = IP_PORTAINJERTOS.slice();
  // Incluir el portainjerto base del registro si no está en la lista
  if(s.portainjerto && portaOpts.indexOf(s.portainjerto)<0) portaOpts.unshift(s.portainjerto);
  var varOpts = ipVariedadesLista();
  if(s.polinizante && varOpts.indexOf(s.polinizante)<0) varOpts.unshift(s.polinizante);

  var modal=document.createElement('div');
  modal.id='ip-edit-reg-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow-y:auto';

  // Cada planta con: código, tipo, portainjerto, polinizante, estado, eliminar
  var plantasHtml = plantas.map(function(p,idx){
    var col = (IP_ESTADOS[p.estado]||IP_ESTADOS.sano).color;
    // Valores actuales del árbol (hereda del registro si la planta no tiene propio)
    var pPorta = p.portainjerto!=null ? p.portainjerto : (s.portainjerto||'');
    var pPoliniz = p.polinizante!=null ? p.polinizante : (s.polinizante||'');
    var esPoliniz = (p._nuevoTipo||p.tipo)==='poliniz';
    return '<div style="padding:10px;border-bottom:1px solid #eee;background:'+(idx%2?'#fafafa':'#fff')+'">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">'+
        '<span style="width:11px;height:11px;border-radius:50%;background:'+col+';flex-shrink:0"></span>'+
        '<span style="font-weight:800;font-size:13px;flex:1">'+escapeHtml(ipCodigoPlanta(s,p))+'</span>'+
        '<button onclick="ipEditEliminarPlanta('+idx+')" style="background:none;border:none;color:#c0392b;font-size:17px;cursor:pointer;flex-shrink:0" title="Eliminar planta (error de conteo)">✕</button>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">'+
        // Tipo
        '<div><label style="font-size:10px;color:#888;font-weight:700">TIPO</label>'+
          '<select onchange="ipEditCampoPlanta('+idx+',\'tipo\',this.value)" style="width:100%;padding:7px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px">'+
            '<option value="principal" '+(!esPoliniz?'selected':'')+'>🌳 Principal</option>'+
            '<option value="poliniz" '+(esPoliniz?'selected':'')+'>🐝 Polinizante</option>'+
          '</select></div>'+
        // Estado
        '<div><label style="font-size:10px;color:#888;font-weight:700">ESTADO</label>'+
          '<select onchange="ipEditCampoPlanta('+idx+',\'estado\',this.value)" style="width:100%;padding:7px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px">'+
            Object.keys(IP_ESTADOS).map(function(k){return '<option value="'+k+'" '+((p._nuevoEstado||p.estado)===k?'selected':'')+'>'+IP_ESTADOS[k].label+'</option>';}).join('')+
          '</select></div>'+
        // Portainjerto
        '<div><label style="font-size:10px;color:#888;font-weight:700">PORTAINJERTO</label>'+
          '<select onchange="ipEditCampoPlanta('+idx+',\'portainjerto\',this.value)" style="width:100%;padding:7px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px">'+
            '<option value="">— sin especificar —</option>'+
            portaOpts.map(function(po){return '<option value="'+escapeHtml(po)+'" '+(pPorta===po?'selected':'')+'>'+escapeHtml(po)+'</option>';}).join('')+
          '</select></div>'+
        // Variedad polinizante (solo relevante si es polinizante, pero editable siempre)
        '<div><label style="font-size:10px;color:#888;font-weight:700">VAR. POLINIZANTE</label>'+
          '<select onchange="ipEditCampoPlanta('+idx+',\'polinizante\',this.value)" style="width:100%;padding:7px;border:1px solid #d9d9d9;border-radius:6px;font-size:12px">'+
            '<option value="">— ninguna —</option>'+
            varOpts.map(function(v){return '<option value="'+escapeHtml(v)+'" '+(pPoliniz===v?'selected':'')+'>'+escapeHtml(v)+'</option>';}).join('')+
          '</select></div>'+
      '</div>'+
    '</div>';
  }).join('');

  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:600px;width:100%;margin:auto;box-shadow:0 10px 40px rgba(0,0,0,.3)">'+
    '<div style="background:#354a5f;color:#fff;padding:14px 20px;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:2">'+
      '<div><div style="font-size:16px;font-weight:800">✏️ Editar '+escapeHtml(s.codigoBase)+'</div>'+
        '<div style="font-size:12px;opacity:.85">'+escapeHtml(s.cuartel)+' · '+escapeHtml(s.variedad)+' · Hilera '+escapeHtml(s.hilera)+' · '+plantas.length+' plantas</div></div>'+
      '<button onclick="document.getElementById(\'ip-edit-reg-modal\').remove()" style="background:rgba(255,255,255,.2);border:none;color:#fff;font-size:22px;cursor:pointer;width:38px;height:38px;border-radius:8px">×</button>'+
    '</div>'+
    '<div style="padding:14px 18px">'+
      '<div style="font-size:13px;color:#888;margin-bottom:6px">Edite cada árbol individualmente: tipo, estado, portainjerto y variedad polinizante. La variedad principal del cuartel ('+escapeHtml(s.variedad)+') no cambia.</div>'+
      '<div style="background:#f0f7ff;border:1px solid #bcd9f5;border-radius:8px;padding:8px 10px;margin-bottom:10px;font-size:12px;color:#0854a0">💡 Use ✕ para eliminar un árbol contado por error (se renumeran los demás).</div>'+
      '<div id="ip-edit-plantas" style="border:1px solid #e5e5e5;border-radius:8px">'+plantasHtml+'</div>'+
    '</div>'+
    '<div style="padding:14px 20px;background:#fafafa;border-top:1px solid #e5e5e5;display:flex;justify-content:flex-end;gap:10px;border-radius:0 0 12px 12px;position:sticky;bottom:0">'+
      '<button onclick="document.getElementById(\'ip-edit-reg-modal\').remove()" style="padding:11px 18px;background:#fff;border:2px solid #d9d9d9;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700;color:#354a5f">Cancelar</button>'+
      '<button onclick="ipGuardarEdicion()" style="padding:11px 18px;background:#0a6ed1;color:#fff;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:700">💾 Guardar cambios</button>'+
    '</div>'+
  '</div>';
  document.body.appendChild(modal);
}

// Cambios temporales por árbol (se confirman al guardar)
function ipEditCampoPlanta(idx, campo, val){
  var s=(STATE.cache.invplantas||[]).find(function(x){return String(x.id)===String(_ipEditId);});
  if(!s || !s.plantas[idx]) return;
  var p=s.plantas[idx];
  if(campo==='tipo'){ p._nuevoTipo = val; }
  else if(campo==='estado'){ p._nuevoEstado = val; }
  else if(campo==='portainjerto'){ p._nuevoPorta = val; }
  else if(campo==='polinizante'){
    p._nuevoPoliniz = val;
    // Asignar una variedad polinizante convierte la planta en polinizante
    if(val){ p._nuevoTipo = 'poliniz'; }
  }
}

function ipEditEliminarPlanta(idx){
  var s=(STATE.cache.invplantas||[]).find(function(x){return String(x.id)===String(_ipEditId);});
  if(!s) return;
  var p=s.plantas[idx]; if(!p) return;
  confirmDialog('Eliminar planta','¿Eliminar la planta '+escapeHtml(ipCodigoPlanta(s,p))+' del registro? (error de conteo)',function(){
    s.plantas.splice(idx,1);
    // Recodificar y renumerar las plantas restantes
    s.plantas.forEach(function(pl,i){ pl.seq=i+1; pl.codigo=s.codigoBase+'-'+String(i+1).padStart(6,'0'); });
    // Recalcular contadores (respeta cambios temporales de tipo)
    s.countPrincipal = s.plantas.filter(function(x){return (x._nuevoTipo||x.tipo)==='principal';}).length;
    s.countPoliniz = s.plantas.filter(function(x){return (x._nuevoTipo||x.tipo)==='poliniz';}).length;
    s.total = s.plantas.length;
    // Reabrir el modal actualizado
    var m=document.getElementById('ip-edit-reg-modal'); if(m)m.remove();
    ipEditarRegistro(_ipEditId);
  },'Eliminar',true);
}

async function ipGuardarEdicion(){
  var s=(STATE.cache.invplantas||[]).find(function(x){return String(x.id)===String(_ipEditId);});
  if(!s) return;
  // Aplicar cambios por árbol
  (s.plantas||[]).forEach(function(p){
    if(p._nuevoTipo!=null){ p.tipo=p._nuevoTipo; delete p._nuevoTipo; }
    if(p._nuevoEstado!=null){ p.estado=p._nuevoEstado; delete p._nuevoEstado; }
    if(p._nuevoPorta!=null){ p.portainjerto=p._nuevoPorta; delete p._nuevoPorta; }
    if(p._nuevoPoliniz!=null){ p.polinizante=p._nuevoPoliniz; delete p._nuevoPoliniz; }
  });
  // Recalcular contadores
  s.countPrincipal = (s.plantas||[]).filter(function(x){return x.tipo==='principal';}).length;
  s.countPoliniz = (s.plantas||[]).filter(function(x){return x.tipo==='poliniz';}).length;
  s.total = (s.plantas||[]).length;
  s.modificado = new Date().toISOString();
  s.modificadoPor = STATE.user ? (STATE.user.nombre||STATE.user.id) : '';
  if(navigator.onLine){ s.sincronizado=true; s.fechaSync=new Date().toISOString(); }
  else { s.sincronizado=false; }
  try{ await dbPut('invplantas', s); STATE.cache.invplantas=await dbAll('invplantas'); }catch(e){ console.error(e); }
  var m=document.getElementById('ip-edit-reg-modal'); if(m)m.remove();
  ipRender();
  toast('Cambios guardados', s.codigoBase+' actualizado','success');
}

// ── Exportar a Excel ──
function ipExportarExcel(){
  if(!can('invplantas.revisar')){ toast('Sin permiso','No tiene permiso para exportar','error'); return; }
  if(typeof XLSX==='undefined'){ toast('Sin librería','Excel no disponible','error'); return; }
  var regs=STATE.cache.invplantas||[];
  if(!regs.length){ toast('Sin datos','No hay hileras para exportar','error'); return; }

  function mapsUrl(lat,lng){ return 'https://www.google.com/maps/search/?api=1&query='+lat+','+lng; }

  // ── Hoja resumen ──
  var resumen=[['Código','Cuartel','Variedad','Hilera','Portainjerto','Polinizante','Principal','Poliniz.','Total','Fecha','Usuario','Estado sync','Lat inicio','Lng inicio','Lat fin','Lng fin','Ver en Maps']];
  var resumenLinks=[]; // {row, col, url}
  regs.forEach(function(s, ri){
    var verMaps = s.gpsInicio ? '🗺️ Abrir mapa' : '';
    resumen.push([s.codigoBase, s.cuartel, s.variedad, s.hilera, s.portainjerto||'', s.polinizante||'',
      s.countPrincipal, s.countPoliniz, s.total||(s.countPrincipal+s.countPoliniz),
      (s.fechaInicio||'').slice(0,10), s.usuario||'', s.sincronizado?'Subido':'Local',
      s.gpsInicio?s.gpsInicio.lat:'', s.gpsInicio?s.gpsInicio.lng:'',
      s.gpsFin?s.gpsFin.lat:'', s.gpsFin?s.gpsFin.lng:'', verMaps]);
    if(s.gpsInicio){ resumenLinks.push({ row:ri+1, col:16, url:mapsUrl(s.gpsInicio.lat, s.gpsInicio.lng) }); }
  });

  // ── Hoja detalle por planta ──
  var detalle=[['Código planta','Cuartel','Variedad','Hilera','Tipo','Portainjerto','Var. polinizante','Estado','Latitud','Longitud','Ver en Maps']];
  var detalleLinks=[];
  var dRow=0;
  regs.forEach(function(s){
    (s.plantas||[]).forEach(function(p){
      dRow++;
      var verMaps = (p.lat!=null && p.lng!=null) ? '🗺️ Abrir mapa' : '';
      var pPorta = p.portainjerto!=null ? p.portainjerto : (s.portainjerto||'');
      var pPoliniz = p.polinizante!=null ? p.polinizante : (s.polinizante||'');
      detalle.push([ipCodigoPlanta(s,p), s.cuartel, s.variedad, s.hilera, p.tipo, pPorta, pPoliniz, (IP_ESTADOS[p.estado]?IP_ESTADOS[p.estado].label:p.estado),
        p.lat!=null?p.lat:'', p.lng!=null?p.lng:'', verMaps]);
      if(p.lat!=null && p.lng!=null){ detalleLinks.push({ row:dRow, col:10, url:mapsUrl(p.lat, p.lng) }); }
    });
  });

  var wb=XLSX.utils.book_new();
  var ws1=XLSX.utils.aoa_to_sheet(resumen); ws1['!cols']=resumen[0].map(function(){return {wch:13};});
  var ws2=XLSX.utils.aoa_to_sheet(detalle); ws2['!cols']=detalle[0].map(function(){return {wch:14};});

  // Aplicar los hipervínculos (propiedad .l de cada celda) en la columna "Ver en Maps"
  resumenLinks.forEach(function(lk){
    var ref=XLSX.utils.encode_cell({r:lk.row, c:lk.col});
    if(ws1[ref]){ ws1[ref].l={ Target:lk.url, Tooltip:'Abrir en Google Maps' }; ws1[ref].s={ font:{ color:{rgb:'0563C1'}, underline:true } }; }
  });
  detalleLinks.forEach(function(lk){
    var ref=XLSX.utils.encode_cell({r:lk.row, c:lk.col});
    if(ws2[ref]){ ws2[ref].l={ Target:lk.url, Tooltip:'Abrir en Google Maps' }; ws2[ref].s={ font:{ color:{rgb:'0563C1'}, underline:true } }; }
  });

  XLSX.utils.book_append_sheet(wb,ws1,'Resumen hileras');
  XLSX.utils.book_append_sheet(wb,ws2,'Detalle plantas');
  XLSX.writeFile(wb,'Inventario_Huerto_'+new Date().toISOString().slice(0,10)+'.xlsx');
  toast('Exportado','Excel generado con enlaces a Google Maps','success');
}

window.addEventListener('online', function(){ if(STATE.page==='invplantas') ipRender(); });
window.addEventListener('offline', function(){ if(STATE.page==='invplantas') ipRender(); });


// ── MAPA 2D de plantas de una hilera ──
function ipVerMapa(id){
  _ipMapaReg = (STATE.cache.invplantas||[]).find(function(x){ return String(x.id)===String(id); });
  if(!_ipMapaReg){ toast('No encontrado','Registro no disponible','error'); return; }
  ipSetVista('mapa');
}

// Invierte manualmente el orden de las plantas de la hilera (solo admin).
// Útil cuando el orden automático por hilera par/impar no coincide con el
// recorrido real de conteo.
async function ipInvertirOrden(){
  if(!STATE.user || STATE.user.role!=='admin'){ toast('Sin permiso','Solo el administrador puede invertir el orden','error'); return; }
  var s=_ipMapaReg; if(!s || !Array.isArray(s.plantas)) return;
  confirmDialog('Invertir orden de la hilera',
    '¿Invertir el orden de las '+s.plantas.length+' plantas de <strong>'+escapeHtml(s.codigoBase)+'</strong>?<br><br>La planta 1 pasará a ser la última y viceversa. Los estados se mantienen con cada planta.',
    async function(){
      s.plantas.reverse();
      s.plantas.forEach(function(p,i){ p.seq=i+1; });
      s.invertida = !s.invertida;
      s.secuencia = s.plantas.map(function(p){ return p.tipo; });
      s.sincronizado=false;
      try{
        await dbPut('invplantas', s);
        STATE.cache.invplantas=await dbAll('invplantas');
        _ipMapaReg = (STATE.cache.invplantas||[]).find(function(x){ return String(x.id)===String(s.id); });
      }catch(e){ console.error(e); toast('Error','No se pudo guardar','error'); return; }
      ipRender();
      toast('Orden invertido','La hilera se reordenó correctamente','success');
    },'Invertir');
}
try{ window.ipInvertirOrden=ipInvertirOrden; }catch(e){}

function ipRenderMapa(){
  var s=_ipMapaReg; if(!s) return '<div class="ip-card">Sin datos</div>';
  var plantas = s.plantas||[];
  var puedeEditar = can('invplantas.editar');

  // Leyenda de estados
  var leyenda = Object.keys(IP_ESTADOS).map(function(k){
    var e=IP_ESTADOS[k];
    var cnt = plantas.filter(function(p){return p.estado===k;}).length;
    return '<span style="display:inline-flex;align-items:center;gap:5px;margin-right:12px;font-size:12px"><span style="width:14px;height:14px;border-radius:50%;background:'+e.color+';display:inline-block"></span>'+e.label+' ('+cnt+')</span>';
  }).join('');

  var html = '<button class="ip-big-btn ip-btn-gray" onclick="ipVerLista()" style="padding:14px;font-size:16px">‹ Volver a la lista</button>'+
    '<div class="ip-card">'+
      '<div style="font-size:18px;font-weight:800;color:#23303d">🗺️ '+escapeHtml(s.codigoBase)+'</div>'+
      '<div style="font-size:13px;color:#666;margin-bottom:8px">'+escapeHtml(s.cuartel)+' · '+escapeHtml(s.variedad)+' · Hilera '+escapeHtml(s.hilera)+' · '+plantas.length+' plantas'+(s.invertida?' · <span style="color:#e9730c;font-weight:700">↔️ orden invertido (hilera par)</span>':'')+'</div>'+
      '<div style="margin-bottom:6px">'+leyenda+'</div>'+
      (puedeEditar?'<div style="font-size:12px;color:#0854a0;background:#f0f7ff;padding:8px;border-radius:8px">✏️ Toque una planta para cambiar su estado</div>':'<div style="font-size:12px;color:#999">Solo lectura. Se requiere permiso para editar estados.</div>')+
      (STATE.user && STATE.user.role==='admin' ? '<button onclick="ipInvertirOrden()" style="margin-top:8px;padding:9px 14px;background:#fff3e0;color:#b45309;border:1px solid #fcd9a0;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">↔️ Invertir orden de la hilera</button>' : '')+
    '</div>';

  // Mapa visual: plantas como círculos en una grilla que representa la hilera.
  // Orientación del huerto: la planta 1 (sur) se muestra a la IZQUIERDA.
  html += '<div class="ip-card" style="overflow-x:auto">';
  html += '<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#7a8794;margin-bottom:6px;padding:0 4px"><span>← SUR (planta 1)</span><span>NORTE →</span></div>';
  html += '<div style="display:flex;flex-wrap:wrap;flex-direction:row;gap:8px;justify-content:flex-start;padding:8px">';
  plantas.forEach(function(p, idx){
    var e=IP_ESTADOS[p.estado]||IP_ESTADOS.sano;
    var borde = p.tipo==='poliniz' ? '3px solid #e9730c' : '2px solid rgba(0,0,0,.15)';
    html += '<div onclick="'+(puedeEditar?'ipEditarPlanta('+idx+')':'')+'" '+
      'title="'+escapeHtml(ipCodigoPlanta(s,p))+' · '+(IP_ESTADOS[p.estado]?IP_ESTADOS[p.estado].label:'')+'" '+
      'style="width:44px;height:44px;border-radius:50%;background:'+e.color+';border:'+borde+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:700;cursor:'+(puedeEditar?'pointer':'default')+';box-shadow:0 1px 3px rgba(0,0,0,.2)">'+
      p.seq+'</div>';
  });
  html += '</div>';
  html += '<div style="text-align:center;font-size:11px;color:#999;margin-top:8px">🌳 borde gris = principal · 🐝 borde naranja = polinizante · número = secuencia en la hilera</div>';
  html += '</div>';

  return html;
}

// Editar estado de una planta
function ipEditarPlanta(idx){
  if(!can('invplantas.editar')){ toast('Sin permiso','Solo administradores pueden editar estados','error'); return; }
  var s=_ipMapaReg; var p=s.plantas[idx]; if(!p) return;
  // Modal de selección de estado
  var modal=document.createElement('div');
  modal.id='ip-edit-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px';
  var botones = Object.keys(IP_ESTADOS).map(function(k){
    var e=IP_ESTADOS[k];
    return '<button onclick="ipSetEstadoPlanta('+idx+',\''+k+'\')" style="display:flex;align-items:center;gap:10px;width:100%;padding:14px;margin-bottom:8px;border:2px solid '+(p.estado===k?e.color:'#e5e5e5')+';border-radius:10px;background:'+(p.estado===k?e.color+'22':'#fff')+';cursor:pointer;font-size:15px;font-weight:700;color:#333">'+
      '<span style="width:18px;height:18px;border-radius:50%;background:'+e.color+'"></span>'+e.label+'</button>';
  }).join('');
  var insertarBtns = '';
  if(_ipEsAdmin()){
    insertarBtns = '<div style="border-top:1px dashed #ddd;margin-top:10px;padding-top:12px">'+
      '<div style="font-size:12px;color:#888;margin-bottom:8px">Administrador: corregir conteo</div>'+
      '<div style="display:flex;gap:8px;margin-bottom:8px">'+
        '<button onclick="ipInsertarPlantaDialog('+idx+',\'antes\')" style="flex:1;padding:11px;border:2px solid #1a7e3e;border-radius:10px;background:#fff;color:#1a7e3e;cursor:pointer;font-size:13px;font-weight:700">➕ Insertar antes</button>'+
        '<button onclick="ipInsertarPlantaDialog('+idx+',\'despues\')" style="flex:1;padding:11px;border:2px solid #1a7e3e;border-radius:10px;background:#fff;color:#1a7e3e;cursor:pointer;font-size:13px;font-weight:700">Insertar después ➕</button>'+
      '</div>'+
      '<button onclick="ipEliminarPlantaMapa('+idx+')" style="width:100%;padding:11px;border:2px solid #c0392b;border-radius:10px;background:#fff;color:#c0392b;cursor:pointer;font-size:13px;font-weight:700">🗑 Eliminar esta planta (error de conteo)</button>'+
    '</div>';
  }
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:340px;width:100%;padding:20px;max-height:90vh;overflow:auto">'+
    '<div style="font-size:17px;font-weight:800;color:#23303d;margin-bottom:4px">Planta '+escapeHtml(p.codigo)+'</div>'+
    '<div style="font-size:13px;color:#888;margin-bottom:14px">'+(p.tipo==='poliniz'?'🐝 Polinizante':'🌳 Principal')+'</div>'+
    botones+
    '<button onclick="document.getElementById(\'ip-edit-modal\').remove()" style="width:100%;padding:12px;margin-top:6px;border:none;border-radius:10px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cancelar</button>'+
    insertarBtns+
  '</div>';
  document.body.appendChild(modal);
}

async function ipSetEstadoPlanta(idx, estado){
  var s=_ipMapaReg; var p=s.plantas[idx]; if(!p) return;
  p.estado=estado;
  p.estadoFecha=new Date().toISOString();
  p.estadoPor=STATE.user?(STATE.user.nombre||STATE.user.id):'';
  try{ await dbPut('invplantas', s); STATE.cache.invplantas=await dbAll('invplantas'); }catch(e){}
  var m=document.getElementById('ip-edit-modal'); if(m)m.remove();
  ipRender();
  toast('Estado actualizado', ipCodigoPlanta(s,p)+' → '+(IP_ESTADOS[estado]?IP_ESTADOS[estado].label:estado),'success');
}

// Eliminar una planta desde el mapa 2D (solo admin, para corregir errores de conteo).
// Recodifica las plantas restantes y recalcula contadores/GPS.
function ipEliminarPlantaMapa(idx){
  if(!_ipEsAdmin()){ toast('Sin permiso','Solo el administrador puede eliminar plantas','error'); return; }
  var s=_ipMapaReg; if(!s || !s.plantas || !s.plantas[idx]) return;
  var p=s.plantas[idx];
  confirmDialog('Eliminar planta','¿Eliminar la planta <strong>'+escapeHtml(ipCodigoPlanta(s,p))+'</strong> ('+(p.tipo==='poliniz'?'polinizante':'principal')+', estado: '+(IP_ESTADOS[p.estado]?IP_ESTADOS[p.estado].label:(p.estado||'sano'))+') de esta hilera?<br><br>Las plantas siguientes se renumerarán.', async function(){
    s.plantas.splice(idx, 1);
    // Renumerar y recodificar
    s.plantas.forEach(function(pl, i){
      pl.seq = i + 1;
    });
    // Recalcular contadores
    s.countPrincipal = s.plantas.filter(function(x){ return x.tipo === 'principal'; }).length;
    s.countPoliniz = s.plantas.filter(function(x){ return x.tipo === 'poliniz'; }).length;
    // Recalcular GPS interpolado si hay inicio y fin
    if(s.gpsInicio && s.gpsFin && s.plantas.length > 1){
      var n = s.plantas.length;
      s.plantas.forEach(function(pl, i){
        pl.lat = s.gpsInicio.lat + (s.gpsFin.lat - s.gpsInicio.lat) * i / (n - 1);
        pl.lng = s.gpsInicio.lng + (s.gpsFin.lng - s.gpsInicio.lng) * i / (n - 1);
      });
    }
    // Guardar y re-renderizar
    try{
      await dbPut('invplantas', s);
      STATE.cache.invplantas = await dbAll('invplantas');
    }catch(e){ console.error('Error guardando tras eliminar planta:', e); }
    var m = document.getElementById('ip-edit-modal'); if(m) m.remove();
    ipRender();
    toast('Planta eliminada', ipCodigoPlanta(s,p) + ' eliminada. Hilera renumerada.', 'success');
  }, 'Eliminar', true);
}

/* ─── Inserción de plantas (SOLO ADMINISTRADOR) ───────────────────────────
   Permite agregar una planta que faltaba en una posición concreta de la
   hilera. Al insertarla, todas las plantas siguientes se recorren una
   posición (su número de secuencia aumenta en 1), se recalculan los códigos
   y se reinterpolan las coordenadas GPS a lo largo de la hilera. */
function _ipEsAdmin(){
  try{ return STATE.user && STATE.user.role==='admin'; }catch(e){ return false; }
}
// Abre un pequeño diálogo para elegir tipo y estado de la planta a insertar.
function ipInsertarPlantaDialog(idx, donde){
  if(!_ipEsAdmin()){ toast('Sin permiso','Solo el administrador puede insertar plantas','error'); return; }
  var s=_ipMapaReg; if(!s) return;
  var ref = s.plantas[idx];
  var posTexto = (donde==='antes') ? ('antes de la planta '+ (ref?ref.seq:'')) : ('después de la planta '+ (ref?ref.seq:''));
  var em=document.getElementById('ip-edit-modal'); if(em) em.remove();
  var modal=document.createElement('div');
  modal.id='ip-insert-modal';
  modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';
  var estadosBtns = Object.keys(IP_ESTADOS).map(function(k){
    var e=IP_ESTADOS[k];
    return '<label style="display:flex;align-items:center;gap:8px;padding:9px 11px;border:2px solid #e5e5e5;border-radius:9px;margin-bottom:6px;cursor:pointer">'+
      '<input type="radio" name="ip-ins-estado" value="'+k+'"'+(k==='sano'?' checked':'')+'>'+
      '<span style="width:15px;height:15px;border-radius:50%;background:'+e.color+';display:inline-block"></span>'+e.label+'</label>';
  }).join('');
  modal.innerHTML='<div style="background:#fff;border-radius:12px;max-width:360px;width:100%;padding:20px;max-height:90vh;overflow:auto">'+
    '<div style="font-size:17px;font-weight:800;color:#23303d;margin-bottom:4px">➕ Insertar planta</div>'+
    '<div style="font-size:13px;color:#0854a0;background:#f0f7ff;padding:8px;border-radius:8px;margin-bottom:14px">Se insertará <strong>'+posTexto+'</strong>. Las plantas siguientes se recorrerán una posición.</div>'+
    '<div style="font-size:13px;font-weight:700;color:#555;margin-bottom:6px">Tipo de planta</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px">'+
      '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;border:2px solid #e5e5e5;border-radius:9px;cursor:pointer"><input type="radio" name="ip-ins-tipo" value="principal" checked> 🌳 Principal</label>'+
      '<label style="flex:1;display:flex;align-items:center;gap:8px;padding:10px;border:2px solid #e5e5e5;border-radius:9px;cursor:pointer"><input type="radio" name="ip-ins-tipo" value="poliniz"> 🐝 Poliniz.</label>'+
    '</div>'+
    '<div style="font-size:13px;font-weight:700;color:#555;margin-bottom:6px">Estado</div>'+
    estadosBtns+
    '<div style="display:flex;gap:8px;margin-top:14px">'+
      '<button onclick="document.getElementById(\'ip-insert-modal\').remove()" style="flex:1;padding:12px;border:none;border-radius:10px;background:#f0f0f0;cursor:pointer;font-size:14px;font-weight:700">Cancelar</button>'+
      '<button onclick="ipInsertarPlantaConfirm('+idx+',\''+donde+'\')" style="flex:1;padding:12px;border:none;border-radius:10px;background:#1a7e3e;color:#fff;cursor:pointer;font-size:14px;font-weight:700">Insertar</button>'+
    '</div>'+
  '</div>';
  document.body.appendChild(modal);
}
async function ipInsertarPlantaConfirm(idx, donde){
  if(!_ipEsAdmin()){ toast('Sin permiso','Solo el administrador puede insertar plantas','error'); return; }
  var s=_ipMapaReg; if(!s || !Array.isArray(s.plantas)) return;
  var tipoEl = document.querySelector('input[name="ip-ins-tipo"]:checked');
  var estEl = document.querySelector('input[name="ip-ins-estado"]:checked');
  var tipo = tipoEl ? tipoEl.value : 'principal';
  var estado = estEl ? estEl.value : 'sano';
  // Posición de inserción (índice en el array): antes = idx; después = idx+1
  var insertAt = (donde==='antes') ? idx : idx+1;
  if(insertAt<0) insertAt=0;
  if(insertAt>s.plantas.length) insertAt=s.plantas.length;

  // Crear la planta nueva (sin código aún; se renumeran todas abajo).
  var nueva = {
    seq: 0,
    codigo: '',
    tipo: tipo,
    lat: null, lng: null,
    estado: estado,
    insertada: true,
    insertadaPor: STATE.user?(STATE.user.nombre||STATE.user.id):'',
    insertadaFecha: new Date().toISOString()
  };
  s.plantas.splice(insertAt, 0, nueva);

  // Renumerar secuencia y recalcular códigos para TODAS las plantas.
  // Reinterpolar GPS a lo largo de la hilera (inicio→fin) según la nueva cantidad.
  var total = s.plantas.length;
  var ini = s.gpsInicio, fin = s.gpsFin;
  for(var i=0;i<total;i++){
    var p = s.plantas[i];
    p.seq = i+1;
    var frac = total>1 ? i/(total-1) : 0;
    if(ini && fin){
      p.lat = ini.lat + (fin.lat-ini.lat)*frac;
      p.lng = ini.lng + (fin.lng-ini.lng)*frac;
    } else if(ini){ p.lat=ini.lat; p.lng=ini.lng; }
  }

  // Actualizar los contadores del registro según los tipos resultantes.
  s.countPrincipal = s.plantas.filter(function(p){ return p.tipo!=='poliniz'; }).length;
  s.countPoliniz   = s.plantas.filter(function(p){ return p.tipo==='poliniz'; }).length;
  s.total = s.plantas.length;
  // Mantener la secuencia de caminata coherente con el nuevo orden de tipos.
  s.secuencia = s.plantas.map(function(p){ return p.tipo; });

  try{
    await dbPut('invplantas', s);
    STATE.cache.invplantas = await dbAll('invplantas');
  }catch(e){ console.error(e); toast('Error','No se pudo guardar la inserción','error'); return; }

  var m=document.getElementById('ip-insert-modal'); if(m) m.remove();
  ipRender();
  toast('Planta insertada', 'Se agregó una planta en la posición '+(insertAt+1)+' y se recorrió el resto.','success');
}
