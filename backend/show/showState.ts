// Server-authoritative "show" state for the theatrical ARC flow.
//
// This is deliberately separate from the escape-room RoomSession: the show layer
// only tracks WHICH theatrical scene is currently live and how the last
// transition was performed, so every client (including late joiners) can render
// the same moment. The client owns all geometry; the server owns the truth of
// "what scene are we in".

export type SceneId = 'PRE_SHOW' | 'ACT_1_STORM_ROAD';
export type TransitionMode = 'instant' | 'assemble';

/** Visual stage cues (client-side effects). */
export type VisualShowCue = 'thunder' | 'lightning' | 'rainUp' | 'gateLight';

/** Storm audio cues (Lost in the Storm cue pack). */
export type StormAudioCue =
  | 'stormStart'
  | 'stormStop'
  | 'thunderDistant'
  | 'thunderClose'
  | 'wolfLeft'
  | 'wolfRight'
  | 'wolfBehind'
  | 'werewolfCircle'
  | 'branchSnap'
  | 'distantScream'
  | 'churchBell';

export type ShowCue = VisualShowCue | StormAudioCue;

export const VALID_SCENES: SceneId[] = ['PRE_SHOW', 'ACT_1_STORM_ROAD'];
export const VALID_MODES: TransitionMode[] = ['instant', 'assemble'];

export const STORM_AUDIO_CUES: StormAudioCue[] = [
  'stormStart',
  'stormStop',
  'thunderDistant',
  'thunderClose',
  'wolfLeft',
  'wolfRight',
  'wolfBehind',
  'werewolfCircle',
  'branchSnap',
  'distantScream',
  'churchBell',
];

export const VALID_CUES: ShowCue[] = [
  'thunder',
  'lightning',
  'rainUp',
  'gateLight',
  ...STORM_AUDIO_CUES,
];

export interface ShowStatePayload {
  currentScene: SceneId;
  // How the current scene was entered. Late joiners always hard-cut ('instant')
  // into the active scene regardless of this value.
  mode: TransitionMode;
}

// In-memory singleton for the prototype (resets on server restart). Swap the
// backing store later without changing the socket surface.
export class ShowState {
  private currentScene: SceneId = 'PRE_SHOW';
  private mode: TransitionMode = 'instant';

  getScene(): SceneId {
    return this.currentScene;
  }

  // Director-triggered transition. Returns the payload to broadcast.
  startScene(sceneId: SceneId, mode: TransitionMode): ShowStatePayload {
    this.currentScene = sceneId;
    this.mode = mode;
    return this.serialize();
  }

  reset(): void {
    this.currentScene = 'PRE_SHOW';
    this.mode = 'instant';
  }

  serialize(): ShowStatePayload {
    return { currentScene: this.currentScene, mode: this.mode };
  }
}

let activeShow: ShowState | null = null;

export function getShowState(): ShowState {
  if (!activeShow) {
    activeShow = new ShowState();
  }
  return activeShow;
}
