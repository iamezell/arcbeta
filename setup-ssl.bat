@echo off
REM Windows batch script for SSL certificate generation

REM Create SSL directory if it doesn't exist
if not exist ssl mkdir ssl

REM Generate self-signed certificate
openssl req -nodes -new -x509 -keyout ssl\server.key -out ssl\server.cert -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo.
echo ✅ SSL certificates generated successfully!
echo 📁 Location: .\ssl\
echo 🔑 Key: server.key
echo 📜 Certificate: server.cert
echo.
echo ⚠️  Note: These are self-signed certificates for development only.
echo     Your browser will show a security warning - this is normal.
echo     Click 'Advanced' and 'Proceed to localhost' to continue.
echo.
pause

