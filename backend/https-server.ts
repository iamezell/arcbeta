import https from 'https';
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
const sslPath = path.join(__dirname, '../ssl');
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

// Start server
const PORT = process.env.PORT || 443;
server.listen(PORT, () => {
  console.log(`🚀 ARC Beta running on https://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready for connections`);
});

