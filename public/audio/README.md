# ARC Audio — shared cue libraries

ARC audio is **cue-name driven**. Gameplay, director tools, and Stream Deck never
reference file paths or extensions.

## Format

- **Primary:** `.opus` (Ogg Opus)
- **Fallback:** `.mp3` (when the browser cannot decode Opus)

The client loader tries Opus first automatically.

## Folder layout

```
public/audio/cue-packs/
  storms/       thunder_far.opus, rain_light.opus, …
  wolves/       wolf_howl_far.opus, growl.opus, …
  footsteps/    grass.opus, wood.opus, gravel.opus
  doors/        open.opus, close.opus, slam.opus
  crowds/       whisper.opus, panic.opus, chanting.opus
  church/       bell.opus, choir.opus
  ui/           cue_activate.opus, button.opus
  creatures/    scream.opus, monster_roar.opus
  voices/       narrator.opus
  forest/       branch_snap.opus, ambience.opus
  props/        scene-specific props (escape room, lab, etc.)
```

## Registering cues

Add entries in `src/audio/cueRegistry/cues.ts`:

```typescript
my_new_cue: { library: 'storms', asset: 'thunder_far', spatial: true, group: 'sfx' },
```

Variant groups pick randomly with pitch/volume variation:

```typescript
thunder: { variants: ['thunder_far', 'thunder_close', 'thunder_crack'] },
```

## Playback (code)

```typescript
audio.playCue('door_creak');
audio.triggerCue('thunder');          // director / Stream Deck
audio.playLoop('rain_light', { layer: 'weather' });
audio.fadeTo('rain_heavy', { layer: 'weather' });
audio.playPositional('church_bell', position);
```

## Stream Deck

```bash
curl -X POST http://localhost:8080/director/cue/stormStart -H "X-Admit-Token: TOKEN"
curl http://localhost:8080/director/cues   # list cue ids
```

## Debug

Directors: press **\`** (backtick) in-scene for the audio debug panel.

Missing files play **procedural placeholders** during development.
