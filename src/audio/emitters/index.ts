import * as THREE from 'three';
import { SpatialAudioEmitter, SpatialAudioEmitterOpts } from './SpatialAudioEmitter';

/** NPC dialogue — WebRTC or buffered lines at the NPC's mouth. */
export class NPCAudioEmitter extends SpatialAudioEmitter {
  constructor(opts: Omit<SpatialAudioEmitterOpts, 'kind' | 'preset' | 'enableSpeechMuffle'> & {
    preset?: 'speech';
  }) {
    super({
      ...opts,
      kind: 'npc',
      preset: opts.preset ?? 'speech',
      enableSpeechMuffle: true,
    });
  }
}

/** Looping positional ambience (generator, choir inside church, lab hum). */
export class AmbientAudioEmitter extends SpatialAudioEmitter {
  constructor(opts: Omit<SpatialAudioEmitterOpts, 'kind' | 'preset'>) {
    super({ ...opts, kind: 'ambient', preset: 'ambience_local' });
  }

  playLoop(buffer: AudioBuffer): void {
    this.playBuffer(buffer, true);
  }
}

/** One-shot or looping sounds from interactive props. */
export class PropAudioEmitter extends SpatialAudioEmitter {
  constructor(opts: Omit<SpatialAudioEmitterOpts, 'kind' | 'preset'>) {
    super({ ...opts, kind: 'prop', preset: 'sfx' });
  }
}

/** Creatures, wolves, monsters — local origin with wider reach. */
export class CreatureAudioEmitter extends SpatialAudioEmitter {
  constructor(opts: Omit<SpatialAudioEmitterOpts, 'kind' | 'preset'>) {
    super({ ...opts, kind: 'creature', preset: 'creature' });
  }
}

/** Future multiplayer voice — attach to player avatar group. */
export class PlayerAudioEmitter extends SpatialAudioEmitter {
  constructor(
    playerId: string,
    parent: THREE.Object3D,
    listener: THREE.AudioListener,
    label?: string
  ) {
    super({
      id: `player-voice-${playerId}`,
      kind: 'player',
      label: label ?? playerId,
      parent,
      listener,
      preset: 'player_voice',
      enableSpeechMuffle: true,
    });
  }

  attachVoiceStream(_stream: MediaStream): void {
    console.warn('[PlayerAudioEmitter] live voice uses WebRTCVoicePipeline, not PositionalAudio');
  }
}

/** Simple moving emitter wrapper (werewolf circle, passing vehicle). */
export class VehicleAudioEmitter extends CreatureAudioEmitter {
  constructor(opts: Omit<SpatialAudioEmitterOpts, 'kind' | 'preset'>) {
    super({ ...opts, kind: 'vehicle' });
  }
}
