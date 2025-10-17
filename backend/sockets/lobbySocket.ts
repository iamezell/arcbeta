import { Server, Socket } from 'socket.io';
import User from '../models/User';
import Room from '../models/Room';
import { isValidRole, UserRole } from '../utils/roles';

interface PlayerMoveData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface JoinLobbyData {
  role: UserRole;
  name: string;
}

export default function registerLobbySocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Handle user joining lobby
    socket.on('joinLobby', async (data: JoinLobbyData) => {
      try {
        const { role, name } = data;

        if (!isValidRole(role)) {
          socket.emit('error', { message: 'Invalid role' });
          return;
        }

        // Create user in database
        const user = new User({
          socketId: socket.id,
          name: name || `User-${socket.id.substring(0, 6)}`,
          role,
          roomId: 'lobby'
        });
        await user.save();

        // Join lobby room
        socket.join('lobby');

        // Notify all users in lobby
        io.to('lobby').emit('userJoined', {
          id: socket.id,
          name: user.name,
          role: user.role
        });

        // Send current lobby users to the new user
        const lobbyUsers = await User.find({ roomId: 'lobby' });
        socket.emit('lobbyState', {
          users: lobbyUsers.map(u => ({
            id: u.socketId,
            name: u.name,
            role: u.role
          }))
        });

        console.log(`✅ ${user.name} (${role}) joined lobby`);
      } catch (error) {
        console.error('Error joining lobby:', error);
        socket.emit('error', { message: 'Failed to join lobby' });
      }
    });

    // Handle level activation (Director only)
    socket.on('activateLevel', async () => {
      try {
        const user = await User.findOne({ socketId: socket.id });

        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only Director can activate level' });
          return;
        }

        // Update or create room
        let room = await Room.findOne({ roomId: 'lobby' });
        if (!room) {
          room = new Room({ roomId: 'lobby', users: [], isActive: false });
        }
        room.isActive = true;
        room.activatedAt = new Date();
        await room.save();

        // Notify all users to start experience
        io.to('lobby').emit('startExperience');
        console.log(`🎬 Director ${user.name} activated the level`);
      } catch (error) {
        console.error('Error activating level:', error);
        socket.emit('error', { message: 'Failed to activate level' });
      }
    });

    // Handle player movement updates
    socket.on('playerMove', (data: PlayerMoveData) => {
      socket.broadcast.to('lobby').emit('playerMove', {
        id: socket.id,
        position: data.position,
        rotation: data.rotation
      });
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (user) {
          await User.deleteOne({ socketId: socket.id });
          io.to('lobby').emit('userLeft', {
            id: socket.id,
            name: user.name
          });
          console.log(`👋 ${user.name} disconnected`);
        }
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
}

