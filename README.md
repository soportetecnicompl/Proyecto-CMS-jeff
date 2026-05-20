# ProyectoCMS — Sistema de Gestión de Proyectos

Sistema de gestión de proyectos para soporte técnico multi-empresa. Autoalojable en cualquier VPS con Node.js.

## Características

- **Gestión de empresas**: Crea y administra múltiples empresas clientes
- **Proyectos por empresa**: Cada empresa tiene sus proyectos con estado, prioridad y fechas
- **Tareas**: Crea, asigna y rastrea tareas con prioridad, horas estimadas y fechas
- **Vista Kanban**: Tablero visual de tareas por estado
- **Planificación**: Vista de línea de tiempo de tareas con fechas
- **Comentarios**: En proyectos y tareas
- **Observaciones**: Notas especiales por proyecto (riesgo, problema, decisión)
- **Registro de tiempo**: Log de horas trabajadas por tarea
- **Invitaciones por email**: Invita usuarios a empresas con roles definidos
- **Automatizaciones**: Crea reglas para generar tareas automáticamente
- **Gestión de usuarios**: Panel de administración de usuarios
- **Roles**: Admin (acceso total) / Miembro / Observador

## Requisitos

- Node.js v18 o superior
- Acceso a un servidor SMTP (para invitaciones por email)

## Instalación rápida

```bash
chmod +x install.sh
./install.sh
# Edita .env con tu configuración
nano .env
npm start
```

## Configuración (.env)

```env
PORT=3000
JWT_SECRET=tu_clave_secreta_muy_larga_aqui
APP_URL=https://tudominio.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu@gmail.com
SMTP_PASS=contraseña_de_aplicacion

ADMIN_EMAIL=admin@tuempresa.com
ADMIN_PASSWORD=TuContraseñaSegura123!
```

## Producción con PM2

```bash
npm install -g pm2
pm2 start server.js --name proyecto-cms
pm2 startup && pm2 save
```

## Base de datos

Los datos se guardan en `data/cms.db` (SQLite). Haz backup de este archivo regularmente.

```bash
cp data/cms.db data/cms_backup_$(date +%Y%m%d).db
```