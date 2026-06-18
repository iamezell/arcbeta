# ARC Audio Architecture

ARC uses two complementary audio paths. They share the same `AudioContext` (via
Three.js `AudioListener`) but must not be mixed for live WebRTC NPC speech.

## Live WebRTC NPC voice

**Module:** `src/audio/WebRTCVoicePipeline.ts`

OpenAI Realtime / WebRTC NPC dialogue is routed through a **manual Web Audio
graph**:

```
WebRTC track
  → MediaStreamTrackProcessor → MediaStreamTrackGenerator   (preferred)
  → MediaStreamAudioSourceNode
  → inputGain → distanceGain → PannerNode → destination
```

A hidden `<audio>` element may decode the stream with **`muted=true` always**.
It must never play to speakers directly — all heard output goes through the gain
and panner chain.

### Why not `createMediaStreamSource` on the raw WebRTC track?

In Chrome with OpenAI Realtime, the live track often yields **silence** in Web
Audio (analyser RMS ≈ 0) even when conversation is active. Distance gain appears
broken because the graph has no PCM.

### Why not `createMediaElementSource` as the primary path?

It can work, but rewiring or disconnecting the graph may restore **direct HTML
speaker output** in Chrome. Heard volume stays constant while distance/gain logs
change. Production uses the processor path instead; element tap is a last-resort
fallback only.

### Production spatial behavior (Mode C)

- **Panner** follows the NPC world position each frame (mouth offset ~1.55 m).
- **Distance gain** uses the theatrical `speech` preset in `spatialConfig.ts`.
- **Listener** syncs from the active camera.

Debug modes **A / B / C** remain in code for troubleshooting:

| Mode | Purpose |
|------|---------|
| A | Full volume, no distance attenuation (direct graph test) |
| B | Fixed panner at gate position |
| C | **Production** — NPC-synced panner |

## Static / buffered cues (SFX, ambience, thunder, wolves)

**Module:** `src/audio/AudioManager.ts`, `src/audio/emitters/`

Preloaded cue assets (Opus-first) use **THREE.PositionalAudio** where spatial
placement applies. Examples: thunder, wolf howls, rain loops, scripted NPC lines
played from buffers.

This path is unchanged by the WebRTC voice pipeline.

## Do not

- Route live WebRTC NPC voice through **THREE.PositionalAudio**
- Set the WebRTC decode `<audio>` element to **`muted=false`** in production
- Attach raw WebRTC tracks with **`createMediaStreamSource`** as the primary NPC
  voice path

## Debug tooling

Enabled when `import.meta.env.DEV` is true **or**
`VITE_ARC_AUDIO_DEBUG=true` is set at build time.

When enabled (Director client):

- Bottom-left **WebRTC Voice Test** panel (modes A / B / C)
- Console API: `arcVoice.help()`, `arcVoice.status()`, `arcVoice.proveGraph()`,
  etc.

Production builds without the debug flag omit the panel and `arcVoice.*`.

## Manual test (production behavior)

1. Hard refresh → **Enable Audio** → Act 1
2. NPC Director → **Guard 1 (AI)** → **Enable Conv**
3. At bus spawn: guard voice should be **quiet / distant**
4. Walk to gate (~z −74): voice should become **clear and loud**
5. Confirm no WebRTC Voice debug panel in a production build (`npm run build` +
   serve `public/` without `VITE_ARC_AUDIO_DEBUG`)

## Manual test (debug)

Same as above, plus:

- Panel shows **Mode C** by default
- `arcVoice.status()` → `mode: "C"`, `wireMethod: "processor"`, `rms > 0` while
  speaking
- Switch to Mode B to verify fixed gate panner; Mode A for full-volume baseline
