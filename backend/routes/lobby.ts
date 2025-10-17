import express, { Request, Response, Router } from 'express';
import User from '../models/User';
import Room from '../models/Room';

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
      userCount: users.length
    });
  } catch (error) {
    console.error('Error fetching lobby status:', error);
    res.status(500).json({ error: 'Failed to fetch lobby status' });
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

