import { CueDefinition } from './types';

/** Shared library folder names (public/audio/cue-packs/<name>/). */
export const LIB = {
  ambient: 'ambient',
  storms: 'storms',
  wolves: 'wolves',
  footsteps: 'footsteps',
  doors: 'doors',
  crowds: 'crowds',
  church: 'church',
  ui: 'ui',
  creatures: 'creatures',
  voices: 'voices',
  props: 'props',
  forest: 'forest',
} as const;

/**
 * Master cue registry. Keys are the ONLY strings gameplay / director code should use.
 * World sounds default to positional unless `global: true`.
 */
export const CUE_REGISTRY: Record<string, CueDefinition> = {
  // ----- variant groups (resolve to positional children) -----
  thunder: { variants: ['thunder_far', 'thunder_close', 'thunder_crack'], group: 'sfx', scope: 'global' },
  wolf_howl: { variants: ['wolf_howl_far', 'wolf_howl_close'], group: 'sfx', spatialPreset: 'creature', scope: 'area' },
  footstep: { variants: ['footstep_grass', 'footstep_wood', 'footstep_gravel'], group: 'sfx', spatialPreset: 'sfx', scope: 'player' },

  // ----- storms -----
  thunder_far: { library: LIB.storms, asset: 'thunder_far', spatialPreset: 'sfx', group: 'sfx', volume: 0.75, maxInstances: 2, global: false },
  thunder_close: { library: LIB.storms, asset: 'thunder_close', spatialPreset: 'sfx', group: 'sfx', volume: 0.95, maxInstances: 2, global: false },
  thunder_crack: { library: LIB.storms, asset: 'thunder_crack', spatialPreset: 'sfx', group: 'sfx', volume: 1, maxInstances: 1, global: false },
  rain_light: { library: LIB.storms, asset: 'rain_light', loop: true, group: 'ambience', volume: 0.55, global: true },
  rain_heavy: { library: LIB.storms, asset: 'rain_heavy', loop: true, group: 'ambience', volume: 0.75, global: true },
  wind_light: { library: LIB.storms, asset: 'wind_light', loop: true, group: 'ambience', volume: 0.4, global: true },
  wind_heavy: { library: LIB.storms, asset: 'wind_heavy', loop: true, group: 'ambience', volume: 0.55, global: true },

  // ----- wolves -----
  wolf_howl_far: { library: LIB.wolves, asset: 'wolf_howl_far', spatialPreset: 'creature', group: 'sfx', volume: 0.8, pitchVariation: [0.92, 1.08], global: false },
  wolf_howl_close: { library: LIB.wolves, asset: 'wolf_howl_close', spatialPreset: 'creature', group: 'sfx', volume: 0.9, pitchVariation: [0.95, 1.05], global: false },
  wolf_pack: { library: LIB.wolves, asset: 'wolf_pack', spatialPreset: 'creature', group: 'sfx', volume: 0.85, maxInstances: 1, global: false },
  growl: { library: LIB.wolves, asset: 'growl', spatialPreset: 'creature', group: 'sfx', volume: 0.8, global: false },

  // ----- footsteps (world positional) -----
  footstep_grass: { library: LIB.footsteps, asset: 'grass', spatialPreset: 'sfx', group: 'sfx', volume: 0.5, maxInstances: 4, global: false },
  footstep_wood: { library: LIB.footsteps, asset: 'wood', spatialPreset: 'sfx', group: 'sfx', volume: 0.55, maxInstances: 4, global: false },
  footstep_gravel: { library: LIB.footsteps, asset: 'gravel', spatialPreset: 'sfx', group: 'sfx', volume: 0.6, maxInstances: 4, global: false },

  // ----- doors (world positional) -----
  door_open: { library: LIB.doors, asset: 'open', spatialPreset: 'sfx', group: 'sfx', volume: 0.85, global: false },
  door_close: { library: LIB.doors, asset: 'close', spatialPreset: 'sfx', group: 'sfx', volume: 0.85, global: false },
  door_slam: { library: LIB.doors, asset: 'slam', spatialPreset: 'sfx', group: 'sfx', volume: 0.9, global: false },
  door_rattle: { library: LIB.doors, asset: 'slam', spatialPreset: 'sfx', group: 'sfx', volume: 0.5, pitchVariation: [1.1, 1.3], global: false },
  door_creak: { library: LIB.doors, asset: 'close', spatialPreset: 'sfx', group: 'sfx', volume: 0.6, pitchVariation: [0.7, 0.85], global: false },

  // ----- crowds -----
  crowd_whisper: { library: LIB.crowds, asset: 'whisper', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.35, global: false },
  crowd_panic: { library: LIB.crowds, asset: 'panic', spatialPreset: 'sfx', group: 'sfx', volume: 0.7, global: false },
  crowd_chanting: { library: LIB.crowds, asset: 'chanting', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.4, global: false },

  // ----- church (positional in world) -----
  church_bell: { library: LIB.church, asset: 'bell', spatialPreset: 'sfx', group: 'sfx', volume: 0.85, scope: 'area', global: false },
  church_choir: { library: LIB.church, asset: 'choir', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.45, global: false },

  // ----- ui (global only) -----
  cue_activate: { library: LIB.ui, asset: 'cue_activate', group: 'ui', volume: 0.7, global: true },
  ui_button: { library: LIB.ui, asset: 'button', group: 'ui', volume: 0.6, global: true },
  sfx_click: { library: LIB.ui, asset: 'button', group: 'ui', volume: 0.65, global: true },
  clue_chime: { library: LIB.ui, asset: 'cue_activate', group: 'ui', volume: 0.75, pitchVariation: [1, 1.15], global: true },

  // ----- creatures -----
  scream: { library: LIB.creatures, asset: 'scream', spatialPreset: 'creature', group: 'sfx', volume: 0.7, maxInstances: 1, global: false },
  monster_roar: { library: LIB.creatures, asset: 'monster_roar', spatialPreset: 'creature', group: 'sfx', volume: 0.9, maxInstances: 1, global: false },
  branch_snap: { library: LIB.forest, asset: 'branch_snap', spatialPreset: 'creature', group: 'sfx', volume: 0.75, global: false },

  // ----- voices (global narration) -----
  narrator: { library: LIB.voices, asset: 'narrator', group: 'voice', volume: 1, global: true },
  narration_intro: { library: LIB.voices, asset: 'narrator', group: 'voice', volume: 1, global: true },

  // ----- environmental loops (positional when placed in world) -----
  forest_ambience: { library: LIB.forest, asset: 'ambience', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.4, global: false },
  lab_hum: { library: LIB.props, asset: 'lab_hum', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.35, global: false },

  // ----- escape-room props (world positional at interact point) -----
  desk_search: { library: LIB.props, asset: 'desk_search', spatialPreset: 'sfx', group: 'sfx', volume: 0.7, global: false },
  drawer_unlock: { library: LIB.ui, asset: 'button', spatialPreset: 'sfx', group: 'sfx', volume: 0.8, pitchVariation: [0.9, 1], global: false },
  drawer_open: { library: LIB.doors, asset: 'open', spatialPreset: 'sfx', group: 'sfx', volume: 0.7, pitchVariation: [0.85, 0.95], global: false },
  paper_rustle: { library: LIB.crowds, asset: 'whisper', spatialPreset: 'sfx', group: 'sfx', volume: 0.4, pitchVariation: [1.2, 1.5], global: false },
  keypad_solved: { library: LIB.ui, asset: 'cue_activate', spatialPreset: 'sfx', group: 'sfx', volume: 0.85, pitchVariation: [1, 1.2], global: false },
  keypad_error: { library: LIB.ui, asset: 'button', spatialPreset: 'sfx', group: 'sfx', volume: 0.7, pitchVariation: [0.6, 0.75], global: false },
  keypad_power_on: { library: LIB.ui, asset: 'cue_activate', spatialPreset: 'sfx', group: 'sfx', volume: 0.6, global: false },
  keypad_hum: { library: LIB.props, asset: 'lab_hum', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.2, global: false },
  safe_open: { library: LIB.doors, asset: 'open', spatialPreset: 'sfx', group: 'sfx', volume: 0.8, pitchVariation: [0.7, 0.8], global: false },
  safe_rattle: { library: LIB.doors, asset: 'slam', spatialPreset: 'sfx', group: 'sfx', volume: 0.35, pitchVariation: [1.2, 1.4], global: false },
  shelf_search: { library: LIB.props, asset: 'desk_search', spatialPreset: 'sfx', group: 'sfx', volume: 0.65, global: false },
  light_switch: { library: LIB.ui, asset: 'button', spatialPreset: 'sfx', group: 'sfx', volume: 0.75, global: false },
  outro_sting: { library: LIB.ui, asset: 'cue_activate', group: 'music', volume: 0.9, pitchVariation: [0.8, 0.9], global: true },
  ambient_office_loop: { library: LIB.props, asset: 'lab_hum', loop: true, spatialPreset: 'ambience_local', group: 'ambience', volume: 0.3, global: false },
  thunder_clap: { library: LIB.storms, asset: 'thunder_close', spatialPreset: 'sfx', group: 'sfx', volume: 0.95, global: false },
};

export function getLoadedLibraries(): string[] {
  const libs = new Set<string>();
  for (const def of Object.values(CUE_REGISTRY)) {
    if (def.library) libs.add(def.library);
  }
  return [...libs].sort();
}
