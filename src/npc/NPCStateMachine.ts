import { DirectorCue, NPCState, NPCEmotion } from './types';

// Client mirror of the server state machine (backend/npc/NPCStateMachine.ts).
// The server is authoritative; the client uses this for local prediction and to
// colour the talking indicator by emotion when a cue arrives.

const CUE_TO_STATE: Partial<Record<DirectorCue, NPCState>> = {
  APPROACH: 'GUIDING',
  STOP: 'WATCHING',
  WATCH: 'WATCHING',
  QUESTION: 'SUSPICIOUS',
  WARN: 'HOSTILE',
  REASSURE: 'CALM',
  DEFLECT: 'GUIDING',
  OPEN_GATE: 'GUIDING',
  CALL_SHEPHERD: 'PROTECTIVE',
  ESCALATE: 'HOSTILE',
  END_SCENE: 'IDLE',
};

const STATE_TO_EMOTION: Record<NPCState, NPCEmotion> = {
  IDLE: 'NEUTRAL',
  WATCHING: 'TENSE',
  SUSPICIOUS: 'SUSPICIOUS',
  PROTECTIVE: 'STERN',
  HOSTILE: 'ANGRY',
  CALM: 'CALM',
  GUIDING: 'WARM',
  AFRAID: 'FEARFUL',
  SILENT: 'NEUTRAL',
};

// Colour per emotion for the talking indicator / state readout.
const EMOTION_COLOR: Record<NPCEmotion, number> = {
  NEUTRAL: 0x9aa0b5,
  CALM: 0x4fc3f7,
  TENSE: 0xffd54f,
  FEARFUL: 0xba68c8,
  ANGRY: 0xef5350,
  WARM: 0x81c784,
  SUSPICIOUS: 0xffb74d,
  STERN: 0x90a4ae,
};

export class NPCStateMachine {
  static nextState(current: NPCState, cue: DirectorCue): NPCState {
    return CUE_TO_STATE[cue] ?? current;
  }

  static emotionForState(state: NPCState): NPCEmotion {
    return STATE_TO_EMOTION[state] ?? 'NEUTRAL';
  }

  static isStateCue(cue: DirectorCue): boolean {
    return cue in CUE_TO_STATE;
  }

  static colorForEmotion(emotion: NPCEmotion): number {
    return EMOTION_COLOR[emotion] ?? 0x9aa0b5;
  }
}
