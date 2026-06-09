import { RoomDef } from './types';

// ARC Escape Room 01 — "The Archivist's Office" (greybox).
//
// Puzzle dependency graph (physical, no moon logic, no inventory UI):
//
//   search DESK ──► flag:hasDrawerKey ──► unlock DRAWER ──► open DRAWER (hint: digits 4 & 7)
//   read WALL_CLUE ──► reveals year 1947 (the keypad code)
//   Director enableKeypad / startRoom ──► KEYPAD active
//   KEYPAD submitCode "1947" ──► SAFE unlocked
//   open SAFE ──► EXIT_DOOR unlocked
//   open EXIT_DOOR ──► experience complete
//
// Everything below is data. To build a new room, write another RoomDef.

const COLORS = {
  neutral: 0x9a9a9a,
  wood: 0x8a6d3b,
  metal: 0x9fb0c0,
  locked: 0xb35454,
  unlocked: 0x5fae5f,
  open: 0x9fd99f,
  inactive: 0x55606b,
  active: 0xd7c24a,
  solved: 0x5fae5f,
  clue: 0xd9cf9a,
  door: 0x7d6e5a,
};

export const ESCAPE_ROOM_01: RoomDef = {
  id: 'escape-01',
  name: "The Archivist's Office",
  ambientAudio: 'ambient_office_loop',

  // Static greybox shell: 12x12 room, 4 walls + ceiling.
  scenery: [
    { shape: 'box', size: { x: 12, y: 0.2, z: 12 }, position: { x: 0, y: 0, z: 0 }, color: 0x6e6e6e }, // floor accent
    { shape: 'box', size: { x: 12, y: 4, z: 0.3 }, position: { x: 0, y: 2, z: -6 }, color: COLORS.neutral }, // north wall
    { shape: 'box', size: { x: 12, y: 4, z: 0.3 }, position: { x: 0, y: 2, z: 6 }, color: COLORS.neutral }, // south wall
    { shape: 'box', size: { x: 0.3, y: 4, z: 12 }, position: { x: -6, y: 2, z: 0 }, color: COLORS.neutral }, // west wall
    { shape: 'box', size: { x: 0.3, y: 4, z: 12 }, position: { x: 6, y: 2, z: 0 }, color: COLORS.neutral }, // east wall
    { shape: 'box', size: { x: 12, y: 0.2, z: 12 }, position: { x: 0, y: 4, z: 0 }, color: 0x4a4a4a }, // ceiling
  ],

  objects: [
    {
      id: 'exit_door',
      name: 'Exit Door',
      description: 'The only way out. Heavy, with a deadbolt.',
      states: ['locked', 'unlocked', 'open'],
      initialState: 'locked',
      geometry: { shape: 'box', size: { x: 1.4, y: 2.6, z: 0.2 }, position: { x: 2.5, y: 1.3, z: -5.85 }, color: COLORS.door },
      colorByState: { locked: COLORS.locked, unlocked: COLORS.unlocked, open: COLORS.open },
      audioHooks: { ambient: 'door_creak' },
      interactions: [
        {
          action: 'open',
          label: 'Open the exit door',
          fromStates: ['unlocked'],
          onSuccess: {
            setState: 'open',
            audioCue: 'door_open',
            feedback: 'The exit door swings open. You made it out!',
            complete: true,
          },
        },
        {
          action: 'open',
          label: 'Try the exit door',
          fromStates: ['locked'],
          onSuccess: {}, // never satisfied; blocked message below
          requires: { flags: { __never__: true } },
          onBlocked: { feedback: 'The exit is deadbolted. You need to find another way.', audioCue: 'door_rattle' },
        },
      ],
    },

    {
      id: 'desk',
      name: 'Writing Desk',
      description: 'A cluttered wooden desk with a single drawer.',
      states: ['unopened', 'searched'],
      initialState: 'unopened',
      geometry: { shape: 'box', size: { x: 2, y: 1, z: 1 }, position: { x: 4, y: 0.5, z: -3.5 }, color: COLORS.wood },
      colorByState: { unopened: COLORS.wood, searched: COLORS.clue },
      interactions: [
        {
          action: 'search',
          label: 'Search the desk',
          fromStates: ['unopened'],
          oncePerSession: true,
          onSuccess: {
            setState: 'searched',
            setFlags: { hasDrawerKey: true },
            audioCue: 'desk_search',
            reveal:
              "Taped under the desk: a small brass key. A sticky note reads: \"The code is the year it all began — it's on the poster.\"",
            feedback: 'Someone found a small brass key in the desk.',
          },
        },
      ],
    },

    {
      id: 'drawer',
      name: 'Desk Drawer',
      description: 'A locked drawer in the writing desk.',
      states: ['locked', 'unlocked', 'open'],
      initialState: 'locked',
      geometry: { shape: 'box', size: { x: 1, y: 0.3, z: 0.6 }, position: { x: 4, y: 0.45, z: -2.95 }, color: COLORS.metal },
      colorByState: { locked: COLORS.locked, unlocked: COLORS.unlocked, open: COLORS.open },
      interactions: [
        {
          action: 'unlock',
          label: 'Unlock the drawer',
          fromStates: ['locked'],
          requires: { flags: { hasDrawerKey: true } },
          onSuccess: { setState: 'unlocked', audioCue: 'drawer_unlock', feedback: 'The drawer unlocks with a click.' },
          onBlocked: { feedback: 'The drawer is locked. You need a key.' },
        },
        {
          action: 'open',
          label: 'Open the drawer',
          fromStates: ['unlocked'],
          onSuccess: {
            setState: 'open',
            audioCue: 'drawer_open',
            reveal: 'Inside the drawer: a torn photograph. Two digits are circled in red — 4 and 7.',
          },
        },
      ],
    },

    {
      id: 'wall_clue',
      name: 'Framed Poster',
      description: 'A faded poster hanging on the wall.',
      states: ['default'],
      initialState: 'default',
      geometry: { shape: 'box', size: { x: 1.6, y: 1.2, z: 0.08 }, position: { x: -5.9, y: 2.2, z: -2 }, rotationY: Math.PI / 2, color: COLORS.clue },
      interactions: [
        {
          action: 'read',
          label: 'Read the poster',
          fromStates: ['default'],
          onSuccess: {
            audioCue: 'paper_rustle',
            reveal: 'The poster reads: "GRAND ARCHIVE — EST. 1947". The founding year is printed large across the top.',
          },
        },
      ],
    },

    {
      id: 'keypad',
      name: 'Wall Keypad',
      description: 'A numeric keypad wired into the wall beside the safe.',
      states: ['inactive', 'active', 'solved'],
      initialState: 'inactive',
      geometry: { shape: 'box', size: { x: 0.4, y: 0.6, z: 0.12 }, position: { x: -3, y: 1.3, z: -5.85 }, color: COLORS.inactive },
      colorByState: { inactive: COLORS.inactive, active: COLORS.active, solved: COLORS.solved },
      audioHooks: { ambient: 'keypad_hum' },
      interactions: [
        {
          action: 'submitCode',
          label: 'Enter a code',
          fromStates: ['active'],
          requires: { code: '1947' },
          onSuccess: {
            setState: 'solved',
            setStates: [{ objectId: 'safe', state: 'unlocked' }],
            audioCue: 'keypad_solved',
            feedback: 'The keypad flashes green. Something heavy unlocks across the room.',
          },
          onBlocked: { feedback: 'The keypad buzzes red. Wrong code.', audioCue: 'keypad_error' },
        },
        {
          action: 'submitCode',
          label: 'Use the keypad',
          fromStates: ['inactive'],
          requires: { flags: { __never__: true } },
          onSuccess: {},
          onBlocked: { feedback: 'The keypad is dark. It has no power yet.' },
        },
      ],
    },

    {
      id: 'safe',
      name: 'Floor Safe',
      description: 'A squat iron safe bolted to the floor.',
      states: ['locked', 'unlocked', 'open'],
      initialState: 'locked',
      geometry: { shape: 'box', size: { x: 1, y: 1, z: 1 }, position: { x: -4, y: 0.5, z: -4 }, color: COLORS.metal },
      colorByState: { locked: COLORS.locked, unlocked: COLORS.unlocked, open: COLORS.open },
      interactions: [
        {
          action: 'open',
          label: 'Open the safe',
          fromStates: ['unlocked'],
          onSuccess: {
            setState: 'open',
            setStates: [{ objectId: 'exit_door', state: 'unlocked' }],
            audioCue: 'safe_open',
            reveal: 'The safe swings open. Inside: a heavy iron key labelled EXIT.',
            feedback: 'The safe is open — and the exit door just unlocked!',
          },
        },
        {
          action: 'open',
          label: 'Try the safe',
          fromStates: ['locked'],
          requires: { flags: { __never__: true } },
          onSuccess: {},
          onBlocked: { feedback: 'The safe is locked. The keypad must be solved first.', audioCue: 'safe_rattle' },
        },
      ],
    },

    {
      id: 'shelf',
      name: 'Bookshelf',
      description: 'A tall shelf crammed with mouldy books.',
      states: ['unsearched', 'searched'],
      initialState: 'unsearched',
      geometry: { shape: 'box', size: { x: 1.6, y: 2.4, z: 0.5 }, position: { x: 5.7, y: 1.2, z: 2 }, color: COLORS.wood },
      colorByState: { unsearched: COLORS.wood, searched: COLORS.clue },
      interactions: [
        {
          action: 'search',
          label: 'Search the bookshelf',
          fromStates: ['unsearched'],
          oncePerSession: true,
          onSuccess: {
            setState: 'searched',
            audioCue: 'shelf_search',
            reveal: 'A book falls open to a dog-eared page: "...the year it all began, when the Archive first opened its doors."',
          },
        },
      ],
    },

    {
      id: 'room_light',
      name: 'Ceiling Light',
      description: 'A bare bulb controlled from elsewhere.',
      states: ['on', 'off'],
      initialState: 'on',
      geometry: { shape: 'box', size: { x: 0.6, y: 0.2, z: 0.6 }, position: { x: 0, y: 3.8, z: 0 }, color: 0xfff2b0 },
      colorByState: { on: 0xfff2b0, off: 0x303030 },
      // Player-controlled toggling is intentionally omitted; the Director owns the lights.
      interactions: [],
    },
  ],

  directorEvents: [
    {
      id: 'startRoom',
      label: 'Start Room',
      effect: {
        resetRoom: true,
        setStates: [
          { objectId: 'keypad', state: 'active' },
          { objectId: 'room_light', state: 'on' },
        ],
        audioCue: 'ambient_office_loop',
        feedback: 'The lights flicker on. The experience begins — find a way out.',
      },
    },
    {
      id: 'narration',
      label: 'Play Narration',
      effect: { audioCue: 'narration_intro', feedback: '"Welcome, Archivists. You have ten minutes before the vault seals..."' },
    },
    {
      id: 'enableKeypad',
      label: 'Enable Keypad',
      effect: { setStates: [{ objectId: 'keypad', state: 'active' }], audioCue: 'keypad_power_on', feedback: 'The keypad hums to life.' },
    },
    {
      id: 'spawnClue',
      label: 'Spawn Clue',
      effect: { audioCue: 'clue_chime', feedback: 'A hidden clue glows briefly: "The code is four digits — a year."' },
    },
    {
      id: 'sfxClick',
      label: 'Sound: Click',
      effect: { audioCue: 'sfx_click' },
    },
    {
      id: 'lightsOff',
      label: 'Lights Off',
      effect: { setStates: [{ objectId: 'room_light', state: 'off' }], audioCue: 'light_switch', feedback: 'The lights cut out. It is pitch black.' },
    },
    {
      id: 'lightsOn',
      label: 'Lights On',
      effect: { setStates: [{ objectId: 'room_light', state: 'on' }], audioCue: 'light_switch', feedback: 'The lights come back on.' },
    },
    {
      id: 'endExperience',
      label: 'End Experience',
      effect: { complete: true, audioCue: 'outro_sting', feedback: 'The Director has ended the experience.' },
    },
  ],
};
