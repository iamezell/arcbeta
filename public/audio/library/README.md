# ARC shared audio library

Reusable audio files referenced by **cue packs** (e.g.
`src/audio/cuePacks/lostInTheStorm.ts`). Cue packs hold only *paths* — never
duplicate audio files inside a cue pack. Multiple shows can point at the same
files here.

## Layout

```
world/
  weather/   rain, wind, thunder
  animals/   wolves, creatures
  human/     footsteps, voices, crowd
  objects/   doors, props, branch snaps
cinematic/
  drones/    long sustained dread beds
  tension/   rising tension swells
  mystery/   curious / safe ambiences
  stingers/  short reveal hits
private/
  whispers/      intimate per-participant voice lines
  heartbeats/    heartbeat / breathing loops
  hallucinations/ child laughs, distant impossible sounds
```

## Format

Drop `.mp3` files matching the paths referenced in the cue pack. If a file is
missing in development, `AudioManager` synthesizes a procedural placeholder so
cue routing can still be auditioned (you'll see a console warning).

## Safety

`private/` cues are intimate immersive-theater effects. Keep levels modest —
`AudioManager` enforces a conservative private-volume ceiling, and the Director
can Calm/Reset or Silence any participant instantly.
