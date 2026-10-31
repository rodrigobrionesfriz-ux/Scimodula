# Scimodular
Scimodular
# SCI · Sistema de Control de Inventario y Cuaderno de Campo

Aplicación web (PWA) para la gestión integral de **Sociedad Agrícola y Forestal La Cabaña Ltda.** — huerto de cerezos en Angol, Chile.

Funciona **offline** en terreno y sincroniza automáticamente con la nube (Firebase) cuando hay conexión. Se puede instalar en el teléfono como aplicación.

---

## Módulos

- **Inventario** — Productos, bodegas, proveedores, clientes, centros de costo, movimientos (entradas/salidas), stock por bodega con costeo PPP y trazabilidad por lote y vencimiento, tomas de inventario, e informes en Excel.
- **Salida de combustible** — Registro de consumo de petróleo/gasolina por equipo, con horómetro/kilometraje validado, historial por equipo y reporte de rendimiento entre cargas (solo administrador).
- **Cuaderno de Campo** — Registro fitosanitario y de fertirriego: paños, órdenes de aplicación, confirmaciones con folio único, productos y estimación de cosecha.
- **Control de Presupuesto** — Dashboard gerencial: presupuesto vs real por temporada, con desglose por tipo de costo, sub-grupo, evolución mensual y detalle de gastos.
- **Inventario de Huerto** — Conteo de plantas por hilera, estado sanitario, polinizantes, mapa general del cuartel con filtros, y georreferenciación de hileras.

---

## Tecnología

- HTML, CSS y JavaScript (sin framework).
- **Firebase Firestore** para sincronización en la nube.
- **IndexedDB** para almacenamiento local (offline-first).
- **PWA** con Service Worker para uso sin conexión e instalación en el dispositivo.
- Hospedado en **GitHub Pages**.

---

## Estructura de archivos

```
index.html               Estructura de la aplicación
manifest.json            Configuración de la PWA (instalable)
service-worker.js        Caché offline y versionado
css/
  styles.css             Estilos de todo el sistema
data/
  presupuesto-data.js    Datos base del módulo de presupuesto
js/
  core.js                Núcleo: base de datos local, sincronización, sesión, navegación
  inventario.js          Inventario, movimientos, stock, combustible, informes, respaldo
  huerto.js              Conteo e inventario de plantas del huerto
  cuaderno.js            Cuaderno de campo, fertirriego, presupuesto (apoyo)
  presupuesto.js         Dashboard de control de presupuesto
icons/                   Íconos de la aplicación
```

---

## Roles de usuario

- **Administrador** — Acceso completo, incluidas configuraciones, respaldos y reportes sensibles.
- **Operador** — Gestión de inventario y movimientos.
- **Consulta** — Solo lectura.
- **OP. Conteos** — Acceso restringido al inventario de huerto (uso en terreno).
- **OP. Combustible** — Acceso exclusivo al formulario de salida de combustible.

---

## Respaldo

El sistema genera un **respaldo consolidado único** (Inventario + Cuaderno + Presupuesto + Huerto) en un solo archivo. Recuerda al administrador realizar un respaldo cada 10 días.

---

## Desarrollo

Desarrollado por **Rodrigo Briones Friz** con apoyo de **Claude AI**.
