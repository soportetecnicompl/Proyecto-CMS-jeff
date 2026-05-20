#!/usr/bin/env node

'use strict';

const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ── Colors ──────────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
};

const bold = (s) => `${c.bold}${s}${c.reset}`;
const cyan = (s) => `${c.cyan}${s}${c.reset}`;
const green = (s) => `${c.green}${s}${c.reset}`;
const yellow = (s) => `${c.yellow}${s}${c.reset}`;
const red = (s) => `${c.red}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;
const magenta = (s) => `${c.magenta}${s}${c.reset}`;

// ── Readline ─────────────────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question, defaultValue = '') {
  return new Promise((resolve) => {
    const hint = defaultValue ? dim(` [${defaultValue}]`) : '';
    rl.question(`  ${cyan('?')} ${bold(question)}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function askSecret(question, defaultValue = '') {
  return new Promise((resolve) => {
    const hint = defaultValue ? dim(` [se generará automáticamente]`) : '';
    process.stdout.write(`  ${cyan('?')} ${bold(question)}${hint}: `);

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let input = '';
    stdin.on('data', function handler(char) {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', handler);
        process.stdout.write('\n');
        resolve(input.trim() || defaultValue);
      } else if (char === '') {
        process.exit();
      } else if (char === '') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(`  ${cyan('?')} ${bold(question)}${hint}: ${'*'.repeat(input.length)}`);
        }
      } else {
        input += char;
        process.stdout.write('*');
      }
    });
  });
}

function askYesNo(question, defaultYes = true) {
  return new Promise((resolve) => {
    const hint = dim(defaultYes ? ' [S/n]' : ' [s/N]');
    rl.question(`  ${cyan('?')} ${bold(question)}${hint}: `, (answer) => {
      const a = answer.trim().toLowerCase();
      if (!a) resolve(defaultYes);
      else resolve(a === 's' || a === 'si' || a === 'sí' || a === 'y' || a === 'yes');
    });
  });
}

function line(char = '─', len = 60) {
  return dim(char.repeat(len));
}

function section(title) {
  console.log('');
  console.log(line());
  console.log(`  ${bold(magenta(title))}`);
  console.log(line());
}

function info(msg) { console.log(`  ${cyan('ℹ')} ${msg}`); }
function ok(msg) { console.log(`  ${green('✓')} ${msg}`); }
function warn(msg) { console.log(`  ${yellow('⚠')} ${msg}`); }
function err(msg) { console.log(`  ${red('✗')} ${msg}`); }
function step(n, total, msg) { console.log(`\n  ${bold(cyan(`[${n}/${total}]`))} ${bold(msg)}`); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.clear();

  console.log('');
  console.log(`  ${bold(cyan('╔════════════════════════════════════════════════╗'))}`);
  console.log(`  ${bold(cyan('║'))}        ${bold('🗂️  ProyectoCMS — Configuración')}          ${bold(cyan('║'))}`);
  console.log(`  ${bold(cyan('║'))}    ${dim('Sistema de Gestión de Proyectos v1.0')}      ${bold(cyan('║'))}`);
  console.log(`  ${bold(cyan('╚════════════════════════════════════════════════╝'))}`);
  console.log('');
  console.log(`  ${dim('Responde las siguientes preguntas para configurar tu instalación.')}`);
  console.log(`  ${dim('Presiona Enter para aceptar el valor por defecto [entre corchetes].')}`);

  const TOTAL = 5;

  // ── 1. Dominio ─────────────────────────────────────────────────────────────
  step(1, TOTAL, 'Dominio y URL');
  const domain = await ask('Subdominio completo (ej: ppjm.mplasesores.com)', 'ppjm.mplasesores.com');
  const port = await ask('Puerto interno del contenedor Docker', '3000');

  // ── 2. Administrador ───────────────────────────────────────────────────────
  step(2, TOTAL, 'Cuenta de Administrador');
  info('Estas serán las credenciales del primer usuario admin.');
  const adminName = await ask('Nombre del administrador', 'Administrador');
  const adminEmail = await ask('Email del administrador', `admin@${domain.split('.').slice(1).join('.')}`);
  const adminPassword = await askSecret('Contraseña del administrador (mín. 8 caracteres)');
  if (adminPassword && adminPassword.length < 8) {
    warn('La contraseña es muy corta. Usa al menos 8 caracteres.');
    process.exit(1);
  }

  // ── 3. JWT Secret ──────────────────────────────────────────────────────────
  step(3, TOTAL, 'Seguridad');
  const jwtSecret = crypto.randomBytes(64).toString('hex');
  ok(`JWT Secret generado automáticamente (${jwtSecret.length} caracteres)`);
  info(`${dim('Guárdalo en un lugar seguro — si lo pierdes todos los usuarios se desloguean.')}`);

  // ── 4. Email SMTP ──────────────────────────────────────────────────────────
  step(4, TOTAL, 'Configuración de Email (para invitaciones)');
  const wantsEmail = await askYesNo('¿Quieres configurar el email ahora?', true);

  let smtpHost = 'smtp.gmail.com';
  let smtpPort = '587';
  let smtpSecure = 'false';
  let smtpUser = '';
  let smtpPass = '';
  let smtpFrom = '';

  if (wantsEmail) {
    console.log('');
    info(`Para Gmail usa una ${bold('Contraseña de Aplicación')}:`);
    info(`${dim('Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación')}`);
    console.log('');

    smtpHost = await ask('Servidor SMTP', 'smtp.gmail.com');
    smtpPort = await ask('Puerto SMTP', '587');
    smtpSecure = smtpPort === '465' ? 'true' : 'false';
    smtpUser = await ask('Email (usuario SMTP)');
    smtpPass = await askSecret('Contraseña de aplicación SMTP');
    smtpFrom = await ask('Nombre del remitente', `ProyectoCMS <${smtpUser}>`);
  } else {
    warn('Email omitido. Las invitaciones por correo no funcionarán hasta que lo configures.');
  }

  // ── 5. Confirmar ───────────────────────────────────────────────────────────
  step(5, TOTAL, 'Resumen de configuración');
  console.log('');
  console.log(`  ${bold('URL de la aplicación:')}  https://${domain}`);
  console.log(`  ${bold('Puerto Docker:')}         ${port}`);
  console.log(`  ${bold('Admin email:')}           ${adminEmail}`);
  console.log(`  ${bold('Admin nombre:')}          ${adminName}`);
  console.log(`  ${bold('Email SMTP:')}            ${wantsEmail ? smtpUser : dim('no configurado')}`);
  console.log('');

  const confirm = await askYesNo('¿Generar los archivos de configuración?', true);
  if (!confirm) {
    warn('Cancelado. No se generó ningún archivo.');
    rl.close();
    return;
  }

  // ── Generar archivos ───────────────────────────────────────────────────────
  section('Generando archivos...');

  const ROOT = path.join(__dirname, '..');

  // .env
  const envContent = `# ProyectoCMS — Configuración generada el ${new Date().toLocaleDateString('es-ES')}
PORT=${port}
NODE_ENV=production

JWT_SECRET=${jwtSecret}
JWT_EXPIRES_IN=7d

APP_URL=https://${domain}

SMTP_HOST=${smtpHost}
SMTP_PORT=${smtpPort}
SMTP_SECURE=${smtpSecure}
SMTP_USER=${smtpUser}
SMTP_PASS=${smtpPass}
SMTP_FROM=${smtpFrom}

ADMIN_NAME=${adminName}
ADMIN_EMAIL=${adminEmail}
ADMIN_PASSWORD=${adminPassword}
`;
  fs.writeFileSync(path.join(ROOT, '.env'), envContent, 'utf8');
  ok('Archivo .env creado');

  // docker-compose.yml
  const composeContent = `version: '3.8'

services:
  proyecto-cms:
    image: proyecto-cms:latest
    build: .
    container_name: proyecto-cms
    restart: unless-stopped
    ports:
      - "${port}:${port}"
    volumes:
      - cms-data:/app/data
    environment:
      - NODE_ENV=production
      - PORT=${port}
      - JWT_SECRET=${jwtSecret}
      - JWT_EXPIRES_IN=7d
      - APP_URL=https://${domain}
      - SMTP_HOST=${smtpHost}
      - SMTP_PORT=${smtpPort}
      - SMTP_SECURE=${smtpSecure}
      - SMTP_USER=${smtpUser}
      - SMTP_PASS=${smtpPass}
      - SMTP_FROM=${smtpFrom}
      - ADMIN_NAME=${adminName}
      - ADMIN_EMAIL=${adminEmail}
      - ADMIN_PASSWORD=${adminPassword}

volumes:
  cms-data:
    driver: local
`;
  fs.writeFileSync(path.join(ROOT, 'docker-compose.yml'), composeContent, 'utf8');
  ok('Archivo docker-compose.yml actualizado');

  // nginx config
  const nginxDir = path.join(ROOT, 'nginx');
  if (!fs.existsSync(nginxDir)) fs.mkdirSync(nginxDir);

  const nginxContent = `server {
    listen 80;
    server_name ${domain};
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    location / {
        proxy_pass         http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
        client_max_body_size 20M;
    }
}
`;
  const nginxFile = path.join(nginxDir, `${domain}.conf`);
  fs.writeFileSync(nginxFile, nginxContent, 'utf8');
  ok(`Configuración de Nginx → nginx/${domain}.conf`);

  // install-server.sh — script para el VPS
  const installScript = `#!/bin/bash
# ProyectoCMS — Script de instalación del servidor
# Ejecutar como root en Ubuntu 22.04

set -e

DOMAIN="${domain}"
PORT="${port}"

echo ""
echo "=================================================="
echo "  ProyectoCMS — Instalación en servidor"
echo "  Dominio: $DOMAIN"
echo "=================================================="
echo ""

# 1. Instalar Docker si no está instalado
if ! command -v docker &> /dev/null; then
    echo "→ Instalando Docker..."
    apt-get update -qq
    apt-get install -y ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \$(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    echo "✓ Docker instalado: \$(docker --version)"
else
    echo "✓ Docker ya está instalado: \$(docker --version)"
fi

# 2. Instalar Nginx y Certbot si no están instalados
if ! command -v nginx &> /dev/null; then
    echo "→ Instalando Nginx y Certbot..."
    apt-get install -y nginx certbot python3-certbot-nginx
    echo "✓ Nginx instalado"
else
    echo "✓ Nginx ya está instalado"
fi

# 3. Copiar configuración de Nginx
echo "→ Configurando Nginx para $DOMAIN..."
cp "$(dirname "\$0")/nginx/$DOMAIN.conf" /etc/nginx/sites-available/$DOMAIN

# Crear versión temporal sin SSL para que Certbot pueda validar
cat > /etc/nginx/sites-available/$DOMAIN << 'NGINX'
server {
    listen 80;
    server_name ${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN
nginx -t && systemctl reload nginx
echo "✓ Nginx configurado"

# 4. Obtener certificado SSL
echo "→ Obteniendo certificado SSL para $DOMAIN..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN --redirect
echo "✓ Certificado SSL obtenido"

# 5. Instalar Portainer si no está corriendo
if ! docker ps | grep -q portainer; then
    echo "→ Instalando Portainer..."
    docker volume create portainer_data
    docker run -d \\
        -p 8000:8000 \\
        -p 9443:9443 \\
        --name portainer \\
        --restart=always \\
        -v /var/run/docker.sock:/var/run/docker.sock \\
        -v portainer_data:/data \\
        portainer/portainer-ce:latest
    echo "✓ Portainer instalado en https://\$(curl -s ifconfig.me):9443"
else
    echo "✓ Portainer ya está corriendo"
fi

# 6. Construir e iniciar la app
echo "→ Construyendo imagen Docker de ProyectoCMS..."
cd "\$(dirname "\$0")"
docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d
echo "✓ ProyectoCMS iniciado"

echo ""
echo "=================================================="
echo "  ✅ Instalación completada"
echo ""
echo "  App:      https://$DOMAIN"
echo "  Portainer: https://\$(curl -s ifconfig.me):9443"
echo ""
echo "  Admin: ${adminEmail}"
echo "=================================================="
`;
  fs.writeFileSync(path.join(ROOT, 'install-server.sh'), installScript, 'utf8');
  try { execSync(`chmod +x ${path.join(ROOT, 'install-server.sh')}`); } catch {}
  ok('Script install-server.sh generado');

  // ── Siguiente pasos ────────────────────────────────────────────────────────
  section('✅ ¡Listo! Próximos pasos');
  console.log('');
  console.log(`  ${bold('1.')} Sube estos archivos a tu VPS:`);
  console.log(`     ${dim('scp -r . root@IP_DE_TU_VPS:/opt/proyecto-cms')}`);
  console.log('');
  console.log(`  ${bold('2.')} Conéctate al VPS:`);
  console.log(`     ${dim('ssh root@IP_DE_TU_VPS')}`);
  console.log('');
  console.log(`  ${bold('3.')} Agrega el registro DNS antes de continuar:`);
  console.log(`     ${bold('Tipo:')} A   ${bold('Nombre:')} ppjm   ${bold('Valor:')} IP_DE_TU_VPS`);
  console.log('');
  console.log(`  ${bold('4.')} Ejecuta el instalador en el VPS:`);
  console.log(`     ${dim('cd /opt/proyecto-cms && bash install-server.sh')}`);
  console.log('');
  console.log(`  ${bold('5.')} Accede a tu aplicación:`);
  console.log(`     ${cyan(`https://${domain}`)}`);
  console.log('');
  console.log(`     ${bold('Email:')}      ${green(adminEmail)}`);
  console.log(`     ${bold('Contraseña:')} ${dim('la que ingresaste')}`);
  console.log('');
  console.log(line());
  console.log(`  ${dim('Archivos generados: .env · docker-compose.yml · nginx/${domain}.conf · install-server.sh')}`);
  console.log(line());
  console.log('');

  rl.close();
}

main().catch((e) => {
  err(`Error inesperado: ${e.message}`);
  process.exit(1);
});
