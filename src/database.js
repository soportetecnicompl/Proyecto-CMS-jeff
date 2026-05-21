const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'cms.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const uploadsDir = path.join(__dirname, '..', 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      avatar TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      logo TEXT,
      color TEXT DEFAULT '#3B82F6',
      website TEXT,
      phone TEXT,
      address TEXT,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'activo',
      priority TEXT DEFAULT 'media',
      start_date DATE,
      end_date DATE,
      progress INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pendiente',
      priority TEXT DEFAULT 'media',
      assigned_to INTEGER REFERENCES users(id),
      estimated_hours REAL,
      actual_hours REAL DEFAULT 0,
      due_date DATE,
      parent_task_id INTEGER REFERENCES tasks(id),
      order_index INTEGER DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      user_id INTEGER REFERENCES users(id),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      content TEXT NOT NULL,
      type TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS time_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      hours REAL NOT NULL,
      description TEXT,
      logged_date DATE DEFAULT (date('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invitations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      role TEXT DEFAULT 'member',
      token TEXT UNIQUE NOT NULL,
      invited_by INTEGER REFERENCES users(id),
      expires_at DATETIME,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT DEFAULT '{}',
      action_type TEXT NOT NULL,
      action_config TEXT DEFAULT '{}',
      is_active INTEGER DEFAULT 1,
      created_by INTEGER REFERENCES users(id),
      last_run_at DATETIME,
      run_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS automation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
      status TEXT,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_company_users_company ON company_users(company_id);
    CREATE INDEX IF NOT EXISTS idx_company_users_user ON company_users(user_id);
    CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project_id);
    CREATE INDEX IF NOT EXISTS idx_time_logs_task ON time_logs(task_id);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#6366f1',
      created_by INTEGER REFERENCES users(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(company_id, name)
    );

    CREATE TABLE IF NOT EXISTS task_tags (
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS task_dependencies (
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      depends_on_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, depends_on_id)
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_task_tags_task ON task_tags(task_id);
    CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_task ON attachments(task_id);

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      user_id INTEGER REFERENCES users(id),
      action TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      read_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);

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
  `);

  // Create initial admin user if not exists
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@cms.local';
  const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

  if (!existingAdmin) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES (?, ?, ?, 'admin')
    `).run(process.env.ADMIN_NAME || 'Administrador', adminEmail, hash);

    console.log(`✅ Usuario admin creado: ${adminEmail}`);
  }
}

initDatabase();

function addColumnSafe(table, column, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`); } catch(e) { if (!e.message.includes('duplicate column')) throw e; }
}

addColumnSafe('projects', 'contract_value', 'REAL');
addColumnSafe('projects', 'billing_frequency', "TEXT DEFAULT 'proyecto'");
addColumnSafe('companies', 'rtn', 'TEXT');
addColumnSafe('companies', 'fiscal_name', 'TEXT');
addColumnSafe('companies', 'fiscal_address', 'TEXT');
addColumnSafe('users', 'rtn', 'TEXT');

module.exports = db;
