import * as THREE from 'three';
import { AudioManager } from './AudioManager';

const LAYER_RAIN = 'storm_rain';
const LAYER_WIND = 'storm_wind';

/**
 * Theatrical staging helpers for "Lost in the Storm".
 * All playback goes through cue names — never file paths.
 */
export class LostInTheStormCues {
  constructor(private audio: AudioManager) {}

  async startStormAmbience(): Promise<void> {
    await Promise.all([
      this.audio.playLoop('rain_light', { layer: LAYER_RAIN, fadeIn: 2 }),
      this.audio.playLoop('wind_light', { layer: LAYER_WIND, fadeIn: 2.5 }),
    ]);
  }

  stopStormAmbience(): void {
    this.audio.stopLoop(LAYER_RAIN, 2);
    this.audio.stopLoop(LAYER_WIND, 2.5);
  }

  async intensifyRain(): Promise<void> {
    await this.audio.fadeTo('rain_heavy', { layer: LAYER_RAIN, duration: 3, volume: 0.75 });
  }

  async triggerDistantThunder(): Promise<void> {
    const center = this.audio.getPlayerGroupCenter();
    const pos = center.clone().add(
      new THREE.Vector3((Math.random() - 0.5) * 80, 30, -60 - Math.random() * 40)
    );
    this.audio.triggerCue('thunder_far', { position: pos });
  }

  async triggerCloseThunder(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3(8 + Math.random() * 6, 25, -15));
    this.audio.triggerCue('thunder_close', { position: pos });
  }

  /** Random thunder variant with pitch/volume jitter. */
  async triggerThunderVariant(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3((Math.random() - 0.5) * 40, 20, -20 - Math.random() * 30));
    this.audio.triggerCue('thunder', { position: pos });
  }

  async triggerWolfHowlLeft(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3(-22, 1.5, -18));
    this.audio.triggerCue('wolf_howl_far', { position: pos });
  }

  async triggerWolfHowlRight(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3(22, 1.5, -18));
    this.audio.triggerCue('wolf_howl_far', { position: pos });
  }

  async triggerWolfBehindPlayers(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3(0, 1.5, 20));
    this.audio.triggerCue('wolf_howl_close', { position: pos });
  }

  async triggerWerewolfCircle(): Promise<void> {
    const center = this.audio.getPlayerGroupCenter();
    const radius = 18;
    const points: THREE.Vector3[] = [];
    const segments = 8;
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      points.push(
        new THREE.Vector3(center.x + Math.cos(a) * radius, center.y + 1.2, center.z + Math.sin(a) * radius)
      );
    }
    await this.audio.playMovingCue('growl', points, {
      duration: 14,
      loop: true,
      volume: 0.75,
      refDistance: 8,
      maxDistance: 55,
    });
  }

  async triggerBranchSnapNearWoods(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3(-14 + Math.random() * 8, 1, -10));
    this.audio.triggerCue('branch_snap', { position: pos });
  }

  async triggerDistantScream(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3((Math.random() - 0.5) * 30, 2, -45));
    this.audio.triggerCue('scream', { position: pos });
  }

  async triggerChurchBellAhead(): Promise<void> {
    const pos = this.audio.offsetFromGroupCenter(new THREE.Vector3(0, 6, -55));
    this.audio.triggerCue('church_bell', { position: pos });
  }
}

export type StormAudioCueId =
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

export const STORM_AUDIO_CUE_IDS: StormAudioCueId[] = [
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

export async function dispatchStormAudioCue(
  cues: LostInTheStormCues,
  cueId: StormAudioCueId
): Promise<void> {
  switch (cueId) {
    case 'stormStart':
      return cues.startStormAmbience();
    case 'stormStop':
      return cues.stopStormAmbience();
    case 'thunderDistant':
      return cues.triggerDistantThunder();
    case 'thunderClose':
      return cues.triggerCloseThunder();
    case 'wolfLeft':
      return cues.triggerWolfHowlLeft();
    case 'wolfRight':
      return cues.triggerWolfHowlRight();
    case 'wolfBehind':
      return cues.triggerWolfBehindPlayers();
    case 'werewolfCircle':
      return cues.triggerWerewolfCircle();
    case 'branchSnap':
      return cues.triggerBranchSnapNearWoods();
    case 'distantScream':
      return cues.triggerDistantScream();
    case 'churchBell':
      return cues.triggerChurchBellAhead();
  }
}
