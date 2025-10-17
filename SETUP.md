# 🚀 ARC Beta Setup Guide

This guide will walk you through setting up ARC Beta from scratch.

## Step 1: System Requirements

Before you begin, ensure you have:

- ✅ Node.js v18 or higher
- ✅ npm (comes with Node.js)
- ✅ OpenSSL (usually pre-installed on macOS/Linux, or use Git Bash on Windows)
- ✅ Administrator/sudo privileges (for port 443)
- ✅ MongoDB Atlas account

## Step 2: MongoDB Atlas Setup

1. **Create an account** at https://www.mongodb.com/atlas/database

2. **Create a new cluster**:
   - Choose the free tier (M0)
   - Select your preferred region
   - Click "Create Cluster"

3. **Create a database user**:
   - Go to "Database Access"
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Username: `iamezell_db_user` (or your preferred username)
   - Generate a strong password and **save it**
   - Grant "Atlas Admin" privileges (or "Read and write to any database")

4. **Whitelist your IP**:
   - Go to "Network Access"
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (0.0.0.0/0) for development
   - For production, use specific IP addresses

5. **Get your connection string**:
   - Go to "Database" → "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - It should look like: `mongodb+srv://iamezell_db_user:<password>@cluster0.xxxxx.mongodb.net/...`

## Step 3: Install Dependencies

```bash
# Navigate to project directory
cd arcbeta

# Install all dependencies
npm install
```

This will install:
- Backend dependencies (Express, Socket.IO, Mongoose)
- Frontend dependencies (Three.js, Socket.IO client)
- Development tools (TypeScript, Vite, Nodemon)

## Step 4: Configure Environment

Create a `.env` file in the root directory:

```env
MONGODB_PASSWORD=your_actual_password_here
MONGODB_URI=mongodb+srv://iamezell_db_user:<db_password>@cluster0.odat5ym.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
PORT=443
```

Replace `your_actual_password_here` with the password from Step 2.

**Important**: The `<db_password>` placeholder in MONGODB_URI will be automatically replaced by the code.

## Step 5: Generate SSL Certificates

### Windows:
```bash
setup-ssl.bat
```

### macOS/Linux:
```bash
chmod +x setup-ssl.sh
./setup-ssl.sh
```

This creates:
- `ssl/server.key` - Private key
- `ssl/server.cert` - Self-signed certificate

**Note**: Browser security warnings are normal with self-signed certificates.

## Step 6: Build the Frontend

```bash
npm run build:frontend
```

This compiles the TypeScript frontend code and bundles it with Vite.

## Step 7: Build the Backend

```bash
npm run build:backend
```

This compiles the TypeScript backend code to JavaScript.

## Step 8: Run the Application

### Development Mode (Recommended)

**Option A: Two terminals (best for development)**

Terminal 1 - Backend with hot reload:
```bash
npm run dev:backend
```

Terminal 2 - Frontend with Vite dev server:
```bash
npm run dev:frontend
```

**Option B: Production mode**
```bash
npm start
```

### With Administrator Privileges

**Windows (Command Prompt as Admin):**
```bash
npm run dev:backend
```

**macOS/Linux:**
```bash
sudo npm run dev:backend
```

## Step 9: Access the Application

1. Open your browser
2. Navigate to: `https://localhost:443`
3. Accept the security warning:
   - **Chrome**: Click "Advanced" → "Proceed to localhost (unsafe)"
   - **Firefox**: Click "Advanced" → "Accept the Risk and Continue"
   - **Safari**: Click "Show Details" → "visit this website"

## Step 10: Test the Application

1. **Enter your name** (e.g., "Alice")
2. **Select a role** (try Director first)
3. **Open another browser tab/window** (or incognito mode)
4. **Join as Actor** or Audience with a different name
5. **As Director, click "Activate Level"**
6. **Both users should enter the 3D scene**

## Troubleshooting

### "Port 443 already in use"

**Solution 1**: Change the port in `.env`:
```env
PORT=8443
```

**Solution 2**: Stop the process using port 443:
```bash
# Windows
netstat -ano | findstr :443
taskkill /PID <PID> /F

# macOS/Linux
lsof -ti:443 | xargs kill -9
```

### "Cannot connect to MongoDB"

**Checklist**:
- ✅ Correct password in `.env`
- ✅ IP whitelisted in MongoDB Atlas (try 0.0.0.0/0)
- ✅ Internet connection working
- ✅ No firewall blocking MongoDB Atlas

**Test connection**:
```bash
# View backend logs
npm run dev:backend
# Look for "✅ MongoDB Atlas connected successfully"
```

### "Module not found" errors

**Solution**:
```bash
# Clean install
rm -rf node_modules package-lock.json
npm install
```

### SSL Certificate Issues

**Re-generate certificates**:
```bash
# Remove old certificates
rm -rf ssl

# Run setup again
./setup-ssl.sh  # or setup-ssl.bat on Windows
```

### Vite Build Errors

**Solution**:
```bash
# Clean Vite cache
rm -rf node_modules/.vite
rm -rf public/js/*

# Rebuild
npm run build:frontend
```

### Socket.IO Not Connecting

**Check**:
1. Backend is running (`npm run dev:backend`)
2. Look for "🚀 ARC Beta running on https://localhost:443" in terminal
3. Check browser console for errors (F12)
4. Verify firewall isn't blocking connections

## Development Workflow

### Making Changes

**Backend changes** (auto-reload with nodemon):
```bash
# Edit files in backend/
# Server automatically restarts
```

**Frontend changes** (with Vite HMR):
```bash
# Edit files in src/
# Browser automatically updates
# If using production mode, rebuild:
npm run build:frontend
```

### Adding New Features

1. Backend routes: Add to `backend/routes/`
2. Socket events: Add to `backend/sockets/lobbySocket.ts`
3. Frontend logic: Edit `src/arc-client.ts`
4. UI/Styles: Edit `views/*.ejs` and `public/stylesheets/style.css`

## Next Steps

- ✅ Add custom 3D models to `public/models/`
- ✅ Customize the scene in `src/arc-client.ts`
- ✅ Add more interactivity with Socket.IO events
- ✅ Deploy to a cloud platform (Heroku, AWS, DigitalOcean)

## Need Help?

- Check the main [README.md](README.md) for detailed documentation
- Review the code comments for implementation details
- Open an issue on GitHub for bugs or questions

---

**You're all set! 🎉 Enjoy building with ARC Beta!**

