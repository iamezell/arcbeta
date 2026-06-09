import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import app from './app';
import { Server } from 'socket.io';
import registerLobbySocket from './sockets/lobbySocket';
import connectDB from './config/db';

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Read SSL certificates
const sslPath = path.join(__dirname, '../../ssl');
const key = fs.readFileSync(path.join(sslPath, 'server.key'));
const cert = fs.readFileSync(path.join(sslPath, 'server.cert'));

// Create HTTPS server
const server = https.createServer({ key, cert }, app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Register socket handlers
registerLobbySocket(io);

// Make the Socket.IO instance available to Express route handlers
// (e.g. the Stream Deck admit endpoint needs to emit to clients)
app.set('io', io);

// Start server
const PORT = process.env.PORT || 443;
server.listen(PORT, () => {
  console.log(`🚀 ARC Beta running on https://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for connections`);
});

// Plain-HTTP listener bound to localhost for tools that can't accept the
// self-signed certificate (e.g. the Stream Deck "Web Requests" plugin).
// It reuses the same Express app, so POST /lobby/admit works without TLS.
// Bound to 127.0.0.1 only, so it is never exposed off this machine.
const ADMIT_HTTP_PORT = process.env.ADMIT_HTTP_PORT;
if (ADMIT_HTTP_PORT && ADMIT_HTTP_PORT !== '0') {
  const httpServer = http.createServer(app);
  httpServer.listen(Number(ADMIT_HTTP_PORT), '127.0.0.1', () => {
    console.log(
      `🎟️  Stream Deck admit endpoint on http://localhost:${ADMIT_HTTP_PORT}/lobby/admit (localhost only)`
    );
  });
}

