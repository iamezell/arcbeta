import { NPCActor, NPCActorOpts } from './NPCActor';
import { ActorKind, DirectorCue } from './types';

// A human-driven NPC. The role, 3D presence and state machine are identical to
// the AI version — the difference is that a real performer supplies the voice.
//
// Cues act as a live teleprompter: the scripted line for a cue is surfaced as a
// subtitle so the human knows the intended beat. Conversation toggles are no-ops
// because a human can always speak; there is no microphone session to manage.
export class HumanActor extends NPCActor {
  readonly kind: ActorKind = 'human';

  constructor(opts: NPCActorOpts) {
    super(opts);
  }

  receiveCue(cue: DirectorCue, scriptedLine?: string): void {
    // Base updates state + shows the scripted line (the human's prompt).
    super.receiveCue(cue, scriptedLine);
  }

  enableConversation(): void {
    /* humans always "can speak"; nothing to open */
  }

  disableConversation(): void {
    /* no microphone session to close */
  }

  speak(text?: string): void {
    if (text) this.performLine(text);
  }

  yieldControl(): void {
    /* about to be replaced by AI; nothing to release */
  }

  takeOver(): void {
    /* a human just claimed this role; nothing to start */
  }
}
