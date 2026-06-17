import { RealtimeSessionResult } from './types';

// Mints short-lived OpenAI Realtime "client secrets" (ephemeral tokens) so the
// browser can open a WebRTC connection to the model directly WITHOUT ever seeing
// the real API key. The full instructions (including secret/forbidden knowledge)
// are bound to the token here, server-side.
//
// GA flow (see OpenAI Realtime docs):
//   1. POST /v1/realtime/client_secrets  (this file) -> ephemeral token
//   2. browser POSTs its SDP offer to /v1/realtime/calls with that token
//
// Node 18+ provides a global `fetch`; the backend tsconfig doesn't include the
// DOM lib, so we reach it through globalThis with a minimal local type.
type FetchFn = (url: string, init?: any) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<any>;
}>;

const doFetch = (globalThis as any).fetch as FetchFn | undefined;

const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';

// Shared Realtime audio config — force English I/O so NPCs don't drift language.
const REALTIME_AUDIO = {
  input: {
    turn_detection: { type: 'semantic_vad' },
    transcription: { model: 'whisper-1', language: 'en' },
  },
} as const;

export class RealtimeService {
  private apiKey: string | undefined = process.env.OPENAI_API_KEY;
  private model: string = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';

  // True only when we can actually reach OpenAI. The NPC system uses this to
  // decide between live AI and scripted-failsafe behaviour.
  isConfigured(): boolean {
    return !!this.apiKey && !!doFetch;
  }

  getModel(): string {
    return this.model;
  }

  // Create an ephemeral session for one NPC conversation window.
  async createSession(
    npcId: string,
    instructions: string,
    voice: string
  ): Promise<RealtimeSessionResult> {
    if (!this.apiKey) {
      return { ok: false, npcId, error: 'OPENAI_API_KEY not configured' };
    }
    if (!doFetch) {
      return { ok: false, npcId, error: 'global fetch unavailable (need Node 18+)' };
    }

    try {
      const res = await doFetch(CLIENT_SECRETS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session: {
            type: 'realtime',
            model: this.model,
            instructions: `${instructions}\n\nIMPORTANT: Respond in spoken English only.`,
            output_modalities: ['audio'],
            audio: {
              ...REALTIME_AUDIO,
              output: { voice },
            },
          },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`RealtimeService: client_secrets failed (${res.status}): ${body}`);
        return { ok: false, npcId, error: `OpenAI error ${res.status}` };
      }

      const data = await res.json();
      // GA returns { value, expires_at, session }. Be tolerant of older shapes.
      const clientSecret: string | undefined = data?.value ?? data?.client_secret?.value;
      const expiresAt: number | undefined = data?.expires_at ?? data?.client_secret?.expires_at;

      if (!clientSecret) {
        return { ok: false, npcId, error: 'No client secret in OpenAI response' };
      }

      return { ok: true, npcId, clientSecret, expiresAt, model: this.model, voice };
    } catch (error: any) {
      console.error('RealtimeService: createSession threw', error);
      return { ok: false, npcId, error: error?.message || 'Realtime session error' };
    }
  }
}

let activeRealtime: RealtimeService | null = null;

export function getRealtimeService(): RealtimeService {
  if (!activeRealtime) activeRealtime = new RealtimeService();
  return activeRealtime;
}
