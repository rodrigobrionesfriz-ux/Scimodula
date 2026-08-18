SCI — Índice de Módulos (v120)
> Reconstruido desde el código real de v120. Sirve para ubicar la línea exacta de cada función y saltar directo, sin leer archivos completos.
> \*\*Repo:\*\* `rodrigobrionesfriz-ux/Scimodula` (GitHub Pages) · \*\*Rama:\*\* `main` · \*\*Cache:\*\* `sci-v120` (10 refs `?v=120` en index.html) · \*\*DB\_VERSION:\*\* 13.
Estructura de archivos
Archivo	Líneas	Rol
`index.html`	2.927	Login, contenedores HTML de todas las pestañas, CSS del módulo Presupuesto, estado `S` del Cuaderno, normalizador global de mayúsculas, registro del SW
`js/core.js`	1.492	IndexedDB, sync Firebase (SCI), sesión/permisos, navegación, sidebar, sistemas externos, temas
`js/inventario.js`	6.895	Productos, movimientos, stock, tomas, combustible, respaldos, indicadores, config, usuarios, empresa
`js/cuaderno.js`	7.250	Fertirriego, estimación, órdenes/confirmaciones, registro, paños, vínculos Cuaderno↔SCI, sync propio
`js/huerto.js`	2.725	Conteo en terreno (`cte\*`) + Inventario de plantas/huerto (`ip\*`), mapas Leaflet, orientación de hileras
`js/presupuesto.js`	2.659	Dashboard de presupuesto, carga Excel, gráficos, temporadas, GTT, criterios, EER/Ha, sync propio (`pz\*`)
`js/helada.js`	1.093	Control de Heladas (`hel\*`): eventos por torre/noche, torres, diésel (compras y consumos)
`js/ordencompra.js`	590	Órdenes de compra (`oc\*`)
`js/actualizacion.js`	310	Actualización de estado de plantas (`aih\*`): terreno propone → admin aprueba, con respaldo por versión
`data/presupuesto-data.js`	7	Datos semilla de presupuesto
`service-worker.js`	64	Precache versionado (constante `VERSION` única desde v108)
Stores IndexedDB (23): users, products, warehouses, groups, productTypes, providers, customers, costCenters, inventoryCounts, movements, ordenescompra, mantenciones, conteos, estimaciones, invplantas, stock, lots, audit, combustible, config, aihprop, aihver (local), heladas.
---
js/core.js — infraestructura
Sección	Líneas
Constantes DB + lista `STORES`	11–37
IndexedDB (`openDB` 40, `dbPutLocal` 57, `dbPut` 64, `dbDelLocal` 152, `dbDel` 158)	40–192
Sync Firebase SCI (`\_sigMovimientos` 307, `sciFbApplyRemote` 319, `\_refrescarVistaSegura` 395, `sciFbPush` 480)	195–560
Temas / branding	562–632
Seed history, sistemas externos, permisos (`can` 794)	633–845
Config de movimientos (`TIPOS\_MOV\_ENT`, `TIPOS\_MOV\_SAL`, `getMovCfg`)	846–870
initDB, `reloadCache` 875, `audit` 905, validarCampos, `toast` 965	871–973
Login / logout / inactividad (`doLogin` 974)	974–1170
Sidebar / navegación (`renderSidebar` 1185, `navigate` 1407)	1175–end
Funciones clave: `openDB` 40 · `dbPut` 64 · `dbDel` 158 · `\_sigMovimientos` 307 · `sciFbApplyRemote` 319 · `\_refrescarVistaSegura` 395 · `sciFbPush` 480 · `can` 794 · `reloadCache` 875 · `audit` 905 · `doLogin` 974 · `renderSidebar` 1185 · `navigate` 1407.
> \*\*Sync tras cambio remoto (v107):\*\* el stock es DERIVADO y no se sincroniza. `sciFbApplyRemote` compara la firma de movimientos (`\_sigMovimientos`) antes y después de fusionar; si cambiaron, ejecuta `\_ejecutarRecalculoStock()` y luego `\_refrescarVistaSegura()`. Ese helper solo redibuja \*\*vistas de consulta\*\* (`\_SCI\_PAGINAS\_CONSULTA`) y nunca con un modal abierto, para no destruir un formulario en curso.
> \*\*Tipos de movimiento con `oculto:true` (v116):\*\* `CONSUMO COMBUSTIBLE` existe en `TIPOS\_MOV\_SAL` pero no se ofrece al crear una salida manual (tiene su propio formulario, que además captura equipo y horómetro). Sin esta entrada, `getMovCfg` devolvía `null` y \*\*ninguna\*\* salida de combustible se podía editar.
> \*\*Menú (`PAGES`):\*\* PRINCIPAL · INVENTARIO · \*\*OPERACIÓN\*\* (movimientos, entradas, salidas, órdenes de compra, tomas, rendimiento combustible, \*\*Control de Heladas\*\*) · CUADERNO DE CAMPO · MANTENCIONES · TERRENO · CONTROL DE PRESUPUESTO · ADMINISTRACIÓN.
js/inventario.js — bodega
Sección	Líneas
Helpers / modals / user menu (`confirmDialog` 73)	16–116
Respaldo y carpeta personalizada	118–230
Recálculo de stock (`recalcularStock` 237, `\_ejecutarRecalculoStock` 272)	232–429
Detección de inconsistencias (`detectarInconsistenciaStock` 430)	430–474
Respaldo consolidado (SCI + Cuaderno + Presupuesto)	475–747
PAGE: Dashboard (`renderDashboard` 828)	748–983
PAGE: Productos (`saveProduct` 1231, duplicados, import masivo)	984–1920
PAGE: Bodegas / Proveedores / Clientes / Centros de Costo	1921–2582
PAGE: Tomas de inventario (`renderTomas` 2618)	2583–3394
Informe de ajustes post-toma	3395–3600
PAGE: Stock (`renderStock` 3601, `renderStockTable` 3659)	3601–4109
PAGE: Movimientos lista (`renderMovimientos` 4110)	4110–4300
Combustible: catálogo, reconciliación e informe (`CB\_EQUIPOS` 4307, `getCombustibleReal` 4315, `renderReporteCombustible` 4335, `exportarReporteCombustible` 4395)	4306–4470
Carga masiva de consumos (Excel)	4470–4770
Formulario de combustible (`renderCombustibleForm` 4774, `cbStockHint` 4845)	4771–4960
Movimiento form (`\_captureMovHeader` 5345, `mvChkSaldo` 5497)	4960–5623
Costing engine (`saveMovimiento` 5624, `applyMovementToStock` 5955)	5624–6153
PAGE: Usuarios (`renderUsuarios` 6154)	6154–6350
Empresa / indicadores / temporadas (`temporadaDeMesAnio` 6467, `temporadaActual` 6476, `getIndicadores` 6517)	6350–6615
PAGE: Config (`renderConfig` 6616)	6616–end
Funciones clave: `recalcularStock` 237 · `\_ejecutarRecalculoStock` 272 · `detectarInconsistenciaStock` 430 · `renderDashboard` 828 · `saveProduct` 1231 · `getCombustibleReal` 4315 · `renderReporteCombustible` 4335 · `renderCombustibleForm` 4774 · `cbStockHint` 4845 · `\_captureMovHeader` 5345 · `mvChkSaldo` 5497 · `saveMovimiento` 5624 · `applyMovementToStock` 5955 · `getIndicadores` 6517.
> \*\*Validación de stock en salidas (v102):\*\*
> - Normales: `saveMovimiento` valida por lote (si el producto maneja atributos) o por producto+bodega; al editar suma la cantidad original para no dar falso positivo.
> - Combustible: valida contra `getStock(codigo, bodegaId)` — \*\*por bodega\*\*, no con `getStockTotal` (que sumaba todas y permitía dejar una bodega en negativo).
> - Preventivo en pantalla: `cbStockHint` (combustible) y `mvChkSaldo` (salidas normales) marcan el exceso en vivo y fijan el atributo `max`.
> \*\*`getCombustibleReal()` (v118) — punto único de verdad:\*\* el store `combustible` guarda una COPIA de cantidad y fecha; el \*\*movimiento\*\* es la fuente de verdad. Esta función reconcilia ambos y descarta los movimientos anulados. La usan el informe de rendimiento (pantalla y Excel), la validación de horómetro y la tarjeta de consumos de Heladas. Antes, editar una salida dejaba los informes con los litros originales, y los movimientos anulados seguían sumando.
> \*\*`\_captureMovHeader` (v116):\*\* no sobrescribe `tipoMovimiento` cuando hay `editId`. El tipo es inmutable (el correlativo depende de él) y su selector está deshabilitado; leerlo del DOM lo dejaba vacío y bloqueaba el guardado.
js/cuaderno.js — cuaderno de campo
Sección	Líneas
Fertirriego base / objetivos UI	3–284
Sync propio (`fbApplyRemote` 393, `fbPush` 450, `save` 537, `load` 559)	285–628
Util / paño row / wizard / import Excel (`savePanosFromTable` 691)	629–1050
Header (`renderHeader` 1052) y Compra urgente (`renderCompraUrgente` 1065, `abrirCompraUrgente` 1087, `descartarCompraUrgente` 1141)	1052–1175
Fertirriego (render, productos, inventario, órdenes, lista, imprimir)	1176–2156
Estimación (`renderEstimacion` 2157, `guardarVersionEstimacion` 2480)	2157–2774
Resumen aplicaciones (`verResumenAplicaciones` 2775)	2775–2934
Baja de bodega (`abrirResumenBajaConfirmaciones` 2935, `marcarBajaManual` 3048, `abrirVinculoSCI` 3087, `desvincularSCI` 3163)	2935–3200
Migración productos Cuaderno→SCI (`\_normNombreProd` 3226)	3200–3405
Resumen dashboard (`renderResumen` 3410)	3410–3545
Catálogo unificado (`\_getProductosCatalogo` 3548)	3546–3610
Registro / equipos / nebulizadoras	3610–3945
Vínculo Cuaderno↔SCI (`\_getVinculoSCI` 3952, `\_resolverProdSCI` 3963, `guardarVinculoSCI` 3985, `\_stockProductoOrden` 4004)	3946–4020
Órdenes (`emitirOrden` 4342, `saveEditOrden` 4779, confirmar `cfGuardar` 5205)	4020–5560
Reportes de confirmaciones (`rp\*`; Hoja 3 «Consumo por producto» por cuartel)	5560–5950
Print / paños app (`savePanoEdit` 6463) / config estado producto (`saveEditProd` 6863)	5950–end
Funciones clave: `fbPush` 450 · `save` 537 · `renderHeader` 1052 · `renderCompraUrgente` 1065 · `descartarCompraUrgente` 1141 · `renderEstimacion` 2157 · `abrirResumenBajaConfirmaciones` 2935 · `marcarBajaManual` 3048 · `abrirVinculoSCI` 3087 · `renderResumen` 3410 · `\_resolverProdSCI` 3963 · `\_stockProductoOrden` 4004 · `emitirOrden` 4342 · `cfGuardar` 5205.
> \*\*Vínculo explícito Cuaderno→SCI (v105):\*\* `S.vinculosSCI` mapea \*nombre normalizado → codigoInterno\*. Se guarda el \*\*código, no la descripción\*\*, así el enlace sobrevive si luego se corrige el nombre en el SCI. `\_resolverProdSCI` resuelve en cascada: \*\*1)\*\* vínculo manual · \*\*2)\*\* descripción exacta · \*\*3)\*\* descripción normalizada (acentos, signos, espacios, mayúsculas). NO hay emparejamiento automático por similitud — enlazar "ALZ2" con "ALZ" por parecido podría rebajar el producto equivocado. Reemplazó los DOS puntos que antes comparaban por nombre exacto: el modal de baja y `\_stockProductoOrden` (que alimenta la alerta de Compra Urgente).
> \*\*Silenciar alertas de stock (v104):\*\* `bajasManual\[nombreProd]` en la confirmación (fecha + usuario) silencia el ⚠ cuando la salida se registró a mano; `descartarCompraUrgente` quita el producto de `S.comprasUrgentes`. Ambas requieren `can('config.editar')`. Las casillas envían \*\*índices numéricos\*\*, nunca nombres: `escapeHtml` convierte `'` en `\&#39;` y el parser lo revierte antes del `onchange`, rompiendo el atributo.
> \*\*Contador del header (v111):\*\* `renderHeader` cuenta `S.confirmaciones`, no `S.registros` (registro manual antiguo, hoy vacío). `cfGuardar` llama a `renderHeader` para que suba en el acto. Mismo criterio que ya se corrigió en la pestaña Paños en v71.
> \*\*Hoja «Consumo por producto» del reporte (v110):\*\* una línea por \*\*producto × cuartel\*\*. La cantidad de cada confirmación se reparte entre sus paños \*\*proporcional a las hectáreas\*\* (igual que la hoja "Consumo por paño"), nunca en partes iguales. Incluye dosis por hectárea y la columna `Cantidad total del producto` para cuadrar contra bodega. Las confirmaciones sin paño generan una línea `(sin cuartel asignado)` con la cantidad íntegra, para que la hoja siga cuadrando.
js/huerto.js — conteo terreno + inventario huerto
Sección	Líneas
Conteo en terreno (`cte\*`): `cteRenderSesion` 164, `cteGuardarArbol` 270, cuaja, finalizar, mapa, export	1–687
Inventario de plantas (`ip\*`): `ipRender` 772, `ipRenderInicio` 815, `ipRenderConteo` 930, `ipRenderResumenPanos` 1206, `ipRenderLista` 1401	688–1533
Mapa general del cuartel (`ipAbrirMapaGeneral` 1536, `ipMostrarMapaGeneral` 1883, SVG `ipRenderCuartelSVG` 2074)	1536–2400
Mapa 2D de hilera + orientación (`ipVerMapa` 2409, `ipCambiarOrientacion` 2442, `ipRenderMapa` 2497)	2409–2551
Edición de plantas en mapa 2D (`ipEditarPlanta` 2552, estados, insertar/eliminar)	2552–end
> \*\*Sistema de orientación (v72–v78):\*\*
> - \*\*Marco cardinal fijo:\*\* SUR izquierda · NORTE derecha · OESTE arriba · ESTE abajo.
> - \*\*`planta1En`\*\* ('sur' | 'norte'), por hilera — botón 🧭 (`ipCambiarOrientacion`). Si es 'norte', se ancla al borde derecho y corre de derecha a izquierda.
> - \*\*`hilera1En`\*\* ('oeste' | 'este'), por cuartel — `ipCambiarOrientacionHileras`, aplica a TODAS las hileras.
> - \*\*`desfase`\*\* (int ≥0), por hilera — `ipAjustarDesfase` (−/+/−5/+5).
> - \*\*Layout espacial\*\* (`LAYOUT\_HUERTO`): grilla `\[\[4,5],\[3,2],\[1]]`.
> - Los tres campos van a nivel de registro de hilera → sobreviven `ipCompactarRegistro`.
js/helada.js — Control de Heladas (hel*)
> Registra los \*\*eventos de helada de la temporada\*\*, el \*\*funcionamiento de las torres\*\* y el \*\*diésel\*\* asociado.
> Estructura: \*\*un registro por torre y por noche\*\* (plano). Si una noche operaron 3 torres → 3 registros con la misma fecha.
> Stores: `heladas` (sincronizado, acumulativo) · torres en `config`/`helTorres` · productos diésel en `config`/`helDiesel`.
Sección	Líneas
Estado del módulo, torres (`\_helTorres` 21), temporada (`\_helTemporada` 37)	11–50
Cálculo de horas (`\_helHorasReloj` 52, `\_helHorasHorom` 63, `\_helHoromVecinos` 74)	51–101
Render principal + tabs (`renderHelada` 103, `helTab` 135, `\_helRefresh` 140)	102–145
TAB REGISTROS (`\_helRenderLista` 146, `\_helSaldoEstanques` 251, `\_helEsPosterior` 267, `\_helCardEstanque` 277, `\_helCard` 301)	146–333
TAB FORMULARIO (`\_helRenderForm` 334, `helHintHorometro` 413, `helHintHoras` 428, `helGuardar` 455)	334–530
TAB TORRES (`\_helRenderTorres` 531, `helRenombrarTorre` 577)	531–605
TAB DIÉSEL (`\_helPctNoRecup` 610, `\_helCodigosDiesel` 626, `\_helComprasDiesel` 659, `\_helConsumosDiesel` 696, `\_helCardConsumoHora` 735, `\_helCuadratura` 789, `\_helRenderDiesel` 803)	606–977
Configuración de productos diésel (`helConfigDiesel` 978) y exportaciones (`helExportarDiesel` 1007, `helExportar` 1044)	978–end
Funciones clave: `renderHelada` 103 · `\_helRenderLista` 146 · `\_helSaldoEstanques` 251 · `\_helRenderForm` 334 · `helGuardar` 455 · `\_helComprasDiesel` 659 · `\_helConsumosDiesel` 696 · `\_helCardConsumoHora` 735 · `\_helRenderDiesel` 803.
Campos del registro: `fecha` · `temporada` (derivada, mayo–abril) · `torre` · `responsable` · `partida` ('auto'|'manual') · `horaInicio` / `horaTermino` · `tempInicio` / `tempApagado` / `tempMinima` (°C) · `horometroInicial` / `horometroFinal` · `litrosEstanque` (saldo AL TERMINAR el evento) · `observaciones` · `usuario` · `createdAt` / `updatedAt`.
> \*\*Reglas de negocio:\*\*
> - \*\*Cruce de medianoche:\*\* si `horaTermino < horaInicio`, `\_helHorasReloj` lo interpreta como día siguiente (suma 24 h) en vez de marcarlo como error.
> - \*\*Horómetro cronológico (v114):\*\* `\_helHoromVecinos` compara contra el registro \*\*anterior\*\* y el \*\*siguiente\*\* de esa torre por fecha, no contra el máximo global. Comparar con el máximo solo funcionaba al agregar al final: al editar un registro antiguo o cargar uno retroactivo, el máximo pertenecía a una noche posterior y bloqueaba el guardado.
> - \*\*Duplicado bloqueado:\*\* misma torre + misma fecha → obliga a editar el registro existente.
> - \*\*Renombrar torre arrastra el histórico:\*\* el horómetro es por torre, así que `helRenombrarTorre` actualiza todos los registros asociados; una torre con registros no se puede eliminar.
> - \*\*Permisos:\*\* `helada.ver` · `helada.registrar` · eliminar exige `config.editar`.
> \*\*Pestaña Diésel:\*\* los datos NO se duplican, se derivan del SCI. \*\*Compras\*\* = entradas del producto `P000161` "DIESEL CONTROL HELADAS" (`HEL\_DIESEL\_DEFAULT`, configurable); el precio por litro es \*neto + la parte NO recuperable del impuesto específico\*, usando `config.empresa.recupIEC`. \*\*Consumos\*\* = `getCombustibleReal()` filtrado por equipo = torre; marca en ámbar las salidas cargadas con otro código de producto. \*\*Consumo = compras − saldo en estanques\*\* (suma de la última lectura de cada torre), y `\_helCuadratura` contrasta ese cálculo con lo registrado en SCI, alertando sobre 5% de diferencia. `\_helCardConsumoHora` cruza litros con horas de horómetro para dar \*\*L/h y $/h por torre\*\*.
js/presupuesto.js — control de presupuesto
Sección	Líneas
Currency state + título dinámico (`pzTemporadaVigente` 34, `pzActualizarTitulo` 41, `actualizarSubtituloTemporada` 58)	12–90
Detalle gastos modal (`openDetalleModal` 160)	91–290
Banner de cosecha (`updateBanner` 300)	291–460
Data (`processExcel` 461, rebuildFilters, `\_getTemporada` 983, `filterData` 1010)	461–1079
Render (`renderWithData` 1080; línea, tipo, subgrupo, desc, desviación, exec summary)	1080–1948
Persistencia Firebase (`pz\*`, `pzFbPush` 1949)	1949–2140
Tabs del módulo (`pzCambiarTab` 2141), GTT, Criterios, EER/Ha	2141–end
Funciones clave: `pzActualizarTitulo` 41 · `openDetalleModal` 160 · `updateBanner` 300 · `processExcel` 461 · `\_getTemporada` 983 · `filterData` 1010 · `renderWithData` 1080 · `pzFbPush` 1949 · `pzCambiarTab` 2141.
> \*\*Título dinámico (v103):\*\* `pzActualizarTitulo()` compone \*etiqueta de pestaña + huerto + temporada\* (ej. `Control Presupuesto · CZ 2024 · Temporada 2026-2027`). Se actualiza en las 5 pestañas y al cambiar el filtro `f-temporada`. El subtítulo muestra solo el rango de meses.
> \*\*Tarjetas duplicadas eliminadas (v120):\*\* el banner mostraba \*Costo Huerto Real / Ppto Ajustado / Saldo Ppto\*, repitiendo \*Real Acumulado / Presupuesto Total / Desviación\* de la fila KPI. Se quitaron \*\*del banner\*\*: `updateBanner` filtra solo por temporada y mes, mientras `filterData` (fila KPI) respeta los cinco filtros, así que el banner se habría contradicho al filtrar por tipo o sub-grupo. Los cálculos siguen en `updateBanner` porque alimentan costo/Kg y $/Ha, con guardas de existencia. El banner queda con: Kilos Estimados, Kilos Cosechados, Costo por Kg, Tipo de Cambio, $/Ha y Superficie.
js/ordencompra.js — órdenes de compra
Funciones clave: `ocNextFolio` 26 · `renderOrdenesCompra` 42 · `renderOrdenCompraForm` 120 · `guardarOrdenCompra` 389 · `ocImprimir` 491.
js/actualizacion.js — actualización inventario huerto (aih*)
> Flujo: TERRENO propone cambios de ESTADO → ADMIN aprueba/rechaza → al aprobar se respalda la hilera en una \*\*versión\*\* recuperable. Solo estado: no agrega, elimina ni cambia tipo de plantas.
> Stores: `aihprop` (sincronizado) · `aihver` (solo local, nunca sube a Firebase).
Funciones clave: `renderAIH` 30 · `\_aihRenderTerreno` 59 · `aihEnviarPropuesta` 145 · `\_aihRenderRevision` 171 · `aihAprobar` 212 · `aihRechazar` 250 · `aihRestaurar` 285.
---
index.html — mapa de contenedores
Bloque	Línea aprox.
Firebase SDK · `<link>` css/styles.css	~14 · 76
Login	~82
Cuaderno: wizard / resumen / registro / órdenes / paños / estimación	~143–700
CSS del módulo Presupuesto (`.kpi-row` 901, `.resumen-banner` 1280, media queries 1080/1129/1159/1330)	762–1560
CSS: gráficos responsivos (`.chart-main-wrap`), Top Desviaciones `table-layout:fixed`, pestañas activas	1509–1560
Presupuesto: encabezado `pz-header` 1574 · tabs `pz-tabs-bar` 1612 · banner cosecha 1713 · fila KPI 1794 · gráficos `top-row` 1828	1574–1900
Carga de scripts JS (`js/helada.js` 2064)	2055–2070
Estado global `S` del Cuaderno (incluye `vinculosSCI`)	2816
Normalizador global de mayúsculas (`data-nouppercase` exime)	~2870
Registro del Service Worker	final
---
Historial v70 → v120
Ver.	Cambio
v70–v71	Resumen Cuaderno depurado; contador de aplicaciones en Paños corregido
v72–v78	Sistema de orientación de hileras: `planta1En`, `hilera1En`, `desfase`, layout espacial
v79–v99	Módulo `actualizacion.js` (`aih\*`): flujo terreno→admin con respaldo por versión
v100	Presupuesto móvil: fila superior colapsable, altura por contenedor, donut con padding proporcional
v101	Top Desviaciones: `table-layout:fixed` + elipsis (la tabla desbordaba y recortaba el inicio del texto)
v102	Combustible validado por bodega; indicadores de saldo en vivo (`cbStockHint`, `mvChkSaldo`)
v103	Presupuesto: logo fuera; título dinámico; pestañas con fondo activo
v104	Silenciar alertas: `bajasManual` y `descartarCompraUrgente`, solo admin
v105	Vínculo explícito Cuaderno→SCI (`S.vinculosSCI`) + `\_resolverProdSCI` en cascada
v106	Título de la barra superior → `Control de Presupuesto — Huertos Cerezo`
v107	Recálculo de stock al recibir movimientos remotos + `\_refrescarVistaSegura()`
v108	Módulo `helada.js` · store `heladas` · DB_VERSION 12→13 · SW con constante `VERSION` única
v109	KPI de estanque: última lectura por torre (tomaba la más antigua y mezclaba torres)
v110	Reporte de aplicaciones: hoja «Consumo por producto» con una línea por cuartel, prorrateada por hectáreas
v111	Contador «Aplicaciones» del header del Cuaderno: cuenta confirmaciones, no `S.registros`
v112	Pestaña Diésel en Heladas: compras y consumos derivados del SCI · `combustible` cargado en `reloadCache`
v113	`P000161` como código de diésel por defecto; marca de consumos con otro código
v114	Campo temperatura al apagar; horómetro validado contra vecinos cronológicos
v115	Consumo = compras − saldo en estanques; el campo de litros es el saldo al terminar
v116	`CONSUMO COMBUSTIBLE` registrado como tipo (`oculto:true`); `\_captureMovHeader` no pisa el tipo al editar
v117	Editar un movimiento sincroniza su registro de `combustible` (cantidad, fecha, bodega, CC)
v118	`getCombustibleReal()`: punto único de verdad; descarta movimientos anulados
v119	Tarjeta consumo por hora por torre (L/h y $/h); eliminada una duplicación de la función
v120	Eliminadas del banner las 3 tarjetas duplicadas con la fila KPI; corregido id duplicado `kpi-sub-ppto`
> \*\*Nota crítica de cache:\*\* al cambiar cualquier módulo, bump en `service-worker.js` (`const VERSION = NN`) \*\*y\*\* en las refs `?v=NN` de `index.html` (actualmente \*\*10\*\*). Desde v108 el SW deriva `CACHE` y todas las refs de `VERSION`, así que allí basta un solo número.
> \*\*Nota crítica de IndexedDB:\*\* al agregar un store a `STORES` hay que subir `DB\_VERSION` en `js/core.js`. Si no, `onupgradeneeded` no dispara, el store no se crea y el módulo falla al primer guardado.
> \*\*Antes de escribir una función nueva, verificar que no exista ya\*\* (`grep -n "function nombre" js/\*.js`). En v119 se duplicó `\_helCardConsumoHora` con otra firma: la segunda definición tapaba a la primera y recibía argumentos que no correspondían.
> \*\*Comando de recuperación:\*\* `mkdir -p /home/claude/work/sci \&\& unzip -qo /mnt/user-data/uploads/Scimodula-main.zip -d /home/claude/work/sci/`
> \*\*Verificación previa a editar:\*\* `grep -o "VERSION = \[0-9]\*" service-worker.js` · `grep -o "?v=\[0-9]\*" index.html | sort -u` · `grep -o "DB\_VERSION=\[0-9]\*" js/core.js`
> \*\*Chequeo de sintaxis:\*\* `for f in js/\*.js; do node --check "$f" \&\& echo "$(basename $f) OK" || echo "FALLA $f"; done`
