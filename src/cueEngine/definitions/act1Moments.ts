import { CueEngineDefinitions, CueAction } from './types';

/**
 * Act 1 theatrical beats and moments — data-driven authoring surface.
 * Add new entries here; register IDs on the server (backend/cueEngine/cueEngineIds.ts).
 */
export const ACT1_CUE_DEFINITIONS: CueEngineDefinitions = {
  beats: {
    act1_storm_builds: {
      id: 'act1_storm_builds',
      label: 'Storm Builds',
      description: 'Rain and wind beds rise; distant thunder and lightning.',
      oneTime: true,
      duration: 12,
      cues: [
        { at: 0, action: { type: 'storm_cue', cue: 'stormStart', label: 'Start storm beds' } },
        { at: 2, action: { type: 'environment', effect: 'rain_up', label: 'Rain intensifies' } },
        { at: 5, action: { type: 'storm_cue', cue: 'thunderDistant', label: 'Distant thunder' } },
        { at: 8, action: { type: 'visual_cue', cue: 'lightning', label: 'Lightning flash' } },
        { at: 8.2, action: { type: 'audio_global', cue: 'thunder_clap', label: 'Thunder clap' } },
      ],
    },

    act1_wolves_closing: {
      id: 'act1_wolves_closing',
      label: 'Wolves Closing In',
      description: 'Encircling wolf howls tighten around the bus.',
      oneTime: true,
      duration: 14,
      cues: [
        { at: 0, action: { type: 'storm_cue', cue: 'wolfLeft', label: 'Wolf left woods' } },
        { at: 3, action: { type: 'storm_cue', cue: 'wolfRight', label: 'Wolf right woods' } },
        { at: 6, action: { type: 'storm_cue', cue: 'branchSnap', label: 'Branch snap' } },
        { at: 9, action: { type: 'storm_cue', cue: 'wolfBehind', label: 'Wolf behind players' } },
        { at: 12, action: { type: 'audio_positional', cue: 'growl', offset: 'wolf_left', label: 'Low growl' } },
      ],
    },

    act1_guard_appears: {
      id: 'act1_guard_appears',
      label: 'Guard Appears',
      description: 'Gate lamps ignite; guard challenges the travellers.',
      oneTime: true,
      duration: 10,
      cues: [
        { at: 0, action: { type: 'environment', effect: 'gate_light', label: 'Gate lamps on' } },
        { at: 1, action: { type: 'visual_cue', cue: 'lightning', label: 'Lightning' } },
        { at: 2, action: { type: 'npc_cue', npcId: 'guard1', cue: 'WATCH', label: 'Guard watches' } },
        { at: 4, action: { type: 'npc_cue', npcId: 'guard1', cue: 'QUESTION', label: 'Guard questions' } },
        { at: 6, action: {
          type: 'dialogue',
          npcId: 'guard1',
          line: 'Stay back from the gate. Who are you?',
          label: 'Guard line',
        }},
      ],
    },

    act1_gate_opens: {
      id: 'act1_gate_opens',
      label: 'Gate Opens',
      description: 'Guard signals entry; bell tolls from the commune.',
      oneTime: true,
      duration: 12,
      cues: [
        { at: 0, action: { type: 'npc_cue', npcId: 'guard1', cue: 'OPEN_GATE', label: 'Open gate cue' } },
        { at: 1, action: { type: 'environment', effect: 'gate_light', label: 'Gate brightens' } },
        { at: 3, action: { type: 'storm_cue', cue: 'churchBell', label: 'Church bell' } },
        { at: 6, action: { type: 'audio_positional', cue: 'door_open', offset: 'gate', label: 'Gate door' } },
      ],
    },

    act1_enter_commune: {
      id: 'act1_enter_commune',
      label: 'Enter the Commune',
      description: 'Storm eases as travellers pass the threshold.',
      oneTime: true,
      duration: 10,
      cues: [
        { at: 0, action: { type: 'npc_cue', npcId: 'guard1', cue: 'REASSURE', label: 'Guard reassures' } },
        { at: 2, action: { type: 'storm_cue', cue: 'stormStop', label: 'Storm fades' } },
        { at: 4, action: { type: 'environment', effect: 'rain_down', label: 'Rain eases' } },
        { at: 6, action: {
          type: 'dialogue',
          npcId: 'guard1',
          line: 'Move quickly. The Shepherd will see you inside.',
          label: 'Guard ushers in',
        }},
      ],
    },
  },

  moments: {
    act1_full_arrival: {
      id: 'act1_full_arrival',
      label: 'Act 1 — Full Arrival',
      description: 'Complete Act 1 theatrical sequence from storm to commune entry.',
      oneTime: true,
      beats: [
        'act1_storm_builds',
        'act1_wolves_closing',
        'act1_guard_appears',
        'act1_gate_opens',
        'act1_enter_commune',
      ],
    },
  },
};

/** Emergency one-shot overrides — mapped to existing director buttons. */
export const EMERGENCY_CUE_ACTIONS: { id: string; label: string; action: CueAction }[] = [
  { id: 'emergency_thunder', label: 'Thunder', action: { type: 'visual_cue', cue: 'thunder' } },
  { id: 'emergency_lightning', label: 'Lightning', action: { type: 'visual_cue', cue: 'lightning' } },
  { id: 'emergency_blackout', label: 'Blackout', action: { type: 'visual_cue', cue: 'blackout' } },
  { id: 'emergency_scream', label: 'Scream', action: { type: 'storm_cue', cue: 'distantScream' } },
  { id: 'emergency_wolf', label: 'Wolf Howl', action: { type: 'storm_cue', cue: 'wolfLeft' } },
  { id: 'emergency_gate', label: 'Gate Open', action: { type: 'npc_cue', npcId: 'guard1', cue: 'OPEN_GATE' } },
];

/** Legacy storm audio buttons → cue engine actions. */
export const STORM_CUE_ACTIONS: { id: string; label: string; key?: string; action: CueAction }[] = [
  { id: 'stormStart', label: 'Start Storm', key: '1', action: { type: 'storm_cue', cue: 'stormStart' } },
  { id: 'stormStop', label: 'Stop Storm', key: '2', action: { type: 'storm_cue', cue: 'stormStop' } },
  { id: 'thunderDistant', label: 'Distant Thunder', key: '3', action: { type: 'storm_cue', cue: 'thunderDistant' } },
  { id: 'thunderClose', label: 'Close Thunder', key: '4', action: { type: 'storm_cue', cue: 'thunderClose' } },
  { id: 'wolfLeft', label: 'Wolf Left', key: '5', action: { type: 'storm_cue', cue: 'wolfLeft' } },
  { id: 'wolfRight', label: 'Wolf Right', key: '6', action: { type: 'storm_cue', cue: 'wolfRight' } },
  { id: 'wolfBehind', label: 'Wolf Behind', key: '7', action: { type: 'storm_cue', cue: 'wolfBehind' } },
  { id: 'werewolfCircle', label: 'Werewolf Circle', key: '8', action: { type: 'storm_cue', cue: 'werewolfCircle' } },
  { id: 'branchSnap', label: 'Branch Snap', key: '9', action: { type: 'storm_cue', cue: 'branchSnap' } },
  { id: 'distantScream', label: 'Distant Scream', key: '0', action: { type: 'storm_cue', cue: 'distantScream' } },
  { id: 'churchBell', label: 'Church Bell', action: { type: 'storm_cue', cue: 'churchBell' } },
];

export const ACT1_BEAT_IDS = Object.keys(ACT1_CUE_DEFINITIONS.beats);
export const ACT1_MOMENT_IDS = Object.keys(ACT1_CUE_DEFINITIONS.moments);
