/**
 * WebRTC NPC voice debug tooling (A/B/C modes, arcVoice.* console, debug panel).
 *
 * Enabled when:
 *   - Vite dev server (`import.meta.env.DEV`), or
 *   - `VITE_ARC_AUDIO_DEBUG=true` in env (e.g. staging troubleshooting build)
 */
export function isWebRTCVoiceDebugEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_ARC_AUDIO_DEBUG === 'true';
}
