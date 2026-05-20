const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendInvitationEmail({ to, inviterName, companyName, token, role }) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/invitacion?token=${token}`;

  const roleLabels = { admin: 'Administrador', member: 'Miembro', viewer: 'Observador' };
  const roleLabel = roleLabels[role] || role;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">ProyectoCMS</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Sistema de Gestión de Proyectos</p>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
        <h2 style="color: #1f2937;">Has sido invitado</h2>
        <p><strong>${inviterName}</strong> te ha invitado a unirte a la empresa <strong>${companyName}</strong> como <strong>${roleLabel}</strong>.</p>
        <p>Haz clic en el botón de abajo para aceptar la invitación y crear tu cuenta:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block;">
            Aceptar Invitación
          </a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">O copia y pega este enlace en tu navegador:<br>
          <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
        </p>
        <p style="color: #9ca3af; font-size: 12px; border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
          Este enlace expira en 7 días. Si no esperabas esta invitación, puedes ignorar este correo.
        </p>
      </div>
    </body>
    </html>
  `;

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'ProyectoCMS <no-reply@cms.local>',
    to,
    subject: `Invitación a ${companyName} en ProyectoCMS`,
    html,
  });
}

async function sendTaskNotification({ to, taskTitle, projectName, assignerName, taskId }) {
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 28px;">ProyectoCMS</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 12px 12px;">
        <h2 style="color: #1f2937;">Nueva tarea asignada</h2>
        <p><strong>${assignerName}</strong> te ha asignado una nueva tarea en el proyecto <strong>${projectName}</strong>:</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; border-left: 4px solid #667eea;">
          <strong>${taskTitle}</strong>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${appUrl}/#tarea/${taskId}" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            Ver Tarea
          </a>
        </div>
      </div>
    </body>
    </html>
  `;

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || 'ProyectoCMS <no-reply@cms.local>',
    to,
    subject: `Nueva tarea asignada: ${taskTitle}`,
    html,
  });
}

module.exports = { sendInvitationEmail, sendTaskNotification };
