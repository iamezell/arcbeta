import { RealtimeSessionResult } from './types';

// A live conversation peer (the AIActor). The manager pushes audio + transcripts
// back to it; the actor handles spatial audio + subtitle display.
export interface ConversationClient {
  npcId: string;
  playerName: string;
  /** Route remote WebRTC audio into the voice pipeline (element decodes, Web Audio taps). */
  attachAudioStream(stream: MediaStream, playbackElement: HTMLAudioElement, track?: MediaStreamTrack): void;
  setTalking(talking: boolean): void;
  onNpcLine(text: string): void;
  onPlayerLine(text: string): void;
  onTimeout?(): void;
  onFailed?(reason: string): void;
}

interface ConversationManagerDeps {
  requestSession: (npcId: string) => Promise<RealtimeSessionResult>;
  sendTranscript: (npcId: string, speaker: string, text: string) => void;
  resumeAudio?: () => Promise<void>;
  onSessionIdleClose?: (npcId: string) => void;
}

interface ActiveSession {
  pc: RTCPeerConnection;
  dc: RTCDataChannel;
  mic: MediaStream;
  client: ConversationClient;
  npcBuffer: string;
  inactivityTimer: number | null;
  speaking: boolean;
  audioEl: HTMLAudioElement;
  audioPlayRetry: number | null;
  tryPlayAudio: () => void;
  pendingDirective: string | null;
}

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
const INACTIVITY_MS = 600_000;

export class ConversationManager {
  private deps: ConversationManagerDeps;
  private sessions = new Map<string, ActiveSession>();
  private starting = new Map<string, Promise<boolean>>();

  constructor(deps: ConversationManagerDeps) {
    this.deps = deps;
  }

  isActive(npcId: string): boolean {
    return this.sessions.has(npcId);
  }

  isStarting(npcId: string): boolean {
    return this.starting.has(npcId);
  }

  async start(client: ConversationClient): Promise<boolean> {
    const npcId = client.npcId;
    if (this.sessions.has(npcId)) {
      console.log(`[${npcId}] conversation session already active`);
      return true;
    }
    const inFlight = this.starting.get(npcId);
    if (inFlight) return inFlight;

    const promise = this.startSession(client);
    this.starting.set(npcId, promise);
    try {
      return await promise;
    } finally {
      this.starting.delete(npcId);
    }
  }

  private async startSession(client: ConversationClient): Promise<boolean> {
    const npcId = client.npcId;
    console.log(`[${npcId}] starting Realtime conversation session…`);

    await this.deps.resumeAudio?.().catch(() => {/* ignore */});

    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      client.onFailed?.('Microphone unavailable');
      return false;
    }

    const token = await this.deps.requestSession(npcId);
    if (!token.ok || !token.clientSecret) {
      mic.getTracks().forEach((t) => t.stop());
      client.onFailed?.(token.error || 'No Realtime session');
      return false;
    }

    const audioEl = document.createElement('audio');
    audioEl.autoplay = false;
    audioEl.muted = true;
    audioEl.volume = 1;
    (audioEl as HTMLMediaElement & { playsInline?: boolean }).playsInline = true;
    // muted=true — decode only; WebRTCVoicePipeline owns speaker output via Web Audio

    const tryPlayAudio = (): void => {
      if (!audioEl.srcObject) return;
      audioEl.muted = true;
      audioEl.play().catch((err) => {
        console.warn(`[${npcId}] audio play blocked — click the page:`, err);
      });
    };

    try {
      const pc = new RTCPeerConnection();
      let remoteTrackId: string | null = null;

      const attachRemoteAudio = (stream: MediaStream): void => {
        const track = stream.getAudioTracks()[0];
        if (track?.id && track.id === remoteTrackId) return;
        if (track?.id) remoteTrackId = track.id;

        console.log(
          `🔊 NPC ${npcId} remote audio (${track?.enabled ? 'enabled' : 'disabled'}, ` +
            `muted=${track?.muted}) → WebRTC voice pipeline`
        );

        client.attachAudioStream(stream, audioEl, track);

        track?.addEventListener('unmute', () => {
          console.log(`🔊 NPC ${npcId} track unmuted`);
          tryPlayAudio();
        });
      };

      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      const dc = pc.createDataChannel('oai-events');
      const session: ActiveSession = {
        pc,
        dc,
        mic,
        client,
        npcBuffer: '',
        inactivityTimer: null,
        speaking: false,
        audioEl,
        audioPlayRetry: null,
        tryPlayAudio,
        pendingDirective: null,
      };

      session.audioPlayRetry = window.setInterval(tryPlayAudio, 800);

      pc.ontrack = (e: RTCTrackEvent) => {
        const stream =
          e.streams?.[0] ?? (e.track ? new MediaStream([e.track]) : null);
        if (stream) attachRemoteAudio(stream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState !== 'connected') return;
        for (const receiver of pc.getReceivers()) {
          if (receiver.track?.kind === 'audio' && receiver.track.readyState === 'live') {
            attachRemoteAudio(new MediaStream([receiver.track]));
            break;
          }
        }
      };

      dc.onopen = () => {
        console.log(`[${npcId}] Realtime data channel open`);
        this.configureSession(session);
        window.setTimeout(() => {
          this.createResponse(
            npcId,
            'In one short English line, tell the travellers to stay back from the gate.'
          );
        }, 400);
      };
      dc.onmessage = (e: MessageEvent) => this.handleEvent(session, e.data);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const resp = await fetch(CALLS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp || '',
      });

      if (!resp.ok) {
        mic.getTracks().forEach((t) => t.stop());
        if (session.audioPlayRetry) window.clearInterval(session.audioPlayRetry);
        audioEl.remove();
        pc.close();
        client.onFailed?.(`OpenAI SDP exchange failed (${resp.status})`);
        return false;
      }

      const answerSdp = await resp.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

      this.sessions.set(npcId, session);
      this.resetInactivity(npcId);
      console.log(`[${npcId}] Realtime session connected`);
      return true;
    } catch (err: any) {
      mic.getTracks().forEach((t) => t.stop());
      audioEl.remove();
      client.onFailed?.(err?.message || 'WebRTC error');
      return false;
    }
  }

  createResponse(npcId: string, directive?: string): void {
    const session = this.sessions.get(npcId);
    if (!session || session.dc.readyState !== 'open') return;
    if (!directive?.trim()) return;

    if (session.speaking) {
      session.pendingDirective = directive;
      session.dc.send(JSON.stringify({ type: 'response.cancel' }));
      return;
    }

    this.sendResponse(session, directive);
    this.resetInactivity(npcId);
  }

  private sendResponse(session: ActiveSession, directive: string): void {
    this.setMicInput(session, false);
    session.dc.send(
      JSON.stringify({
        type: 'response.create',
        response: { instructions: `${directive} Respond in spoken English only.` },
      })
    );
  }

  private flushPendingResponse(session: ActiveSession): void {
    if (!session.pendingDirective) return;
    const directive = session.pendingDirective;
    session.pendingDirective = null;
    this.sendResponse(session, directive);
    this.resetInactivity(session.client.npcId);
  }

  async stop(npcId: string): Promise<void> {
    const session = this.sessions.get(npcId);
    if (!session) return;
    console.log(`[${npcId}] conversation session stopped`);
    this.sessions.delete(npcId);

    if (session.inactivityTimer) window.clearTimeout(session.inactivityTimer);
    if (session.audioPlayRetry) window.clearInterval(session.audioPlayRetry);
    session.audioEl.pause();
    session.audioEl.srcObject = null;
    session.audioEl.remove();
    try {
      session.dc.close();
    } catch { /* no-op */ }
    session.mic.getTracks().forEach((t) => t.stop());
    try {
      session.pc.close();
    } catch { /* no-op */ }
    session.client.setTalking(false);
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.stop(id)));
  }

  private setMicInput(session: ActiveSession, enabled: boolean): void {
    session.mic.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private configureSession(session: ActiveSession): void {
    session.dc.send(
      JSON.stringify({
        type: 'session.update',
        session: {
          type: 'realtime',
          audio: {
            input: {
              turn_detection: { type: 'semantic_vad' },
              transcription: { model: 'whisper-1', language: 'en' },
            },
          },
        },
      })
    );
  }

  private handleEvent(session: ActiveSession, raw: any): void {
    let evt: any;
    try {
      evt = JSON.parse(raw);
    } catch {
      return;
    }
    const npcId = session.client.npcId;

    if (evt.type?.startsWith('response.') || evt.type?.startsWith('input_audio')) {
      this.resetInactivity(npcId);
    }

    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        this.resetInactivity(npcId);
        if (!session.mic.getAudioTracks()[0]?.enabled) break;
        if (session.speaking) {
          session.dc.send(JSON.stringify({ type: 'response.cancel' }));
          session.speaking = false;
          session.client.setTalking(false);
          this.setMicInput(session, true);
        }
        break;

      case 'input_audio_buffer.speech_stopped':
        this.resetInactivity(npcId);
        break;

      case 'conversation.item.input_audio_transcription.completed': {
        const text = (evt.transcript || '').trim();
        if (text) {
          session.client.onPlayerLine(text);
          this.deps.sendTranscript(npcId, `player:${session.client.playerName}`, text);
        }
        this.resetInactivity(npcId);
        break;
      }

      case 'response.output_audio_transcript.delta':
        session.speaking = true;
        session.client.setTalking(true);
        this.setMicInput(session, false);
        session.npcBuffer += evt.delta || '';
        session.client.onNpcLine(session.npcBuffer);
        session.tryPlayAudio();
        break;

      case 'response.output_audio_transcript.done': {
        const finalText = (evt.transcript || session.npcBuffer).trim();
        if (finalText) this.deps.sendTranscript(npcId, 'npc', finalText);
        session.npcBuffer = '';
        break;
      }

      case 'response.done':
        session.speaking = false;
        session.client.setTalking(false);
        this.setMicInput(session, true);
        this.flushPendingResponse(session);
        break;

      case 'response.cancelled':
        session.speaking = false;
        session.client.setTalking(false);
        this.setMicInput(session, true);
        this.flushPendingResponse(session);
        break;

      case 'error':
        console.error(`[${npcId}] Realtime error:`, evt.error || evt);
        break;
    }
  }

  private resetInactivity(npcId: string): void {
    const session = this.sessions.get(npcId);
    if (!session) return;
    if (session.inactivityTimer) window.clearTimeout(session.inactivityTimer);
    session.inactivityTimer = window.setTimeout(() => {
      if (session.speaking) {
        this.resetInactivity(npcId);
        return;
      }
      session.client.onTimeout?.();
      this.deps.onSessionIdleClose?.(npcId);
      this.stop(npcId);
    }, INACTIVITY_MS);
  }
}
