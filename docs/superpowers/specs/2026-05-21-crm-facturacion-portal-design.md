# CRM + Facturación + Portal del Cliente — Diseño

## Goal
Convertir el CMS en un sistema CRM+facturación: gestión financiera por proyecto, facturación con requisitos SAR Honduras, portal del cliente para ver facturas y proyectos, y solicitudes de proyectos/tareas desde el cliente con flujo de aprobación.

## Architecture
Misma base: Express + better-sqlite3 + Vanilla JS SPA. Se agrega una segunda página (`/portal`) servida por el mismo servidor. Nuevo rol `cliente` en `company_users`. Las facturas viven en el servidor junto al sistema de archivos existente (`data/uploads/`). El dashboard financiero usa Chart.js ya instalado.

## Tech Stack
Express, better-sqlite3, multer (ya instalado), Chart.js (ya instalado), Vanilla JS, CSS custom properties existentes.

---

## 1. Modelo de Datos

### Modificaciones a tablas existentes

**`projects`** — agregar columnas:
- `contract_value REAL` — valor total del contrato
- `billing_frequency TEXT DEFAULT 'proyecto'` — valores: `proyecto | mensual | trimestral | anual`

**`companies`** — agregar columnas:
- `rtn TEXT` — Registro Tributario Nacional del cliente
- `fiscal_name TEXT` — razón social fiscal
- `fiscal_address TEXT` — dirección fiscal

**`users`** — agregar columna:
- `rtn TEXT` — RTN del administrador (emisor en facturas)

### Nuevas tablas

```sql
CREATE TABLE IF NOT EXISTS fiscal_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  rtn_emisor TEXT,
  nombre_emisor TEXT,
  direccion_emisor TEXT,
  telefono_emisor TEXT,
  cai TEXT,
  rango_inicio TEXT,
  rango_fin TEXT,
  fecha_limite_emision DATE,
  tipo_documento TEXT DEFAULT 'factura_venta',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  numero_factura TEXT NOT NULL,
  fecha_emision DATE NOT NULL,
  fecha_vencimiento DATE,
  descripcion TEXT NOT NULL,
  monto_gravado REAL DEFAULT 0,
  monto_exento REAL DEFAULT 0,
  monto_exonerado REAL DEFAULT 0,
  isv_porcentaje REAL DEFAULT 15,
  isv_monto REAL DEFAULT 0,
  total REAL NOT NULL,
  estado TEXT DEFAULT 'borrador',
  pdf_filename TEXT,
  notas TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  monto REAL NOT NULL,
  fecha_pago DATE NOT NULL,
  metodo_pago TEXT,
  notas TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_estado ON invoices(estado);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id);
```

### Rol de cliente
- El rol `cliente` se agrega como valor válido en `company_users.role` (ya es TEXT, no necesita migración)
- El sistema de invitaciones existente lo soporta sin cambios
- La invitación con rol `cliente` redirige al portal (`/portal`) al aceptar

---

## 2. Gestión de Facturas (Admin)

### Configuración fiscal (`/configuracion-fiscal`)
Nueva sección en sidebar (solo admin). Formulario con:
- RTN emisor, nombre fiscal, dirección, teléfono
- CAI (16 dígitos con formato XXXXXX-XXXXXX-XXXX-XXXXXXXXXXXXXXXX)
- Rango inicio / Rango fin (números de factura autorizados)
- Fecha límite de emisión
- Tipo de documento: `Factura de Venta` | `Recibo por Honorarios`

Una sola fila en `fiscal_config`. Sin configuración fiscal, el botón "Nueva Factura" muestra aviso.

### Sección "💰 Facturación" en sidebar
Lista de facturas con:
- Filtros: empresa, estado (borrador/enviada/pagada/vencida/anulada), período
- Columnas: número, empresa, proyecto, fecha, total, estado, acciones
- Paginación (usa `paginate()` existente)
- Botón "Nueva Factura"

### Modal "Nueva Factura"
Campos:
- Empresa (select), Proyecto (select opcional, filtrado por empresa)
- Número de factura (autoincrementa dentro del rango CAI, editable)
- Fecha de emisión, Fecha de vencimiento
- Descripción del servicio (textarea)
- Monto gravado, Monto exento, Monto exonerado
- ISV % (select: 0 / 12.5 / 15 / 18) — ISV monto y Total se calculan en tiempo real
- Adjuntar PDF (opcional, multer)
- Estado: borrador | enviada

### Vista de detalle de factura
- Datos completos en formato SAR (como aparecería en papel): emisor, cliente, CAI, rango, fecha límite, número, fechas, descripción, desglose de montos, ISV, total
- Historial de pagos parciales con total cobrado y saldo pendiente
- Botón "Registrar Pago" (modal: monto, fecha, método, notas)
- Botón descargar PDF (si tiene adjunto)
- Cambiar estado (dropdown)
- Botón eliminar (solo borradores)

### Datos fiscales por empresa
En la vista de empresa (company.js), nuevo tab "🏛️ Datos Fiscales":
- RTN, Nombre fiscal, Dirección fiscal del cliente
- Se guarda en `companies` table

### Valor del contrato en proyectos
Al crear/editar proyecto: campos adicionales:
- Valor del contrato (número)
- Frecuencia de facturación (proyecto / mensual / trimestral / anual)

---

## 3. Dashboard Financiero (Admin)

Nueva vista en `#/finanzas` — solo admin. Sidebar item "💰 Finanzas".

### Bloque superior: resumen del período
- Selector de período: Este mes / Este trimestre / Este año / Rango personalizado
- 4 stat-cards: Total facturado | Total cobrado | Pendiente | Vencido

### Gráfica mensual
- Barras: Facturado vs Cobrado (últimos 12 meses)
- Chart.js bar chart

### Tabla por empresa
Columnas: Empresa | Contratos activos (sum) | Facturado período | Cobrado | Pendiente | Estado
Expandible por empresa → proyectos con:
- Nombre | Frecuencia | Valor contrato | Facturado | % cobrado

### Facturas por vencer / vencidas
- Lista de facturas con `estado = 'enviada'` y `fecha_vencimiento <= NOW() + 7 días`
- Ordenadas por urgencia

---

## 4. Portal del Cliente (`/portal`)

### Acceso
- URL: `tudominio.com/portal`
- Archivo: `public/portal.html` + `public/js/portal-app.js` + `public/css/portal.css`
- Misma API JWT del sistema principal
- Al login: detecta rol `cliente` → redirige a `/portal`
- Admin/user intentando acceder a `/portal` → redirige al CMS

### Sidebar del portal
Limpio, profesional. Items:
- 🏠 Inicio (dashboard)
- 📁 Mis Proyectos
- 📄 Mis Facturas
- 📋 Solicitar Proyecto
- 👤 Mi Perfil

### Dashboard del portal
- Stat cards: Proyectos activos | Facturas pendientes de pago | Total adeudado | Próximo vencimiento
- Lista rápida: últimas 3 facturas + proyectos activos

### Mis Proyectos
Lista de proyectos de su empresa (aprobados + pendientes de aprobación propios). Para cada proyecto:
- Nombre, estado, progreso (barra), fechas
- Badge "Pendiente aprobación" si `status = 'pendiente_aprobacion'`
- Click → detalle

**Detalle de proyecto (portal):**
- Descripción, progreso, fechas
- Tareas: conteo completadas/total, lista de títulos (sin detalles internos)
- Comentarios del proyecto (lee/escribe usando el sistema de comentarios existente)
- Aprobaciones: observaciones tipo `decision` → puede aprobar/rechazar con comentario
- Botón "+ Solicitar tarea" → modal: título + descripción → crea tarea en `pendiente`

### Solicitar Proyecto
Formulario:
- Nombre del proyecto *
- Descripción *
- Fecha deseada de entrega
- Enviar → crea proyecto con `status = 'pendiente_aprobacion'`, `created_by = cliente`
- Admin recibe notificación SSE + aparece en su dashboard

### Flujo de aprobación (admin)
- En el CMS, nuevo tab en empresa: "📋 Solicitudes" — lista proyectos `pendiente_aprobacion`
- Botón Aprobar (cambia a `activo`, notifica cliente) | Rechazar (modal con nota, notifica cliente)

### Mis Facturas
- Tabla: número | fecha | descripción | monto gravado | ISV | total | estado
- Filtros: estado, período
- Click → detalle con vista SAR completa
- Botón descargar PDF (si disponible)
- Historial de pagos visibles (sin poder editar)

### Diseño del portal
- Fondo blanco/gris claro — diferente al sidebar oscuro del CMS
- Header con logo (tomado de la configuración fiscal: nombre_emisor)
- Sin acceso a tareas internas, tiempos, automatizaciones, usuarios, métricas
- Responsive

---

## 5. Nuevas rutas backend

```
GET/PUT  /api/fiscal-config              — configuración SAR
GET      /api/invoices                   — lista con filtros
POST     /api/invoices                   — crear factura
GET      /api/invoices/:id               — detalle
PUT      /api/invoices/:id               — actualizar
DELETE   /api/invoices/:id               — solo borradores
POST     /api/invoices/:id/payments      — registrar pago
DELETE   /api/invoices/:id/payments/:pid — eliminar pago
GET      /api/invoices/:id/download      — descarga PDF

GET      /api/finance/summary            — resumen por período
GET      /api/finance/by-company         — desglose por empresa/proyecto
GET      /api/finance/chart              — datos para gráfica mensual

GET      /api/portal/me                  — datos del cliente logueado
GET      /api/portal/projects            — proyectos del cliente
POST     /api/portal/projects            — solicitar proyecto
GET      /api/portal/projects/:id        — detalle
POST     /api/portal/projects/:id/tasks  — solicitar tarea
GET      /api/portal/invoices            — facturas del cliente
GET      /api/portal/invoices/:id        — detalle factura
```

---

## 6. Planes de implementación

Por su tamaño e independencia, se divide en 3 planes:

**Plan E — Backend financiero + Facturación admin**
- DB schema (nuevas tablas + ALTER TABLE)
- Rutas: fiscal-config, invoices, payments
- UI admin: configuración fiscal, sección Facturación, detalle factura, datos fiscales en empresa, valor contrato en proyecto

**Plan F — Dashboard financiero + Flujo de aprobación**
- Rutas: finance/summary, finance/by-company, finance/chart
- UI: vista #/finanzas con métricas, gráfica, tablas
- Tab "Solicitudes" en empresa para aprobar/rechazar proyectos de clientes

**Plan G — Portal del cliente**
- portal.html + portal-app.js + portal.css
- Rutas: /api/portal/*
- Detección de rol cliente → redirect
- Dashboard, proyectos, facturas, solicitud de proyecto, solicitud de tareas

---

## Restricciones y reglas de negocio

- Solo admin puede crear/editar/eliminar facturas
- Solo admin puede ver #/finanzas
- Cliente solo ve su propia empresa (company_id de su company_user record)
- Proyectos `pendiente_aprobacion` solo visibles al cliente que los creó y al admin
- No se puede eliminar una factura en estado pagada o enviada — solo anular
- El número de factura debe estar dentro del rango CAI activo — validación en frontend y backend
- ISV se calcula solo sobre `monto_gravado`; `monto_exento` y `monto_exonerado` no pagan ISV
- Total = monto_gravado + monto_exento + monto_exonerado + isv_monto
