import express, { Request, Response, Router } from 'express';
import { Server } from 'socket.io';
import User from '../models/User';
import Room from '../models/Room';
import { requireStreamDeckToken } from '../utils/streamDeckAuth';

const router: Router = express.Router();

// Get lobby status
router.get('/status', async (req: Request, res: Response) => {
  try {
    const users = await User.find({ roomId: 'lobby' });
    const room = await Room.findOne({ roomId: 'lobby' });

    res.json({
      users: users.map(u => ({
        id: u.socketId,
        name: u.name,
        role: u.role
      })),
      isActive: room?.isActive || false,
      userCount: users.length,
      // Users still on the lobby page waiting to be admitted into the experience
      waitingCount: users.filter(u => !u.inScene).length
    });
  } catch (error) {
    console.error('Error fetching lobby status:', error);
    res.status(500).json({ error: 'Failed to fetch lobby status' });
  }
});

// Admit waiting players into a running experience.
// Designed to be triggered by a Director's Stream Deck button via an HTTP request.
// Protected by a shared secret in the STREAM_DECK_TOKEN environment variable.
router.post('/admit', requireStreamDeckToken, async (req: Request, res: Response) => {
  try {
    const room = await Room.findOne({ roomId: 'lobby' });
    if (!room || !room.isActive) {
      return res.status(409).json({
        error: 'Experience has not started yet. Activate the level before admitting players.'
      });
    }

    const io = req.app.get('io') as Server | undefined;
    if (!io) {
      console.error('Socket.IO instance not available on app; cannot admit players');
      return res.status(500).json({ error: 'Server is not ready to admit players' });
    }

    // Only target sockets that are still connected and waiting on the lobby page.
    const connectedSocketIds = Array.from(io.sockets.sockets.keys());
    const waitingUsers = await User.find({
      roomId: 'lobby',
      inScene: false,
      socketId: { $in: connectedSocketIds }
    });

    waitingUsers.forEach(user => {
      io.to(user.socketId).emit('startExperience');
    });

    console.log(`🎟️  Stream Deck admitted ${waitingUsers.length} waiting player(s)`);

    res.json({
      admitted: waitingUsers.length,
      players: waitingUsers.map(u => ({ name: u.name, role: u.role }))
    });
  } catch (error) {
    console.error('Error admitting players:', error);
    res.status(500).json({ error: 'Failed to admit players' });
  }
});

// Get user by socket ID
router.get('/user/:socketId', async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({ socketId: req.params.socketId });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.socketId,
      name: user.name,
      role: user.role
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

export default router;

