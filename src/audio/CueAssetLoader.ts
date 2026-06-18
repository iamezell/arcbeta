import * as THREE from 'three';
import { createProceduralBuffer, proceduralKindForCue } from './ProceduralFallback';

/** Whether this browser can decode Opus-in-Ogg (primary ARC format). */
let opusSupported: boolean | null = null;

export function browserSupportsOpus(): boolean {
  if (opusSupported !== null) return opusSupported;
  const el = document.createElement('audio');
  opusSupported = el.canPlayType('audio/ogg; codecs=opus') !== '' || el.canPlayType('audio/webm; codecs=opus') !== '';
  return opusSupported;
}

/**
 * Loads decoded audio for a library asset. Tries `.opus` first, falls back to `.mp3`.
 * Callers never pass extensions — only library + asset basenames.
 */
export class CueAssetLoader {
  private loader = new THREE.AudioLoader();
  /** Cache key: "library/asset" */
  private cache = new Map<string, AudioBuffer>();
  private loading = new Map<string, Promise<AudioBuffer>>();
  private ctx: AudioContext;

  constructor(audioContext: AudioContext) {
    this.ctx = audioContext;
  }

  cacheKey(library: string, asset: string): string {
    return `${library}/${asset}`;
  }

  async load(library: string, asset: string, cueName: string): Promise<AudioBuffer> {
    const key = this.cacheKey(library, asset);
    const cached = this.cache.get(key);
    if (cached) return cached;

    const inflight = this.loading.get(key);
    if (inflight) return inflight;

    const promise = this.loadFresh(library, asset, cueName, key);
    this.loading.set(key, promise);
    try {
      return await promise;
    } finally {
      this.loading.delete(key);
    }
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getLoadedKeys(): string[] {
    return [...this.cache.keys()].sort();
  }

  estimateMemoryBytes(): number {
    let bytes = 0;
    for (const buf of this.cache.values()) {
      bytes += buf.length * buf.numberOfChannels * 4;
    }
    return bytes;
  }

  private async loadFresh(library: string, asset: string, cueName: string, key: string): Promise<AudioBuffer> {
    const base = `/audio/cue-packs/${library}/${asset}`;
    const formats = browserSupportsOpus() ? ['opus', 'mp3'] : ['mp3', 'opus'];

    for (const fmt of formats) {
      try {
        const buffer = await this.loader.loadAsync(`${base}.${fmt}`);
        this.cache.set(key, buffer);
        return buffer;
      } catch {
        // try next format
      }
    }

    console.warn(`[CueAssetLoader] Missing asset ${key}, using procedural placeholder`);
    const kind = proceduralKindForCue(cueName, library, asset);
    const duration = kind === 'rain' || kind === 'wind' ? 3 : kind === 'thunder' ? 2.5 : 1.8;
    const buffer = createProceduralBuffer(this.ctx, kind, duration);
    this.cache.set(key, buffer);
    return buffer;
  }
}
