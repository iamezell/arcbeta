import { Server } from 'socket.io';
import { RoomSession, ApplyResult } from './RoomSession';
import { ESCAPE_ROOM_01 } from './escapeRoom';
import { StateChangePayload } from './types';

// Socket.IO room all in-scene players share.
export const SCENE_ROOM = 'lobby';

// Single active session for the prototype. Swap this for a per-room map when ARC
// runs multiple simultaneous experiences.
let activeSession: RoomSession | null = null;

export function getSession(): RoomSession {
  if (!activeSession) {
    activeSession = new RoomSession(ESCAPE_ROOM_01);
  }
  return activeSession;
}

// Centralised emission of an ApplyResult so player interactions and Stream Deck
// director events broadcast identically. `actingSocketId` receives private
// reveal/notice messages; pass null for headless (HTTP) triggers.
export function emitApplyResult(io: Server, result: ApplyResult, actingSocketId: string | null): void {
  const hasBroadcast =
    result.changes.length > 0 ||
    result.complete ||
    !!result.feedback ||
    result.audioCues.length > 0 ||
    !!result.directorEventId;

  if (hasBroadcast) {
    const payload: StateChangePayload = {
      changes: result.changes,
      flags: result.flags,
      complete: result.complete,
      feedback: result.feedback,
      audioCues: result.audioCues,
      directorEventId: result.directorEventId,
    };
    io.to(SCENE_ROOM).emit('stateChanged', payload);
  }

  if (actingSocketId) {
    if (result.reveal) io.to(actingSocketId).emit('reveal', result.reveal);
    if (result.notice) io.to(actingSocketId).emit('notice', { message: result.notice });
  }
}
