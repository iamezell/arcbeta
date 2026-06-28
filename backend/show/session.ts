/**
 * Minimal show/session system for local rehearsals.
 *
 * For now there is a single active show identified by a short code (default
 * "STORM"). Participants are associated with this code on join. The structure is
 * intentionally future-ready: swap the single value for a Map keyed by code when
 * multiple concurrent shows are needed.
 */

const DEFAULT_SHOW_CODE = process.env.SHOW_CODE || 'STORM';

let currentShowCode = DEFAULT_SHOW_CODE;

export function getShowCode(): string {
  return currentShowCode;
}

export function setShowCode(code: string): string {
  const clean = (code || '').trim().toUpperCase();
  if (clean) currentShowCode = clean;
  return currentShowCode;
}

/** Whether a provided code matches the active show (case-insensitive). Empty = accept. */
export function isCurrentShow(code?: string | null): boolean {
  if (!code) return true;
  return code.trim().toUpperCase() === currentShowCode.toUpperCase();
}
