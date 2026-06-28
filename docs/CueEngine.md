# ARC Cue Engine

The Cue Engine orchestrates **atomic cues**, **timed beats**, and **story moments** for theatrical pacing. It sits above existing systems (`AudioManager`, `ShowController`, `CueManager`) without replacing them.

## Three levels

| Level | Description | Example |
|-------|-------------|---------|
| **Cue** | One atomic action | Play wolf howl at left woods, flash lightning, guard `QUESTION` |
| **Beat** | Timed sequence of cues | 0s storm beds → 3s wolf left → 6s wolf right → 8s guard line |
| **Moment** | Ordered beats | Act 1 Full Arrival = Storm Builds → Wolves → Guard → Gate → Commune |

## Architecture

```
Director UI / Stream Deck
        │
        ▼
   CueEngine (beat runner + one-time state)
        │
        ├── cueActionRegistry → AudioManager / ShowController / CueManager
        │
        └── socket cueEngine:beatStart | momentStart → all clients
```

Definitions live in `src/cueEngine/definitions/`. Server validates beat/moment IDs in `backend/cueEngine/cueEngineIds.ts`.

## Cue action types

| Type | Purpose |
|------|---------|
| `audio_global` | Registry cue, non-positional |
| `audio_positional` | Registry cue at `{x,y,z}` or offset preset |
| `storm_cue` | `LostInTheStormCues` staging helper |
| `visual_cue` | Legacy show cue (lightning, rainUp, gateLight, blackout) |
| `environment` | Rain/gate/blackout on show layer |
| `npc_cue` | Director NPC cue (server-authoritative) |
| `dialogue` | Scripted subtitle line via NPC actor |

Register new types in `src/cueEngine/cueActionRegistry.ts`.

---

## How to add a new cue action type

1. Add the type to `CueActionType` and a discriminated interface in `src/cueEngine/types.ts`.
2. Register a handler in `registerDefaultCueActions()` in `cueActionRegistry.ts`.
3. Use the new action in beat definitions.

---

## How to add a new beat

1. Open `src/cueEngine/definitions/act1Moments.ts` (or add a new definitions file).
2. Add a `BeatDefinition`:

```typescript
act1_my_beat: {
  id: 'act1_my_beat',
  label: 'My Beat',
  oneTime: true,       // optional — prevents replay
  duration: 8,         // optional — runner completion hint (seconds)
  cues: [
    { at: 0, action: { type: 'storm_cue', cue: 'stormStart' } },
    { at: 2, action: { type: 'visual_cue', cue: 'lightning' } },
    { at: 4, action: {
        type: 'audio_positional',
        cue: 'wolf_howl_far',
        offset: 'wolf_left',
      }},
  ],
},
```

3. Add the beat id to `backend/cueEngine/cueEngineIds.ts` → `VALID_BEAT_IDS`.
4. The Stage Director panel lists beats automatically from definitions.

**Beat runner controls:** Pause / Resume / Stop (Director panel transport row).

**Replay:** One-time beats log a warning on second start. Call `cueEngine.resetProgress('beats')` in dev to clear.

---

## How to add a new moment

1. In the same definitions file, add a `MomentDefinition`:

```typescript
my_moment: {
  id: 'my_moment',
  label: 'My Moment',
  oneTime: true,
  beats: ['act1_storm_builds', 'act1_wolves_closing'],
},
```

2. Add the moment id to `VALID_MOMENT_IDS` on the server.
3. Director clicks the moment button → server broadcasts → all clients run beats in order.

---

## Act 1 example sequence

| Beat | Content |
|------|---------|
| **Storm Builds** | Storm beds, rain up, distant thunder, lightning |
| **Wolves Closing In** | Left/right howls, branch snap, wolf behind, growl |
| **Guard Appears** | Gate lamps, lightning, guard WATCH/QUESTION + line |
| **Gate Opens** | OPEN_GATE, gate light, church bell, door_open at gate |
| **Enter the Commune** | REASSURE, storm stop, rain down, usher line |

Full moment: **Act 1 — Full Arrival** chains all five beats.

---

## Emergency overrides

Manual one-shots remain on the Director panel (not part of beat state):

- Thunder, Lightning, Blackout, Scream, Wolf Howl, Gate Open
- Storm audio buttons (hotkeys 1–0)
- Visual quick cues (lightning, rain up, gate light)

These map to `EMERGENCY_CUE_ACTIONS` / `STORM_CUE_ACTIONS` and broadcast via legacy `showCue` / `npc:cue` where needed for multiplayer sync.

---

## Related docs

- [AudioArchitecture.md](./AudioArchitecture.md) — WebRTC voice vs static SFX
- `src/audio/cueRegistry/cues.ts` — sound asset registry (separate from cue engine actions)
