SCI — Índice de Módulos (v108)

Reconstruido desde el código real de v108. Sirve para ubicar la línea exacta de cada función y saltar directo, sin leer archivos completos. Repo: rodrigobrionesfriz-ux/Scimodula (GitHub Pages) · Rama: main · Cache: sci-v108 (10 refs ?v=108 en index.html) · DB_VERSION: 13.

Estructura de archivos
Archivo	Líneas	Rol
index.html	2.945	Login, contenedores HTML de todas las pestañas, CSS del módulo Presupuesto, estado S del Cuaderno, normalizador global de mayúsculas, registro del SW
js/core.js	1.484	IndexedDB, sync Firebase (SCI), sesión/permisos, navegación, sidebar, sistemas externos, temas
js/inventario.js	6.846	Productos, movimientos, stock, tomas, combustible, respaldos, indicadores, config, usuarios, empresa
js/cuaderno.js	7.163	Fertirriego, estimación, órdenes/confirmaciones, registro, paños, vínculos Cuaderno↔SCI, sync propio
js/huerto.js	2.725	Conteo en terreno (cte*) + Inventario de plantas/huerto (ip*), mapas Leaflet, orientación de hileras
js/presupuesto.js	2.651	Dashboard de presupuesto, carga Excel, gráficos, temporadas, GTT, criterios, EER/Ha, sync propio (pz*)
js/ordencompra.js	590	Órdenes de compra (oc*)
js/actualizacion.js	310	Actualización de estado de plantas (aih*): terreno propone → admin aprueba, con respaldo por versión
js/helada.js	556	NUEVO (v108): Control de Heladas (hel*) — eventos de helada y funcionamiento de torres
data/presupuesto-data.js	7	Datos semilla de presupuesto
service-worker.js	64	Precache versionado (constante VERSION única desde v108)

Stores IndexedDB (23): users, products, warehouses, groups, productTypes, providers, customers, costCenters, inventoryCounts, movements, ordenescompra, mantenciones, conteos, estimaciones, invplantas, stock, lots, audit, combustible, config, aihprop, aihver (local), heladas (nuevo v108).

js/core.js — infraestructura
Sección	Líneas
Constantes DB + lista STORES	11–37
IndexedDB (openDB 40, dbPutLocal 57, dbPut 64, dbDelLocal 152, dbDel 158)	40–192
Sync Firebase SCI (_sigMovimientos 307, sciFbApplyRemote 319, _refrescarVistaSegura 395, sciFbPush 480)	195–560
Temas / branding	562–632
Seed history, sistemas externos, permisos (can 794)	633–840
Config de movimientos (prefijos/labels)	841–860
initDB, reloadCache 870, audit 897, validarCampos, toast 957	861–965
Login / logout / inactividad (doLogin 966)	966–1160
Sidebar / navegación (renderSidebar 1177, navigate 1399)	1165–end

Funciones clave: openDB 40 · dbPut 64 · dbDel 158 · _sigMovimientos 307 · sciFbApplyRemote 319 · _refrescarVistaSegura 395 · sciFbPush 480 · can 794 · reloadCache 870 · audit 897 · doLogin 966 · renderSidebar 1177 · navigate 1399.

Sync tras cambio remoto (v107): el stock es DERIVADO y no se sincroniza. sciFbApplyRemote compara la firma de movimientos (_sigMovimientos) antes y después de fusionar; si cambiaron, ejecuta _ejecutarRecalculoStock() y luego _refrescarVistaSegura(). Ese helper solo redibuja vistas de consulta (_SCI_PAGINAS_CONSULTA) y nunca con un modal abierto, para no destruir un formulario en curso.

Menú (PAGES): PRINCIPAL · INVENTARIO · OPERACIÓN (movimientos, entradas, salidas, órdenes de compra, tomas, rendimiento combustible, Control de Heladas 1154) · CUADERNO DE CAMPO · MANTENCIONES · TERRENO · CONTROL DE PRESUPUESTO · ADMINISTRACIÓN.

js/inventario.js — bodega
Sección	Líneas
Helpers / modals / user menu (confirmDialog 73)	16–116
Respaldo y carpeta personalizada	118–230
Recálculo de stock (recalcularStock 237, _ejecutarRecalculoStock 272)	232–429
Detección de inconsistencias (detectarInconsistenciaStock 430)	430–474
Respaldo consolidado (SCI + Cuaderno + Presupuesto)	475–747
PAGE: Dashboard (renderDashboard 828)	748–983
PAGE: Productos (saveProduct 1231, duplicados, import masivo)	984–1920
PAGE: Bodegas / Proveedores / Clientes / Centros de Costo	1921–2582
PAGE: Tomas de inventario (renderTomas 2618, renderTomasTable 2646)	2583–3394
Informe de ajustes post-toma	3395–3600
PAGE: Stock (renderStock 3601, renderStockTable 3659)	3601–4109
PAGE: Movimientos lista (renderMovimientos 4110, tabla 4146)	4110–4288
Combustible (renderCombustibleForm 4748, cbStockHint 4819)	4289–4900
Movimiento form (entrada/salida, mvChkSaldo 5462)	4900–5588
Costing engine (saveMovimiento 5589, applyMovementToStock 5906)	5589–6104
PAGE: Usuarios (renderUsuarios 6105)	6105–6300
Empresa / indicadores / temporadas (temporadaDeMesAnio 6418, temporadaActual 6427, getIndicadores 6468)	6300–6566
PAGE: Config (renderConfig 6567)	6567–end

Funciones clave: recalcularStock 237 · _ejecutarRecalculoStock 272 · detectarInconsistenciaStock 430 · renderDashboard 828 · saveProduct 1231 · renderCombustibleForm 4748 · cbStockHint 4819 · mvChkSaldo 5462 · saveMovimiento 5589 · applyMovementToStock 5906 · temporadaActual 6427 · getIndicadores 6468.

Validación de stock en salidas (v102):

Normales: saveMovimiento valida por lote (si el producto maneja atributos) o por producto+bodega; al editar suma la cantidad original para no dar falso positivo.
Combustible: valida contra getStock(codigo, bodegaId) — por bodega, no con getStockTotal (que sumaba todas y permitía dejar una bodega en negativo).
Preventivo en pantalla: cbStockHint (combustible) y mvChkSaldo (salidas normales) marcan el exceso en vivo y fijan el atributo max.
js/cuaderno.js — cuaderno de campo
Sección	Líneas
Fertirriego base / objetivos UI	3–284
Sync propio (fbApplyRemote 393, fbPush 450, save 537, load 559)	285–628
Util / paño row / wizard / import Excel	629–1000
Compra urgente (renderCompraUrgente 1062, abrirCompraUrgente 1084, descartarCompraUrgente 1138)	1055–1170
Launch / header / tabs	1171–1200
Fertirriego (render, productos, inventario, órdenes, lista, imprimir)	1200–2153
Estimación (renderEstimacion 2154, guardarVersionEstimacion 2477)	2154–2770
Resumen aplicaciones (verResumenAplicaciones 2772, verAplicacionesPano 2834)	2771–2930
Baja de bodega (abrirResumenBajaConfirmaciones 2932, marcarBajaManual 3045, abrirVinculoSCI 3084, desvincularSCI 3160)	2932–3200
Migración productos Cuaderno→SCI (_normNombreProd 3223)	3200–3400
Resumen dashboard (renderResumen 3407)	3407–3540
Catálogo unificado (_getProductosCatalogo 3545)	3541–3600
Registro (chips, guardar, historial)	3600–3800
Equipos / nebulizadoras	3800–3940
Vínculo Cuaderno↔SCI (_getVinculoSCI 3949, _resolverProdSCI 3960, guardarVinculoSCI 3982, _stockProductoOrden 4001)	3941–4015
Órdenes (emitirOrden 4339, saveEditOrden 4776, confirmar cfGuardar 5202)	4016–5540
Reportes de confirmaciones (rp*)	5540–5900
Print / paños app (savePanoEdit 6376) / config estado producto (saveEditProd 6776)	5900–end

Funciones clave: fbPush 450 · save 537 · renderCompraUrgente 1062 · descartarCompraUrgente 1138 · renderEstimacion 2154 · verResumenAplicaciones 2772 · abrirResumenBajaConfirmaciones 2932 · marcarBajaManual 3045 · abrirVinculoSCI 3084 · renderResumen 3407 · _resolverProdSCI 3960 · _stockProductoOrden 4001 · emitirOrden 4339 · cfGuardar 5202.

Vínculo explícito Cuaderno→SCI (v105): S.vinculosSCI mapea nombre normalizado → codigoInterno. Se guarda el código, no la descripción, así el enlace sobrevive si luego se corrige el nombre en el SCI. _resolverProdSCI resuelve en cascada: 1) vínculo manual · 2) descripción exacta · 3) descripción normalizada (acentos, signos, espacios, mayúsculas). NO hay emparejamiento automático por similitud — enlazar "ALZ2" con "ALZ" por parecido podría rebajar el producto equivocado; esa decisión es siempre del usuario vía abrirVinculoSCI. Reemplazó los DOS puntos que antes comparaban por nombre exacto: el modal de baja y _stockProductoOrden (que alimenta la alerta de Compra Urgente).

Silenciar alertas de stock (v104): bajasManual[nombreProd] en la confirmación (fecha + usuario) silencia el ⚠ cuando la salida se registró a mano; descartarCompraUrgente quita el producto de S.comprasUrgentes. Ambas requieren can('config.editar'). Las casillas envían índices numéricos, nunca nombres: escapeHtml convierte ' en &#39; y el parser lo revierte antes del onchange, rompiendo el atributo.

Pestaña Paños (v71): el contador "N aplic." cuenta S.confirmaciones del grupo (principal + polinizantes), no S.registros, y es clicable → verAplicacionesPano.

js/huerto.js — conteo terreno + inventario huerto
Sección	Líneas
Conteo en terreno (cte*): cteRenderSesion 164, cteGuardarArbol 270, cuaja, finalizar, mapa, export	1–687
Inventario de plantas (ip*): ipRender 772, ipRenderInicio 815, ipRenderConteo 930, ipRenderResumenPanos 1206, ipRenderLista 1401	688–1533
Mapa general del cuartel (ipAbrirMapaGeneral 1536, ipMostrarMapaGeneral 1883, SVG ipRenderCuartelSVG 2074)	1536–2400
Mapa 2D de hilera + orientación (ipVerMapa 2409, ipCambiarOrientacion 2442, ipRenderMapa 2497)	2409–2551
Edición de plantas en mapa 2D (ipEditarPlanta 2552, estados, insertar/eliminar)	2552–end

Sistema de orientación (v72–v78):

Marco cardinal fijo: SUR izquierda · NORTE derecha · OESTE arriba · ESTE abajo.
planta1En ('sur' | 'norte'), por hilera — botón 🧭 (ipCambiarOrientacion). Si es 'norte', se ancla al borde derecho y corre de derecha a izquierda.
hilera1En ('oeste' | 'este'), por cuartel — ipCambiarOrientacionHileras, aplica a TODAS las hileras.
desfase (int ≥0), por hilera — ipAjustarDesfase (−/+/−5/+5).
Layout espacial (LAYOUT_HUERTO): grilla [[4,5],[3,2],[1]].
Los tres campos van a nivel de registro de hilera → sobreviven ipCompactarRegistro.
js/helada.js — Control de Heladas (hel*) · NUEVO v108

Registra los eventos de helada de la temporada y el funcionamiento de las torres de control. Estructura: un registro por torre y por noche (plano). Si una noche operaron 3 torres → 3 registros con la misma fecha. Stores: heladas (sincronizado, acumulativo) · catálogo de torres en config / clave helTorres.

Sección	Líneas
Estado del módulo + HEL_TORRES_DEFAULT	11–16
Datos y helpers (_helRegs 18, _helTorres 21, _helGuardarTorres 29, _helTemporada 37)	17–50
Cálculo de horas (_helHorasReloj 52, _helHorasHorom 63, _helUltHorometro 69)	51–85
Render principal + tabs (renderHelada 87, helTab 117, _helRefresh 122)	86–127
TAB REGISTROS (_helRenderLista 128, _helCard 226, helFiltrar 232, helEditar 238, helEliminar 242)	128–258
TAB FORMULARIO (_helRenderForm 259, helHintHorometro 334, helHintHoras 345, helGuardar 372)	259–440
TAB TORRES (_helRenderTorres 441, helAgregarTorre 465, helQuitarTorre 478, helRenombrarTorre 487)	441–510
Exportar CSV (helExportar 511)	511–end

Funciones clave: renderHelada 87 · _helRenderLista 128 · _helRenderForm 259 · helGuardar 372 · _helRenderTorres 441 · helRenombrarTorre 487 · helExportar 511.

Campos del registro: fecha · temporada (derivada, mayo–abril) · torre · responsable · partida ('auto'|'manual') · horaInicio / horaTermino · tempInicio / tempMinima (°C) · horometroInicial / horometroFinal · litrosEstanque · observaciones · usuario · createdAt / updatedAt.

Reglas de negocio:

Cruce de medianoche: el control parte de noche y termina de madrugada. Si horaTermino < horaInicio, _helHorasReloj lo interpreta como día siguiente (suma 24 h) en vez de marcarlo como error.
Horómetro acumulativo: el inicial no puede ser menor al último horometroFinal de esa torre (_helUltHorometro), y el término no puede ser menor al inicial. Mismo criterio que el módulo de combustible.
Duplicado bloqueado: misma torre + misma fecha → obliga a editar el registro existente.
Renombrar torre arrastra el histórico: como el horómetro es por torre, helRenombrarTorre actualiza todos los registros asociados; una torre con registros no se puede eliminar.
Permisos: helada.ver (gerente, consulta, agrónomo, operador, admin) · helada.registrar (agrónomo, operador, admin) · eliminar exige config.editar.
js/presupuesto.js — control de presupuesto
Sección	Líneas
Currency state + título dinámico (pzTemporadaVigente 34, pzActualizarTitulo 41, actualizarSubtituloTemporada 58)	12–90
Detalle gastos modal (openDetalleModal 160)	91–280
Print/PDF · Resumen cosecha banner	281–452
Data (processExcel 453, rebuildFilters, _getTemporada 975, filterData)	453–1071
Render (renderWithData 1072; línea, tipo, subgrupo, desc, desviación, exec summary)	1072–1940
Persistencia Firebase (pz*, pzFbPush 1941)	1941–2130
Tabs del módulo (pzCambiarTab 2133), GTT, Criterios, EER/Ha	2131–end

Funciones clave: pzActualizarTitulo 41 · openDetalleModal 160 · processExcel 453 · _getTemporada 975 · renderWithData 1072 · pzFbPush 1941 · pzCambiarTab 2133.

Título dinámico (v103): pzActualizarTitulo() compone etiqueta de pestaña + huerto + temporada (ej. Control Presupuesto · CZ 2024 · Temporada 2026-2027). Se actualiza en las 5 pestañas y al cambiar el filtro f-temporada. El subtítulo muestra solo el rango de meses. Logo y razón social eliminados del encabezado (redundantes).

js/ordencompra.js — órdenes de compra

Funciones clave: ocNextFolio 26 · renderOrdenesCompra 42 · renderOrdenCompraForm 120 · guardarOrdenCompra 389 · ocImprimir 491.

js/actualizacion.js — actualización inventario huerto (aih*)

Flujo: TERRENO propone cambios de ESTADO → ADMIN aprueba/rechaza → al aprobar se respalda la hilera en una versión recuperable. Solo estado: no agrega, elimina ni cambia tipo de plantas. Stores: aihprop (sincronizado) · aihver (solo local, nunca sube a Firebase).

Funciones clave: renderAIH 30 · _aihRenderTerreno 59 · aihEnviarPropuesta 145 · _aihRenderRevision 171 · aihAprobar 212 · aihRechazar 250 · _aihRenderVersiones 266 · aihRestaurar 285.

index.html — mapa de contenedores
Bloque	Línea aprox.
Firebase SDK	~14
<link> css/styles.css	76
Login	~82
CSS del módulo Presupuesto (.pz-header 793, media queries 1072/1090/1364, paleta clara 1449)	762–1560
CSS: gráficos responsivos (.chart-main-wrap)	1509–1532
CSS: Top Desviaciones table-layout:fixed	1533–1555
CSS: pestañas con fondo al seleccionar	1556–1560
Presupuesto: encabezado (pz-header) 1574 · tabs (pz-tabs-bar) 1612 · canvas gráficos 1851/1857	1574–1900
Cuaderno: wizard / resumen / registro / órdenes / paños / estimación	~143–678
Carga de scripts JS (js/helada.js 2082)	2075–2085
Estado global S del Cuaderno (incluye vinculosSCI)	2834
Normalizador global de mayúsculas (data-nouppercase exime)	~2890
Registro del Service Worker	final
Historial v70 → v108
Ver.	Cambio
v70–v71	Resumen Cuaderno depurado; contador de aplicaciones en Paños corregido
v72–v78	Sistema de orientación de hileras: planta1En, hilera1En, desfase, layout espacial de cuarteles
v79–v99	Módulo actualizacion.js (aih*): flujo terreno→admin con propuestas sincronizadas y respaldo por versión
v100	Presupuesto móvil: fila superior colapsable, maintainAspectRatio:false, altura por contenedor, donut con padding proporcional
v101	Top Desviaciones: table-layout:fixed + elipsis (la tabla desbordaba y el scroll de fila recortaba el inicio del texto)
v102	Combustible validado por bodega (antes getStockTotal global); indicadores de saldo en vivo (cbStockHint, mvChkSaldo)
v103	Presupuesto: logo/razón social fuera; título dinámico con pestaña + huerto + temporada; pestañas con fondo activo
v104	Silenciar alertas: bajasManual en confirmaciones y descartarCompraUrgente, ambas solo admin
v105	Vínculo explícito Cuaderno→SCI (S.vinculosSCI) + _resolverProdSCI en cascada; reemplaza el match por nombre exacto
v106	Título de la barra superior sin año fijo → Control de Presupuesto — Huertos Cerezo
v107	Recálculo de stock automático al recibir movimientos remotos + _refrescarVistaSegura() (antes había que reabrir la app)
v108	Módulo helada.js (Control de Heladas) · store heladas · DB_VERSION 12→13 · service worker con constante VERSION única

Nota crítica de cache: al cambiar cualquier módulo, bump en service-worker.js (const VERSION = NN) y en las refs ?v=NN de index.html (actualmente 10). Desde v108 el SW deriva CACHE y todas las refs de VERSION, así que allí basta un solo número.

Nota crítica de IndexedDB: al agregar un store a STORES hay que subir DB_VERSION en js/core.js. Si no, onupgradeneeded no dispara, el store no se crea y el módulo falla al primer guardado.

Comando de recuperación: mkdir -p /home/claude/work/sci && unzip -qo /mnt/user-data/uploads/Scimodula-main.zip -d /home/claude/work/sci/ Verificación previa a editar: grep -o "VERSION = [0-9]*" service-worker.js · grep -o "?v=[0-9]*" index.html | sort -u · grep -o "DB_VERSION=[0-9]*" js/core.js Chequeo de sintaxis: for f in js/*.js; do node --check "$f" && echo "$(basename $f) OK" || echo "FALLA $f"; done
