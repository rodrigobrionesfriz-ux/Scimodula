/* ════════════════════════════════════════════════════════════════════
   SCI — Control de Heladas (hel*)
   Registro de los eventos de helada de la temporada y del funcionamiento
   de las torres de control.
   Estructura: UN REGISTRO POR TORRE Y POR NOCHE (plano). Una misma noche
   con 3 torres operando = 3 registros con la misma fecha.
   Stores: heladas (sincronizado) · catálogo de torres en config/helTorres.
   ════════════════════════════════════════════════════════════════════ */

var _helTab      = 'registros';
var _helEditId   = null;      // id del registro en edición (null = nuevo)
var _helFTemp    = '';        // filtro temporada
var _helFTorre   = '';        // filtro torre

var HEL_TORRES_DEFAULT = ['Torre Control Helada 1','Torre Control Helada 2'];

/* ─────────────── Datos ─────────────── */
function _helRegs(){ return (STATE.cache.heladas||[]).slice(); }

// Catálogo de torres (configurable). Vive en config → se sincroniza.
function _helTorres(){
  try{
    var c=STATE.cache.config||{};
    var cfg=c.helTorres;
    if(cfg && Array.isArray(cfg.lista) && cfg.lista.length) return cfg.lista.slice();
  }catch(e){}
  return HEL_TORRES_DEFAULT.slice();
}
async function _helGuardarTorres(lista){
  await dbPut('config',{key:'helTorres', lista:lista});
  STATE.cache.config=STATE.cache.config||{};
  STATE.cache.config.helTorres={key:'helTorres', lista:lista};
}

/* Temporada agrícola a partir de una fecha ISO (mayo–abril, igual que el resto
   del sistema). Se guarda en el registro para poder agrupar por temporada. */
function _helTemporada(fechaISO){
  try{
    if(typeof temporadaDeMesAnio==='function'){
      var d=new Date(fechaISO+'T12:00:00');
      var m=d.getMonth(), y=d.getFullYear();
      var inicio=(m>=4)?y:(y-1);
      return inicio+'-'+(inicio+1);
    }
  }catch(e){}
  return '';
}

/* Horas de control por reloj. El control de heladas cruza la medianoche
   (ej. inicio 23:30 → término 06:00), así que un término menor que el inicio
   se interpreta como del día siguiente, no como un error. */
function _helHorasReloj(hIni,hFin){
  if(!hIni||!hFin) return null;
  var a=hIni.split(':'), b=hFin.split(':');
  if(a.length<2||b.length<2) return null;
  var m1=parseInt(a[0],10)*60+parseInt(a[1],10);
  var m2=parseInt(b[0],10)*60+parseInt(b[1],10);
  if(isNaN(m1)||isNaN(m2)) return null;
  var dif=m2-m1;
  if(dif<0) dif+=24*60;            // cruzó la medianoche
  return dif/60;
}
function _helHorasHorom(r){
  var hi=parseFloat(r.horometroInicial), hf=parseFloat(r.horometroFinal);
  if(isNaN(hi)||isNaN(hf)) return null;
  return hf-hi;
}
// Último horómetro final registrado para una torre (excluyendo un id dado).
function _helUltHorometro(torre, excluirId){
  var max=null;
  _helRegs().forEach(function(r){
    if(r.torre!==torre) return;
    if(excluirId && String(r.id)===String(excluirId)) return;
    var v=parseFloat(r.horometroFinal);
    if(!isNaN(v) && (max===null || v>max)) max=v;
  });
  return max;
}
function _helFmtH(n){ return (n===null||n===undefined||isNaN(n))?'—':(typeof fmtNum==='function'?fmtNum(n,2):Number(n).toFixed(2)); }
function _helFmtFecha(iso){
  if(!iso) return '—';
  try{ var p=String(iso).split('-'); return p[2]+'-'+p[1]+'-'+p[0]; }catch(e){ return String(iso); }
}
function _helEsc(s){ return (typeof escapeHtml==='function')?escapeHtml(s==null?'':String(s)):String(s==null?'':s); }

/* ─────────────── Render principal ─────────────── */
function renderHelada(main){
  if(!can('helada.ver')){
    main.innerHTML='<div class="card" style="padding:20px">Sin acceso a este módulo.</div>';
    return;
  }
  var puedeReg=can('helada.registrar');
  var esAdmin=can('config.editar');
  var tabs='';
  tabs+='<button onclick="helTab(0)" style="'+_helTabCss(_helTab==='registros')+'">❄️ Registros</button>';
  if(puedeReg) tabs+='<button onclick="helTab(1)" style="'+_helTabCss(_helTab==='form')+'">📝 '+(_helEditId?'Editando':'Nuevo registro')+'</button>';
  if(esAdmin)  tabs+='<button onclick="helTab(2)" style="'+_helTabCss(_helTab==='torres')+'">🗼 Torres</button>';

  var body='';
  if(_helTab==='form' && puedeReg)       body=_helRenderForm();
  else if(_helTab==='torres' && esAdmin) body=_helRenderTorres();
  else                                   body=_helRenderLista();

  main.innerHTML=
    '<div class="card" style="padding:16px">'+
      '<div style="font-size:18px;font-weight:800;color:#1a3a5c;margin-bottom:2px">❄️ Control de Heladas</div>'+
      '<div style="font-size:12px;color:#7a8794;margin-bottom:12px">Eventos de helada de la temporada y funcionamiento de las torres de control. Un registro por torre y por noche.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+tabs+'</div>'+
      '<div id="hel-body">'+body+'</div>'+
    '</div>';
}
function _helTabCss(act){
  return 'padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid '+
    (act?'#0a6ed1;background:#0a6ed1;color:#fff':'#d5dde5;background:#fff;color:#3a4a5a');
}
// Índices numéricos en el onclick: evita problemas de escape con textos.
function helTab(i){
  _helTab=(i===1)?'form':(i===2)?'torres':'registros';
  if(i!==1) _helEditId=null;
  _helRefresh();
}
function _helRefresh(){
  var m=document.getElementById('mainContent')||document.getElementById('main-content')||document.querySelector('main');
  if(m) renderHelada(m);
}

/* ════════ TAB REGISTROS ════════ */
function _helRenderLista(){
  var regs=_helRegs();
  var temporadas=[]; regs.forEach(function(r){ if(r.temporada && temporadas.indexOf(r.temporada)<0) temporadas.push(r.temporada); });
  temporadas.sort().reverse();
  if(!_helFTemp && temporadas.length) _helFTemp=temporadas[0];   // por defecto, la más reciente
  var torres=_helTorres();

  var filtrados=regs.filter(function(r){
    if(_helFTemp && r.temporada!==_helFTemp) return false;
    if(_helFTorre && r.torre!==_helFTorre) return false;
    return true;
  }).sort(function(a,b){
    return String(b.fecha||'').localeCompare(String(a.fecha||'')) || String(a.torre||'').localeCompare(String(b.torre||''));
  });

  // ── Resumen de la temporada filtrada ──
  var noches={}, horas=0, litrosUlt=null, tMin=null, nAuto=0;
  filtrados.forEach(function(r){
    if(r.fecha) noches[r.fecha]=1;
    var h=_helHorasHorom(r); if(h!==null && h>0) horas+=h;
    var t=parseFloat(r.tempMinima); if(!isNaN(t) && (tMin===null||t<tMin)) tMin=t;
    if(r.partida==='auto') nAuto++;
    var l=parseFloat(r.litrosEstanque); if(!isNaN(l)) litrosUlt=l;
  });
  var nNoches=Object.keys(noches).length;

  var cards=
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">'+
      _helCard('Noches de helada', nNoches, 'eventos con control', '#0a6ed1')+
      _helCard('Horas de torre', _helFmtH(horas), 'suma por horómetro', '#7c3aed')+
      _helCard('Temp. mínima', (tMin===null?'—':_helFmtH(tMin)+' °C'), 'de la temporada', '#b91c1c')+
      _helCard('Registros', filtrados.length, nAuto+' con partida automática', '#15803d')+
      _helCard('Estanque', (litrosUlt===null?'—':_helFmtH(litrosUlt)+' L'), 'última lectura informada', '#c2831a')+
    '</div>';

  // ── Filtros ──
  var optTemp='<option value="">Todas</option>'+temporadas.map(function(t,i){
    return '<option value="'+_helEsc(t)+'"'+(t===_helFTemp?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');
  var optTorre='<option value="">Todas</option>'+torres.map(function(t){
    return '<option value="'+_helEsc(t)+'"'+(t===_helFTorre?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');
  var filtros=
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">TEMPORADA</label>'+
        '<select id="hel-f-temp" onchange="helFiltrar()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+optTemp+'</select></div>'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">TORRE</label>'+
        '<select id="hel-f-torre" onchange="helFiltrar()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+optTorre+'</select></div>'+
      (can('helada.registrar')?'<button class="btn btn-primary" onclick="helNuevo()">➕ Nuevo registro</button>':'')+
      (filtrados.length?'<button class="btn btn-secondary" onclick="helExportar()">📊 Exportar CSV</button>':'')+
    '</div>';

  if(!filtrados.length){
    return cards+filtros+'<div style="color:#999;padding:26px;text-align:center;font-size:13px">No hay registros de helada'+(_helFTemp?(' para la temporada '+_helEsc(_helFTemp)):'')+'.</div>';
  }

  var filas=filtrados.map(function(r,i){
    // El índice es del arreglo FILTRADO: se resuelve el id real antes de usarlo.
    var hH=_helHorasHorom(r), hR=_helHorasReloj(r.horaInicio,r.horaTermino);
    var badge=(r.partida==='auto')
      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">AUTO</span>'
      : '<span style="background:#fef3c7;color:#92600a;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">MANUAL</span>';
    var acc='';
    if(can('helada.registrar')) acc+='<button onclick="helEditar('+i+')" title="Editar" style="background:#0a6ed1;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px">✎</button>';
    if(can('config.editar'))    acc+='<button onclick="helEliminar('+i+')" title="Eliminar" style="background:#b91c1c;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer">🗑</button>';
    return '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:7px 9px;white-space:nowrap;font-weight:700">'+_helFmtFecha(r.fecha)+'</td>'+
      '<td style="padding:7px 9px">'+_helEsc(r.torre)+'<div style="font-size:10px;color:#888">'+_helEsc(r.responsable||'')+'</div></td>'+
      '<td style="padding:7px 9px;text-align:center;white-space:nowrap">'+_helEsc(r.horaInicio||'—')+' → '+_helEsc(r.horaTermino||'—')+
        (hR!==null?('<div style="font-size:10px;color:#888">'+_helFmtH(hR)+' h reloj</div>'):'')+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+
        (r.tempInicio!==''&&r.tempInicio!=null?_helFmtH(parseFloat(r.tempInicio))+' °C':'—')+
        (r.tempMinima!==''&&r.tempMinima!=null?('<div style="font-size:10px;color:#b91c1c">mín '+_helFmtH(parseFloat(r.tempMinima))+' °C</div>'):'')+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+_helFmtH(hH)+' h'+
        '<div style="font-size:10px;color:#888">'+_helFmtH(parseFloat(r.horometroInicial))+' → '+_helFmtH(parseFloat(r.horometroFinal))+'</div></td>'+
      '<td style="padding:7px 9px;text-align:center">'+badge+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+(r.litrosEstanque!==''&&r.litrosEstanque!=null?_helFmtH(parseFloat(r.litrosEstanque))+' L':'—')+'</td>'+
      '<td style="padding:7px 9px;text-align:center;white-space:nowrap">'+(acc||'—')+'</td>'+
    '</tr>';
  }).join('');

  // Guardar el orden mostrado para resolver los índices de los botones
  _helVista=filtrados;

  return cards+filtros+
    '<div style="overflow-x:auto">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:820px">'+
      '<thead><tr style="background:#f5f7fa;border-bottom:2px solid #e3e8ee">'+
        '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">FECHA</th>'+
        '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">TORRE / RESPONSABLE</th>'+
        '<th style="padding:8px 9px;text-align:center;font-size:11px;color:#64748b">CONTROL</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">TEMPERATURA</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">HORÓMETRO</th>'+
        '<th style="padding:8px 9px;text-align:center;font-size:11px;color:#64748b">PARTIDA</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">ESTANQUE</th>'+
        '<th style="padding:8px 9px;text-align:center;font-size:11px;color:#64748b"></th>'+
      '</tr></thead><tbody>'+filas+'</tbody></table></div>';
}
var _helVista=[];   // registros tal como se muestran (para resolver índices)

function _helCard(titulo,valor,sub,color){
  return '<div style="border:1px solid #e3e8ee;border-radius:9px;padding:10px 12px;background:#fff">'+
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">'+_helEsc(titulo)+'</div>'+
    '<div style="font-size:20px;font-weight:800;color:'+color+';margin:2px 0">'+_helEsc(valor)+'</div>'+
    '<div style="font-size:10px;color:#94a3b8">'+_helEsc(sub)+'</div></div>';
}
function helFiltrar(){
  var t=document.getElementById('hel-f-temp'), o=document.getElementById('hel-f-torre');
  _helFTemp=t?t.value:''; _helFTorre=o?o.value:'';
  _helRefresh();
}
function helNuevo(){ _helEditId=null; _helTab='form'; _helRefresh(); }
function helEditar(i){
  var r=_helVista[i]; if(!r) return;
  _helEditId=r.id; _helTab='form'; _helRefresh();
}
function helEliminar(i){
  var r=_helVista[i]; if(!r) return;
  if(!can('config.editar')){ toast('Sin permiso','Solo un administrador puede eliminar registros','error'); return; }
  confirmDialog('Eliminar registro',
    'Se eliminará el registro de <strong>'+_helEsc(r.torre)+'</strong> del <strong>'+_helFmtFecha(r.fecha)+'</strong>. Esta acción no se puede deshacer.',
    async function(){
      try{
        await dbDel('heladas', r.id);
        STATE.cache.heladas=await dbAll('heladas');
        if(typeof audit==='function') audit('helada.eliminar','Registro '+r.torre+' '+r.fecha, r.id);
        toast('Registro eliminado', r.torre+' · '+_helFmtFecha(r.fecha),'success');
        closeModal(); _helRefresh();
      }catch(e){ console.error(e); toast('Error','No se pudo eliminar','error'); }
    },'Eliminar',true);
}

/* ════════ TAB FORMULARIO ════════ */
function _helRenderForm(){
  var r=_helEditId ? _helRegs().find(function(x){ return String(x.id)===String(_helEditId); }) : null;
  var esNuevo=!r;
  if(!r) r={};
  var torres=_helTorres();
  var hoy=new Date().toISOString().slice(0,10);

  var optTorre='<option value="">— Seleccione —</option>'+torres.map(function(t){
    return '<option value="'+_helEsc(t)+'"'+(r.torre===t?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');

  var respDef=r.responsable || ((STATE.user&&(STATE.user.nombre||STATE.user.id))||'');

  return ''+
  '<div style="max-width:840px">'+
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:10px 13px;margin-bottom:14px;font-size:12px;color:#1e40af">'+
      (esNuevo?'Nuevo registro. ':'Editando un registro existente. ')+
      'Cada torre se registra por separado. Si la noche de helada operaron varias torres, cree un registro por cada una con la misma fecha.'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">'+

      '<div class="form-field"><label>Fecha del evento *</label>'+
        '<input type="date" id="hel-fecha" value="'+_helEsc(r.fecha||hoy)+'" onchange="helHintHorometro()"></div>'+

      '<div class="form-field"><label>Torre *</label>'+
        '<select id="hel-torre" onchange="helHintHorometro()">'+optTorre+'</select></div>'+

      '<div class="form-field"><label>Responsable *</label>'+
        '<input type="text" id="hel-resp" value="'+_helEsc(respDef)+'" placeholder="Nombre de quien controla"></div>'+

      '<div class="form-field"><label>Tipo de partida *</label>'+
        '<select id="hel-partida">'+
          '<option value="auto"'+(r.partida==='auto'?' selected':'')+'>Automática</option>'+
          '<option value="manual"'+(r.partida==='manual'||!r.partida?' selected':'')+'>Manual</option>'+
        '</select></div>'+

      '<div class="form-field"><label>Hora de inicio del control</label>'+
        '<input type="time" id="hel-hini" value="'+_helEsc(r.horaInicio||'')+'" oninput="helHintHoras()"></div>'+

      '<div class="form-field"><label>Hora de término del control</label>'+
        '<input type="time" id="hel-hfin" value="'+_helEsc(r.horaTermino||'')+'" oninput="helHintHoras()">'+
        '<div class="hint" id="hel-hint-horas" style="display:none"></div></div>'+

      '<div class="form-field"><label>Temperatura al iniciar (°C)</label>'+
        '<input type="number" step="0.1" id="hel-tini" value="'+_helEsc(r.tempInicio!=null?r.tempInicio:'')+'" placeholder="Ej: -1.5"></div>'+

      '<div class="form-field"><label>Temperatura mínima de la noche (°C)</label>'+
        '<input type="number" step="0.1" id="hel-tmin" value="'+_helEsc(r.tempMinima!=null?r.tempMinima:'')+'" placeholder="Ej: -3.2"></div>'+

      '<div class="form-field"><label>Horómetro inicial</label>'+
        '<input type="number" step="0.1" min="0" id="hel-hom-ini" value="'+_helEsc(r.horometroInicial!=null?r.horometroInicial:'')+'" oninput="helHintHoras()">'+
        '<div class="hint" id="hel-hint-hom" style="display:none"></div></div>'+

      '<div class="form-field"><label>Horómetro de término</label>'+
        '<input type="number" step="0.1" min="0" id="hel-hom-fin" value="'+_helEsc(r.horometroFinal!=null?r.horometroFinal:'')+'" oninput="helHintHoras()">'+
        '<div class="hint" id="hel-hint-run" style="display:none"></div></div>'+

      '<div class="form-field"><label>Litros disponibles en estanque</label>'+
        '<input type="number" step="0.1" min="0" id="hel-litros" value="'+_helEsc(r.litrosEstanque!=null?r.litrosEstanque:'')+'" placeholder="Lectura al iniciar"></div>'+

    '</div>'+

    '<div class="form-field" style="margin-top:12px"><label>Observaciones</label>'+
      '<textarea id="hel-obs" rows="2" placeholder="Condiciones, incidencias, sectores afectados...">'+_helEsc(r.observaciones||'')+'</textarea></div>'+

    '<div id="hel-err" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:10px 12px;font-size:12.5px;margin-top:12px"></div>'+

    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'+
      '<button class="btn btn-primary" onclick="helGuardar()">💾 '+(esNuevo?'Guardar registro':'Actualizar registro')+'</button>'+
      '<button class="btn btn-secondary" onclick="helTab(0)">Cancelar</button>'+
    '</div>'+
  '</div>';
}

/* Muestra el último horómetro registrado para la torre elegida. */
function helHintHorometro(){
  var el=document.getElementById('hel-hint-hom'); if(!el) return;
  var torre=(document.getElementById('hel-torre')||{}).value||'';
  if(!torre){ el.style.display='none'; return; }
  var ult=_helUltHorometro(torre,_helEditId);
  if(ult===null){ el.style.display='block'; el.style.color='#64748b'; el.textContent='Primer registro de esta torre.'; return; }
  el.style.display='block'; el.style.color='#0a6ed1';
  el.textContent='Último horómetro registrado: '+_helFmtH(ult);
  helHintHoras();
}
/* Calcula en vivo las horas por reloj y por horómetro. */
function helHintHoras(){
  var hr=_helHorasReloj((document.getElementById('hel-hini')||{}).value,(document.getElementById('hel-hfin')||{}).value);
  var eh=document.getElementById('hel-hint-horas');
  if(eh){
    if(hr===null){ eh.style.display='none'; }
    else{ eh.style.display='block'; eh.style.color='#0a6ed1';
      eh.textContent='Duración del control: '+_helFmtH(hr)+' h'+(hr>0&&_esCruceMedianoche()?' (cruza la medianoche)':''); }
  }
  var hi=parseFloat((document.getElementById('hel-hom-ini')||{}).value);
  var hf=parseFloat((document.getElementById('hel-hom-fin')||{}).value);
  var er=document.getElementById('hel-hint-run');
  if(er){
    if(isNaN(hi)||isNaN(hf)){ er.style.display='none'; }
    else{
      var d=hf-hi;
      er.style.display='block';
      er.style.color=(d<0)?'#b91c1c':'#15803d';
      er.textContent=(d<0)?'El horómetro de término es menor al inicial.':('Funcionamiento: '+_helFmtH(d)+' h');
    }
  }
}
function _esCruceMedianoche(){
  var a=(document.getElementById('hel-hini')||{}).value, b=(document.getElementById('hel-hfin')||{}).value;
  if(!a||!b) return false;
  return b<a;
}

async function helGuardar(){
  var err=document.getElementById('hel-err');
  function setErr(m){ if(err){ err.style.display='block'; err.innerHTML=m; err.scrollIntoView({block:'center',behavior:'smooth'}); } }
  if(err) err.style.display='none';

  var g=function(id){ var e=document.getElementById(id); return e?e.value.trim():''; };
  var fecha=g('hel-fecha'), torre=g('hel-torre'), resp=g('hel-resp');
  var partida=g('hel-partida')||'manual';
  var hIni=g('hel-hini'), hFin=g('hel-hfin');
  var tIni=g('hel-tini'), tMin=g('hel-tmin');
  var homIni=g('hel-hom-ini'), homFin=g('hel-hom-fin');
  var litros=g('hel-litros'), obs=g('hel-obs');

  if(!fecha)  return setErr('Indique la <strong>fecha</strong> del evento.');
  if(!torre)  return setErr('Seleccione la <strong>torre</strong>.');
  if(!resp)   return setErr('Indique el <strong>responsable</strong> del control.');

  var hi=parseFloat(homIni), hf=parseFloat(homFin);
  if(homIni!=='' && homFin!=='' && !isNaN(hi) && !isNaN(hf) && hf<hi){
    return setErr('El horómetro de término ('+_helFmtH(hf)+') no puede ser menor al inicial ('+_helFmtH(hi)+').');
  }
  // El horómetro es acumulativo: no puede retroceder respecto de la torre.
  var ult=_helUltHorometro(torre,_helEditId);
  if(ult!==null && homIni!=='' && !isNaN(hi) && hi<ult){
    return setErr('El horómetro inicial ('+_helFmtH(hi)+') es menor al último registrado de '+_helEsc(torre)+' ('+_helFmtH(ult)+'). Verifique la lectura.');
  }
  // Aviso de duplicado: misma torre, misma noche.
  var dup=_helRegs().find(function(x){
    return x.fecha===fecha && x.torre===torre && String(x.id)!==String(_helEditId||'');
  });
  if(dup) return setErr('Ya existe un registro de <strong>'+_helEsc(torre)+'</strong> para el '+_helFmtFecha(fecha)+'. Edite ese registro en vez de crear uno nuevo.');

  var reg={
    id: _helEditId || ('HEL-'+Date.now()+'-'+Math.floor(Math.random()*1000)),
    fecha: fecha,
    temporada: _helTemporada(fecha),
    torre: torre,
    responsable: resp,
    partida: (partida==='auto')?'auto':'manual',
    horaInicio: hIni, horaTermino: hFin,
    tempInicio: tIni===''?null:parseFloat(tIni),
    tempMinima: tMin===''?null:parseFloat(tMin),
    horometroInicial: homIni===''?null:parseFloat(homIni),
    horometroFinal:  homFin===''?null:parseFloat(homFin),
    litrosEstanque:  litros===''?null:parseFloat(litros),
    observaciones: obs,
    usuario: (STATE.user&&(STATE.user.nombre||STATE.user.id))||'?',
    updatedAt: new Date().toISOString()
  };
  if(!_helEditId) reg.createdAt=reg.updatedAt;
  else{
    var prev=_helRegs().find(function(x){ return String(x.id)===String(_helEditId); });
    if(prev && prev.createdAt) reg.createdAt=prev.createdAt;
  }

  try{
    await dbPut('heladas', reg);
    STATE.cache.heladas=await dbAll('heladas');
  }catch(e){ console.error(e); return setErr('No se pudo guardar el registro.'); }

  if(typeof audit==='function'){
    audit(_helEditId?'helada.editar':'helada.crear', torre+' · '+fecha, reg.id);
  }
  toast(_helEditId?'Registro actualizado':'Registro guardado', torre+' · '+_helFmtFecha(fecha),'success');
  _helEditId=null; _helFTemp=reg.temporada||_helFTemp; _helTab='registros';
  _helRefresh();
}

/* ════════ TAB TORRES (catálogo configurable) ════════ */
function _helRenderTorres(){
  var torres=_helTorres();
  var filas=torres.map(function(t,i){
    var usos=_helRegs().filter(function(r){ return r.torre===t; }).length;
    return '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:8px 10px;font-weight:600">'+_helEsc(t)+'</td>'+
      '<td style="padding:8px 10px;text-align:right;color:#64748b;font-size:12px">'+usos+' registro(s)</td>'+
      '<td style="padding:8px 10px;text-align:center">'+
        '<button onclick="helRenombrarTorre('+i+')" style="background:#0a6ed1;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px">✎ Renombrar</button>'+
        '<button onclick="helQuitarTorre('+i+')" style="background:#b91c1c;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">🗑</button>'+
      '</td></tr>';
  }).join('');

  return '<div style="max-width:620px">'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px">Torres disponibles al registrar un control. Renombrar una torre actualiza también los registros históricos, para no perder su continuidad de horómetro.</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px">'+
      '<input type="text" id="hel-torre-nueva" placeholder="Nombre de la torre" style="flex:1;padding:9px 11px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+
      '<button class="btn btn-primary" onclick="helAgregarTorre()">➕ Agregar</button>'+
    '</div>'+
    (torres.length
      ? '<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>'+filas+'</tbody></table>'
      : '<div style="color:#999;padding:20px;text-align:center;font-size:13px">No hay torres configuradas.</div>')+
  '</div>';
}
async function helAgregarTorre(){
  var el=document.getElementById('hel-torre-nueva');
  var nom=el?el.value.trim():'';
  if(!nom){ toast('Falta el nombre','Escriba el nombre de la torre','error'); return; }
  var torres=_helTorres();
  if(torres.some(function(t){ return t.toLowerCase()===nom.toLowerCase(); })){
    toast('Ya existe','Esa torre ya está en la lista','error'); return;
  }
  torres.push(nom);
  await _helGuardarTorres(torres);
  toast('Torre agregada',nom,'success');
  _helRefresh();
}
async function helQuitarTorre(i){
  var torres=_helTorres(); var nom=torres[i]; if(!nom) return;
  var usos=_helRegs().filter(function(r){ return r.torre===nom; }).length;
  if(usos){ toast('No se puede quitar',nom+' tiene '+usos+' registro(s) asociado(s)','error'); return; }
  torres.splice(i,1);
  await _helGuardarTorres(torres);
  toast('Torre eliminada',nom,'info');
  _helRefresh();
}
async function helRenombrarTorre(i){
  var torres=_helTorres(); var actual=torres[i]; if(!actual) return;
  var nuevo=prompt('Nuevo nombre para la torre:',actual);
  if(nuevo===null) return;
  nuevo=String(nuevo).trim();
  if(!nuevo || nuevo===actual) return;
  if(torres.some(function(t,j){ return j!==i && t.toLowerCase()===nuevo.toLowerCase(); })){
    toast('Ya existe','Otra torre usa ese nombre','error'); return;
  }
  torres[i]=nuevo;
  await _helGuardarTorres(torres);
  // Arrastrar el cambio a los registros históricos: el horómetro es por torre,
  // así que dejar registros con el nombre viejo rompería su continuidad.
  var afectados=_helRegs().filter(function(r){ return r.torre===actual; });
  for(var k=0;k<afectados.length;k++){
    var r=afectados[k]; r.torre=nuevo; r.updatedAt=new Date().toISOString();
    try{ await dbPut('heladas', r); }catch(e){ console.error(e); }
  }
  try{ STATE.cache.heladas=await dbAll('heladas'); }catch(e){}
  toast('Torre renombrada', actual+' → '+nuevo+(afectados.length?(' · '+afectados.length+' registro(s) actualizado(s)'):''),'success');
  _helRefresh();
}

/* ════════ EXPORTAR ════════ */
function helExportar(){
  var regs=_helVista||[];
  if(!regs.length){ toast('Sin datos','No hay registros para exportar','error'); return; }
  var cab=['Fecha','Temporada','Torre','Responsable','Hora inicio','Hora termino','Horas control',
           'Temp inicio (C)','Temp minima (C)','Horometro inicial','Horometro termino','Horas funcionamiento',
           'Partida','Litros estanque','Observaciones'];
  var q=function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  var lineas=[cab.map(q).join(';')];
  regs.forEach(function(r){
    var hr=_helHorasReloj(r.horaInicio,r.horaTermino), hh=_helHorasHorom(r);
    lineas.push([
      r.fecha||'', r.temporada||'', r.torre||'', r.responsable||'',
      r.horaInicio||'', r.horaTermino||'', hr===null?'':hr.toFixed(2),
      r.tempInicio==null?'':r.tempInicio, r.tempMinima==null?'':r.tempMinima,
      r.horometroInicial==null?'':r.horometroInicial, r.horometroFinal==null?'':r.horometroFinal,
      hh===null?'':hh.toFixed(2),
      (r.partida==='auto'?'Automatica':'Manual'),
      r.litrosEstanque==null?'':r.litrosEstanque, r.observaciones||''
    ].map(q).join(';'));
  });
  // BOM para que Excel respete los acentos
  var blob=new Blob(['\ufeff'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='heladas_'+(_helFTemp||'todas')+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  toast('Exportado', regs.length+' registro(s)','success');
}

/* ════════ EXPOSICIÓN GLOBAL ════════ */
try{
  window.renderHelada=renderHelada;
  window.helTab=helTab;
  window.helFiltrar=helFiltrar;
  window.helNuevo=helNuevo;
  window.helEditar=helEditar;
  window.helEliminar=helEliminar;
  window.helGuardar=helGuardar;
  window.helHintHoras=helHintHoras;
  window.helHintHorometro=helHintHorometro;
  window.helAgregarTorre=helAgregarTorre;
  window.helQuitarTorre=helQuitarTorre;
  window.helRenombrarTorre=helRenombrarTorre;
  window.helExportar=helExportar;
}catch(e){}
