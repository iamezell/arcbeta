// Client mirror of the server's wire payloads (backend/rooms/types.ts).
// The client treats these as read-only data describing what to render and prompt.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface GeometryDef {
  shape: 'box' | 'cylinder' | 'plane';
  size: Vec3;
  position: Vec3;
  rotationY?: number;
  color: number;
}

export interface WireInteraction {
  action: string;
  label: string;
  fromStates: string[];
}

export interface WireObject {
  id: string;
  name: string;
  description: string;
  geometry: GeometryDef;
  interactions: WireInteraction[];
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
  directorEventId?: string;
}

export interface RevealPayload {
  objectId: string;
  name: string;
  text: string;
}
