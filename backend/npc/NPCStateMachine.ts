import { DirectorCue, NPCState, NPCEmotion } from './types';

// Pure, declarative mapping from director cues to NPC states, and from states to
// a default emotion. Kept side-effect free so it can run identically on the
// server (authoritative) and the client (mirror).
//
// Cues that don't appear in CUE_TO_STATE don't change the base state — they do
// something else (toggle conversation, swap the driving actor, end the scene).

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

const ALL_STATES: NPCState[] = [
  'IDLE', 'WATCHING', 'SUSPICIOUS', 'PROTECTIVE', 'HOSTILE',
  'CALM', 'GUIDING', 'AFRAID', 'SILENT',
];

export class NPCStateMachine {
  // The state a cue drives the NPC into (or the current state if the cue is not
  // a state-changing cue).
  static nextState(current: NPCState, cue: DirectorCue): NPCState {
    return CUE_TO_STATE[cue] ?? current;
  }

  static emotionForState(state: NPCState): NPCEmotion {
    return STATE_TO_EMOTION[state] ?? 'NEUTRAL';
  }

  // True if the cue changes the behavioural state (vs. conversation/transfer cues).
  static isStateCue(cue: DirectorCue): boolean {
    return cue in CUE_TO_STATE;
  }

  static isValidState(s: string): s is NPCState {
    return (ALL_STATES as string[]).includes(s);
  }
}
