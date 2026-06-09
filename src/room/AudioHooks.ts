// ARC audio hook layer (architecture only for the greybox MVP).
//
// Every interaction, director event and ambient loop routes its audio through
// here as a named cue. Today we just log/dispatch; later this maps cue ids to
// real spatialised buffers (positional audio, ducking, narration bus, etc.)
// without touching gameplay code.

export type AudioCueId = string;

export class AudioHooks {
  private ambient: AudioCueId | null = null;
  private muted = false;

  // Fire a one-shot cue (footstep, click, unlock, sting, ...).
  play(cue: AudioCueId): void {
    if (this.muted || !cue) return;
    console.log(`🔊 [audio] cue: ${cue}`);
    // Future: look up cue -> AudioBuffer and play through the ARC audio graph.
    window.dispatchEvent(new CustomEvent('arc:audio-cue', { detail: { cue } }));
  }

  // Set/replace the looping ambient bed for the room.
  setAmbient(cue: AudioCueId | undefined | null): void {
    if (!cue || cue === this.ambient) return;
    this.ambient = cue;
    console.log(`🔊 [audio] ambient: ${cue}`);
    window.dispatchEvent(new CustomEvent('arc:audio-ambient', { detail: { cue } }));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }
}
