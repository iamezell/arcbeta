# ARC Personalized Audience Cue System

Lets the director/host give each audience member a **unique-but-shared**
experience: target cues at everyone, a person, a group, a random member, or a
world position. Layered on top of the existing `AudioManager` and the timed
beat/moment engine (`src/cueEngine/`) — neither is modified destructively.

## Modules

| Module | Role |
|--------|------|
| `src/audience/AudienceRegistry.ts` | Tracks participants + resolves `CueTarget`s |
| `src/audience/AudienceCueEngine.ts` | `triggerCue()` + private helper methods |
| `src/audience/AudiencePanel.ts` | Director "Audience" panel (per-person buttons) |
| `src/audience/types.ts` | `Participant`, `CueTarget`, affect fields |
| `src/audio/cuePacks/lostInTheStorm.ts` | Data-only cue pack → `public/audio/library/` |
| `AudioManager` (extended) | `playGlobal*`, `playPositional*`, `playPrivate*` |

## Targeting

```ts
type CueTarget =
  | { type: 'everyone' }
  | { type: 'audienceOnly' }
  | { type: 'actorsOnly' }
  | { type: 'specificParticipant'; participantId: string }
  | { type: 'randomAudienceMember' }
  | { type: 'group'; participantIds: string[] }
  | { type: 'worldPosition'; position: THREE.Vector3 };
```

## Triggering cues

```ts
engine.triggerCue({
  cueId: 'whisper.private',
  target: { type: 'specificParticipant', participantId: 'mock-1' },
  intensity: 0.6,        // optional 0–1
  metadata: { line: 'behind you' }, // optional
});
```

Example cue IDs: `storm.start`, `storm.stop`, `thunder.distant`, `thunder.close`,
`wolf.left|right|behind|circle`, `whisper.private`, `childLaugh.private`,
`heartbeat.private`, `silence.private`, `comfort.reduceFear`, `dread.increase`,
`wolf.behind.private`.

### Private helper methods (used by the panel)

```ts
engine.triggerPrivateWhisper(id);
engine.triggerPrivateHeartbeat(id);   engine.stopPrivateHeartbeat(id);
engine.triggerPrivateChildLaugh(id);
engine.triggerWolfBehindParticipant(id);
engine.reduceFearForParticipant(id);
engine.increaseTensionForParticipant(id);
engine.silenceParticipant(id);        // SAFETY: stop all private for one person
engine.calmReset();                   // SAFETY: stop all private everywhere
```

## How private routing works

1. Director clicks a private button for a participant.
2. `AudienceCueEngine` resolves the target and, per participant, checks
   `registry.shouldPlayLocally(participant)`:
   - **local player or dev-mock** → play in this browser (audition/preview).
   - **remote participant** → `socketClient.sendPrivateCue(socketId, payload)`.
3. Server (`audience:privateCue`) relays **only** to that socket
   (`io.to(socketId).emit(...)`).
4. The target client runs `engine.handleRemotePrivateCue(payload)` → plays locally.

So a private cue is only ever heard by the intended person. In single-browser
dev, mock members preview on the director's machine so the slice is testable.

## Safety / consent guardrails

- Voluntary immersive theater only.
- `AudioManager.MAX_PRIVATE_VOLUME` (0.8) caps every private cue.
- Per-person **Silence For Them** button + global **Calm / Reset**.
- Departing participants are auto-silenced (`stopAllPrivate`).
- Audio initializes only after a user gesture (existing Enable Audio flow).

## How to add a new cue type

1. Add the audio file under `public/audio/library/...` and reference it in a cue
   pack (`src/audio/cuePacks/lostInTheStorm.ts`). Never duplicate files in packs.
2. Add a `case 'your.cueId'` in `AudienceCueEngine.executeLocal()`, choosing
   global / positional / private playback.
3. Mark privacy: private cue IDs end in `.private` or start with `comfort.` /
   `dread.` (see `isPrivateCue`). Adjust that classifier if needed.
4. (Optional) add a typed helper + an `AudiencePanel` button.

## Vertical slice (works today)

1. Run dev (`npm run dev`) as **Director** → 3 mock audience members appear in
   the top-right **Audience** panel.
2. **Enable Audio** (user gesture) → Start Act 1.
3. Click **Whisper** on "John" → only that participant's channel plays (previewed
   locally in dev). Other members are unaffected.
4. **Heartbeat** starts a private loop; **Silence For Them** / **Calm / Reset**
   stop it instantly.

> Library audio files are placeholders until added; missing files synthesize a
> procedural tone so routing is audible during development.
