# 🎭 ARC Beta: Multiplayer WebXR Theatre Prototype

A full-stack TypeScript multiplayer WebXR application that combines Three.js, Socket.IO, and MongoDB to create an immersive first-person theatre experience with VR support.

## ✨ Features

- **WebXR Support**: Full VR headset compatibility using Three.js and WebXR API
- **Multiplayer Networking**: Real-time synchronization via Socket.IO over HTTPS
- **Role-Based System**: Three distinct roles (Director, Actor, Audience)
- **FPS Controls**: WASD movement, mouse look, pointer lock, and jump mechanics
- **MongoDB Integration**: Persistent user and room data with MongoDB Atlas
- **Secure Communication**: HTTPS with self-signed certificates for local development

## 🏗️ Architecture

```
arcbeta/
├── backend/              # Node.js + Express + TypeScript backend
│   ├── app.ts           # Express application
│   ├── https-server.ts  # HTTPS + Socket.IO server
│   ├── config/
│   │   └── db.ts        # MongoDB connection
│   ├── models/
│   │   ├── User.ts      # User schema
│   │   └── Room.ts      # Room schema
│   ├── routes/
│   │   ├── index.ts     # Main routes
│   │   └── lobby.ts     # Lobby API
│   ├── sockets/
│   │   └── lobbySocket.ts  # Socket.IO handlers
│   └── utils/
│       └── roles.ts     # Role utilities
├── src/                 # Frontend TypeScript (compiled by Vite)
│   ├── arc-client.ts    # Main WebXR client
│   ├── fps-controller.ts # First-person controls
│   └── socket-client.ts  # Socket.IO client wrapper
├── views/               # EJS templates
│   ├── index.ejs        # Lobby & role selection
│   ├── vrscene.ejs      # 3D WebXR scene
│   └── error.ejs        # Error page
├── public/
│   ├── js/              # Compiled frontend bundles
│   ├── models/          # 3D models (GLTF/GLB)
│   └── stylesheets/
│       └── style.css    # UI styles
└── ssl/                 # HTTPS certificates (generated)
```

## 🎮 User Roles

### 🎬 Director
- **Ability**: Can activate the level for all users
- **Camera**: Elevated view at 3.0m height with free-fly movement
- **Speed**: Faster movement (5.0 units/sec)
- **Purpose**: Control and orchestrate the experience

### 🎭 Actor
- **Camera**: Standard first-person at 1.6m eye height
- **Speed**: Normal movement (3.0 units/sec)
- **Purpose**: Perform and interact in the scene

### 👥 Audience
- **Camera**: Standard first-person at 1.6m eye height
- **Speed**: Normal movement (3.0 units/sec)
- **Purpose**: Watch and explore the environment

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18+ and npm
- **OpenSSL** (for certificate generation)
- **MongoDB Atlas** account with connection string
- **Administrator privileges** (required for port 443)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd arcbeta
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   MONGODB_PASSWORD=your_mongodb_password
   MONGODB_URI=mongodb+srv://iamezell_db_user:<db_password>@cluster0.odat5ym.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   PORT=443
   # Shared secret for the Director's Stream Deck "admit players" button (POST /lobby/admit)
   STREAM_DECK_TOKEN=choose-a-long-random-secret
   # Optional: plain-HTTP port (localhost only) for the Stream Deck admit endpoint.
   # Use this if your Stream Deck plugin can't accept the self-signed HTTPS cert.
   ADMIT_HTTP_PORT=8080
   ```

4. **Generate SSL certificates**
   
   **On Windows:**
   ```bash
   setup-ssl.bat
   ```
   
   **On macOS/Linux:**
   ```bash
   chmod +x setup-ssl.sh
   ./setup-ssl.sh
   ```
   
   Or manually:
   ```bash
   mkdir ssl
   openssl req -nodes -new -x509 -keyout ssl/server.key -out ssl/server.cert -days 365
   ```

5. **Build frontend**
   ```bash
   npm run build:frontend
   ```

6. **Build backend**
   ```bash
   npm run build:backend
   ```

## 🎯 Usage

### Development Mode

Run backend and frontend separately for hot-reloading:

**Terminal 1 - Backend:**
```bash
npm run dev:backend
```

**Terminal 2 - Frontend:**
```bash
npm run dev:frontend
```

Then open: `https://localhost:443`

### Production Mode

Build and run in production:
```bash
npm run build
npm start
```

### Running on Port 443

Port 443 requires administrator privileges:

**Windows:**
```bash
# Run Command Prompt or PowerShell as Administrator
npm run dev:backend
```

**macOS/Linux:**
```bash
sudo npm run dev:backend
```

**Alternative:** Change `PORT=443` to `PORT=8443` in `.env` if you don't have admin access.

## 🌐 Accessing the Application

1. **Navigate to** `https://localhost:443` (or your configured port)
2. **Accept the security warning** (self-signed certificate for development)
   - Chrome: Click "Advanced" → "Proceed to localhost (unsafe)"
   - Firefox: Click "Advanced" → "Accept the Risk and Continue"
3. **Enter your name** and **select a role** (Director/Actor/Audience)
4. **Wait in the lobby** for other users to join
5. **Director clicks "Activate Level"** to start the experience
6. **Everyone enters the 3D scene** simultaneously

## 🕹️ Controls

Once in the 3D scene:

| Input | Action |
|-------|--------|
| **W / ↑** | Move forward |
| **A / ←** | Move left |
| **S / ↓** | Move backward |
| **D / →** | Move right |
| **Space** | Jump |
| **Mouse** | Look around |
| **Click** | Lock pointer (for mouse look) |
| **ESC** | Release pointer lock |

## 🔧 Configuration

### MongoDB Atlas Setup

1. Create a MongoDB Atlas account at https://www.mongodb.com/atlas
2. Create a new cluster
3. Add a database user with password
4. Whitelist your IP address (or use 0.0.0.0/0 for development)
5. Copy the connection string and update `.env`

### Customizing Ports

Edit `.env`:
```env
PORT=8443  # Use any available port
```

Update Socket.IO client in `views/vrscene.ejs` if using a non-standard port.

## 📡 Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `joinLobby` | `{ role, name }` | User joins the lobby with selected role |
| `activateLevel` | - | Director activates the 3D scene |
| `playerMove` | `{ position, rotation }` | Player position/rotation update |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `userJoined` | `{ id, name, role }` | New user joined lobby |
| `userLeft` | `{ id, name }` | User disconnected |
| `lobbyState` | `{ users[] }` | Current lobby state |
| `startExperience` | - | Trigger scene transition for all users |
| `playerMove` | `{ id, position, rotation }` | Remote player moved |
| `error` | `{ message }` | Error notification |

## 🛠️ Development

### Project Structure

- **TypeScript Backend**: CommonJS modules for Node.js compatibility
- **TypeScript Frontend**: ES modules bundled by Vite
- **Separate tsconfig files**: Backend and frontend have different compile targets

### Building

```bash
# Build everything
npm run build

# Build backend only
npm run build:backend

# Build frontend only
npm run build:frontend
```

### Scripts

```json
{
  "dev:backend": "nodemon with ts-node for backend hot-reload",
  "dev:frontend": "vite dev server with HMR",
  "build:backend": "compile TypeScript backend to dist/backend/",
  "build:frontend": "bundle frontend to public/js/",
  "build": "build both backend and frontend",
  "start": "run production server"
}
```

## 🎨 Adding 3D Models

To use custom avatars:

1. Place your GLTF/GLB model in `public/models/`
2. Name it `avatar.glb` or update the path in `src/arc-client.ts`
3. Recommended model source: [Fab Marketplace](https://www.fab.com/listings/ebdc8829-9e41-4e1f-bf50-3ae6605ccca1)

Currently, the app uses procedural placeholder avatars (capsule + sphere).

## 🔒 Security Notes

- **Self-signed certificates** are for development only
- **Never commit** `.env` or `ssl/` directory
- For production, use proper SSL certificates (Let's Encrypt, etc.)
- Update CORS settings in `backend/https-server.ts` for production

## 🐛 Troubleshooting

### Port 443 Permission Denied

**Solution**: Run with `sudo` (Linux/macOS) or as Administrator (Windows), or change to a higher port (8443).

### MongoDB Connection Error

**Solution**: Check:
- `.env` file has correct credentials
- IP address is whitelisted in MongoDB Atlas
- Network allows outbound connections to MongoDB Atlas

### Browser Security Warning

**Solution**: This is expected with self-signed certificates. Click "Advanced" and proceed to localhost.

### Vite Build Errors

**Solution**: 
```bash
rm -rf node_modules public/js
npm install
npm run build:frontend
```

### Socket.IO Connection Failed

**Solution**:
- Ensure backend is running (`npm run dev:backend`)
- Check browser console for CORS errors
- Verify HTTPS certificates are properly loaded

## 📦 Dependencies

### Backend
- `express` - Web framework
- `socket.io` - Real-time communication
- `mongoose` - MongoDB ODM
- `cors` - Cross-origin resource sharing
- `dotenv` - Environment variables
- `ejs` - Template engine

### Frontend
- `three` - 3D graphics library
- `socket.io-client` - Socket.IO client
- `vite` - Build tool and dev server

## 🚢 Deployment

For production deployment:

1. **Use proper SSL certificates** (Let's Encrypt, CloudFlare, etc.)
2. **Set up MongoDB Atlas** with proper security settings
3. **Configure environment variables** on your hosting platform
4. **Build the project**: `npm run build`
5. **Run**: `npm start`
6. **Use a process manager** like PM2 for auto-restart:
   ```bash
   npm install -g pm2
   pm2 start dist/backend/https-server.js --name arcbeta
   ```

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using Three.js, Socket.IO, and MongoDB**
