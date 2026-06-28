import express, { Request, Response, Router } from 'express';
import { Server } from 'socket.io';
import { requireStreamDeckToken } from '../utils/streamDeckAuth';
import { getSession, emitApplyResult, SCENE_ROOM } from '../rooms/sessionManager';
import {
  VALID_CUES,
  ShowCue,
  VALID_SCENES,
  VALID_MODES,
  SceneId,
  TransitionMode,
  getShowState,
} from '../show/showState';
import { VALID_BEAT_IDS, VALID_MOMENT_IDS } from '../cueEngine/cueEngineIds';
import { getDirectorController } from '../npc/DirectorController';
import Room from '../models/Room';
import {
  AudienceTarget,
  getAudienceRoster,
  getAudienceTarget,
  resolveAudienceTarget,
  setAudienceTarget,
  describeTarget,
} from '../show/audienceTarget';
import { renderStreamDeckCheatSheet } from './streamDeckCheatSheet';
import { getNetworkInfo } from '../utils/networkInfo';
import { getShowCode } from '../show/session';
import User from '../models/User';
import * as QRCode from 'qrcode';

const router: Router = express.Router();

function getIo(req: Request): Server | undefined {
  return req.app.get('io') as Server | undefined;
}

/**
 * NPC director cues — keep in sync with backend/sockets/npcSocket.ts VALID_CUES.
 * Used to validate HTTP-triggered NPC actions before dispatch.
 */
const NPC_CUES = [
  'APPROACH', 'STOP', 'WATCH', 'QUESTION', 'WARN', 'REASSURE', 'DEFLECT',
  'OPEN_GATE', 'CALL_SHEPHERD', 'ESCALATE', 'END_SCENE',
  'ENABLE_CONVERSATION', 'DISABLE_CONVERSATION', 'TRANSFER_TO_HUMAN', 'TRANSFER_TO_AI',
] as const;

/**
 * Friendly Stream-Deck cue names → AudienceCueEngine cue IDs. Lets buttons use
 * short URLs (/director/audience/whisper) that the client engine understands.
 */
const AUDIENCE_CUE_ALIASES: Record<string, string> = {
  whisper: 'whisper.private',
  childlaugh: 'childLaugh.private',
  laugh: 'childLaugh.private',
  heartbeat: 'heartbeat.private',
  heartbeatstop: 'heartbeat.stop',
  wolfbehind: 'wolf.behind.private',
  reducefear: 'comfort.reduceFear',
  comfort: 'comfort.reduceFear',
  increasetension: 'dread.increase',
  dread: 'dread.increase',
  silence: 'silence.private',
};
const AUDIENCE_CUE_IDS = new Set(Object.values(AUDIENCE_CUE_ALIASES));

// =====================================================================
// Discovery (no token — read-only, handy while configuring Stream Deck)
// =====================================================================

router.get('/events', (_req: Request, res: Response) => {
  const room = getSession().getRoomDef();
  res.json({
    room: room.id,
    events: room.directorEvents.map((e) => ({ id: e.id, label: e.label })),
  });
});

router.get('/cues', (_req: Request, res: Response) => {
  res.json({ cues: VALID_CUES });
});

router.get('/audience', async (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  const roster = await getAudienceRoster(io);
  const target = getAudienceTarget();
  res.json({ target, targetLabel: describeTarget(target), audience: roster });
});

// LAN join info: the address a phone/headset can use to reach this server.
router.get('/network-info', (req: Request, res: Response) => {
  const showCode = getShowCode();
  const info = getNetworkInfo({ joinPath: '/join', showCode });
  res.json({ ...info, showCode });
});

// All connected participants (host/actors/audience) + audience slot numbers.
router.get('/participants', async (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  const connected = new Set(io.sockets.sockets.keys());
  const roster = await getAudienceRoster(io); // audience, with stable slots
  const slotBySocket = new Map(roster.map((m) => [m.socketId, m.slot]));

  const users = await User.find({ roomId: 'lobby' });
  const participants = users
    .filter((u) => connected.has(u.socketId))
    .map((u) => ({
      id: u.socketId,
      name: u.name,
      role: u.role,
      deviceType: u.deviceType || 'unknown',
      showCode: u.showCode || getShowCode(),
      inScene: u.inScene,
      joinedAt: u.joinedAt,
      slot: slotBySocket.get(u.socketId), // only audience get a slot
    }))
    .sort((a, b) => (a.slot ?? 99) - (b.slot ?? 99));

  res.json({ showCode: getShowCode(), participants });
});

// QR code as SVG for any URL.  /director/qr.svg?url=https://192.168.1.25/join
router.get('/qr.svg', async (req: Request, res: Response) => {
  const url = (req.query.url as string) || getNetworkInfo({ joinPath: '/join', showCode: getShowCode() }).joinUrl;
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 320 });
    res.type('svg').send(svg);
  } catch (err) {
    res.status(500).send('QR generation failed');
  }
});

/** Self-documenting HTML cheat-sheet of every Stream Deck URL (token pre-filled). */
router.get('/streamdeck', async (req: Request, res: Response) => {
  const io = getIo(req);
  const roster = io ? await getAudienceRoster(io) : [];
  const base = `${req.protocol}://${req.get('host')}`;
  const token = process.env.STREAM_DECK_TOKEN || '';
  const showCode = getShowCode();
  const net = getNetworkInfo({ joinPath: '/join', showCode });
  res.type('html').send(
    renderStreamDeckCheatSheet({ base, token, roster, joinUrl: net.joinUrl, joinScreenUrl: net.joinUrl.replace('/join', '/join-screen').replace(/\?show=.*$/, ''), showCode })
  );
});

// =====================================================================
// Show flow
// =====================================================================

// Activate the level (admit waiting players into the experience).
router.all('/activate', requireStreamDeckToken, async (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  let room = await Room.findOne({ roomId: 'lobby' });
  if (!room) room = new Room({ roomId: 'lobby', users: [], isActive: false });
  room.isActive = true;
  room.activatedAt = new Date();
  await room.save();
  io.to('lobby').emit('startExperience');
  console.log('🎬 Stream Deck activated the level');
  res.json({ ok: true });
});

// Start an act / scene.  /director/act/ACT_1_STORM_ROAD?mode=instant
router.all(['/act', '/act/:sceneId'], requireStreamDeckToken, (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  const sceneId = (req.params.sceneId || req.query.sceneId || req.body?.sceneId) as SceneId | undefined;
  if (!sceneId || !VALID_SCENES.includes(sceneId)) {
    return res.status(404).json({ error: `Unknown scene: ${sceneId}` });
  }
  const rawMode = (req.query.mode || req.body?.mode) as TransitionMode | undefined;
  const mode: TransitionMode = rawMode && VALID_MODES.includes(rawMode) ? rawMode : 'instant';
  const payload = getShowState().startScene(sceneId, mode);
  io.to('lobby').emit('sceneTransition', payload);
  console.log(`🎭 Stream Deck started ${sceneId} (${mode})`);

  // Auto-open live voice for on-stage AI NPCs once the scene has settled.
  if (sceneId === 'ACT_1_STORM_ROAD') {
    setTimeout(() => getDirectorController().enableOnStageAIVoices(), 1200);
  }

  res.json({ ok: true, sceneId, mode });
});

// Start a cue-engine beat.  /director/beat/act1_storm_builds
router.all(['/beat', '/beat/:beatId'], requireStreamDeckToken, (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  const beatId = (req.params.beatId || req.query.beatId || req.body?.beatId) as string | undefined;
  if (!beatId || !VALID_BEAT_IDS.includes(beatId)) {
    return res.status(404).json({ error: `Unknown beat: ${beatId}` });
  }
  io.to('lobby').emit('cueEngine:beatStart', { beatId, startedAt: Date.now(), force: true });
  console.log(`🎬 Stream Deck started beat "${beatId}"`);
  res.json({ ok: true, beatId });
});

// Start a cue-engine moment.  /director/moment/act1_full_arrival
router.all(['/moment', '/moment/:momentId'], requireStreamDeckToken, (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  const momentId = (req.params.momentId || req.query.momentId || req.body?.momentId) as string | undefined;
  if (!momentId || !VALID_MOMENT_IDS.includes(momentId)) {
    return res.status(404).json({ error: `Unknown moment: ${momentId}` });
  }
  io.to('lobby').emit('cueEngine:momentStart', { momentId, startedAt: Date.now(), force: true });
  console.log(`🎭 Stream Deck started moment "${momentId}"`);
  res.json({ ok: true, momentId });
});

// =====================================================================
// Escape-room scripted events (legacy headless director events)
// =====================================================================

router.all(['/event', '/event/:eventId'], requireStreamDeckToken, (req: Request, res: Response) => {
  const eventId = (req.params.eventId || req.body?.eventId || req.query?.eventId) as string | undefined;
  if (!eventId) return res.status(400).json({ error: 'Missing eventId' });

  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });

  const result = getSession().applyDirectorEvent(eventId);
  if (!result.ok) return res.status(404).json({ error: result.notice || 'Unknown event' });

  emitApplyResult(io, result, null);
  console.log(`🎬 Stream Deck triggered director event "${eventId}"`);
  res.json({ ok: true, eventId, changes: result.changes, complete: result.complete });
});

// =====================================================================
// Stage / storm / visual cues  (/director/cue/stormStart)
// =====================================================================

router.all(['/cue', '/cue/:cueId'], requireStreamDeckToken, (req: Request, res: Response) => {
  const cueId = (req.params.cueId || req.body?.cue || req.query?.cue) as string | undefined;
  if (!cueId) return res.status(400).json({ error: 'Missing cue id' });
  if (!VALID_CUES.includes(cueId as ShowCue)) {
    return res.status(404).json({ error: `Unknown cue: ${cueId}` });
  }
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  io.to(SCENE_ROOM).emit('showCue', { cue: cueId });
  console.log(`🎬 Stream Deck fired show cue "${cueId}"`);
  res.json({ ok: true, cue: cueId });
});

// =====================================================================
// NPC cues  (/director/npc/guard1/OPEN_GATE)
// =====================================================================

router.all(['/npc/:npcId/:cue'], requireStreamDeckToken, (req: Request, res: Response) => {
  const npcId = req.params.npcId;
  const cue = req.params.cue;
  if (!NPC_CUES.includes(cue as (typeof NPC_CUES)[number])) {
    return res.status(404).json({ error: `Unknown NPC cue: ${cue}` });
  }
  const result = getDirectorController().executeCue(npcId, cue as never);
  if (!result.ok) return res.status(400).json({ error: result.error || 'NPC cue failed' });
  console.log(`🎭 Stream Deck NPC cue ${npcId} → ${cue}`);
  res.json({ ok: true, npcId, cue });
});

// =====================================================================
// Audience targeting + private cues
// =====================================================================

// Select the current private-cue target.
//   /director/target/everyone | /target/audience | /target/random
//   /director/target/slot/1   | /target/name/John | /target/id/<socketId>
router.all(
  ['/target/:type', '/target/:type/:value'],
  requireStreamDeckToken,
  (req: Request, res: Response) => {
    const type = req.params.type as AudienceTarget['type'];
    const value = req.params.value || (req.query.value as string | undefined);
    const valid: AudienceTarget['type'][] = ['everyone', 'audience', 'random', 'slot', 'name', 'id'];
    if (!valid.includes(type)) {
      return res.status(404).json({ error: `Unknown target type: ${type}` });
    }
    const target = setAudienceTarget({ type, value });
    console.log(`🎯 Stream Deck target → ${describeTarget(target)}`);
    res.json({ ok: true, target, targetLabel: describeTarget(target) });
  }
);

// Fire a private audience cue at the CURRENT target.
//   /director/audience/whisper | /audience/heartbeat | /audience/silence ...
router.all(['/audience/cue/:cueId'], requireStreamDeckToken, async (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });

  const raw = req.params.cueId.toLowerCase();
  const cueId = AUDIENCE_CUE_ALIASES[raw] || req.params.cueId;
  if (!AUDIENCE_CUE_IDS.has(cueId)) {
    return res.status(404).json({ error: `Unknown audience cue: ${req.params.cueId}` });
  }

  const target = getAudienceTarget();
  const { socketIds, description } = await resolveAudienceTarget(io, target);
  for (const socketId of socketIds) {
    io.to(socketId).emit('audience:privateCue', { cueId, participantId: socketId });
  }
  console.log(`🔊 Stream Deck audience cue "${cueId}" → ${description} (${socketIds.length} client[s])`);
  res.json({ ok: true, cueId, target: description, delivered: socketIds.length });
});

// SAFETY: global Calm / Reset — stop every private scary cue for everyone.
router.all('/calm', requireStreamDeckToken, (req: Request, res: Response) => {
  const io = getIo(req);
  if (!io) return res.status(500).json({ error: 'Server is not ready' });
  io.to('lobby').emit('audience:calmReset', {});
  console.log('🟢 Stream Deck Calm / Reset broadcast');
  res.json({ ok: true });
});

export default router;
