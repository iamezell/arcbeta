// ARC interactive-object framework — authoritative (server-side) type definitions.
//
// Everything about a room is described as data so the client can stay a generic
// renderer. A new ARC experience is a new RoomDef; no client code changes.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Greybox primitive. Visual fidelity is intentionally minimal.
export interface GeometryDef {
  shape: 'box' | 'cylinder' | 'plane';
  // box: full width/height/depth. cylinder: x=radius, y=height. plane: x=width, y=height.
  size: Vec3;
  position: Vec3;
  rotationY?: number;
  color: number;
}

// A condition that must hold for an interaction to succeed.
export interface InteractionCondition {
  // Session flags that must equal the given boolean.
  flags?: Record<string, boolean>;
  // Other objects that must be in a given state.
  objectStates?: { objectId: string; state: string }[];
  // For code-entry interactions: the value the player must submit (payload.code).
  code?: string;
}

// What happens when an interaction succeeds. Effects are declarative so they can
// be reasoned about, logged, and replayed.
export interface InteractionEffect {
  // New state for the object being interacted with.
  setState?: string;
  // Cascade state changes to other objects (e.g. solving keypad unlocks safe).
  setStates?: { objectId: string; state: string }[];
  // Set session flags (the closest thing we have to "inventory" without an inventory).
  setFlags?: Record<string, boolean>;
  // Audio hook id(s) — the client maps these to real sounds later.
  audioCue?: string;
  // Message broadcast to all players (shared puzzle progress).
  feedback?: string;
  // Private text revealed to the interacting player (note/clue contents).
  reveal?: string;
  // Marks the whole experience complete.
  complete?: boolean;
}

export interface InteractionOption {
  action: string; // 'search' | 'open' | 'unlock' | 'submitCode' | 'pull' | 'read' | 'toggle' | ...
  label: string; // shown in the interaction prompt, e.g. "Search desk"
  fromStates: string[]; // states in which this action is offered
  requires?: InteractionCondition;
  onSuccess: InteractionEffect;
  // Shown to the player when `requires` is not satisfied (no state change happens).
  onBlocked?: { feedback: string; audioCue?: string };
  // Prevent the same action from firing twice in a session.
  oncePerSession?: boolean;
}

export interface ObjectDef {
  id: string;
  name: string;
  description: string;
  states: string[];
  initialState: string;
  geometry: GeometryDef;
  interactions: InteractionOption[];
  // Per-state base color so state changes are visible in the greybox.
  colorByState?: Record<string, number>;
  // Ambient/looping audio hooks keyed by event name (architecture only for now).
  audioHooks?: Record<string, string>;
}

export interface DirectorEventDef {
  id: string; // 'startRoom' | 'lightsOff' | 'enableKeypad' | 'narration' | 'endExperience' | ...
  label: string;
  // Reuse the same declarative effect shape as interactions.
  effect: InteractionEffect & { resetRoom?: boolean };
}

export interface RoomDef {
  id: string;
  name: string;
  ambientAudio?: string;
  objects: ObjectDef[];
  // Non-interactive greybox geometry (walls, ceiling, floor accents).
  scenery: GeometryDef[];
  directorEvents: DirectorEventDef[];
}

// ----- Wire payloads (server -> client) -----

// Trimmed object info the client needs to render and prompt. Authoritative logic
// (requires/effects) stays server-side.
export interface WireObject {
  id: string;
  name: string;
  description: string;
  geometry: GeometryDef;
  interactions: { action: string; label: string; fromStates: string[] }[];
  colorByState?: Record<string, number>;
}

export interface WireRoom {
  id: string;
  name: string;
  ambientAudio?: string;
  objects: WireObject[];
  scenery: GeometryDef[];
  directorEvents: { id: string; label: string }[];
}

export interface RoomStatePayload {
  room: WireRoom;
  states: Record<string, string>;
  flags: Record<string, boolean>;
  complete: boolean;
}

export interface StateChangePayload {
  changes: { id: string; state: string }[];
  flags: Record<string, boolean>;
  complete: boolean;
  feedback?: string;
  audioCues?: string[];
  // Echoes the director event id when a change originates from one (client fx).
  directorEventId?: string;
}

export interface RevealPayload {
  objectId: string;
  name: string;
  text: string;
}

export interface NoticePayload {
  message: string;
}
