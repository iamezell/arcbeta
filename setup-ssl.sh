#!/bin/bash

# Create SSL directory if it doesn't exist
mkdir -p ssl

# Generate self-signed certificate
openssl req -nodes -new -x509 -keyout ssl/server.key -out ssl/server.cert -days 365 -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

echo "✅ SSL certificates generated successfully!"
echo "📁 Location: ./ssl/"
echo "🔑 Key: server.key"
echo "📜 Certificate: server.cert"
echo ""
echo "⚠️  Note: These are self-signed certificates for development only."
echo "    Your browser will show a security warning - this is normal."
echo "    Click 'Advanced' and 'Proceed to localhost' to continue."

