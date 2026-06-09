import express, { Request, Response, Router } from 'express';
import { Server } from 'socket.io';
import { requireStreamDeckToken } from '../utils/streamDeckAuth';
import { getSession, emitApplyResult } from '../rooms/sessionManager';

const router: Router = express.Router();

// List the director events the current room exposes. Handy for configuring
// Stream Deck buttons (one button per eventId).
router.get('/events', (_req: Request, res: Response) => {
  const room = getSession().getRoomDef();
  res.json({
    room: room.id,
    events: room.directorEvents.map((e) => ({ id: e.id, label: e.label })),
  });
});

// Trigger a scripted director event. Designed for a Director's Stream Deck button
// via an HTTP Request action. Protected by STREAM_DECK_TOKEN.
//
//   POST /director/event   body: { "eventId": "lightsOff" }
//   POST /director/event/lightsOff   (eventId in the path)
router.post(['/event', '/event/:eventId'], requireStreamDeckToken, (req: Request, res: Response) => {
  const eventId = (req.params.eventId || req.body?.eventId || req.query?.eventId) as string | undefined;
  if (!eventId) {
    return res.status(400).json({ error: 'Missing eventId' });
  }

  const io = req.app.get('io') as Server | undefined;
  if (!io) {
    console.error('Socket.IO instance not available on app; cannot run director event');
    return res.status(500).json({ error: 'Server is not ready' });
  }

  const result = getSession().applyDirectorEvent(eventId);
  if (!result.ok) {
    return res.status(404).json({ error: result.notice || 'Unknown event' });
  }

  // No acting socket for a headless trigger; broadcast to everyone in the scene.
  emitApplyResult(io, result, null);
  console.log(`🎬 Stream Deck triggered director event "${eventId}"`);

  res.json({ ok: true, eventId, changes: result.changes, complete: result.complete });
});

export default router;
