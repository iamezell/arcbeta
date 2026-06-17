import { DirectorCue, NPCState, NPCEmotion, ActorKind } from './types';

// The single contract a Human actor and an AI actor both fulfil. The scene only
// ever talks to an NPC through this interface, so the director can swap the
// driver (human <-> AI) without anything else in the scene noticing.
export interface ActorInterface {
  readonly kind: ActorKind;

  // A director cue arrived. `scriptedLine` is the failsafe line to perform when
  // there is no live AI conversation.
  receiveCue(cue: DirectorCue, scriptedLine?: string): void;

  // Conversation windows are director-gated; NPCs never listen by default.
  enableConversation(): void;
  disableConversation(): void;

  // Make the NPC say something now (AI: trigger a response; human: show line).
  speak(text?: string): void;

  // Driver handoff helpers.
  yieldControl(): void; // AI releases the role (about to become human)
  takeOver(): void; // AI assumes the role (just became AI)

  setState(state: NPCState, emotion: NPCEmotion): void;

  dispose(): void;
}
