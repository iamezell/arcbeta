# ⚡ Quick Start Guide

Get ARC Beta running in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- MongoDB Atlas account
- Administrator privileges (for port 443)

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Create .env file
cat > .env << EOF
MONGODB_PASSWORD=your_mongodb_password
MONGODB_URI=mongodb+srv://iamezell_db_user:<db_password>@cluster0.odat5ym.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
PORT=443
EOF

# 3. Generate SSL certificates (Windows: use setup-ssl.bat)
./setup-ssl.sh

# 4. Build frontend
npm run build:frontend

# 5. Run backend (with sudo/admin privileges)
sudo npm run dev:backend
```

## Access

Open `https://localhost:443` in your browser.

Accept the security warning (self-signed certificate).

## Testing

1. **Tab 1**: Join as "Director"
2. **Tab 2** (incognito): Join as "Actor"
3. **As Director**: Click "Activate Level"
4. **Both tabs**: Should enter 3D scene together

## Controls

- **WASD** or **Arrow Keys**: Move
- **Mouse**: Look around
- **Space**: Jump
- **Click**: Lock pointer

## Troubleshooting

### Port 443 in use?
Change `.env`: `PORT=8443`

### MongoDB connection error?
1. Check password in `.env`
2. Whitelist IP in MongoDB Atlas (use 0.0.0.0/0 for dev)

### SSL certificate warning?
Normal for self-signed certs. Click "Advanced" → "Proceed"

## Next Steps

- Read [README.md](README.md) for full documentation
- Check [SETUP.md](SETUP.md) for detailed setup
- Review [API.md](API.md) for API reference

---

**Ready to build! 🚀**

