#!/bin/bash
set -e

echo "================================================"
echo "  Instalación de ProyectoCMS"
echo "================================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado."
    echo "   Instálalo desde https://nodejs.org (v18 o superior)"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Se requiere Node.js v18 o superior. Versión actual: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v) detectado"

# Install dependencies
echo ""
echo "📦 Instalando dependencias..."
npm install --production

# Setup .env
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo ""
    echo "⚙️  Archivo .env creado. Configura las variables antes de iniciar:"
    echo "   - JWT_SECRET: clave secreta para tokens (¡IMPORTANTE: cambia esto!)"
    echo "   - SMTP_*: configuración de correo para invitaciones"
    echo "   - ADMIN_EMAIL / ADMIN_PASSWORD: credenciales del primer administrador"
    echo "   - APP_URL: URL pública de tu aplicación"
else
    echo "⚙️  Archivo .env ya existe. Verifica la configuración."
fi

echo ""
echo "================================================"
echo "✅ Instalación completada"
echo ""
echo "Para iniciar el servidor:"
echo "   npm start"
echo ""
echo "Para desarrollo con recarga automática:"
echo "   npm run dev"
echo ""
echo "La aplicación estará disponible en:"
echo "   http://localhost:3000"
echo ""
echo "Credenciales por defecto del admin:"
grep ADMIN_EMAIL .env | head -1
grep ADMIN_PASSWORD .env | head -1
echo "================================================"
