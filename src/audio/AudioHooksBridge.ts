import { AudioManager } from './AudioManager';
import { getCueDefinition } from './cueRegistry';

export type AudioCueId = string;

/**
 * Bridge from legacy string cue ids (escape room, show visuals) → AudioManager.playCue.
 */
export class AudioHooks {
  private ambientLayer = 'room_ambience';

  constructor(private audio: AudioManager) {}

  play(cue: AudioCueId): void {
    if (!cue || !this.audio.isEnabled()) return;
    if (!getCueDefinition(cue)) {
      console.warn(`[AudioHooks] Unknown cue "${cue}" — add to cueRegistry/cues.ts`);
      return;
    }
    void this.audio.playCue(cue);
  }

  setAmbient(cue: AudioCueId | undefined | null): void {
    if (!cue || !this.audio.isEnabled()) return;
    if (!getCueDefinition(cue)) return;
    void this.audio.fadeTo(cue, { layer: this.ambientLayer, duration: 1.5 });
  }

  setMuted(_muted: boolean): void {
    // Future: audio.setGroupVolume('master', muted ? 0 : 1)
  }
}
