import { ProceduralKind } from './ProceduralFallback';

export type { ProceduralKind };

export function createProceduralBuffer(
  ctx: AudioContext,
  kind: ProceduralKind,
  durationSec = 1.5
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  switch (kind) {
    case 'rain':
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.08;
      break;
    case 'wind':
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        data[i] = Math.sin(t * 40 + Math.sin(t * 3) * 2) * 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7));
      }
      break;
    case 'thunder':
      for (let i = 0; i < length; i++) {
        const env = Math.exp(-i / (sampleRate * 0.9));
        data[i] = (Math.random() * 2 - 1) * env * 0.9;
      }
      break;
    case 'wolf':
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.sin(Math.min(1, t / 0.15) * Math.PI) * Math.exp(-t * 1.2);
        data[i] = Math.sin(t * 420 + Math.sin(t * 6) * 80) * env * 0.35;
      }
      break;
    case 'snap':
      for (let i = 0; i < length; i++) {
        const env = Math.exp(-i / (sampleRate * 0.05));
        data[i] = (Math.random() * 2 - 1) * env * 0.5;
      }
      break;
    case 'scream':
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 2.5);
        data[i] = Math.sin(t * 900 + t * t * 200) * env * 0.25;
      }
      break;
    case 'bell':
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const env = Math.exp(-t * 1.1);
        data[i] = (Math.sin(t * 660) + Math.sin(t * 990) * 0.4) * env * 0.3;
      }
      break;
    case 'click':
      for (let i = 0; i < length; i++) {
        const env = Math.exp(-i / (sampleRate * 0.02));
        data[i] = Math.sin(i / sampleRate * 800) * env * 0.2;
      }
      break;
    default:
      for (let i = 0; i < length; i++) {
        const env = Math.exp(-i / (sampleRate * 0.3));
        data[i] = Math.sin(i / sampleRate * 440) * env * 0.15;
      }
  }

  return buffer;
}

/** Map cue / library metadata to a procedural sound when files are missing. */
export function proceduralKindForCue(cueName: string, library: string, asset: string): ProceduralKind {
  const s = `${cueName} ${library} ${asset}`.toLowerCase();
  if (s.includes('rain')) return 'rain';
  if (s.includes('wind')) return 'wind';
  if (s.includes('thunder')) return 'thunder';
  if (s.includes('wolf') || s.includes('growl')) return 'wolf';
  if (s.includes('branch') || s.includes('snap')) return 'snap';
  if (s.includes('scream')) return 'scream';
  if (s.includes('bell') || s.includes('church')) return 'bell';
  if (s.includes('button') || s.includes('click') || s.includes('ui')) return 'click';
  return 'generic';
}
