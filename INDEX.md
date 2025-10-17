# 📚 ARC Beta - Documentation Index

Welcome to ARC Beta! This index will help you find the information you need.

## 🚀 Getting Started

### For First-Time Users
1. **[QUICKSTART.md](QUICKSTART.md)** - Get running in 5 minutes
2. **[SETUP.md](SETUP.md)** - Detailed setup instructions
3. **[README.md](README.md)** - Complete overview and documentation

### Choose Your Path

**"I want to start quickly"** → [QUICKSTART.md](QUICKSTART.md)

**"I want detailed instructions"** → [SETUP.md](SETUP.md)

**"I want to understand everything"** → [README.md](README.md)

**"I want to deploy to production"** → [DEPLOYMENT.md](DEPLOYMENT.md)

**"I want to contribute"** → [CONTRIBUTING.md](CONTRIBUTING.md)

**"I need API documentation"** → [API.md](API.md)

## 📖 Documentation Files

### Main Documentation

#### [README.md](README.md) (500+ lines)
- Complete project overview
- Features and architecture
- Installation and usage
- Configuration guide
- Troubleshooting
- **Start here for comprehensive understanding**

#### [SETUP.md](SETUP.md) (350+ lines)
- Step-by-step setup guide
- MongoDB Atlas configuration
- SSL certificate generation
- Development workflow
- **Perfect for first-time setup**

#### [QUICKSTART.md](QUICKSTART.md)
- Minimal setup instructions
- Get running in 5 minutes
- Basic troubleshooting
- **For experienced developers**

### Technical Documentation

#### [API.md](API.md) (600+ lines)
- REST API endpoints
- Socket.IO events
- Database models
- Client-side classes
- Code examples
- **Essential for development**

#### [DEPLOYMENT.md](DEPLOYMENT.md) (500+ lines)
- Production deployment
- VPS setup (DigitalOcean, AWS, etc.)
- Docker deployment
- Heroku deployment
- SSL/TLS configuration
- Monitoring and scaling
- **Required for production**

### Project Information

#### [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) (400+ lines)
- Implementation status
- File structure
- Feature checklist
- Code statistics
- **Overview of what was built**

#### [CONTRIBUTING.md](CONTRIBUTING.md) (250+ lines)
- Contribution guidelines
- Development workflow
- Code style
- Pull request process
- **For contributors**

#### [LICENSE](LICENSE)
- MIT License
- Usage rights

## 🗂️ Project Structure

```
arcbeta/
├── 📚 Documentation (8 files)
│   ├── INDEX.md              ← You are here
│   ├── README.md             ← Main documentation
│   ├── SETUP.md              ← Setup guide
│   ├── QUICKSTART.md         ← Quick start
│   ├── API.md                ← API reference
│   ├── DEPLOYMENT.md         ← Production deployment
│   ├── CONTRIBUTING.md       ← Contribution guide
│   └── PROJECT_SUMMARY.md    ← Project overview
│
├── 🔧 Backend (9 files)
│   ├── app.ts                ← Express app
│   ├── https-server.ts       ← Main server entry
│   ├── config/
│   │   └── db.ts             ← MongoDB connection
│   ├── models/
│   │   ├── User.ts           ← User schema
│   │   └── Room.ts           ← Room schema
│   ├── routes/
│   │   ├── index.ts          ← Main routes
│   │   └── lobby.ts          ← Lobby API
│   ├── sockets/
│   │   └── lobbySocket.ts    ← Socket.IO handlers
│   └── utils/
│       └── roles.ts          ← Role utilities
│
├── 🎮 Frontend (3 files)
│   ├── arc-client.ts         ← WebXR client
│   ├── fps-controller.ts     ← Movement controller
│   └── socket-client.ts      ← Socket.IO wrapper
│
├── 🎨 Views (3 files)
│   ├── index.ejs             ← Lobby page
│   ├── vrscene.ejs           ← 3D scene
│   └── error.ejs             ← Error page
│
├── 🌐 Public Assets
│   ├── stylesheets/
│   │   └── style.css         ← UI styles
│   ├── js/                   ← Build output (Vite)
│   └── models/               ← 3D models
│
├── ⚙️ Configuration (6 files)
│   ├── package.json          ← Dependencies & scripts
│   ├── tsconfig.json         ← TypeScript (frontend)
│   ├── tsconfig.backend.json ← TypeScript (backend)
│   ├── vite.config.ts        ← Vite config
│   ├── .gitignore            ← Git ignore rules
│   └── .gitattributes        ← Line endings
│
└── 🛠️ Setup Scripts
    ├── setup-ssl.sh          ← SSL gen (Linux/macOS)
    └── setup-ssl.bat         ← SSL gen (Windows)
```

## 🎯 Common Tasks

### Setup & Installation
→ [SETUP.md](SETUP.md) - Complete setup guide

### Running the Application
→ [README.md#usage](README.md#-usage) - Usage instructions

### Understanding the Code
→ [API.md](API.md) - API reference and code documentation

### Deploying to Production
→ [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment

### Reporting Issues
→ [CONTRIBUTING.md](CONTRIBUTING.md) - Bug reports

### Adding Features
→ [CONTRIBUTING.md](CONTRIBUTING.md) - Pull requests

### Troubleshooting
→ [SETUP.md#troubleshooting](SETUP.md#troubleshooting) - Common issues

## 🔍 Find Information

### "How do I...?"

**Install the project?**
→ [SETUP.md - Installation](SETUP.md#step-3-install-dependencies)

**Set up MongoDB?**
→ [SETUP.md - MongoDB Setup](SETUP.md#step-2-mongodb-atlas-setup)

**Generate SSL certificates?**
→ [SETUP.md - SSL Setup](SETUP.md#step-5-generate-ssl-certificates)

**Run in development mode?**
→ [README.md - Development Mode](README.md#development-mode)

**Deploy to production?**
→ [DEPLOYMENT.md](DEPLOYMENT.md)

**Add custom 3D models?**
→ [README.md - Adding Models](README.md#-adding-3d-models)

**Create new Socket.IO events?**
→ [API.md - Socket Events](API.md#socketio-events)

**Understand the architecture?**
→ [README.md - Architecture](README.md#-architecture)

**Contribute to the project?**
→ [CONTRIBUTING.md](CONTRIBUTING.md)

### "What is...?"

**The project about?**
→ [README.md - Features](README.md#-features)

**The tech stack?**
→ [README.md - Architecture](README.md#-architecture)

**The user roles?**
→ [README.md - User Roles](README.md#-user-roles)

**The API structure?**
→ [API.md](API.md)

**The file structure?**
→ [PROJECT_SUMMARY.md - File Structure](PROJECT_SUMMARY.md#-file-structure)

## 📊 Quick Reference

### npm Scripts
```bash
npm install              # Install dependencies
npm run dev:backend      # Run backend (with hot reload)
npm run dev:frontend     # Run Vite dev server
npm run build            # Build everything
npm run build:backend    # Build backend only
npm run build:frontend   # Build frontend only
npm start                # Run production server
```

### Ports
- **443** - HTTPS server (default)
- **5173** - Vite dev server (development only)

### Key URLs
- **Lobby**: https://localhost:443/
- **Scene**: https://localhost:443/scene
- **Health**: https://localhost:443/health
- **Lobby API**: https://localhost:443/lobby/status

### Environment Variables
```env
MONGODB_PASSWORD=your_password
MONGODB_URI=your_connection_string
PORT=443
```

## 🆘 Need Help?

### Quick Fixes

**Port 443 in use?**
→ [SETUP.md - Port Issues](SETUP.md#port-443-already-in-use)

**MongoDB won't connect?**
→ [SETUP.md - MongoDB Issues](SETUP.md#cannot-connect-to-mongodb)

**SSL certificate error?**
→ [SETUP.md - SSL Issues](SETUP.md#ssl-certificate-issues)

**Build errors?**
→ [SETUP.md - Build Issues](SETUP.md#vite-build-errors)

### Support Channels

1. Check documentation first (you're here!)
2. Review troubleshooting sections
3. Check [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) for implementation details
4. Open a GitHub issue

## 📈 Learning Path

### Beginner
1. [QUICKSTART.md](QUICKSTART.md) - Get it running
2. [README.md](README.md) - Understand the basics
3. Test all three roles

### Intermediate
1. [SETUP.md](SETUP.md) - Detailed configuration
2. [API.md](API.md) - API structure
3. Customize the scene

### Advanced
1. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) - Implementation details
2. [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution workflow
3. [DEPLOYMENT.md](DEPLOYMENT.md) - Production deployment
4. Add new features

## 🎓 Tutorials (in documentation)

- **Setup MongoDB Atlas**: [SETUP.md](SETUP.md#step-2-mongodb-atlas-setup)
- **Generate SSL Certs**: [SETUP.md](SETUP.md#step-5-generate-ssl-certificates)
- **Add Socket Events**: [API.md](API.md#socketio-events)
- **Deploy to VPS**: [DEPLOYMENT.md](DEPLOYMENT.md#-vps-deployment-ubuntu)
- **Docker Deployment**: [DEPLOYMENT.md](DEPLOYMENT.md#-docker-deployment)

## 📦 Code Examples

All in [API.md](API.md):
- REST API usage
- Socket.IO events
- Database queries
- Client initialization
- Multiplayer sync

## 🎨 Customization Guides

- **Avatar Models**: [README.md - Adding Models](README.md#-adding-3d-models)
- **Scene Objects**: [PROJECT_SUMMARY.md - Customization](PROJECT_SUMMARY.md#-customization-points)
- **UI Styling**: Edit `public/stylesheets/style.css`
- **Movement**: Edit `src/fps-controller.ts`
- **Roles**: Edit `backend/utils/roles.ts`

## ✅ Checklists

- **Setup**: [SETUP.md - Pre-Deployment](SETUP.md#troubleshooting)
- **Deployment**: [DEPLOYMENT.md - Checklist](DEPLOYMENT.md#-pre-deployment-checklist)
- **Contributing**: [CONTRIBUTING.md - PR Checklist](CONTRIBUTING.md#pr-checklist)

## 🔗 External Resources

- [Three.js Documentation](https://threejs.org/docs/)
- [Socket.IO Documentation](https://socket.io/docs/)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- [WebXR API](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API)

---

## 🚀 Ready to Start?

### Next Steps:

1. **New user?** Start with [QUICKSTART.md](QUICKSTART.md)
2. **Want details?** Read [SETUP.md](SETUP.md)
3. **Need everything?** Go to [README.md](README.md)

**Happy building! 🎭**

