const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { sendInvitationEmail } = require('../services/email');

const router = express.Router();
router.use(authMiddleware);

// Get all companies accessible by user
router.get('/', (req, res) => {
  let companies;
  if (req.user.role === 'admin') {
    companies = db.prepare(`
      SELECT c.*, u.name as creator_name,
        (SELECT COUNT(*) FROM projects p WHERE p.company_id = c.id) as project_count,
        (SELECT COUNT(*) FROM company_users cu WHERE cu.company_id = c.id) as member_count
      FROM companies c
      LEFT JOIN users u ON u.id = c.created_by
      ORDER BY c.name ASC
    `).all();
  } else {
    companies = db.prepare(`
      SELECT c.*, u.name as creator_name, cu.role as my_role,
        (SELECT COUNT(*) FROM projects p WHERE p.company_id = c.id) as project_count,
        (SELECT COUNT(*) FROM company_users cuu WHERE cuu.company_id = c.id) as member_count
      FROM companies c
      JOIN company_users cu ON cu.company_id = c.id AND cu.user_id = ?
      LEFT JOIN users u ON u.id = c.created_by
      ORDER BY c.name ASC
    `).all(req.user.id);
  }
  res.json(companies);
});

// Get single company
router.get('/:id', (req, res) => {
  const company = db.prepare(`
    SELECT c.*, u.name as creator_name
    FROM companies c
    LEFT JOIN users u ON u.id = c.created_by
    WHERE c.id = ?
  `).get(req.params.id);

  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

  if (req.user.role !== 'admin') {
    const access = db.prepare('SELECT role FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Sin acceso' });
    company.my_role = access.role;
  } else {
    company.my_role = 'admin';
  }

  company.members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, cu.role, cu.created_at as joined_at
    FROM company_users cu
    JOIN users u ON u.id = cu.user_id
    WHERE cu.company_id = ?
    ORDER BY u.name ASC
  `).all(req.params.id);

  res.json(company);
});

// Create company (admin only)
router.post('/', adminMiddleware, (req, res) => {
  const { name, description, color, website, phone, address } = req.body;
  if (!name) return res.status(400).json({ error: 'El nombre es requerido' });

  const result = db.prepare(`
    INSERT INTO companies (name, description, color, website, phone, address, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, description || null, color || '#3B82F6', website || null, phone || null, address || null, req.user.id);

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(company);
});

// Update company
router.put('/:id', (req, res) => {
  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

  if (req.user.role !== 'admin') {
    const access = db.prepare('SELECT role FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!access || access.role !== 'admin') {
      return res.status(403).json({ error: 'Sin permisos' });
    }
  }

  const { name, description, color, website, phone, address } = req.body;
  db.prepare(`
    UPDATE companies SET name = ?, description = ?, color = ?, website = ?, phone = ?, address = ?
    WHERE id = ?
  `).run(
    name || company.name,
    description !== undefined ? description : company.description,
    color || company.color,
    website !== undefined ? website : company.website,
    phone !== undefined ? phone : company.phone,
    address !== undefined ? address : company.address,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id));
});

// Delete company (admin only)
router.delete('/:id', adminMiddleware, (req, res) => {
  const company = db.prepare('SELECT id FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });
  db.prepare('DELETE FROM companies WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Get company members
router.get('/:id/members', (req, res) => {
  const members = db.prepare(`
    SELECT u.id, u.name, u.email, u.avatar, u.role as system_role, cu.role, cu.created_at as joined_at
    FROM company_users cu
    JOIN users u ON u.id = cu.user_id
    WHERE cu.company_id = ?
    ORDER BY u.name ASC
  `).all(req.params.id);
  res.json(members);
});

// Remove member from company
router.delete('/:id/members/:userId', (req, res) => {
  if (req.user.role !== 'admin') {
    const access = db.prepare('SELECT role FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!access || access.role !== 'admin') {
      return res.status(403).json({ error: 'Sin permisos' });
    }
  }
  db.prepare('DELETE FROM company_users WHERE company_id = ? AND user_id = ?')
    .run(req.params.id, req.params.userId);
  res.json({ success: true });
});

// Update member role
router.put('/:id/members/:userId', (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Rol inválido' });
  }
  db.prepare('UPDATE company_users SET role = ? WHERE company_id = ? AND user_id = ?')
    .run(role, req.params.id, req.params.userId);
  res.json({ success: true });
});

// Invite user to company
router.post('/:id/invite', (req, res) => {
  if (req.user.role !== 'admin') {
    const access = db.prepare('SELECT role FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!access || !['admin'].includes(access.role)) {
      return res.status(403).json({ error: 'Sin permisos para invitar' });
    }
  }

  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const company = db.prepare('SELECT * FROM companies WHERE id = ?').get(req.params.id);
  if (!company) return res.status(404).json({ error: 'Empresa no encontrada' });

  // Check if already a member
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existingUser) {
    const alreadyMember = db.prepare('SELECT id FROM company_users WHERE company_id = ? AND user_id = ?')
      .get(req.params.id, existingUser.id);
    if (alreadyMember) {
      return res.status(400).json({ error: 'Este usuario ya es miembro de la empresa' });
    }
  }

  // Delete old pending invitation for same email+company
  db.prepare('DELETE FROM invitations WHERE email = ? AND company_id = ? AND used_at IS NULL')
    .run(email.toLowerCase().trim(), req.params.id);

  const token = uuidv4();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO invitations (email, company_id, role, token, invited_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(email.toLowerCase().trim(), req.params.id, role || 'member', token, req.user.id, expiresAt);

  // Send email (non-blocking)
  sendInvitationEmail({
    to: email,
    inviterName: req.user.name,
    companyName: company.name,
    token,
    role: role || 'member'
  }).catch(err => console.error('Error enviando email de invitación:', err.message));

  res.json({ success: true, message: 'Invitación enviada' });
});

// Get pending invitations for company
router.get('/:id/invitations', (req, res) => {
  const invites = db.prepare(`
    SELECT i.*, u.name as inviter_name
    FROM invitations i
    JOIN users u ON u.id = i.invited_by
    WHERE i.company_id = ? AND i.used_at IS NULL
    ORDER BY i.created_at DESC
  `).all(req.params.id);
  res.json(invites);
});

// Cancel invitation
router.delete('/:id/invitations/:inviteId', (req, res) => {
  db.prepare('DELETE FROM invitations WHERE id = ? AND company_id = ?')
    .run(req.params.inviteId, req.params.id);
  res.json({ success: true });
});

module.exports = router;
