import { Server, Socket } from 'socket.io';
import User from '../models/User';
import { getDirectorController } from '../npc/DirectorController';
import { DirectorCue } from '../npc/types';

// Socket wiring for the NPC system. The DirectorController is authoritative;
// this layer just validates who is allowed to do what and relays.
//
// Registered alongside registerLobbySocket — Socket.IO allows multiple
// connection handlers, so this keeps NPC concerns isolated from the lobby.

const VALID_CUES: DirectorCue[] = [
  'APPROACH', 'STOP', 'WATCH', 'QUESTION', 'WARN', 'REASSURE', 'DEFLECT',
  'OPEN_GATE', 'CALL_SHEPHERD', 'ESCALATE', 'END_SCENE',
  'ENABLE_CONVERSATION', 'DISABLE_CONVERSATION', 'TRANSFER_TO_HUMAN', 'TRANSFER_TO_AI',
];

async function isDirector(socketId: string): Promise<boolean> {
  const user = await User.findOne({ socketId });
  return !!user && user.role === 'Director';
}

export default function registerNPCSocket(io: Server): void {
  const controller = getDirectorController();
  controller.setIO(io);

  io.on('connection', (socket: Socket) => {
    // Send the current roster so a (possibly late-joining) client can build NPCs
    // in whatever driver state they're already in.
    controller.broadcastRoster(socket);
    socket.emit('npc:realtimeStatus', { configured: controller.isRealtimeConfigured() });

    // Director triggers a cue (also the path a Stream Deck HTTP bridge would use
    // server-side via controller.executeCue).
    socket.on('npc:cue', async (data: { npcId: string; cue: DirectorCue; payload?: any }) => {
      try {
        if (!(await isDirector(socket.id))) {
          socket.emit('error', { message: 'Only the Director can trigger NPC cues' });
          return;
        }
        if (!data || !VALID_CUES.includes(data.cue)) {
          socket.emit('notice', { message: 'Unknown NPC cue.' });
          return;
        }
        const result = controller.executeCue(data.npcId, data.cue, data.payload, socket.id);
        if (!result.ok) socket.emit('notice', { message: result.error || 'Cue failed.' });
      } catch (error) {
        console.error('npc:cue error', error);
        socket.emit('error', { message: 'Failed to trigger NPC cue' });
      }
    });

    // A client running an AI conversation asks for an ephemeral Realtime session.
    // The controller only mints one if the NPC is AI-driven and conversation is
    // currently enabled by the director.
    socket.on('npc:requestRealtimeSession', async (data: { npcId: string }) => {
      try {
        const result = await controller.createRealtimeSession(data?.npcId);
        socket.emit('npc:realtimeSession', result);
      } catch (error) {
        console.error('npc:requestRealtimeSession error', error);
        socket.emit('npc:realtimeSession', {
          ok: false,
          npcId: data?.npcId,
          error: 'Realtime session error',
        });
      }
    });

    // Transcript line from a live conversation (player speech or NPC speech) used
    // for scene memory + subtitle broadcast.
    socket.on('npc:transcript', (data: { npcId: string; speaker: string; text: string }) => {
      try {
        if (!data?.npcId || !data?.speaker || typeof data?.text !== 'string') return;
        controller.recordTranscript(data.npcId, data.speaker, data.text);
      } catch (error) {
        console.error('npc:transcript error', error);
      }
    });

    // Client asks for the roster (handles connect race + reconnect).
    socket.on('npc:requestRoster', () => {
      controller.broadcastRoster(socket);
      socket.emit('npc:realtimeStatus', { configured: controller.isRealtimeConfigured() });
    });

    // Director panel requests full detail (state + memory + transcript).
    socket.on('npc:requestDetail', async (data: { npcId: string }) => {
      try {
        if (!(await isDirector(socket.id))) return;
        const detail = controller.getDetail(data?.npcId);
        if (detail) socket.emit('npc:detail', detail);
      } catch (error) {
        console.error('npc:requestDetail error', error);
      }
    });

    // Failsafe: if a human actor drops, the AI understudy takes over the role.
    socket.on('disconnect', () => {
      controller.handleDisconnect(socket.id);
    });
  });
}
