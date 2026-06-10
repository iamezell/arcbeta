import { Server, Socket } from 'socket.io';
import User from '../models/User';
import Room from '../models/Room';
import { isValidRole, UserRole } from '../utils/roles';
import { getSession, emitApplyResult } from '../rooms/sessionManager';

interface PlayerMoveData {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

interface JoinLobbyData {
  role: UserRole;
  name: string;
  // Sent by the 3D scene page so we know this socket is in the experience,
  // not waiting on the lobby page to be admitted.
  fromScene?: boolean;
}

interface InteractData {
  objectId: string;
  action: string;
  payload?: { code?: string };
}

interface DirectorActionData {
  eventId: string;
}

export default function registerLobbySocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Handle user joining lobby
    socket.on('joinLobby', async (data: JoinLobbyData) => {
      try {
        const { role, name, fromScene } = data;

        if (!isValidRole(role)) {
          socket.emit('error', { message: 'Invalid role' });
          return;
        }

        // Create user in database
        const user = new User({
          socketId: socket.id,
          name: name || `User-${socket.id.substring(0, 6)}`,
          role,
          roomId: 'lobby',
          inScene: !!fromScene
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

        // Clean up any stale lobby users whose sockets are no longer connected
        const connectedSocketIds = Array.from(io.sockets.sockets.keys());
        await User.deleteMany({
          roomId: 'lobby',
          socketId: { $nin: connectedSocketIds }
        });

        // Send current lobby users (only those with live sockets) to the new user
        const lobbyUsers = await User.find({
          roomId: 'lobby',
          socketId: { $in: connectedSocketIds }
        });
        socket.emit('lobbyState', {
          users: lobbyUsers.map(u => ({
            id: u.socketId,
            name: u.name,
            role: u.role
          }))
        });

        // Players inside the 3D scene get the authoritative room snapshot so they
        // render exactly what every other in-scene player sees.
        if (fromScene) {
          socket.emit('roomState', getSession().serialize());
        }

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

    // Handle a player interacting with a room object (authoritative).
    socket.on('interact', (data: InteractData) => {
      try {
        if (!data || typeof data.objectId !== 'string' || typeof data.action !== 'string') {
          socket.emit('notice', { message: 'Invalid interaction.' });
          return;
        }
        const result = getSession().applyInteraction(data.objectId, data.action, data.payload);
        emitApplyResult(io, result, socket.id);
      } catch (error) {
        console.error('Error handling interaction:', error);
        socket.emit('notice', { message: 'Interaction failed.' });
      }
    });

    // Restart the escape room after a player completes it.
    socket.on('restartRoom', () => {
      try {
        const session = getSession();
        if (!session.serialize().complete) {
          socket.emit('notice', { message: 'The room is still in progress.' });
          return;
        }
        const result = session.restartRoom();
        emitApplyResult(io, result, socket.id);
        console.log('🔄 Room restarted after completion');
      } catch (error) {
        console.error('Error restarting room:', error);
        socket.emit('notice', { message: 'Failed to restart room.' });
      }
    });

    // Handle an in-scene Director triggering a scripted event.
    socket.on('directorAction', async (data: DirectorActionData) => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only the Director can trigger events' });
          return;
        }
        if (!data || typeof data.eventId !== 'string') {
          socket.emit('notice', { message: 'Invalid director event.' });
          return;
        }
        const result = getSession().applyDirectorEvent(data.eventId);
        emitApplyResult(io, result, socket.id);
        console.log(`🎬 Director ${user.name} triggered "${data.eventId}"`);
      } catch (error) {
        console.error('Error handling director action:', error);
        socket.emit('error', { message: 'Failed to trigger director event' });
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

