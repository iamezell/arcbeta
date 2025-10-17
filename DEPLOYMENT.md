# 🚢 ARC Beta Deployment Guide

This guide covers deploying ARC Beta to production environments.

## 🌍 Deployment Options

### Option 1: VPS (Recommended)
- DigitalOcean
- AWS EC2
- Google Cloud Compute
- Linode
- Vultr

### Option 2: Platform-as-a-Service
- Heroku
- Railway
- Render
- Fly.io

### Option 3: Containerized
- Docker + Docker Compose
- Kubernetes
- AWS ECS

## 📋 Pre-Deployment Checklist

- [ ] MongoDB Atlas cluster configured
- [ ] Valid SSL certificates obtained (Let's Encrypt)
- [ ] Environment variables configured
- [ ] Domain name registered and configured
- [ ] Firewall rules configured
- [ ] Application built and tested locally

## 🔧 Production Configuration

### Environment Variables

Create production `.env`:

```env
# MongoDB
MONGODB_PASSWORD=your_production_password
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/arcbeta?retryWrites=true&w=majority

# Server
PORT=443
NODE_ENV=production

# Security (optional)
SESSION_SECRET=your_random_secret_key
ALLOWED_ORIGINS=https://yourdomain.com
```

### Update CORS Settings

Edit `backend/https-server.ts`:

```typescript
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS || 'https://yourdomain.com',
    methods: ['GET', 'POST'],
    credentials: true
  }
});
```

### Update Socket.IO Client

Edit `views/vrscene.ejs` if needed:

```javascript
const socket = io({
  transports: ['websocket', 'polling'],
  secure: true
});
```

## 🔐 SSL Certificates

### Let's Encrypt (Free)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Certificates will be at:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### Update Server Configuration

Edit `backend/https-server.ts`:

```typescript
const sslPath = process.env.NODE_ENV === 'production'
  ? '/etc/letsencrypt/live/yourdomain.com'
  : path.join(__dirname, '../ssl');

const key = fs.readFileSync(
  process.env.NODE_ENV === 'production'
    ? path.join(sslPath, 'privkey.pem')
    : path.join(sslPath, 'server.key')
);

const cert = fs.readFileSync(
  process.env.NODE_ENV === 'production'
    ? path.join(sslPath, 'fullchain.pem')
    : path.join(sslPath, 'server.cert')
);
```

## 📦 VPS Deployment (Ubuntu)

### 1. Server Setup

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install build essentials
sudo apt-get install -y build-essential git

# Verify installation
node --version
npm --version
```

### 2. Clone and Build

```bash
# Clone repository
git clone https://github.com/your-username/arcbeta.git
cd arcbeta

# Install dependencies
npm install

# Create .env file
nano .env
# (paste your production environment variables)

# Build application
npm run build
```

### 3. SSL Setup

```bash
# Install Certbot
sudo apt-get install certbot

# Stop any service on port 80
sudo systemctl stop nginx  # if running

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### 4. PM2 Process Manager

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start application
pm2 start dist/backend/https-server.js --name arcbeta

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# (follow the command it outputs)

# Monitor application
pm2 monit

# View logs
pm2 logs arcbeta
```

### 5. Firewall Configuration

```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTPS
sudo ufw allow 443/tcp

# Allow HTTP (for certificate renewal)
sudo ufw allow 80/tcp

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

## 🐳 Docker Deployment

### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 443

# Start application
CMD ["node", "dist/backend/https-server.js"]
```

### docker-compose.yml

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  arcbeta:
    build: .
    ports:
      - "443:443"
    environment:
      - NODE_ENV=production
      - MONGODB_PASSWORD=${MONGODB_PASSWORD}
      - MONGODB_URI=${MONGODB_URI}
      - PORT=443
    volumes:
      - ./ssl:/app/ssl:ro
    restart: unless-stopped
```

### Deploy

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## ☁️ Heroku Deployment

### 1. Heroku Setup

```bash
# Install Heroku CLI
curl https://cli-assets.heroku.com/install.sh | sh

# Login
heroku login

# Create app
heroku create your-app-name

# Add buildpack
heroku buildpacks:set heroku/nodejs
```

### 2. Configure Heroku

```bash
# Set environment variables
heroku config:set MONGODB_PASSWORD=your_password
heroku config:set MONGODB_URI=your_mongodb_uri
heroku config:set NODE_ENV=production

# Note: Heroku assigns PORT automatically
# Update code to use process.env.PORT || 443
```

### 3. Procfile

Create `Procfile`:

```
web: node dist/backend/https-server.js
```

### 4. Deploy

```bash
# Commit changes
git add .
git commit -m "Prepare for Heroku deployment"

# Push to Heroku
git push heroku main

# Open app
heroku open
```

**Note**: Heroku doesn't support port 443. Use Heroku's provided URL or configure a custom domain with SSL.

## 🔍 Monitoring

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Status
pm2 status

# Logs
pm2 logs

# Restart
pm2 restart arcbeta

# Stop
pm2 stop arcbeta
```

### Log Rotation

```bash
# Install PM2 log rotate
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## 🔒 Security Best Practices

### 1. MongoDB Security

- ✅ Use strong passwords
- ✅ Enable IP whitelist (don't use 0.0.0.0/0)
- ✅ Use separate database for production
- ✅ Enable MongoDB encryption at rest
- ✅ Regular backups

### 2. Server Security

- ✅ Keep system updated (`apt-get update`)
- ✅ Use firewall (UFW)
- ✅ Disable root login via SSH
- ✅ Use SSH keys, not passwords
- ✅ Install fail2ban for brute force protection

### 3. Application Security

- ✅ Use environment variables (never hardcode secrets)
- ✅ Validate all user inputs
- ✅ Rate limit Socket.IO connections
- ✅ Use CORS properly
- ✅ Keep dependencies updated

### 4. SSL/TLS

- ✅ Use TLS 1.2+ only
- ✅ Strong cipher suites
- ✅ Auto-renew certificates
- ✅ HSTS headers
- ✅ Certificate monitoring

## 📊 Performance Optimization

### 1. Enable Compression

Add to `backend/app.ts`:

```typescript
import compression from 'compression';
app.use(compression());
```

### 2. Enable Caching

```typescript
app.use(express.static('public', {
  maxAge: '1d',
  etag: true
}));
```

### 3. MongoDB Indexing

Ensure indexes are created:

```typescript
// In User model
UserSchema.index({ socketId: 1 });

// In Room model
RoomSchema.index({ roomId: 1 });
```

### 4. CDN for Static Assets

Use CDN for Three.js if not bundling:
- Cloudflare CDN
- jsDelivr
- unpkg

## 🔄 CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build
    
    - name: Deploy to server
      uses: appleboy/ssh-action@master
      with:
        host: ${{ secrets.HOST }}
        username: ${{ secrets.USERNAME }}
        key: ${{ secrets.SSH_KEY }}
        script: |
          cd arcbeta
          git pull
          npm install
          npm run build
          pm2 restart arcbeta
```

## 🧪 Health Checks

Add health check endpoint in `backend/routes/index.ts`:

```typescript
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});
```

## 📈 Scaling

### Horizontal Scaling

Use Socket.IO Redis adapter:

```bash
npm install socket.io-redis
```

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

### Load Balancing

Use Nginx as reverse proxy:

```nginx
upstream arcbeta {
    server localhost:443;
    # Add more servers for load balancing
    # server localhost:444;
    # server localhost:445;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass https://arcbeta;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 🆘 Troubleshooting

### Connection Issues

```bash
# Check if service is running
pm2 status

# Check logs
pm2 logs arcbeta --lines 100

# Test MongoDB connection
mongo "mongodb+srv://cluster.mongodb.net" --username user
```

### SSL Issues

```bash
# Check certificate expiry
openssl x509 -in /etc/letsencrypt/live/yourdomain.com/fullchain.pem -noout -dates

# Renew certificate
sudo certbot renew --force-renewal

# Restart PM2
pm2 restart arcbeta
```

### High Memory Usage

```bash
# Check memory
pm2 monit

# Restart service
pm2 restart arcbeta

# Increase memory limit
pm2 start dist/backend/https-server.js --name arcbeta --max-memory-restart 500M
```

## 📚 Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/)
- [Let's Encrypt](https://letsencrypt.org/)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
- [Socket.IO Production Guide](https://socket.io/docs/v4/production-checklist/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

**Ready for production! 🚀**

