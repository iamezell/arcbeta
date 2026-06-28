import { Server, Socket } from 'socket.io';
import User from '../models/User';
import Room from '../models/Room';
import { isValidRole, UserRole } from '../utils/roles';
import { getSession, emitApplyResult } from '../rooms/sessionManager';
import {
  getShowState,
  SceneId,
  TransitionMode,
  ShowCue,
  VALID_SCENES,
  VALID_MODES,
  VALID_CUES,
} from '../show/showState';
import { VALID_BEAT_IDS, VALID_MOMENT_IDS } from '../cueEngine/cueEngineIds';
import { getDirectorController } from '../npc/DirectorController';
import { getShowCode } from '../show/session';

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
  // Local-rehearsal join metadata.
  showCode?: string;
  deviceType?: 'phone' | 'desktop' | 'headset' | 'unknown';
}

interface InteractData {
  objectId: string;
  action: string;
  payload?: { code?: string };
}

interface DirectorActionData {
  eventId: string;
}

interface StartActData {
  sceneId: SceneId;
  mode: TransitionMode;
}

interface ShowCueData {
  cue: ShowCue;
}

interface CueEngineBeatData {
  beatId: string;
  startedAt: number;
  momentId?: string;
  force?: boolean;
}

interface CueEngineMomentData {
  momentId: string;
  startedAt: number;
  force?: boolean;
}

interface PrivateCueData {
  targetSocketId: string;
  payload: unknown;
}

export default function registerLobbySocket(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Handle user joining lobby
    socket.on('joinLobby', async (data: JoinLobbyData) => {
      try {
        const { role, name, fromScene, deviceType } = data;

        if (!isValidRole(role)) {
          socket.emit('error', { message: 'Invalid role' });
          return;
        }

        // Participants join under the current show; honor an explicit code if sent.
        const showCode = (data.showCode && data.showCode.trim()) || getShowCode();

        // Upsert so reconnect / duplicate joinLobby never creates twin User rows.
        const user = await User.findOneAndUpdate(
          { socketId: socket.id },
          {
            socketId: socket.id,
            name: name || `User-${socket.id.substring(0, 6)}`,
            role,
            roomId: 'lobby',
            inScene: !!fromScene,
            showCode,
            deviceType: deviceType || 'unknown',
            joinedAt: new Date(),
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Entering the 3D scene: drop any lobby-page socket still listed under the
        // same display name so we don't render two avatars for one person.
        if (fromScene) {
          await User.deleteMany({
            name: user.name,
            inScene: false,
            socketId: { $ne: socket.id },
          });
        }

        // Join lobby room
        socket.join('lobby');

        // Notify everyone else (not the joiner — they get lobbyState below).
        socket.broadcast.to('lobby').emit('userJoined', {
          id: socket.id,
          name: user.name,
          role: user.role,
          inScene: user.inScene,
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
            role: u.role,
            inScene: u.inScene,
          }))
        });

        // Players inside the 3D scene get the authoritative show state so they
        // render the same theatrical moment as everyone else. Late joiners who
        // arrive after Act 1 has started are dropped straight into Act 1.
        if (fromScene) {
          socket.emit('showState', getShowState().serialize());
          // Re-send NPC roster once the client has finished booting its scene page.
          getDirectorController().broadcastRoster(socket);
          // NOTE: the escape-room greybox (`roomState`) is intentionally not
          // auto-loaded here so it doesn't clutter the theatrical scenes. The
          // `interact` / `directorAction` infrastructure remains available for
          // wiring an escape-room act in later.
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

    // Director starts a theatrical scene (e.g. Act 1). The server is the source
    // of truth for the active scene; it broadcasts a synchronized transition so
    // every client switches at the same time.
    socket.on('startAct', async (data: StartActData) => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only the Director can start an act' });
          return;
        }
        const sceneId = data?.sceneId;
        const mode = data?.mode;
        if (!sceneId || !VALID_SCENES.includes(sceneId)) {
          socket.emit('notice', { message: 'Unknown scene.' });
          return;
        }
        const safeMode: TransitionMode = mode && VALID_MODES.includes(mode) ? mode : 'instant';
        const payload = getShowState().startScene(sceneId, safeMode);
        io.to('lobby').emit('sceneTransition', payload);
        console.log(`🎭 Director ${user.name} started ${sceneId} (${safeMode})`);

        // Auto-open live voice for on-stage AI NPCs once the scene has settled.
        if (sceneId === 'ACT_1_STORM_ROAD') {
          setTimeout(() => getDirectorController().enableOnStageAIVoices(), 1200);
        }
      } catch (error) {
        console.error('Error starting act:', error);
        socket.emit('error', { message: 'Failed to start act' });
      }
    });

    // Director fires a one-shot stage cue (thunder, lightning, rain, gate light).
    socket.on('showCue', async (data: ShowCueData) => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only the Director can trigger cues' });
          return;
        }
        const cue = data?.cue;
        if (!cue || !VALID_CUES.includes(cue)) {
          socket.emit('notice', { message: 'Unknown cue.' });
          return;
        }
        io.to('lobby').emit('showCue', { cue });
        console.log(`⚡ Director ${user.name} fired cue "${cue}"`);
      } catch (error) {
        console.error('Error firing show cue:', error);
        socket.emit('error', { message: 'Failed to fire cue' });
      }
    });

    socket.on('cueEngine:startBeat', async (data: CueEngineBeatData) => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only the Director can start beats' });
          return;
        }
        const beatId = data?.beatId;
        if (!beatId || !VALID_BEAT_IDS.includes(beatId)) {
          socket.emit('notice', { message: 'Unknown beat.' });
          return;
        }
        const payload = {
          beatId,
          startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
          momentId: data.momentId,
          force: !!data.force,
        };
        io.to('lobby').emit('cueEngine:beatStart', payload);
        console.log(`🎬 Director ${user.name} started beat "${beatId}"`);
      } catch (error) {
        console.error('Error starting beat:', error);
        socket.emit('error', { message: 'Failed to start beat' });
      }
    });

    socket.on('cueEngine:startMoment', async (data: CueEngineMomentData) => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only the Director can start moments' });
          return;
        }
        const momentId = data?.momentId;
        if (!momentId || !VALID_MOMENT_IDS.includes(momentId)) {
          socket.emit('notice', { message: 'Unknown moment.' });
          return;
        }
        const payload = {
          momentId,
          startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
          force: !!data.force,
        };
        io.to('lobby').emit('cueEngine:momentStart', payload);
        console.log(`🎭 Director ${user.name} started moment "${momentId}"`);
      } catch (error) {
        console.error('Error starting moment:', error);
        socket.emit('error', { message: 'Failed to start moment' });
      }
    });

    // Director → single target: private (per-participant) audience cue.
    // Relayed ONLY to the targeted socket so other clients never hear it.
    socket.on('audience:privateCue', async (data: PrivateCueData) => {
      try {
        const user = await User.findOne({ socketId: socket.id });
        if (!user || user.role !== 'Director') {
          socket.emit('error', { message: 'Only the Director can send private cues' });
          return;
        }
        const targetSocketId = data?.targetSocketId;
        if (!targetSocketId || !data?.payload) return;
        io.to(targetSocketId).emit('audience:privateCue', data.payload);
      } catch (error) {
        console.error('Error sending private cue:', error);
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

