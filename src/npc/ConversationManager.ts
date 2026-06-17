import { RealtimeSessionResult } from './types';

// A live conversation peer (the AIActor). The manager pushes audio + transcripts
// back to it; the actor handles spatial audio + subtitle display.
export interface ConversationClient {
  npcId: string;
  playerName: string;
  attachAudioStream(stream: MediaStream): void;
  setTalking(talking: boolean): void;
  onNpcLine(text: string): void; // streaming/partial NPC subtitle (local)
  onPlayerLine(text: string): void; // final player transcript (local)
  onTimeout?(): void;
  onFailed?(reason: string): void;
}

interface ConversationManagerDeps {
  // Ask the server to mint an ephemeral Realtime token for this NPC.
  requestSession: (npcId: string) => Promise<RealtimeSessionResult>;
  // Forward a finalized transcript line to the server (scene memory + broadcast).
  sendTranscript: (npcId: string, speaker: string, text: string) => void;
  resumeAudio?: () => Promise<void>;
  // Called when the idle timer closes a session (sync server / notify director).
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
  unmutePoll: number | null;
  tryPlayAudio: () => void;
  pendingDirective: string | null;
}

const CALLS_URL = 'https://api.openai.com/v1/realtime/calls';
// Theatrical scenes have long silences — 25s was killing live audio mid-show.
const INACTIVITY_MS = 600_000;

// Owns all WebRTC lifecycle for OpenAI Realtime speech-to-speech: mic capture,
// SDP exchange, the control data channel, speech detection / interruption,
// transcripts, audio playback routing, timeout, and cleanup.
//
// NPCs only listen inside a director-opened window: a session exists only
// between start() and stop()/timeout. Nothing is autonomous.
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

  // Open a conversation window. Returns false if anything fails so the caller
  // can fall back to scripted dialogue.
  async start(client: ConversationClient): Promise<boolean> {
    const npcId = client.npcId;
    if (this.sessions.has(npcId)) {
      console.log(`[${npcId}] conversation session already active — skipping duplicate start`);
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

    await this.deps.resumeAudio?.().catch(() => {/* ignore */});

    // Mic first while the director's click gesture is still fresh.
    let mic: MediaStream;
    try {
      mic = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch {
      client.onFailed?.('Microphone unavailable');
      return false;
    }

    // OpenAI recommends creating the playback element before the WebRTC handshake.
    const audioEl = document.createElement('audio');
    audioEl.autoplay = true;
    (audioEl as HTMLMediaElement & { playsInline?: boolean }).playsInline = true;
    audioEl.volume = 1;
    document.body.appendChild(audioEl);
    void audioEl.play().catch(() => {/* primed on user gesture */});

    // Ephemeral token (instructions/secret knowledge bound server-side).
    const token = await this.deps.requestSession(npcId);
    if (!token.ok || !token.clientSecret) {
      mic.getTracks().forEach((t) => t.stop());
      audioEl.remove();
      client.onFailed?.(token.error || 'No Realtime session');
      return false;
    }

    try {
      const pc = new RTCPeerConnection();
      let remoteAttached = false;

      const tryPlayAudio = (): void => {
        audioEl.play().catch((err) => {
          console.warn(`[${npcId}] NPC audio play blocked — click the page:`, err);
          const unlock = (): void => {
            tryPlayAudio();
            window.removeEventListener('click', unlock);
            window.removeEventListener('keydown', unlock);
          };
          window.addEventListener('click', unlock, { once: true });
          window.addEventListener('keydown', unlock, { once: true });
        });
      };

      // Player mic -> model.
      mic.getTracks().forEach((track) => pc.addTrack(track, mic));

      // Control channel.
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
        unmutePoll: null,
        tryPlayAudio,
        pendingDirective: null,
      };

      const attachRemoteAudio = (stream: MediaStream): void => {
        if (remoteAttached) return;
        remoteAttached = true;
        const tracks = stream.getAudioTracks();
        console.log(
          `🔊 NPC ${npcId} audio track connected (${tracks.length} track(s), ` +
            `enabled=${tracks[0]?.enabled}, muted=${tracks[0]?.muted})`
        );
        audioEl.srcObject = stream;
        audioEl.onplaying = () => {
          console.log(`🔊 NPC ${npcId} audio playing`);
          if (session.audioPlayRetry) {
            window.clearInterval(session.audioPlayRetry);
            session.audioPlayRetry = null;
          }
        };

        tryPlayAudio();
        tracks.forEach((track) => {
          track.addEventListener('unmute', () => {
            console.log(`🔊 NPC ${npcId} audio track unmuted`);
            tryPlayAudio();
          });
        });

        // WebRTC tracks start muted until the first RTP packet; poll as a fallback.
        if (tracks[0]?.muted) {
          session.unmutePoll = window.setInterval(() => {
            const t = stream.getAudioTracks()[0];
            if (t && !t.muted) {
              if (session.unmutePoll) window.clearInterval(session.unmutePoll);
              session.unmutePoll = null;
              console.log(`🔊 NPC ${npcId} audio track unmuted (poll)`);
              tryPlayAudio();
            }
          }, 100);
        }
      };

      // Remote model audio -> playback element (OpenAI WebRTC pattern).
      pc.ontrack = (e: RTCTrackEvent) => {
        const stream =
          e.streams?.[0] ??
          (e.track ? new MediaStream([e.track]) : null);
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

      session.audioPlayRetry = window.setInterval(tryPlayAudio, 800);

      dc.onopen = () => {
        this.configureSession(session);
        // Opening line so the guard speaks without waiting for player input.
        window.setTimeout(() => {
          this.createResponse(
            npcId,
            'In one short English line, tell the travellers to stay back from the gate.'
          );
        }, 400);
      };
      dc.onmessage = (e: MessageEvent) => this.handleEvent(session, e.data);

      // SDP offer/answer with OpenAI (GA endpoint, no model query param).
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
      return true;
    } catch (err: any) {
      mic.getTracks().forEach((t) => t.stop());
      audioEl.remove();
      client.onFailed?.(err?.message || 'WebRTC error');
      return false;
    }
  }

  // Director cue (or player turn) asking the NPC to produce a response now.
  // `directive` is a per-response nudge (no secret knowledge).
  createResponse(npcId: string, directive?: string): void {
    const session = this.sessions.get(npcId);
    if (!session || session.dc.readyState !== 'open') return;
    if (!directive?.trim()) return;

    // Queue if the model is still speaking — Realtime ignores overlapping response.create.
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
    const english = 'Respond in spoken English only.';
    session.dc.send(
      JSON.stringify({
        type: 'response.create',
        response: { instructions: `${directive} ${english}` },
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
    if (session.unmutePoll) window.clearInterval(session.unmutePoll);
    session.audioEl.srcObject = null;
    session.audioEl.remove();
    try {
      session.dc.close();
    } catch {
      /* no-op */
    }
    session.mic.getTracks().forEach((t) => t.stop());
    try {
      session.pc.close();
    } catch {
      /* no-op */
    }
    session.client.setTalking(false);
  }

  async stopAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map((id) => this.stop(id)));
  }

  // ---------- internals ----------

  private setMicInput(session: ActiveSession, enabled: boolean): void {
    session.mic.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
  }

  private configureSession(session: ActiveSession): void {
    // Reassert English transcription + VAD on the live data channel.
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

    // Keep the session alive for any model/player activity.
    if (evt.type?.startsWith('response.') || evt.type?.startsWith('input_audio')) {
      this.resetInactivity(npcId);
    }

    switch (evt.type) {
      case 'input_audio_buffer.speech_started':
        this.resetInactivity(npcId);
        // Ignore VAD while mic is muted (NPC speaking through speakers).
        if (!session.mic.getAudioTracks()[0]?.enabled) break;
        // Barge-in: player deliberately spoke over the NPC.
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
          const speaker = `player:${session.client.playerName}`;
          this.deps.sendTranscript(npcId, speaker, text);
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
        console.error('Realtime error:', evt.error || evt);
        break;
    }
  }

  private resetInactivity(npcId: string): void {
    const session = this.sessions.get(npcId);
    if (!session) return;
    if (session.inactivityTimer) window.clearTimeout(session.inactivityTimer);
    session.inactivityTimer = window.setTimeout(() => {
      if (session.speaking) {
        // NPC mid-line — give more time before closing.
        this.resetInactivity(npcId);
        return;
      }
      console.warn(
        `[${npcId}] conversation idle for ${INACTIVITY_MS / 1000}s — closing session. ` +
          'Click Enable Conv again to restore voice.'
      );
      session.client.onTimeout?.();
      this.deps.onSessionIdleClose?.(npcId);
      this.stop(npcId);
    }, INACTIVITY_MS);
  }
}
