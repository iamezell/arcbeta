/**
 * "Lost in the Storm" show-level cue pack.
 *
 * Cue packs are DATA ONLY — they reference reusable files under
 * `public/audio/library/`. Never duplicate audio inside a cue pack; multiple
 * shows can point at the same shared library files.
 *
 * Library layout (see public/audio/library/README):
 *   world/    weather, animals, human, objects   (diegetic world sounds)
 *   cinematic/ drones, tension, mystery, stingers (score / underscore)
 *   private/  whispers, heartbeats, hallucinations (per-participant intimacy)
 *
 * To add a new show: copy this file, swap the file references, register it with
 * the CueEngine. To add a new private effect: drop a file under
 * public/audio/library/private/... and add it to the `private` block here.
 */

export interface CuePackEntry {
  /** Single file, or an array to pick a random variant from. */
  src: string | string[];
  /** Looping bed (rain, drone, heartbeat). */
  loop?: boolean;
  /** Base volume 0–1 (kept conservative; engine clamps a hard ceiling). */
  volume?: number;
}

export interface ShowCuePack {
  id: string;
  label: string;
  world: Record<string, CuePackEntry>;
  cinematic: Record<string, CuePackEntry>;
  private: Record<string, CuePackEntry>;
}

const LIB = '/audio/library';
/**
 * Existing shipped assets under public/audio/cue-packs/. We reference these
 * directly so the show is audibly real today. As bespoke library files are
 * added under public/audio/library/, swap the `src` here — nothing else changes.
 */
const PACK = '/audio/cue-packs';

export const lostInTheStormCuePack: ShowCuePack = {
  id: 'lostInTheStorm',
  label: 'Lost in the Storm',

  // World layer uses real shipped assets (weather + wolves).
  world: {
    rainLight: { src: `${PACK}/ambient/rain_light_ambient.opus`, loop: true, volume: 0.5 },
    windForest: { src: `${PACK}/ambient/animal_sounds_night_forest.opus`, loop: true, volume: 0.4 },
    thunderDistant: { src: `${PACK}/storms/thunder_far.opus`, volume: 0.7 },
    thunderClose: { src: `${PACK}/storms/thunder_close.opus`, volume: 0.9 },
    wolfHowls: { src: `${PACK}/wolves/wolf_howl_far.opus`, volume: 0.8 },
    wolfGrowl: { src: `${PACK}/wolves/growl.opus`, volume: 0.8 },
    // No shipped asset yet → library path (procedural placeholder until added).
    branchSnap: { src: `${LIB}/world/objects/branch_snap_01.mp3`, volume: 0.7 },
  },

  cinematic: {
    // Opening drone bed for Act 1 (plays on "Start Act 1", instant + assemble).
    // ▶ To use YOUR file: change the path below to the exact filename you dropped
    //   into public/audio/library/cinematic/drones/ (include the extension).
    act1Drone: { src: `${LIB}/cinematic/drones/Woods_in_the_Tempest_2026-06-22T180407.opus`, loop: true, volume: 0.35 },
    lowDread: { src: `${LIB}/cinematic/drones/low_dread_loop_60s.mp3`, loop: true, volume: 0.35 },
    risingTension: { src: `${LIB}/cinematic/tension/rising_tension_30s.mp3`, volume: 0.5 },
    mysteryBed: { src: `${LIB}/cinematic/mystery/mystery_bed_loop.mp3`, loop: true, volume: 0.3 },
    revealHit: { src: `${LIB}/cinematic/stingers/reveal_hit_03s.mp3`, volume: 0.7 },
    warmAmbience: { src: `${LIB}/cinematic/mystery/warm_safe_loop.mp3`, loop: true, volume: 0.3 },
  },

  private: {
    whispers: {
      src: [
        `${LIB}/private/whispers/dont_trust_him_01.mp3`,
        `${LIB}/private/whispers/behind_you_01.mp3`,
        `${LIB}/private/whispers/they_know_01.mp3`,
      ],
      volume: 0.55,
    },
    childLaugh: {
      src: [
        `${LIB}/private/hallucinations/child_laugh_far_01.mp3`,
        `${LIB}/private/hallucinations/child_laugh_far_02.mp3`,
      ],
      volume: 0.5,
    },
    heartbeat: { src: `${LIB}/private/heartbeats/heartbeat_loop.mp3`, loop: true, volume: 0.45 },
    breathing: { src: `${LIB}/private/heartbeats/breathing_loop.mp3`, loop: true, volume: 0.4 },
  },
};

/** Pick a (possibly random) concrete file from a cue pack entry. */
export function resolveCuePackSrc(entry: CuePackEntry): string {
  if (Array.isArray(entry.src)) {
    return entry.src[Math.floor(Math.random() * entry.src.length)];
  }
  return entry.src;
}
