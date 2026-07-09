// Devuelve el array de meses seleccionados en el filtro múltiple (vacío = todos).
function getMesesSel(){
  var el=document.getElementById('f-mes');
  if(!el) return [];
  return Array.from(el.selectedOptions||[]).map(function(o){return o.value;}).filter(Boolean);
}

/* ═══════════ MÓDULO CONTROL DE PRESUPUESTO (encapsulado) ═══════════ */
function __PZ_BOOTSTRAP__(){ (function(){
'use strict';

// ===================== CURRENCY STATE =====================
let CURRENCY = 'CLP'; // 'CLP' or 'USD'

function setCurrency(cur) {
  CURRENCY = cur;
  // Update buttons
  document.getElementById('btn-clp').className = 'cur-btn' + (cur==='CLP' ? ' active' : '');
  document.getElementById('btn-usd').className = 'cur-btn' + (cur==='USD' ? ' active-usd' : '');
  // Update subtitle
  const sub = document.getElementById('subtitle-moneda');
  if (sub) sub.textContent = cur === 'CLP' ? 'Valores en Pesos ($)' : 'Valores en USD';
  // Update accent color for USD
  document.documentElement.style.setProperty('--accent', cur==='USD' ? '#38bdf8' : '#16c784');
  // Re-render everything
  render();
  updateBanner();
}

function getPpto(d) { return CURRENCY === 'CLP' ? d['PPTO_CLP'] : d['PPTO_USD']; }
function getReal(d)  { return CURRENCY === 'CLP' ? d['REAL_CLP']  : d['REAL_USD'];  }
function symPrefix()  { return CURRENCY === 'CLP' ? '$' : 'USD '; }
function fmtVal(v)    {
  if (CURRENCY === 'CLP') return '$' + Math.round(v).toLocaleString('es-CL');
  return 'USD ' + Math.round(v).toLocaleString('es-CL');
}
function fmtValK(v)   {
  if (CURRENCY === 'CLP') return '$' + Math.round(v/1000).toLocaleString('es-CL') + 'K';
  return 'USD ' + Math.round(v).toLocaleString('es-CL');
}


// ===================== DETALLE GASTOS MODAL =====================
let currentDetalleItems = [];
let currentDetallePpto = 0;

/* _isSeasonDetalle(obj): true si el detalle ya está segmentado por temporada
   (el primer nivel es {temporada:{familia:[...]}}), false si es el formato
   plano antiguo ({familia:[...]}). Heurística: en el formato nuevo el valor
   del primer nivel es un objeto (no array); en el viejo es un array. */
function _isSeasonDetalle(obj){
  if(!obj || typeof obj!=='object') return false;
  const keys = Object.keys(obj);
  if(!keys.length) return false;
  const first = obj[keys[0]];
  return first != null && typeof first==='object' && !Array.isArray(first);
}
/* _toSeasonDetalle(obj): normaliza cualquier detalle al formato segmentado por
   temporada. Si ya lo está, lo devuelve tal cual (copia superficial). Si es
   plano, lo agrupa derivando la temporada de cada item (campo .temporada, o
   .anio+.mes, o 'SIN TEMPORADA'). */
function _toSeasonDetalle(obj){
  if(!obj || typeof obj!=='object') return {};
  if(_isSeasonDetalle(obj)){
    const out={}; Object.keys(obj).forEach(t=>{ out[t]=obj[t]; }); return out;
  }
  const out={};
  Object.keys(obj).forEach(familia=>{
    const arr = obj[familia]; if(!Array.isArray(arr)) return;
    arr.forEach(it=>{
      let temp = (it && it.temporada) ? String(it.temporada).trim() : '';
      if(!temp && it && it.anio!=null && typeof temporadaDeMesAnio==='function'){
        try{ temp = temporadaDeMesAnio(it.mes, it.anio) || ''; }catch(e){}
      }
      if(!temp) temp = 'SIN TEMPORADA';
      if(!out[temp]) out[temp]={};
      if(!out[temp][familia]) out[temp][familia]=[];
      out[temp][familia].push(it);
    });
  });
  return out;
}
/* _getDetalleFamilia(familia, temporada): devuelve el array de gastos de una
   familia para la temporada dada. Si temporada es '' (Todas), concatena todas
   las temporadas. Tolera el formato plano antiguo. */
function _getDetalleFamilia(familia, temporada){
  const src = (window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS);
  if(!_isSeasonDetalle(src)){
    // Formato plano: sin segmentación, devolver la familia tal cual.
    return src[familia] || [];
  }
  if(temporada){
    return (src[temporada] && src[temporada][familia]) ? src[temporada][familia] : [];
  }
  // Todas las temporadas: concatenar.
  let acc=[];
  Object.keys(src).forEach(t=>{ if(src[t] && src[t][familia]) acc = acc.concat(src[t][familia]); });
  return acc;
}
function openDetalleModal(descripcion) {
  const MONTH_ORDER = ['MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE','ENERO','FEBRERO','MARZO','ABRIL'];
  // Detalle filtrado por la TEMPORADA seleccionada en el dashboard (o todas).
  const tempSel = (document.getElementById('f-temporada') || {}).value || '';
  const allItems = _getDetalleFamilia(descripcion, tempSel);
  const mesesSel = getMesesSel();

  // Filter by month(s) if any selected
  const filtered = mesesSel.length
    ? allItems.filter(x => mesesSel.indexOf(x.mes) >= 0)
    : allItems;

  // Sort ascending by month order
  const items = [...filtered].sort((a, b) => {
    const ai = MONTH_ORDER.indexOf(a.mes);
    const bi = MONTH_ORDER.indexOf(b.mes);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  currentDetalleItems = items;

  // Calcular el PRESUPUESTO de esta descripción (sumando las filas de datos que
  // coinciden, respetando el filtro de mes). Se usa en el pie del modal para
  // mostrar gasto vs presupuesto y el % de desviación.
  try{
    var fuenteFilas = (typeof ACTIVE_DATA!=='undefined' && ACTIVE_DATA && ACTIVE_DATA.length) ? ACTIVE_DATA : RAW;
    var filasDesc = fuenteFilas.filter(function(d){
      if(d.DESCRIPCION !== descripcion) return false;
      if(mesFiltro && d.MES !== mesFiltro) return false;
      return true;
    });
    currentDetallePpto = filasDesc.reduce(function(s,d){ return s + (parseFloat(getPpto(d))||0); }, 0);
  }catch(e){ currentDetallePpto = 0; }

  document.getElementById('detalle-title').textContent = descripcion;
  const mesLabel = mesFiltro ? ` · ${mesFiltro}` : ' · Todos los meses';
  document.getElementById('detalle-subtitle').textContent =
    `${items.length} registros${mesLabel} · Hoja Detalle Gastos`;
  document.getElementById('detalle-search').value = '';
  renderDetalleTable(items);
  document.getElementById('detalle-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDetalleModal(e) {
  if (e && e.target !== document.getElementById('detalle-overlay')) return;
  document.getElementById('detalle-overlay').classList.remove('active');
  document.body.style.overflow = '';
}

// Close on Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.getElementById('detalle-overlay').classList.remove('active');
    document.body.style.overflow = '';
  }
});

function filterDetalleTable() {
  const q = document.getElementById('detalle-search').value.toLowerCase();
  const filtered = currentDetalleItems.filter(x =>
    x.desc.toLowerCase().includes(q) || x.proveedor.toLowerCase().includes(q)
  );
  renderDetalleTable(filtered);
}

function renderDetalleTable(items) {
  const tbody = document.getElementById('detalle-tbody');
  const noData = document.getElementById('detalle-no-data');
  const countEl = document.getElementById('detalle-count');
  const totalEl = document.getElementById('detalle-total-val');

  if (!items.length) {
    tbody.innerHTML = '';
    const mesesSel = getMesesSel();
    noData.textContent = mesesSel.length
      ? `Sin registros en Detalle Gastos para ${mesesSel.join(', ')}. El monto proviene de la hoja Base.`
      : 'Sin registros para esta descripción en Detalle Gastos.';
    noData.style.display = 'block';
    countEl.textContent = '0 registros';
    totalEl.textContent = '';
    return;
  }

  // Get TC for conversion when in USD mode
  const tc = parseFloat((document.getElementById('rb-tc').value || '0').replace(/\./g,'').replace(',','.')) || 1;
  const convertVal = v => CURRENCY === 'USD' ? v / tc : v;

  noData.style.display = 'none';
  const total = items.reduce((s, x) => s + convertVal(x.total), 0);
  countEl.textContent = `${items.length} registro${items.length !== 1 ? 's' : ''}`;
  // Pie del modal: además del gasto real, mostrar el presupuesto de la
  // descripción y el % de desviación (real vs presupuesto).
  // currentDetallePpto se suma desde getPpto(), que YA devuelve el valor en la
  // moneda activa (PPTO_USD en modo USD). No se debe volver a convertir.
  var pptoConv = currentDetallePpto || 0;
  var devPct = (pptoConv && pptoConv !== 0) ? ((total - pptoConv) / Math.abs(pptoConv)) * 100 : null;
  var devColor = (devPct == null) ? '#64748b' : (devPct > 0 ? '#ef4444' : '#16a34a');
  var devTxt = (devPct == null) ? 's/ppto' : ((devPct > 0 ? '+' : '') + devPct.toFixed(1) + '%');
  totalEl.innerHTML =
    '<span style="margin-right:14px">Gasto: <strong>' + fmtVal(total) + '</strong></span>' +
    '<span style="margin-right:14px;color:#475569">Ppto: <strong>' + fmtVal(pptoConv) + '</strong></span>' +
    '<span style="color:' + devColor + '">Desv: <strong>' + devTxt + '</strong></span>';

  tbody.innerHTML = items.map(x => {
    const converted = convertVal(x.total);
    const cls = converted < 0 ? 'neg' : 'pos';
    const totalFmt = CURRENCY === 'USD'
      ? 'USD ' + Math.abs(converted).toFixed(2)
      : '$' + Math.round(Math.abs(converted)).toLocaleString('es-CL');
    const sign = converted < 0 ? '-' : '';
    return `<tr>
      <td class="desc" title="${x.desc}">${x.desc.length > 55 ? x.desc.slice(0,55)+'…' : x.desc}</td>
      <td class="prov" title="${x.proveedor}">${x.proveedor.length > 30 ? x.proveedor.slice(0,30)+'…' : x.proveedor}</td>
      <td style="color:#64748b;font-size:11px;white-space:nowrap;">${x.numero != null ? x.numero : '—'}</td>
      <td class="num" style="color:#64748b;">${x.cantidad != null && x.cantidad !== '' ? x.cantidad : '—'}</td>
      <td style="color:#64748b;font-size:11px;white-space:nowrap;">${x.mes}</td>
      <td class="num ${cls}">${sign}${totalFmt}</td>
    </tr>`;
  }).join('');
}

// ===================== PRINT / PDF =====================
function imprimirPDF() {
  // Give charts time to render before print dialog
  window.print();
}

// ===================== RESUMEN COSECHA BANNER =====================
function updateBanner() {
  var base = ACTIVE_DATA || RAW;
  // Respetar los filtros de temporada y mes (las tarjetas reflejan la
  // temporada seleccionada, no el total del archivo).
  var tempSel = (document.getElementById('f-temporada') || {}).value || '';
  var mesesSel = getMesesSel();
  const source = base.filter(function(d){
    if (tempSel && _getTemporada(d) !== tempSel) return false;
    if (mesesSel.length && mesesSel.indexOf(d.MES) < 0) return false;
    return true;
  });

  // Totales de la selección — sensibles a la moneda activa
  const totalReal = source.reduce((s,d) => s + getReal(d), 0);
  const totalPpto = source.reduce((s,d) => s + getPpto(d), 0);
  const saldo     = totalPpto - totalReal;

  // Editable inputs
  const kg = parseFloat((document.getElementById('rb-kg').value || '0').replace(/\./g,'').replace(',','.')) || 0;
  const tc = parseFloat((document.getElementById('rb-tc').value || '0').replace(',','.')) || 1;
  const ha = parseFloat((document.getElementById('rb-ha').value || '0').replace(',','.')) || 1;

  const costoKg  = kg > 0 ? totalReal / kg : 0;
  const clpHa    = ha > 0 ? totalReal / ha : 0;

  // Formatter
  const fmtM = v => fmtVal(v);   // full pesos
  const fmtN = v => Math.round(v).toLocaleString('es-CL');          // plain number
  const fmtD = v => v.toFixed(2);                                    // 2 decimals

  document.getElementById('rb-costo-real').textContent = fmtM(totalReal);
  document.getElementById('rb-ppto-adj').textContent   = fmtM(totalPpto);

  const saldoEl    = document.getElementById('rb-saldo');
  const saldoSubEl = document.getElementById('rb-saldo-sub');
  saldoEl.textContent = (saldo >= 0 ? '+' : '') + fmtM(saldo);
  saldoEl.className   = 'rb-value ' + (saldo >= 0 ? 'accent' : 'danger');
  saldoSubEl.textContent = saldo >= 0 ? 'Bajo presupuesto ✓' : 'Sobre presupuesto ✗';

  document.getElementById('rb-costo-kg').textContent = CURRENCY === 'USD'
    ? 'USD ' + costoKg.toFixed(2) + '/Kg'
    : '$' + Math.round(costoKg).toLocaleString('es-CL') + '/Kg';
  document.getElementById('rb-usd-kg').textContent   = fmtVal(clpHa) + '/Ha';
  const haLabel = document.getElementById('rb-ha-label');
  if (haLabel) haLabel.textContent = (CURRENCY === 'CLP' ? '$ / Ha' : 'USD / Ha');
}

// Wire editable inputs
['rb-kg','rb-tc','rb-ha'].forEach(id => {
  document.getElementById(id).addEventListener('input', updateBanner);
});


let ACTIVE_DATA = null; // will hold current working dataset

function openUploadModal() {
  document.getElementById('upload-modal').classList.add('active');
  setStatus('⏳ Leyendo archivo...', 'loading');
}
function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
}

// Drag & drop on body
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.match(/\.(xlsx|xls)$/i)) {
    openUploadModal();
    processExcel(file);
  }
});

function handleFileSelect(e) {
  const files = e.target.files;
  if (!files || files.length === 0) return;
  const file = files[0];
  openUploadModal();
  setTimeout(() => processExcel(file), 100);
  try { e.target.value = ''; } catch(err) {}
}

function setStatus(msg, type) {
  const el = document.getElementById('upload-status');
  el.textContent = msg;
  el.className = 'upload-status ' + type;
}

function processExcel(file) {
  if (!file.name.match(/\.(xlsx|xls)$/i)) {
    setStatus('❌ Archivo no válido. Solo se aceptan archivos .xlsx o .xls', 'error');
    return;
  }
  setStatus('⏳ Leyendo archivo...', 'loading');
  // Marcar que hay una actualización local en curso: evita que un snapshot de
  // Firebase (que aún puede traer datos anteriores) pise lo que estamos
  // cargando desde el Excel. El flag se libera cuando el push a la nube confirma.
  try{ if(typeof PZFB!=='undefined') PZFB._localEditing = true; }catch(e){}

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });

      // Find 'Base' sheet (visible or hidden)
      const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'base');
      if (!sheetName) {
        setStatus('❌ No se encontró la hoja "Base" en el archivo.', 'error');
        return;
      }

      const ws = wb.Sheets[sheetName];

      // ── Read Kilos Cosechados from cell W1 of Base sheet ──
      // Acepta 0 como valor válido (antes lo ignoraba). Solo se omite si la
      // celda está vacía o no es numérica.
      const w1Cell = ws['W1'];
      if (w1Cell != null && w1Cell.v != null && w1Cell.v !== '') {
        const w1Val = parseFloat(w1Cell.v);
        if (!isNaN(w1Val)) {
          const kgInput = document.getElementById('rb-kg');
          if (kgInput) {
            kgInput.value = Math.round(w1Val).toLocaleString('es-CL');
          }
        }
      }
      // ── Read Kilos Estimados from cell U1 of Base sheet ──
      const u1Cell = ws['U1'];
      if (u1Cell != null && u1Cell.v != null && u1Cell.v !== '') {
        const u1Val = parseFloat(u1Cell.v);
        if (!isNaN(u1Val)) {
          const kgEstInput = document.getElementById('rb-kg-est');
          if (kgEstInput) {
            kgEstInput.value = Math.round(u1Val).toLocaleString('es-CL');
          }
        }
      }

      // Read headers from first row explicitly — avoids missing cols due to nulls in row 1
      const rawMatrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      if (!rawMatrix.length || !rawMatrix[0]) {
        setStatus('❌ La hoja "Base" está vacía.', 'error');
        return;
      }

      // Build normalized header map (trim whitespace)
      const headers = rawMatrix[0].map(h => (h != null ? String(h).trim() : ''));

      // Convert matrix rows → objects using explicit headers
      const rows = [];
      for (let i = 1; i < rawMatrix.length; i++) {
        const row = rawMatrix[i];
        if (!row || row.every(v => v == null || v === '')) continue;
        const obj = {};
        headers.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? null; });
        rows.push(obj);
      }

      if (!rows.length) {
        setStatus('❌ La hoja "Base" está vacía.', 'error');
        return;
      }

      // Validate required columns against the explicit headers
      const required = ['TIPO','MES','AÑO','SUB-GRUPO','TIPO DE COSTO','DESCRIPCION','MONTO REAL'];
      const missing = required.filter(r => !headers.includes(r));
      if (missing.length) {
        setStatus(`❌ Columnas faltantes: ${missing.join(', ')}`, 'error');
        return;
      }
      // Detect budget column: prefer PPTO AJUSTADO KG, fallback to MONTO PPTO
      const pptoCol = headers.includes('PPTO AJUSTADO KG') ? 'PPTO AJUSTADO KG' : 'MONTO PPTO';

      // Process: split PRESUPUESTO / REAL and merge
      const ppto = rows.filter(r => r.TIPO === 'PRESUPUESTO');
      const real = rows.filter(r => r.TIPO === 'REAL');

      const MONTH_ORDER_LOCAL = ["MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","ENERO","FEBRERO","MARZO","ABRIL"];
      const monthIdx = m => { const i = MONTH_ORDER_LOCAL.indexOf((m||'').toString().toUpperCase()); return i >= 0 ? i : 99; };

      // Build maps for CLP and USD
      const pptoCLPMap = {}, pptoUSDMap = {}, realCLPMap = {}, realUSDMap = {};

      ppto.forEach(r => {
        const k = [r.MES, r.AÑO, r['SUB-GRUPO'], r['TIPO DE COSTO'], r.DESCRIPCION].join('|');
        const tc = Math.max(parseFloat(r['TC']) || 1, 1);
        pptoCLPMap[k] = (pptoCLPMap[k] || 0) + (parseFloat(r['MONTO PPTO']) || 0);
        const pUSD = (r['Ppto USD'] != null && parseFloat(r['Ppto USD']) > 0)
          ? parseFloat(r['Ppto USD'])
          : (parseFloat(r['MONTO PPTO']) || 0) / tc;
        pptoUSDMap[k] = (pptoUSDMap[k] || 0) + pUSD;
      });

      real.forEach(r => {
        const k = [r.MES, r.AÑO, r['SUB-GRUPO'], r['TIPO DE COSTO'], r.DESCRIPCION].join('|');
        const tc = Math.max(parseFloat(r['TC']) || 1, 1);
        realCLPMap[k] = (realCLPMap[k] || 0) + (parseFloat(r['MONTO REAL']) || 0);
        const rUSD = (r['Real USD'] != null && parseFloat(r['Real USD']) > 0)
          ? parseFloat(r['Real USD'])
          : (parseFloat(r['MONTO REAL']) || 0) / tc;
        realUSDMap[k] = (realUSDMap[k] || 0) + rUSD;
      });

      // Union of all keys
      const allKeys = new Set([...Object.keys(pptoCLPMap), ...Object.keys(realCLPMap)]);
      const merged = [];
      allKeys.forEach(k => {
        const [MES, AÑO, SUB, TIPO, DESC] = k.split('|');
        // Leer temporada del Excel (si la columna existe) o derivar de MES+AÑO.
        var tempDeriv = '';
        try{
          var rawRow = rows.find(function(r){ return r.MES===MES && String(r['AÑO'])===String(AÑO); });
          if(rawRow) tempDeriv = _getTemporada(rawRow);
          if(!tempDeriv && typeof temporadaDeMesAnio==='function') tempDeriv = temporadaDeMesAnio(MES, AÑO) || '';
        }catch(e){}
        merged.push({
          'MES': MES, 'AÑO': parseInt(AÑO),
          'SUB-GRUPO': SUB, 'TIPO DE COSTO': TIPO,
          'DESCRIPCION': DESC,
          'TEMPORADA': tempDeriv,
          'PPTO_CLP': pptoCLPMap[k] || 0,
          'REAL_CLP': realCLPMap[k] || 0,
          'PPTO_USD': pptoUSDMap[k] || 0,
          'REAL_USD': realUSDMap[k] || 0,
          'MONTO PPTO': pptoCLPMap[k] || 0,
          'MONTO REAL': realCLPMap[k] || 0,
          'MES_ORDER': monthIdx(MES)
        });
      });

      merged.sort((a,b) => a.MES_ORDER - b.MES_ORDER);

      // Detect months with real data
      const mesesConReal = [...new Set(merged.filter(d => d['MONTO REAL'] > 0).map(d => d.MES))];
      const lastMes = mesesConReal.length ? mesesConReal[mesesConReal.length - 1] : '—';

      // Extract TC of the last month with real data from raw rows
      const lastMesReal = real.find(r =>
        (r.MES || '').toString().toUpperCase() === lastMes &&
        parseFloat(r['TC']) > 0
      );
      const lastTC = lastMesReal ? parseFloat(lastMesReal['TC']) : null;
      if (lastTC) {
        // El Excel manda: si trae TC, ese se usa.
        const tcInput = document.getElementById('rb-tc');
        if (tcInput) tcInput.value = lastTC.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        // Respaldo: si el Excel no trae TC, usar el Valor USD del último mes con
        // datos desde Indicadores Diarios (Configuración del SCI).
        try{
          if(typeof window.getIndicadorMes==='function'){
            // Pasar el año del último mes con real para resolver la temporada.
            var anioLast = lastMesReal ? lastMesReal['AÑO'] : null;
            const indic = window.getIndicadorMes(lastMes, anioLast);
            if(indic && indic.usd){
              const tcInput = document.getElementById('rb-tc');
              if(tcInput) tcInput.value = Number(indic.usd).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
          }
        }catch(e){}
      }

      // Update global data
      ACTIVE_DATA = merged;
      window.MONTHS_WITH_REAL = mesesConReal;
      // ── Persistencia en la nube (Parte 2): si el usuario puede editar,
      // subir TODO el dataset a presupuesto/main (reemplazo total). ──
      try{
        if(typeof can==='function' && can('presupuesto.editar')){
          // Diferir brevemente para que los inputs KPI (rb-kg/rb-tc) ya estén
          // actualizados, luego subir. El flag _localEditing se libera al
          // confirmar el push (o si Firebase no está disponible).
          setTimeout(function(){ try{ pzFbPush(); }catch(e){ console.error(e); if(typeof PZFB!=='undefined') PZFB._localEditing=false; } }, 200);
        } else {
          // Sin permiso de edición: no se sube. Liberar el flag local.
          if(typeof PZFB!=='undefined') PZFB._localEditing = false;
        }
      }catch(e){ if(typeof PZFB!=='undefined') PZFB._localEditing = false; }

      // ── Reload Detalle Gastos from new file if sheet exists ──
      const detalleSheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'detalle gastos');
      if (detalleSheetName) {
        try {
          const dwsRaw = XLSX.utils.sheet_to_json(wb.Sheets[detalleSheetName], { header: 1, defval: null });
          if (dwsRaw.length > 1) {
            const dHeaders = dwsRaw[0].map(h => (h != null ? String(h).trim() : ''));
            const dRows = [];
            for (let i = 1; i < dwsRaw.length; i++) {
              const row = dwsRaw[i];
              if (!row || row.every(v => v == null || v === '')) continue;
              const obj = {};
              dHeaders.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? null; });
              dRows.push(obj);
            }
            // Reconstruir el detalle de gastos SEGMENTADO POR TEMPORADA.
            // Mapeo REAL de la hoja "Detalle Gastos":
            //   FECHA=mes(A) · AÑO1=año(C) · NÚMERO(F) · DESCRIPCIÓN(H)
            //   CANTIDAD(I) · TOTAL(K) · PROVEEDOR(L) · FAMILIA(N)
            //   PROYECCION(T) · TEMPORADA(W)
            // Solo se incluyen filas REALES (PROYECCION === "REAL"); las de
            // PRESUPUESTO se ignoran. La temporada viene de la columna
            // TEMPORADA y, si falta, se deriva de FECHA(mes)+AÑO1.
            const _v = (r,k)=> (r[k]!=null && r[k]!=='') ? r[k] : null;
            const newDetalleSeason = {};
            dRows.forEach(r => {
              // Filtrar SOLO gastos reales.
              const proj = (r['PROYECCION'] || '').toString().trim().toUpperCase();
              if (proj !== 'REAL') return;
              const familia = (r['FAMILIA'] || '').toString().trim();
              const total   = parseFloat(r['TOTAL']);
              if (!familia || isNaN(total) || total === 0) return;
              const mesDet  = (r['FECHA'] || '—').toString().trim().toUpperCase();
              const anioRaw = _v(r,'AÑO1');
              const anioDet = anioRaw != null ? parseInt(anioRaw) : null;
              // Temporada: columna TEMPORADA o derivada de FECHA(mes)+AÑO1.
              let tempDet = (r['TEMPORADA'] || '').toString().trim();
              if (!tempDet && anioDet != null && typeof temporadaDeMesAnio === 'function') {
                try { tempDet = temporadaDeMesAnio(mesDet, anioDet) || ''; } catch(e){}
              }
              if (!tempDet) tempDet = 'SIN TEMPORADA';
              if (!newDetalleSeason[tempDet]) newDetalleSeason[tempDet] = {};
              if (!newDetalleSeason[tempDet][familia]) newDetalleSeason[tempDet][familia] = [];
              const numRaw  = _v(r,'NÚMERO') != null ? _v(r,'NÚMERO') : _v(r,'NUMERO');
              const cantRaw = _v(r,'CANTIDAD');
              newDetalleSeason[tempDet][familia].push({
                desc:      (r['DESCRIPCIÓN'] || r['DESCRIPCION'] || '—').toString().trim(),
                numero:    numRaw != null ? String(numRaw).trim() : '—',
                cantidad:  cantRaw != null ? cantRaw : '—',
                total:     Math.round(total),
                proveedor: (r['PROVEEDOR'] || '—').toString().trim(),
                mes:       mesDet,
                fecha:     mesDet,
                anio:      anioDet,
                temporada: tempDet,
                cuenta:    (r['CUENTA'] || '—').toString().trim(),
              });
            });
            // Ordenar cada familia por orden de mes, dentro de cada temporada.
            const MO = ["MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","ENERO","FEBRERO","MARZO","ABRIL"];
            Object.keys(newDetalleSeason).forEach(temp => {
              Object.keys(newDetalleSeason[temp]).forEach(fam => {
                newDetalleSeason[temp][fam].sort((a,b) => {
                  const ai = MO.indexOf(a.mes), bi = MO.indexOf(b.mes);
                  return (ai===-1?99:ai) - (bi===-1?99:bi);
                });
              });
            });
            // MERGE incremental: partir del detalle actual (ya segmentado) y
            // REEMPLAZAR solo las temporadas presentes en este Excel, dejando
            // intactas las demás. _toSeasonDetalle normaliza formato viejo.
            const baseSeason = _toSeasonDetalle(window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS);
            Object.keys(newDetalleSeason).forEach(temp => { baseSeason[temp] = newDetalleSeason[temp]; });
            // Update global — reassign the constant via window
            window.DETALLE_GASTOS_LIVE = baseSeason;
          }
        } catch(e) { console.warn('Detalle Gastos reload failed:', e); }
      }

      // Update last-update label
      refreshLastUpdate();

      const nRows = merged.length;
      const nMeses = mesesConReal.length;
      setStatus(`✅ Archivo cargado correctamente. ${nRows} registros, ${nMeses} meses con datos reales.`, 'ok');

      // Rebuild filters and re-render
      rebuildFilters(merged);
      renderAll(merged);
      updateBanner();

      setTimeout(closeUploadModal, 2200);

    } catch(err) {
      console.error('processExcel error:', err);
      setStatus('❌ Error al procesar el archivo: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ===================== DATA =====================
const RAW = window.SCI_DATA.RAW;

const MONTH_ORDER = ["MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","ENERO","FEBRERO","MARZO","ABRIL"];
const DETALLE_GASTOS = window.SCI_DATA.DETALLE_GASTOS;
const MONTHS_WITH_REAL = window.SCI_DATA.MONTHS_WITH_REAL;

// Chart instances

// Safe chart destroy — handles cases where Chart.js doesn't release canvas properly
function safeDestroy(instance, canvasId) {
  try { if (instance) instance.destroy(); } catch(e) {}
  try {
    const existing = Chart.getChart(document.getElementById(canvasId));
    if (existing) existing.destroy();
  } catch(e) {}
}

let chartLinea, chartTipo, chartSubgrupo, chartDesc, chartDev;

function rebuildFilters(data) {
  const temporadas = [...new Set(data.map(d => _getTemporada(d)).filter(t => t))].sort();
  const meses = [...new Set(data.map(d => d.MES))].sort((a,b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const tipos = [...new Set(data.map(d => d["TIPO DE COSTO"].trim()))].sort();
  const subgrupos = [...new Set(data.map(d => d["SUB-GRUPO"]))].sort();
  const descs = [...new Set(data.map(d => d.DESCRIPCION))].sort();

  const rebuild = (id, arr) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos</option>';
    arr.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if (arr.includes(cur)) sel.value = cur;
  };
  // Temporada: usa "Todas" como etiqueta del vacío.
  // Por defecto (sin selección previa) selecciona la temporada actual, o la última disponible.
  (function(){
    const sel = document.getElementById('f-temporada');
    if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todas</option>';
    temporadas.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if (cur && temporadas.includes(cur)) {
      sel.value = cur;
    } else if (!cur && !sel.dataset.pzInit) {
      // Primera carga: elegir temporada actual si existe en los datos, si no la última
      var def = '';
      try { var ta = (typeof temporadaActual==='function') ? temporadaActual() : ''; if(ta && temporadas.includes(ta)) def = ta; } catch(e){}
      if(!def && temporadas.length) def = temporadas[temporadas.length-1];
      if(def){ sel.value = def; sel.dataset.pzInit = '1'; }
    }
  })();
  // f-mes es multiselección: reconstruir preservando los meses marcados y sin "Todos".
  (function(){
    const sel=document.getElementById('f-mes'); if(!sel) return;
    const prev=Array.from(sel.selectedOptions||[]).map(o=>o.value);
    sel.innerHTML='';
    meses.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(prev.indexOf(v)>=0)o.selected=true; sel.appendChild(o); });
  })();
  rebuild('f-tipo', tipos);
  rebuild('f-subgrupo', subgrupos);
  rebuild('f-desc', descs);

  // Rebuild month chips using current MONTHS_WITH_REAL
  const currentMWR = window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
  const chips = document.getElementById('month-chips');
  chips.innerHTML = '';
  MONTH_ORDER.forEach(m => {
    const chip = document.createElement('div');
    chip.className = 'month-chip ' + (currentMWR.includes(m) ? 'chip-real' : 'chip-pending');
    chip.textContent = m.slice(0,3);
    chips.appendChild(chip);
  });
}

function renderAll(data) {
  // Re-run filterData so currency mapping (getPpto/getReal) is always applied
  const filtered = filterData();
  renderWithData(filtered, data || ACTIVE_DATA || RAW);
}

// Populate filters
function populateFilters() {
  // Generar las opciones desde los datos vigentes (los de la nube si existen,
  // si no la semilla). Antes se usaba solo RAW, lo que dejaba los filtros
  // desfasados respecto a los datos reales.
  const datos = (typeof ACTIVE_DATA !== 'undefined' && ACTIVE_DATA && ACTIVE_DATA.length) ? ACTIVE_DATA : RAW;
  const mesesReales = (typeof MONTHS_WITH_REAL !== 'undefined' ? (window.MONTHS_WITH_REAL || MONTHS_WITH_REAL) : []) || [];

  const meses = [...new Set(datos.map(d => d.MES))].sort((a,b) => MONTH_ORDER.indexOf(a) - MONTH_ORDER.indexOf(b));
  const tipos = [...new Set(datos.map(d => (d["TIPO DE COSTO"]||'').trim()).filter(Boolean))].sort();
  const subgrupos = [...new Set(datos.map(d => d["SUB-GRUPO"]).filter(Boolean))].sort();
  const descs = [...new Set(datos.map(d => d.DESCRIPCION).filter(Boolean))].sort();

  // Limpiar el <select> dejando SOLO la opción "Todos" (value="") antes de
  // rellenar. Esto evita opciones duplicadas: el HTML ya trae opciones y, sin
  // esta limpieza, populateFilters las agregaba de nuevo en cada entrada.
  const fillSelect = (id, arr) => {
    const sel = document.getElementById(id);
    if(!sel) return;
    const prev = sel.value;                 // conservar la selección actual si existe
    sel.innerHTML = '<option value="">Todos</option>';
    arr.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
    if(prev && arr.includes(prev)) sel.value = prev;
  };
  // f-mes es multiselección: reconstruir preservando los meses marcados y sin "Todos".
  (function(){
    const sel=document.getElementById('f-mes'); if(!sel) return;
    const prev=Array.from(sel.selectedOptions||[]).map(o=>o.value);
    sel.innerHTML='';
    meses.forEach(v=>{ const o=document.createElement('option'); o.value=v; o.textContent=v; if(prev.indexOf(v)>=0)o.selected=true; sel.appendChild(o); });
  })();
  fillSelect('f-tipo', tipos);
  fillSelect('f-subgrupo', subgrupos);
  fillSelect('f-desc', descs);

  // Chips de meses: vaciar antes de rellenar (el HTML ya trae chips).
  const chips = document.getElementById('month-chips');
  if(chips){
    chips.innerHTML = '';
    MONTH_ORDER.forEach(m => {
      const chip = document.createElement('div');
      chip.className = 'month-chip ' + (mesesReales.includes(m) ? 'chip-real' : 'chip-pending');
      chip.textContent = m.slice(0,3);
      chips.appendChild(chip);
    });
  }

  refreshLastUpdate();
}

// Lee el valor de "temporada" de una fila de forma tolerante al nombre exacto
// de la columna (TEMPORADA, Temporada, temporada). Si no existe la columna,
// deriva la temporada de MES+AÑO usando temporadaDeMesAnio(). Devuelve '' si
// no puede resolverla.
function _getTemporada(d){
  if(!d) return '';
  // La temporada agrícola cierra en ABRIL (mayo→abril). Se deriva SIEMPRE de
  // MES + AÑO, que son datos confiables, en vez de confiar en una columna
  // "TEMPORADA" del Excel que puede venir mal poblada y mezclar temporadas.
  if(d.MES && d['AÑO']){
    try{ var t=temporadaDeMesAnio(d.MES, d['AÑO']); if(t) return t; }catch(e){}
  }
  // Respaldo: si no hay MES/AÑO, usar la columna TEMPORADA del Excel si existe.
  if(d.TEMPORADA!=null && d.TEMPORADA!=='') return String(d.TEMPORADA).trim();
  if(d.Temporada!=null && d.Temporada!=='') return String(d.Temporada).trim();
  if(d.temporada!=null && d.temporada!=='') return String(d.temporada).trim();
  for(var k in d){ if(/^temporada$/i.test(String(k).trim())){ var v=d[k]; if(v!=null&&v!=='') return String(v).trim(); } }
  return '';
}

function getFilters() {
  return {
    temporada: document.getElementById('f-temporada') ? document.getElementById('f-temporada').value : '',
    mes: document.getElementById('f-mes').value,
    meses: getMesesSel(),
    tipo: document.getElementById('f-tipo').value,
    sub: document.getElementById('f-subgrupo').value,
    desc: document.getElementById('f-desc').value,
  };
}

function filterData() {
  const source = ACTIVE_DATA || RAW;
  const f = getFilters();
  // Map to MONTO PPTO / MONTO REAL based on currency
  return source
    .filter(d =>
      (!f.temporada || _getTemporada(d) === f.temporada) &&
      (!f.meses || !f.meses.length || f.meses.indexOf(d.MES) >= 0) &&
      (!f.tipo || d["TIPO DE COSTO"].trim() === f.tipo) &&
      (!f.sub || d["SUB-GRUPO"] === f.sub) &&
      (!f.desc || d.DESCRIPCION === f.desc)
    )
    .map(d => ({
      ...d,
      "MONTO PPTO": getPpto(d),
      "MONTO REAL": getReal(d)
    }));
}

function resetFilters() {
  if(document.getElementById('f-temporada')) document.getElementById('f-temporada').value = '';
  var _fm=document.getElementById('f-mes'); if(_fm){ Array.from(_fm.options).forEach(function(o){o.selected=false;}); }
  document.getElementById('f-tipo').value = '';
  document.getElementById('f-subgrupo').value = '';
  document.getElementById('f-desc').value = '';
  render();
}

function fmtK(v) {
  // Show as integer miles, using dot as thousands separator (CL locale)
  return Math.round(v/1000).toLocaleString('es-CL');
}
function fmtPct(r, p) { if (!p) return '—'; return ((r-p)/p*100).toFixed(1)+'%'; }

// ====== RENDER ======
// ── Actualiza la etiqueta "Última actualización" desde la fuente activa ──
function refreshLastUpdate() {
  var source = (typeof ACTIVE_DATA !== 'undefined' && ACTIVE_DATA) ? ACTIVE_DATA : RAW;
  // Respetar la temporada seleccionada en el filtro global
  var tempSel = (document.getElementById('f-temporada') || {}).value || '';
  // Meses con datos reales, dentro de la temporada seleccionada (o todas si no hay selección)
  var conReal = source.filter(function(d) {
    return d['MONTO REAL'] > 0 && (!tempSel || _getTemporada(d) === tempSel);
  });
  if (!conReal.length) {
    document.getElementById('last-update').textContent = '—';
    return;
  }
  // Ordenar por MES_ORDER y tomar el último
  var sorted = conReal.slice().sort(function(a, b) {
    var oa = (a['MES_ORDER'] != null) ? a['MES_ORDER'] : 99;
    var ob = (b['MES_ORDER'] != null) ? b['MES_ORDER'] : 99;
    return oa - ob;
  });
  var last = sorted[sorted.length - 1];
  var mes = (last['MES'] || '').toString();
  var año = last['AÑO'] || '';
  // Title case: "FEBRERO" → "Febrero"
  var label = mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase() + (año ? ' ' + año : '');
  document.getElementById('last-update').textContent = label;
}

function render() {
  refreshLastUpdate();
  updateBanner();
  const data = filterData();
  renderWithData(data, ACTIVE_DATA || RAW);
}

function renderWithData(data, allData) {
  const currentMonthsWithReal = window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
  const ppto = data.reduce((s,d) => s + d["MONTO PPTO"], 0);
  const real = data.reduce((s,d) => s + d["MONTO REAL"], 0);
  const dev = real - ppto;
  const devPct = ppto ? (dev/ppto*100) : 0;

  // Count months with real (from filtered data)
  const mesesReal = [...new Set(data.filter(d => d["MONTO REAL"] > 0).map(d => d.MES))];

  // KPIs — full integer pesos with thousands separator, no decimals
  const fmtInt = v => Math.round(v).toLocaleString('es-CL');
  document.getElementById('kpi-ppto').textContent = fmtVal(ppto);
  document.getElementById('kpi-real').textContent = fmtVal(real);
  document.getElementById('kpi-dev').textContent  = (dev >= 0 ? '+' : '-') + fmtVal(Math.abs(dev));
  document.getElementById('kpi-dev-pct').textContent = (devPct >= 0 ? '+' : '') + devPct.toFixed(1) + '% vs presupuesto';
  const devCard = document.getElementById('kpi-dev-card');
  devCard.className = 'kpi-card ' + (dev > 0 ? 'red' : 'green');
  document.getElementById('kpi-meses-real').textContent = mesesReal.length;
  document.getElementById('kpi-avance').textContent = ppto ? Math.round(real/ppto*100) + '%' : '—';

  // Max overrun by descripcion
  const byDesc = {};
  data.forEach(d => {
    const k = d.DESCRIPCION;
    if (!byDesc[k]) byDesc[k] = {p:0,r:0};
    byDesc[k].p += d["MONTO PPTO"]; byDesc[k].r += d["MONTO REAL"];
  });
  const overruns = Object.entries(byDesc).map(([k,v]) => ({k, dev: v.r - v.p})).filter(x => x.dev > 0).sort((a,b) => b.dev - a.dev);
  if (overruns.length) {
    document.getElementById('kpi-max-over').textContent = fmtVal(overruns[0].dev);
    document.getElementById('kpi-max-over-label').textContent = overruns[0].k.split(' ').slice(0,3).join(' ');
  }

  renderLineChart(data);
  renderTipoChart(data);
  renderSubgrupoChart(data);
  renderTopDev(data, byDesc);
  renderDescChart(data);
  renderDevChart(data);
  // renderExecSummary removed
}  // end renderWithData

function renderLineChart(data) {
  const byMes = {};
  MONTH_ORDER.forEach(m => { byMes[m] = {p:0,r:0}; });
  data.forEach(d => {
    if (!byMes[d.MES]) return;
    byMes[d.MES].p += d["MONTO PPTO"];
    byMes[d.MES].r += d["MONTO REAL"];
  });
  const labels = MONTH_ORDER.map(m => m.slice(0,3));
  const pptoVals = MONTH_ORDER.map(m => Math.round(byMes[m].p));
  const realVals = MONTH_ORDER.map(m => byMes[m].r > 0 ? Math.round(byMes[m].r) : null);

  safeDestroy(chartLinea, 'chartLinea');
  chartLinea = new Chart(document.getElementById('chartLinea'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Presupuesto',
          data: pptoVals,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Real',
          data: realVals,
          borderColor: '#16c784',
          backgroundColor: 'rgba(22,199,132,0.08)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#16c784',
          tension: 0.3,
          fill: true,
          spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: '#1a2235', borderColor: '#1e2d45', borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtVal(ctx.parsed.y ?? 0)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', font:{size:10} }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#64748b', font:{size:10}, callback: v => fmtVal(v) }, grid: { color: 'rgba(30,45,69,0.5)' } }
      }
    }
  });
}

function renderTipoChart(data) {
  const byTipo = {};
  data.forEach(d => {
    const k = d["TIPO DE COSTO"].trim();
    if (!byTipo[k]) byTipo[k] = {p:0, r:0};
    byTipo[k].p += d["MONTO PPTO"];
    byTipo[k].r += d["MONTO REAL"];
  });
  const tipos  = Object.keys(byTipo).filter(k => byTipo[k].p > 0 || byTipo[k].r > 0);
  const labels = tipos.map(k => k.replace('COSTOS ','').replace('GASTOS ',''));
  const pptoV  = tipos.map(k => Math.round(byTipo[k].p));
  const realV  = tipos.map(k => byTipo[k].r > 0 ? Math.round(byTipo[k].r) : null);

  safeDestroy(chartTipo, 'chartTipo');
  chartTipo = new Chart(document.getElementById('chartTipo'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Presupuesto',
          data: pptoV,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6',
          tension: 0.3,
          fill: true,
        },
        {
          label: 'Real',
          data: realV,
          borderColor: '#16c784',
          backgroundColor: 'rgba(22,199,132,0.08)',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#16c784',
          tension: 0.3,
          fill: true,
          spanGaps: false,
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          backgroundColor: '#1a2235', borderColor: '#1e2d45', borderWidth: 1,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${fmtVal(ctx.parsed.y ?? 0)}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#64748b', font:{size:9} }, grid: { color: 'rgba(30,45,69,0.5)' } },
        y: { ticks: { color: '#64748b', font:{size:9}, callback: v => fmtVal(v) }, grid: { color: 'rgba(30,45,69,0.5)' } }
      }
    }
  });
}


function renderSubgrupoChart(data) {
  const bySub = {};
  data.forEach(d => {
    const k = d["SUB-GRUPO"];
    if (!bySub[k]) bySub[k] = { total: 0, tipos: {} };
    bySub[k].total += d["MONTO REAL"];
    const tipo = (d["TIPO DE COSTO"] || '').trim();
    if (tipo) {
      if (!bySub[k].tipos[tipo]) bySub[k].tipos[tipo] = 0;
      bySub[k].tipos[tipo] += d["MONTO REAL"];
    }
  });
  const subs = Object.keys(bySub).filter(k => bySub[k].total > 0);
  const vals = subs.map(k => Math.round(bySub[k].total));
  const colors = ['#16c784','#3b82f6','#f5a623','#a78bfa','#22d3ee'];
  const total  = vals.reduce((s,v) => s+v, 0);

  safeDestroy(chartSubgrupo, 'chartSubgrupo');
  chartSubgrupo = new Chart(document.getElementById('chartSubgrupo'), {
    type: 'doughnut',
    data: {
      labels: subs,
      datasets: [{ data: vals, backgroundColor: colors, borderWidth: 2, borderColor: '#111827', hoverOffset: 8 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      layout: { padding: { top: 65, bottom: 10, left: 75, right: 75 } },
      plugins: {
        legend: { display: false },   // hidden — we use custom HTML legend
        tooltip: {
          backgroundColor:'#1a2235', borderColor:'#1e2d45', borderWidth:1,
          callbacks:{
            label: ctx => {
              const pct = total ? ((ctx.parsed/total)*100).toFixed(1) : '0';
              return ` ${ctx.label}: ${fmtVal(ctx.parsed)} (${pct}%)`;
            }
          }
        },
        datalabels: false
      }
    },
    plugins: [{
      id: 'sliceLabels',
      afterDraw(chart) {
        const { ctx, data: cd } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data.length) return;
        ctx.save();
        meta.data.forEach((arc, i) => {
          const val  = cd.datasets[0].data[i];
          const pct  = total ? ((val/total)*100).toFixed(1) : '0';
          if (parseFloat(pct) < 3) return;
          const angle  = (arc.startAngle + arc.endAngle) / 2;
          const outerR = arc.outerRadius;
          const labelR = outerR + 20;
          const x      = arc.x + Math.cos(angle) * labelR;
          const y      = arc.y + Math.sin(angle) * labelR;
          const align  = Math.cos(angle) >= 0 ? 'left' : 'right';
          const xOff   = Math.cos(angle) >= 0 ? 4 : -4;
          // Connector
          ctx.beginPath();
          ctx.moveTo(arc.x + Math.cos(angle)*(outerR+3), arc.y + Math.sin(angle)*(outerR+3));
          ctx.lineTo(x, y);
          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth   = 1.2; ctx.stroke();
          // Value
          ctx.fillStyle    = colors[i % colors.length];
          ctx.font         = 'bold 10px Roboto, sans-serif';
          ctx.textAlign    = align; ctx.textBaseline = 'bottom';
          ctx.fillText(fmtVal(val), x + xOff, y);
          // Pct
          ctx.fillStyle    = '#ffffff';
          ctx.font         = '9px Inter, sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(`${pct}%`, x + xOff, y + 2);
        });
        ctx.restore();
      }
    }]
  });

  // ---- Build custom HTML legend (2 columns, white text + tipo de costo breakdown) ----
  const legendEl = document.getElementById('subgrupo-legend');
  if (legendEl) {
    legendEl.innerHTML = subs.map((label, i) => {
      const val  = vals[i];
      const pct  = total ? ((val/total)*100).toFixed(1) : '0';
      const col  = colors[i % colors.length];
      // Tipo de costo breakdown for this sub-grupo
      const tipos = bySub[label] ? bySub[label].tipos : {};
      const tiposHtml = Object.entries(tipos)
        .filter(([,v]) => v > 0)
        .sort(([,a],[,b]) => b - a)
        .map(([tipo, tval]) => {
          const tpct = val ? ((tval/val)*100).toFixed(0) : '0';
          const shortTipo = tipo.replace('COSTOS ', '').replace('GASTOS ', '');
          return `<div style="display:flex;justify-content:space-between;gap:6px;font-size:9px;color:#94a3b8;line-height:1.4;">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;" title="${tipo}">${shortTipo}</span>
            <span style="color:#64748b;flex-shrink:0;">${tpct}%</span>
          </div>`;
        }).join('');
      return `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:6px;padding:5px 7px;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:${col};flex-shrink:0;"></span>
            <span style="font-size:10.5px;font-weight:700;color:#ffffff;line-height:1.2;">${label}</span>
          </div>
          <div style="font-size:9.5px;color:#cbd5e1;font-family:'Roboto',sans-serif;font-weight:600;">
            $${Math.round(val).toLocaleString('es-CL')}
            <span style="color:#64748b;font-weight:400;font-size:9.5px;">&nbsp;(${pct}%)</span>
          </div>
          <div style="border-top:1px solid rgba(255,255,255,0.06);margin-top:2px;padding-top:4px;">
            ${tiposHtml}
          </div>
        </div>`;
    }).join('');
  }
}

function renderDescChart(data) {
  // Aggregate by DESCRIPCION
  const byDesc = {};
  data.forEach(d => {
    const k = d.DESCRIPCION;
    if (!byDesc[k]) byDesc[k] = {p:0, r:0};
    byDesc[k].p += d["MONTO PPTO"];
    byDesc[k].r += d["MONTO REAL"];
  });

  // Keep only items with movement, sort by max desc, top 15
  const items = Object.entries(byDesc)
    .filter(([,v]) => v.p > 0 || v.r > 0)
    .sort(([,a],[,b]) => Math.max(b.p,b.r) - Math.max(a.p,a.r))
    .slice(0, 15);

  const labels = items.map(([k]) => k);
  const pptoV  = items.map(([,v]) => Math.round(v.p));
  const realV  = items.map(([,v]) => Math.round(v.r));

  // Fixed height for line chart
  const wrap = document.querySelector('.chart-desc-wrap');
  if (wrap) wrap.style.height = '320px';

  safeDestroy(chartDesc, 'chartDesc');
  chartDesc = new Chart(document.getElementById('chartDesc'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Presupuesto',
          data: pptoV,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.12)',
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
        },
        {
          label: 'Real',
          data: realV,
          borderColor: '#16c784',
          backgroundColor: 'rgba(22,199,132,0.08)',
          pointBackgroundColor: items.map(([,v]) => v.r > v.p ? '#ef4444' : '#16c784'),
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2,
          fill: true,
          tension: 0.35,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#94a3b8', font:{size:10}, boxWidth:10, padding:12 }
        },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: '#1e2d45',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const val  = ctx.parsed.y;
              const diff = realV[ctx.dataIndex] - pptoV[ctx.dataIndex];
              const base = pptoV[ctx.dataIndex];
              const pct  = base ? ((diff / Math.abs(base)) * 100).toFixed(1) : '—';
              const tag  = ctx.datasetIndex === 1
                ? ` (${diff >= 0 ? '+' : ''}${fmtVal(Math.abs(diff))} · ${diff >= 0 ? '+' : ''}${pct}%)`
                : '';
              return ` ${ctx.dataset.label}: ${fmtVal(val)}${tag}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: 9 },
            maxRotation: 45,
            minRotation: 30,
            callback: function(val, i) {
              const lbl = labels[i] || '';
              return lbl.length > 18 ? lbl.slice(0, 18) + '…' : lbl;
            }
          },
          grid: { color: 'rgba(30,45,69,0.3)' }
        },
        y: {
          ticks: {
            color: '#64748b',
            font: { size: 9 },
            callback: v => fmtVal(v)
          },
          grid: { color: 'rgba(30,45,69,0.4)' }
        }
      }
    }
  });
}

function renderDevChart(data) {
  // Aggregate by DESCRIPCION: deviation = REAL - PPTO
  const byDesc = {};
  data.forEach(d => {
    const k = d.DESCRIPCION;
    if (!byDesc[k]) byDesc[k] = {p:0, r:0};
    byDesc[k].p += d["MONTO PPTO"];
    byDesc[k].r += d["MONTO REAL"];
  });

  // Calculate deviations, exclude items with no movement
  const items = Object.entries(byDesc)
    .map(([k, v]) => ({ label: k, dev: v.r - v.p, p: v.p, r: v.r }))
    .filter(x => Math.abs(x.dev) > 0)
    .sort((a, b) => a.dev - b.dev); // ascending: negatives left, positives right

  if (!items.length) return;

  const labels  = items.map(x => x.label);
  const devVals = items.map(x => Math.round(x.dev));

  // Dynamic height — barras más gruesas para mejor lectura
  const h = Math.max(220, items.length * 32);
  const wrap = document.querySelector('.chart-dev-wrap');
  if (wrap) wrap.style.height = h + 'px';

  safeDestroy(chartDev, 'chartDev');
  chartDev = new Chart(document.getElementById('chartDev'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Desviación (Real − Ppto)',
        data: devVals,
        backgroundColor: devVals.map(v => v > 0
          ? 'rgba(239,68,68,0.92)'
          : 'rgba(22,163,74,0.92)'
        ),
        borderColor: devVals.map(v => v > 0 ? '#dc2626' : '#15803d'),
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
        barPercentage: 0.78,
        categoryPercentage: 0.82,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: '#1e2d45',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const v   = ctx.parsed.x;
              const itm = items[ctx.dataIndex];
              const pct = itm.p ? ((v / Math.abs(itm.p)) * 100).toFixed(1) : '—';
              return ` ${v >= 0 ? '+' : ''}${fmtVal(Math.abs(v))}  (${v >= 0 ? '+' : ''}${pct}%)`;
            },
            title: ctx => ctx[0].label + '  👆 clic en etiqueta para ver detalle'
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#475569', font: {size:10},
            callback: v => fmtVal(v)
          },
          grid: { color: 'rgba(148,163,184,0.25)' },
          border: { color: '#cbd5e1' }
        },
        y: {
          ticks: { color: '#0369a1', font: { size: 11, weight: '600' }, padding: 6 },
          grid: { display: false }
        }
      }
    },
    plugins: [{
      id: 'devZeroLine',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        const xZero = scales.x.getPixelForValue(0);
        if (xZero < chartArea.left || xZero > chartArea.right) return;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xZero, chartArea.top);
        ctx.lineTo(xZero, chartArea.bottom);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.restore();
      }
    }, {
      id: 'devValueLabels',
      afterDatasetsDraw(chart) {
        const { ctx, scales } = chart;
        const xZero = scales.x.getPixelForValue(0);
        ctx.save();
        chart.getDatasetMeta(0).data.forEach((bar, i) => {
          const v = devVals[i];
          if (v === 0) return;
          const itm = items[i];
          const pct = itm.p ? Math.round((v / Math.abs(itm.p)) * 100) : null;
          const montoTxt = (v >= 0 ? '+' : '-') + fmtVal(Math.abs(v));
          const pctTxt = (pct === null) ? '' : '  (' + (pct >= 0 ? '+' : '') + pct + '%)';
          const label = montoTxt + pctTxt;
          const y = bar.tooltipPosition().y;
          ctx.font = '700 10px Roboto, Inter, sans-serif';
          ctx.textBaseline = 'middle';
          // Colocar la etiqueta SIEMPRE del lado del cero, hacia afuera de la
          // barra, para que no se encime con el color de la barra y se lea bien.
          if (v >= 0) {
            // barra crece a la derecha → etiqueta a la izquierda del cero
            ctx.textAlign = 'right';
            ctx.fillStyle = '#b91c1c';
            ctx.fillText(label, xZero - 6, y);
          } else {
            // barra crece a la izquierda → etiqueta a la derecha del cero
            ctx.textAlign = 'left';
            ctx.fillStyle = '#15803d';
            ctx.fillText(label, xZero + 6, y);
          }
        });
        ctx.restore();
      }
    }, {
      // Clickable y-axis labels with hover underline effect
      id: 'yAxisClickable',
      _hoveredIdx: -1,
      afterEvent(chart, args) {
        const { event } = args;
        const { scales, chartArea } = chart;
        const yScale = scales.y;
        const canvas = chart.canvas;

        // Only care about mouse events in the left label area
        if (event.x > chartArea.left) {
          if (this._hoveredIdx !== -1) {
            this._hoveredIdx = -1;
            canvas.style.cursor = 'default';
            chart.draw();
          }
          return;
        }

        // Find which tick the mouse is over
        let found = -1;
        for (let i = 0; i < labels.length; i++) {
          const tickY = yScale.getPixelForValue(i);
          if (Math.abs(event.y - tickY) < 12) { found = i; break; }
        }

        if (found !== this._hoveredIdx) {
          this._hoveredIdx = found;
          canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
          args.changed = true;
        }

        // Handle click
        if (event.type === 'click' && found >= 0) {
          openDetalleModal(labels[found]);
        }
      },
      afterDraw(chart) {
        if (this._hoveredIdx < 0) return;
        const { ctx, scales, chartArea } = chart;
        const yScale = scales.y;
        const i = this._hoveredIdx;
        const tickY = yScale.getPixelForValue(i);
        const label = labels[i];

        // Measure text width to draw underline
        ctx.save();
        ctx.font = '600 10.5px Inter, sans-serif';
        const tw = ctx.measureText(label).width;
        const x = chartArea.left - 10 - tw;

        // Draw highlight background
        ctx.fillStyle = 'rgba(56,189,248,0.1)';
        ctx.beginPath();
        ctx.roundRect(x - 6, tickY - 11, tw + 12, 22, 4);
        ctx.fill();

        // Draw underline
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth   = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x, tickY + 8);
        ctx.lineTo(x + tw, tickY + 8);
        ctx.stroke();
        ctx.restore();
      }
    }]
  });
}

function renderTopDev(data, byDesc) {
  const rows = Object.entries(byDesc)
    .map(([k,v]) => ({ k, dev: v.r - v.p, p: v.p, r: v.r }))
    .filter(x => Math.abs(x.dev) > 0)
    .sort((a,b) => Math.abs(b.dev) - Math.abs(a.dev))
    .slice(0, 8);

  const tbody = document.getElementById('top-dev-body');
  tbody.innerHTML = rows.map(r => {
    const pct = r.p ? ((r.r-r.p)/r.p*100).toFixed(0) : '—';
    const over = r.dev > 0;
    const label = over ? '▲ +'+fmtVal(r.dev) : '▼ '+fmtVal(r.dev);
    const cls = over ? 'pill-over' : 'pill-under';
    const pctLabel = r.p ? (over ? '+' : '') + pct + '%' : '—';
    const nombre = r.k.length > 24 ? r.k.slice(0,24)+'…' : r.k;
    // Cada fila es clicable: abre el detalle de gastos de esa descripción.
    // El tooltip (title) muestra el presupuesto y el real completos.
    const tip = 'Presupuesto: ' + fmtVal(r.p) + ' · Real: ' + fmtVal(r.r) + ' · Desv: ' + pctLabel + ' — Clic para ver el detalle';
    const safeKey = (r.k || '').replace(/'/g, "\\'");
    return `<tr class="dev-row-click" onclick="window.PZ.openDetalleModal('${safeKey}')" title="${tip.replace(/"/g,'&quot;')}" style="cursor:pointer">
      <td style="font-size:10.5px;color:#cbd5e1;">${nombre}</td>
      <td><span class="dev-pill ${cls}">${label}</span></td>
      <td style="color:${over?'#ef4444':'#16c784'};font-weight:600;">${pctLabel}</td>
    </tr>`;
  }).join('');
}

function renderExecSummary(data, ppto, real, dev, devPct, overruns, monthsWithRealParam) {
  const currentMWR = monthsWithRealParam || window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
  // Big picture
  const items = [];
  const totalK = fmtK(Math.abs(dev));
  if (Math.abs(devPct) < 3) {
    items.push({cls:'ok', title:'Ejecución total dentro del presupuesto', body:`El gasto real acumulado es $${fmtK(real)}K vs presupuesto $${fmtK(ppto)}K. Desviación de ${devPct.toFixed(1)}%, dentro del rango aceptable.`});
  } else if (dev > 0) {
    items.push({cls:'alert', title:`Sobreje cución: +$${totalK}K (${devPct.toFixed(1)}%)`, body:`El gasto real supera el presupuesto en $${totalK}K. Se requiere revisión de los ítems con mayor desviación.`});
  } else {
    items.push({cls:'ok', title:`Subejecución: -$${totalK}K (${Math.abs(devPct).toFixed(1)}%)`, body:`El gasto real está por debajo del presupuesto en $${totalK}K. Posible atraso en ejecución o ahorro genuino.`});
  }

  // Top overruns
  overruns.slice(0, 3).forEach(o => {
    const cls = o.dev > 5000000 ? 'alert' : '';
    items.push({cls, title:`Sobreeje cución: ${o.k}`, body:`Desviación de +$${fmtK(o.dev)}K por sobre el presupuesto asignado a este ítem.`});
  });

  // Months without real data
  const pendientes = MONTH_ORDER.filter(m => !currentMWR.includes(m));
  if (pendientes.length) {
    items.push({cls:'', title:`${pendientes.length} meses pendientes de ingreso`, body:`Los meses ${pendientes.join(', ')} aún no tienen datos reales registrados en la base.`});
  }

  document.getElementById('exec-items').innerHTML = items.map(i =>
    `<div class="exec-item ${i.cls}"><strong>${i.title}</strong><p>${i.body}</p></div>`
  ).join('');
}

// Init


updateBanner();

document.getElementById('f-mes').addEventListener('change', render);
document.getElementById('f-tipo').addEventListener('change', render);
document.getElementById('f-subgrupo').addEventListener('change', render);
document.getElementById('f-desc').addEventListener('change', render);
(function(){ var ft=document.getElementById('f-temporada'); if(ft) ft.addEventListener('change', function(){ render(); try{ if(typeof pzRenderCriterios==='function') pzRenderCriterios(); }catch(e){} }); })();

// ===================== DESCARGA HTML =====================
function downloadDashboard() {
  var btn = document.getElementById('btn-download');
  var originalText = '⬇ Descargar HTML';
  btn.textContent = '⏳ Generando...';
  btn.disabled = true;

  setTimeout(function() {
    try {
      var currentData = (typeof ACTIVE_DATA !== 'undefined' && ACTIVE_DATA) ? ACTIVE_DATA : RAW;
      var currentMWR  = window.MONTHS_WITH_REAL || MONTHS_WITH_REAL;
      var currentDG   = window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS;
      var haVal       = (document.getElementById('rb-ha') || {}).value || '13.39';
      var kgVal       = (document.getElementById('rb-kg') || {}).value || '206.808';
      var tcVal       = (document.getElementById('rb-tc') || {}).value || '865.1';
      var lastUpdate  = ((document.getElementById('last-update') || {}).textContent || 'dashboard')
                          .trim().replace(/\s+/g, '_');

      var rawJSON = JSON.stringify(currentData);
      var mwrJSON = JSON.stringify(currentMWR);
      var dgJSON  = JSON.stringify(currentDG);

      var html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

      function reemplazarLinea(src, prefijo, nuevoContenido) {
        var marcador = '\n' + prefijo;
        var idx = src.indexOf(marcador);
        if (idx === -1) return src;
        var inicioLinea = idx + 1;
        var finLinea    = src.indexOf('\n', inicioLinea);
        if (finLinea === -1) finLinea = src.length;
        return src.slice(0, inicioLinea) + nuevoContenido + src.slice(finLinea);
      }

      // Escape user input for safe insertion into HTML attribute (avoid breaking quotes)
      function escAttr(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }

      html = reemplazarLinea(html, 'const RAW = [',              'const RAW = ' + rawJSON + ';');
      html = reemplazarLinea(html, 'const DETALLE_GASTOS = {',   'const DETALLE_GASTOS = ' + dgJSON + ';');
      html = reemplazarLinea(html, 'const MONTHS_WITH_REAL = [', 'const MONTHS_WITH_REAL = ' + mwrJSON + ';');

      html = html.replace(/(<input[^>]+id="rb-ha"[^>]+value=")[^"]*"/, function(m, p1) {
        return p1 + escAttr(haVal) + '"';
      });
      html = html.replace(/(<input[^>]+id="rb-kg"[^>]+value=")[^"]*"/, function(m, p1) {
        return p1 + escAttr(kgVal) + '"';
      });
      html = html.replace(/(<input[^>]+id="rb-tc"[^>]+value=")[^"]*"/, function(m, p1) {
        return p1 + escAttr(tcVal) + '"';
      });

      var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement('a');
      a.href     = url;
      a.download = 'Control_Presupuesto_Cz_2018_' + lastUpdate + '.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      btn.textContent = '✅ Descargado';
      setTimeout(function() { btn.textContent = originalText; btn.disabled = false; }, 2200);
    } catch(err) {
      console.error('downloadDashboard error:', err);
      btn.textContent = '❌ Error';
      setTimeout(function() { btn.textContent = originalText; btn.disabled = false; }, 3000);
    }
  }, 80);
}


/* ═══════════════ PERSISTENCIA FIREBASE DEL PRESUPUESTO ═══════════════ */
/* Doc único 'presupuesto/main' (mismo patrón que sci/main del SCI).
   Estrategia: REEMPLAZAR TODO. Cada Excel que sube el admin pisa el dataset
   completo en la nube; los demás roles leen en tiempo real vía onSnapshot.
   Solo el admin (permiso presupuesto.editar) puede subir. */
var PZFB = {
  ready:false, online:false, applyingRemote:false, _localEditing:false,
  clientId: 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
  lastVersion: 0, unsubscribe: null, listenerStarted:false
};
function pzFbDocRef(){
  if(typeof firebase==='undefined' || !firebase.apps || !firebase.apps.length) return null;
  try{ return firebase.firestore().collection('presupuesto').doc('main'); }catch(e){ return null; }
}
/* serializeDataset(): arma el objeto persistible con TODO el estado actual del
   dashboard (filas mensuales, detalle de gastos y los KPIs editables). */
function pzSerializeDataset(){
  function num(id){ var el=document.getElementById(id); if(!el) return null;
    var v=(el.value||'').toString().replace(/\./g,'').replace(',', '.').replace(/[^0-9.\-]/g,'');
    var n=parseFloat(v); return isNaN(n)?null:n; }
  return {
    rows: (ACTIVE_DATA || RAW) || [],
    detalle: _toSeasonDetalle(window.DETALLE_GASTOS_LIVE || DETALLE_GASTOS) || {},
    monthsWithReal: (window.MONTHS_WITH_REAL || MONTHS_WITH_REAL) || [],
    kpis: { kg: num('rb-kg'), tc: num('rb-tc'), ha: num('rb-ha'), kgEst: num('rb-kg-est') }
  };
}
/* loadDataset(obj): aplica datos provenientes de Firebase al dashboard y
   re-renderiza. No vuelve a subir (se marca applyingRemote). */
function pzLoadDataset(obj){
  if(!obj || typeof obj!=='object') return;
  // Si el usuario acaba de subir un Excel localmente, NO pisar sus datos con
  // un snapshot remoto que aún puede traer el valor anterior. La ventana se
  // libera cuando el push local confirma.
  if(PZFB._localEditing){ return; }
  try{
    PZFB.applyingRemote = true;
    if(Array.isArray(obj.rows) && obj.rows.length){ ACTIVE_DATA = obj.rows; }
    if(obj.detalle && typeof obj.detalle==='object'){ window.DETALLE_GASTOS_LIVE = _toSeasonDetalle(obj.detalle); }
    if(Array.isArray(obj.monthsWithReal)){ window.MONTHS_WITH_REAL = obj.monthsWithReal; }
    // KPIs editables
    if(obj.kpis){
      var k=obj.kpis;
      var kg=document.getElementById('rb-kg'); if(kg && k.kg!=null) kg.value = Math.round(k.kg).toLocaleString('es-CL');
      var tc=document.getElementById('rb-tc'); if(tc && k.tc!=null) tc.value = k.tc.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
      var ha=document.getElementById('rb-ha'); if(ha && k.ha!=null) ha.value = k.ha.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
      var kgEst=document.getElementById('rb-kg-est'); if(kgEst && k.kgEst!=null) kgEst.value = Math.round(k.kgEst).toLocaleString('es-CL');
    }
    // Reconstruir filtros y re-render con los datos nuevos
    try{ rebuildFilters(ACTIVE_DATA || RAW); }catch(e){}
    try{ populateFilters(); }catch(e){}
    try{ render(); }catch(e){}
    try{ updateBanner(); }catch(e){}
    try{ refreshLastUpdate(); }catch(e){}
  }catch(e){ console.error('PZ loadDataset error:', e); }
  finally{ PZFB.applyingRemote = false; }
}
/* pzFbPush(): sube TODO el dataset a presupuesto/main (replace-all). */
function pzFbPush(){
  var ref = pzFbDocRef();
  if(!ref){ if(typeof PZFB!=='undefined') PZFB._localEditing = false; return; }
  if(PZFB.applyingRemote){ return; }
  try{
    var version = Date.now();
    PZFB.lastVersion = version;
    var data = pzSerializeDataset();
    var userName = '';
    try{ if(typeof STATE!=='undefined' && STATE.user){ userName = STATE.user.nombre || STATE.user.id || ''; } }catch(e){}
    try{FBCOUNT.write();}catch(e){} ref.set({
      payload: JSON.stringify(data),
      _version: version,
      _clientId: PZFB.clientId,
      _updatedBy: userName,
      _updatedAt: (firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : version)
    }).then(function(){
      PZFB.online = true;
      PZFB._localEditing = false;
      try{ setStatus('☁️ Datos del presupuesto guardados en la nube.', 'ok'); }catch(e){}
    }).catch(function(err){
      PZFB.online = false;
      PZFB._localEditing = false;
      console.error('[PZ-Firebase] Error al guardar:', err);
      try{ setStatus('⚠️ No se pudo guardar en la nube (datos locales OK).', 'error'); }catch(e){}
    });
  }catch(e){ console.error('[PZ-Firebase] push error:', e); }
}
/* pzFbStartListener(): escucha presupuesto/main en tiempo real. */
function pzFbStartListener(){
  var ref = pzFbDocRef();
  if(!ref) return;
  if(PZFB.unsubscribe){ try{ PZFB.unsubscribe(); }catch(e){} }
  PZFB.unsubscribe = ref.onSnapshot({includeMetadataChanges:false}, function(doc){ try{FBCOUNT.read();}catch(e){}
    PZFB.online = true;
    if(!doc.exists){
      // La nube está vacía. Si este usuario puede editar, sembramos la semilla
      // local actual para inicializar el documento remoto (una sola vez).
      try{
        if(typeof can==='function' && can('presupuesto.editar')){ pzFbPush(); }
      }catch(e){}
      return;
    }
    var d = doc.data() || {};
    // Ignorar el eco de nuestra propia escritura.
    if(d._clientId === PZFB.clientId && d._version === PZFB.lastVersion){ return; }
    if(!d.payload) return;
    var obj;
    try{ obj = JSON.parse(d.payload); }catch(e){ console.error('[PZ-Firebase] payload inválido'); return; }
    pzLoadDataset(obj);
  }, function(err){
    console.error('[PZ-Firebase] onSnapshot error:', err);
  });
}
/* pzFbInit(): inicializa la sincronización del presupuesto. Reusa la app de
   Firebase ya inicializada por el SCI/Cuaderno. */
function pzFbInit(){
  try{
    if(typeof firebase === 'undefined'){ console.warn('[PZ-Firebase] SDK no disponible. Presupuesto solo local.'); return; }
    if(!firebase.apps || !firebase.apps.length){ console.warn('[PZ-Firebase] App Firebase no inicializada aún.'); return; }
    PZFB.ready = true;
    if(!PZFB.listenerStarted){
      PZFB.listenerStarted = true;
      // Si hay auth, esperar a que esté lista; si no, arrancar directo.
      if(firebase.auth){
        var started=false;
        firebase.auth().onAuthStateChanged(function(u){ if(u && !started){ started=true; pzFbStartListener(); } });
        setTimeout(function(){ if(!started){ started=true; pzFbStartListener(); } }, 6000);
      } else {
        pzFbStartListener();
      }
    }
  }catch(e){ console.error('[PZ-Firebase] init error:', e); }
}

var _pzReady = false;
function pzInit(){
  // (Re)inicializa el dashboard sobre el DOM ya inyectado.
  try{
    if(!_pzReady){
      populateFilters();
      _pzReady = true;
    } else {
      // al re-entrar, reconstruir filtros por si el DOM se recreó
      populateFilters();
    }
    render();
    updateBanner();
    // Botón 'Actualizar datos': solo visible para quien puede editar (admin).
    try{
      var _btn = document.getElementById('pz-btn-upload');
      if(_btn){ _btn.style.display = (typeof can==='function' && can('presupuesto.editar')) ? '' : 'none'; }
    }catch(e){}
    // Tipo de Cambio por defecto desde Indicadores Diarios (respaldo): si existe
    // un Valor USD para el último mes con datos reales, usarlo como referencia
    // cuando el dashboard arranca sin un TC traído por Excel en esta sesión.
    try{
      if(typeof window.getIndicadorMes==='function'){
        var mesesReales = (window.MONTHS_WITH_REAL || (typeof MONTHS_WITH_REAL!=='undefined'?MONTHS_WITH_REAL:[])) || [];
        var ultimoMes = mesesReales.length ? mesesReales[mesesReales.length-1] : null;
        // Buscar el año de ese mes en los datos para resolver la temporada.
        var anioUlt = null;
        try{
          var fuente = (typeof ACTIVE_DATA!=='undefined' && ACTIVE_DATA) ? ACTIVE_DATA : RAW;
          var fila = ultimoMes ? fuente.find(function(d){ return d.MES===ultimoMes; }) : null;
          anioUlt = fila ? fila['AÑO'] : null;
        }catch(e){}
        var indic = ultimoMes ? window.getIndicadorMes(ultimoMes, anioUlt) : null;
        var tcInput = document.getElementById('rb-tc');
        if(indic && indic.usd && tcInput){
          // Solo si el usuario no ha modificado manualmente (heurística: marcar).
          if(!tcInput.dataset.pzUserEdited){
            tcInput.value = Number(indic.usd).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
          }
        }
      }
    }catch(e){}
    // Superficie CZ 2018: tomar la suma de hectáreas de los paños 2018 del
    // Cuaderno de Campo. Si existe, se rellena y se marca como derivada.
    try{
      if(typeof window.pzSumaHa2018==='function'){
        var ha2018 = window.pzSumaHa2018();
        var haInput = document.getElementById('rb-ha');
        if(haInput && ha2018!=null && ha2018>0){
          haInput.value = (Math.round(ha2018*100)/100).toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
          haInput.readOnly = true;
          haInput.title = 'Calculado: suma de hectáreas de paños Plantación 2018 (Cuaderno de Campo)';
          var sub = haInput.closest('.rb-item') ? haInput.closest('.rb-item').querySelector('.rb-sub') : null;
          if(sub) sub.textContent = 'Ha · suma paños 2018 (Cuaderno)';
        }
      }
    }catch(e){}
  }catch(e){ console.error('PZ init error:', e); }
}
function pzReset(){ _pzReady = false; }

// Filtros: enganchar change para re-render (en el original había listeners
// implícitos vía onchange en algunos; aseguramos consistencia).
function pzWireFilters(){
  ['f-temporada','f-mes','f-tipo','f-subgrupo','f-desc'].forEach(function(id){
    var el = document.getElementById(id);
    if(el && !el._pzWired){ el.addEventListener('change', render); el._pzWired = true; }
  });
}

// ── Criterios por Temporada (pestaña del presupuesto) ──────────────
// Almacena criterios en config key 'pz_criterios': array acumulativo por
// temporada con tipo de gasto y detalle descriptivo. Editable.
var _PZ_CRIT_KEY = 'pz_criterios';
function _pzGetCriterios(){
  try{
    var c = (STATE.cache.config && STATE.cache.config[_PZ_CRIT_KEY]) || null;
    return (c && Array.isArray(c.items)) ? c.items : [];
  }catch(e){ return []; }
}
async function _pzSaveCriterios(items){
  var obj = { key:_PZ_CRIT_KEY, items:items, _updatedAt:new Date().toISOString() };
  STATE.cache.config = STATE.cache.config || {};
  STATE.cache.config[_PZ_CRIT_KEY] = obj;
  await dbPut('config', obj);
}
// Cambiar pestaña Dashboard / Criterios
window.pzCambiarTab = function(tab){
  var pDash=document.getElementById('pz-pane-dashboard');
  var pCrit=document.getElementById('pz-pane-criterios');
  document.querySelectorAll('.pz-tab-btn').forEach(function(b){
    var t=b.getAttribute('data-pztab');
    b.style.borderBottomColor=(t===tab)?'#1565c0':'transparent';
    b.style.color=(t===tab)?'#1565c0':'#888';
    b.classList.toggle('pz-tab-active', t===tab);
  });
  if(pDash) pDash.style.display=(tab==='dashboard')?'':'none';
  if(pCrit) pCrit.style.display=(tab==='criterios')?'':'none';
  if(tab==='criterios'){
    pzPopularSelectoresCriterios();
    pzRenderCriterios();
  }
};
// Popular los selectores de temporada y tipo de gasto
window.pzPopularSelectoresCriterios = function(){
  // Temporadas: las del presupuesto + las de criterios existentes + actual
  var temps={};
  var allD=ACTIVE_DATA||RAW||[];
  allD.forEach(function(d){ var t=_getTemporada(d); if(t) temps[t]=1; });
  _pzGetCriterios().forEach(function(c){ if(c.temporada) temps[c.temporada]=1; });
  try{ var ta=temporadaActual(); if(ta) temps[ta]=1; var ini=parseInt(ta.split('-')[0]); temps[(ini+1)+'-'+(ini+2)]=1; }catch(e){}
  temps['2025-2026']=1;
  var tList=Object.keys(temps).sort();
  // Selector de temporada del formulario
  var sel=document.getElementById('pz-crit-temp');
  if(sel){
    var cur=sel.value;
    sel.innerHTML='<option value="">Seleccione</option>';
    tList.forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; sel.appendChild(o); });
    if(cur && tList.indexOf(cur)>=0) sel.value=cur;
  }
  // (El filtro de temporada de criterios ahora es el filtro global del Dashboard: f-temporada)
  // Tipos de gasto: del Excel + algunos comunes
  var tipos={};
  allD.forEach(function(d){ var g=d.DESCRIPCION; if(g) tipos[g]=1; });
  ['Poda','Raleo','Cosecha','Fertilización','Fitosanitario','Riego','Mano de Obra','Contratista','Maquinaria','Otros'].forEach(function(t){ tipos[t]=1; });
  var tSel=document.getElementById('pz-crit-tipo');
  if(tSel){
    var curT=tSel.value;
    tSel.innerHTML='<option value="">Seleccione</option>';
    Object.keys(tipos).sort().forEach(function(t){ var o=document.createElement('option'); o.value=t; o.textContent=t; tSel.appendChild(o); });
    if(curT) tSel.value=curT;
  }
};
// Guardar un criterio
window.pzGuardarCriterio = async function(){
  if(typeof can==='function' && !can('presupuesto.editar')){
    if(typeof toast==='function') toast('Sin permiso','Necesita permiso de edición','error');
    return;
  }
  var temp=(document.getElementById('pz-crit-temp')||{}).value||'';
  var tipo=(document.getElementById('pz-crit-tipo')||{}).value||'';
  var detalle=(document.getElementById('pz-crit-detalle')||{}).value||'';
  if(!temp){ if(typeof toast==='function') toast('Falta temporada','Seleccione una temporada','error'); return; }
  if(!tipo){ if(typeof toast==='function') toast('Falta tipo','Seleccione un tipo de gasto','error'); return; }
  if(!detalle.trim()){ if(typeof toast==='function') toast('Falta detalle','Describa el criterio','error'); return; }
  var items=_pzGetCriterios();
  // Si estamos editando (hay un id de edición activo), actualizar en vez de crear.
  var editId=document.getElementById('pz-crit-edit-id');
  if(editId && editId.value){
    var ex=items.find(function(c){ return c.id===editId.value; });
    if(ex){ ex.temporada=temp; ex.tipo=tipo; ex.detalle=detalle.trim(); ex.modificado=new Date().toISOString(); ex.usuario=(STATE.user?(STATE.user.nombre||STATE.user.id):''); }
    editId.value='';
    document.querySelector('#pz-criterio-form .pz-crit-cancel-btn')?.remove();
  } else {
    items.push({
      id:'cr_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      temporada:temp, tipo:tipo, detalle:detalle.trim(),
      fecha:new Date().toISOString(),
      usuario:(STATE.user?(STATE.user.nombre||STATE.user.id):'')
    });
  }
  await _pzSaveCriterios(items);
  // Limpiar formulario
  document.getElementById('pz-crit-detalle').value='';
  if(typeof toast==='function') toast('Criterio guardado','','success');
  pzRenderCriterios();
};
// Renderizar lista de criterios
window.pzRenderCriterios = function(){
  var el=document.getElementById('pz-criterios-list'); if(!el) return;
  var items=_pzGetCriterios();
  // La temporada se controla con el filtro global del Dashboard (f-temporada)
  var filtro=(document.getElementById('f-temporada')||{}).value||'';
  var lbl=document.getElementById('pz-crit-temp-activa'); if(lbl) lbl.textContent = filtro || 'Todas';
  if(filtro) items=items.filter(function(c){ return c.temporada===filtro; });
  // Ordenar por temporada desc, luego por fecha desc
  items.sort(function(a,b){ return (b.temporada||'').localeCompare(a.temporada||'') || (b.fecha||'').localeCompare(a.fecha||''); });
  if(!items.length){
    el.innerHTML='<div style="color:#999;padding:24px;text-align:center;font-size:13px">No hay criterios registrados'+(filtro?' para la temporada '+filtro:'')+'.</div>';
    return;
  }
  var puedeEditar=(typeof can==='function')&&can('presupuesto.editar');
  // Agrupar por temporada
  var porTemp={};
  items.forEach(function(c){ var t=c.temporada||'—'; if(!porTemp[t]) porTemp[t]=[]; porTemp[t].push(c); });
  var html='';
  Object.keys(porTemp).sort().reverse().forEach(function(temp){
    html+='<div style="margin-bottom:16px"><div style="font-size:14px;font-weight:800;color:#1565c0;border-bottom:2px solid #e3e8ee;padding-bottom:4px;margin-bottom:8px">📅 Temporada '+escapeHtml(temp)+'</div>';
    porTemp[temp].forEach(function(c){
      var fechaFmt=''; try{ fechaFmt=new Date(c.fecha).toLocaleDateString('es-CL'); }catch(e){ fechaFmt=c.fecha||''; }
      html+='<div style="background:#fff;border:1px solid #e3e8ee;border-radius:8px;padding:12px 14px;margin-bottom:8px">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
          '<span style="background:#eff6ff;color:#1e40af;font-size:11px;font-weight:700;padding:3px 10px;border-radius:6px">'+escapeHtml(c.tipo||'')+'</span>'+
          '<span style="font-size:10px;color:#94a3b8">'+escapeHtml(fechaFmt)+(c.usuario?' · '+escapeHtml(c.usuario):'')+'</span>'+
        '</div>'+
        '<div style="font-size:13px;color:#334155;line-height:1.5;white-space:pre-wrap">'+escapeHtml(c.detalle||'')+'</div>'+
        (puedeEditar?'<div style="margin-top:8px;display:flex;gap:6px">'+
          '<button onclick="pzEditarCriterio(\''+c.id+'\')" style="background:#f0f7ff;border:1px solid #bfdbfe;border-radius:6px;padding:4px 10px;font-size:11px;color:#1565c0;font-weight:700;cursor:pointer">✏️ Editar</button>'+
          '<button onclick="pzEliminarCriterio(\''+c.id+'\')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:4px 10px;font-size:11px;color:#b91c1c;font-weight:700;cursor:pointer">✕ Eliminar</button>'+
        '</div>':'')+
      '</div>';
    });
    html+='</div>';
  });
  el.innerHTML=html;
};
// Editar un criterio: carga los datos en el formulario
window.pzEditarCriterio = function(id){
  var items=_pzGetCriterios();
  var c=items.find(function(x){ return x.id===id; }); if(!c) return;
  var tempSel=document.getElementById('pz-crit-temp'); if(tempSel) tempSel.value=c.temporada||'';
  var tipoSel=document.getElementById('pz-crit-tipo'); if(tipoSel) tipoSel.value=c.tipo||'';
  var det=document.getElementById('pz-crit-detalle'); if(det) det.value=c.detalle||'';
  // Marcar id de edición
  var hidEdit=document.getElementById('pz-crit-edit-id');
  if(!hidEdit){ hidEdit=document.createElement('input'); hidEdit.type='hidden'; hidEdit.id='pz-crit-edit-id'; document.getElementById('pz-criterio-form').appendChild(hidEdit); }
  hidEdit.value=id;
  // Agregar botón cancelar edición si no existe
  if(!document.querySelector('#pz-criterio-form .pz-crit-cancel-btn')){
    var cancelBtn=document.createElement('button');
    cancelBtn.className='pz-crit-cancel-btn';
    cancelBtn.textContent='Cancelar edición';
    cancelBtn.style.cssText='padding:10px 20px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#666;font-size:13px;font-weight:700;cursor:pointer;margin-left:8px';
    cancelBtn.onclick=function(){ document.getElementById('pz-crit-edit-id').value=''; det.value=''; cancelBtn.remove(); };
    document.querySelector('#pz-criterio-form button[onclick*="pzGuardarCriterio"]').insertAdjacentElement('afterend', cancelBtn);
  }
  det.focus();
};
// Eliminar un criterio
window.pzEliminarCriterio = function(id){
  if(typeof confirmDialog==='function'){
    confirmDialog('Eliminar criterio','¿Eliminar este criterio? Esta acción no se puede deshacer.', async function(){
      var items=_pzGetCriterios().filter(function(c){ return c.id!==id; });
      await _pzSaveCriterios(items);
      pzRenderCriterios();
      if(typeof toast==='function') toast('Criterio eliminado','','success');
    }, 'Eliminar', true);
  }
};

window.PZ = {
  init: function(){ pzWireFilters(); pzInit(); },
  reset: pzReset,
  setCurrency: setCurrency,
  resetFilters: resetFilters,
  imprimirPDF: imprimirPDF,
  handleFileSelect: handleFileSelect,
  closeUploadModal: closeUploadModal,
  closeDetalleModal: closeDetalleModal,
  filterDetalleTable: filterDetalleTable,
  openDetalleModal: openDetalleModal,
  serializeDataset: pzSerializeDataset,
  loadDataset: pzLoadDataset,
  fbInit: pzFbInit,
  fbPush: pzFbPush,
  _fbState: function(){ return PZFB; }
};
})(); }
