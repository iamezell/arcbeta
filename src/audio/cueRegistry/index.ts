import { CUE_REGISTRY } from './cues';
import { CueDefinition } from './types';

export interface ResolvedCue {
  name: string;
  def: CueDefinition;
  library: string;
  asset: string;
}

/** Pick a deterministic or random element from an array. */
function pickFrom<T>(items: T[], seed?: number): T {
  if (items.length === 1) return items[0];
  const idx =
    seed !== undefined
      ? Math.abs(Math.floor(seed * 997)) % items.length
      : Math.floor(Math.random() * items.length);
  return items[idx];
}

/**
 * Resolve a cue name to a concrete library asset, expanding variant groups.
 * Returns null if the name is unknown or resolution fails.
 */
export function resolveCue(
  cueName: string,
  options?: { noVariants?: boolean; seed?: number; depth?: number }
): ResolvedCue | null {
  const depth = options?.depth ?? 0;
  if (depth > 8) {
    console.warn(`[CueRegistry] Variant depth exceeded for "${cueName}"`);
    return null;
  }

  const def = CUE_REGISTRY[cueName];
  if (!def) {
    console.warn(`[CueRegistry] Unknown cue "${cueName}"`);
    return null;
  }

  if (def.variants && def.variants.length > 0 && !options?.noVariants) {
    const picked = pickFrom(def.variants, options?.seed);
    return resolveCue(picked, { ...options, depth: depth + 1 });
  }

  if (!def.library || !def.asset) {
    console.warn(`[CueRegistry] Cue "${cueName}" has no library/asset`);
    return null;
  }

  return { name: cueName, def, library: def.library, asset: def.asset };
}

export function getCueDefinition(cueName: string): CueDefinition | undefined {
  return CUE_REGISTRY[cueName];
}

export function isGlobalCue(def: CueDefinition): boolean {
  if (def.global === true) return true;
  if (def.global === false) return false;
  if (def.group === 'ui') return true;
  // Host / loading narration only — not in-world voice lines.
  if (def.group === 'voice') return true;
  // Sky/atmosphere beds (rain, wind) — non-positional weather layer.
  if (def.loop && def.global !== false && !def.spatial && !def.spatialPreset) {
    const skyBeds = ['rain_light', 'rain_heavy', 'wind_light', 'wind_heavy'];
    if (def.asset && skyBeds.includes(def.asset)) return true;
  }
  return false;
}

export function getSpatialPreset(def: CueDefinition): import('../spatialConfig').SpatialPreset {
  if (def.spatialPreset) return def.spatialPreset;
  if (def.library === 'wolves' || def.library === 'creatures') return 'creature';
  if (def.loop && !isGlobalCue(def)) return 'ambience_local';
  return 'sfx';
}

export function listCueNames(): string[] {
  return Object.keys(CUE_REGISTRY).sort();
}

export { CUE_REGISTRY, getLoadedLibraries } from './cues';
export * from './types';
