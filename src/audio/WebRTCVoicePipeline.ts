import * as THREE from 'three';
import {
  applyPannerStereoOnly,
  theatricalGainFromDistance,
} from './spatialConfig';
import { isWebRTCVoiceDebugEnabled } from './webrtcVoiceConfig';

/** Debug Mode B — fixed guard gate position (world metres). */
export const VOICE_TEST_B_POSITION = { x: -3.5, y: 1.6, z: -74 };

/** Production uses Mode C. Modes A/B are debug-only spatial test presets. */
export type WebRTCVoiceTestMode = 'A' | 'B' | 'C';

export type NpcWorldPositionProvider = () => THREE.Vector3;

type WireMethod = 'processor' | 'capture' | 'element';

const wiredElements = new WeakSet<HTMLMediaElement>();

/**
 * Live WebRTC NPC voice — manual Web Audio spatial chain.
 *
 * Production default: Mode C (panner follows NPC world position each frame).
 *
 * ## Why not raw MediaStreamAudioSourceNode?
 * Chrome + OpenAI Realtime often delivers a live WebRTC audio track that never
 * exposes decoded PCM to `createMediaStreamSource` (analyser RMS stays 0 while
 * the user would still hear voice through other paths). Distance gain then
 * appears broken because the graph is silent.
 *
 * ## Why not createMediaElementSource (primary)?
 * Tapping a playing `<audio>` element can work, but disconnecting or rewiring the
 * graph may restore direct HTML speaker output in Chrome — heard volume stays
 * constant while gain logs change. Keeping the element `muted=true` avoids that
 * leak; decode still runs for the processor/capture paths below.
 *
 * ## Preferred wire: MediaStreamTrackProcessor → MediaStreamTrackGenerator
 * Reads decoded audio frames from the WebRTC track, re-emits a fresh track, then
 * `createMediaStreamSource` on the generator output. All playback goes through:
 *
 *   source → inputGain → distanceGain → panner → destination
 *
 * Fallbacks (debug/troubleshooting): muted `captureStream()`, then element tap.
 */
export class WebRTCVoicePipeline {
  private readonly ctx: AudioContext;
  /** Production default — NPC-synced panner (Mode C). */
  private mode: WebRTCVoiceTestMode = 'C';
  private wireMethod: WireMethod | null = null;
  private streamSource: MediaStreamAudioSourceNode | null = null;
  private elementSource: MediaElementAudioSourceNode | null = null;
  private inputGain: GainNode | null = null;
  private distanceGain: GainNode | null = null;
  private panner: PannerNode | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly analyserBuf = new Uint8Array(256);
  private processorAbort: AbortController | null = null;
  private playbackElement: HTMLAudioElement | null = null;
  private npcLabel = 'npc';
  private npcPositionProvider: NpcWorldPositionProvider | null = null;
  private gainOverride: number | null = null;
  private readonly scratchPos = new THREE.Vector3();
  private distanceLogTimer = 0;
  private lastDistance = 0;
  private lastGain = 1;
  private lastRms = 0;
  private readonly listenerPos = new THREE.Vector3();
  private readonly sourcePos = new THREE.Vector3();

  constructor(audioContext: AudioContext) {
    this.ctx = audioContext;
    if (isWebRTCVoiceDebugEnabled()) {
      console.log('[WebRTCVoice] pipeline created, context state:', this.ctx.state);
    }
  }

  getMode(): WebRTCVoiceTestMode {
    return this.mode;
  }

  getWireMethod(): WireMethod | null {
    return this.wireMethod;
  }

  setMode(mode: WebRTCVoiceTestMode): void {
    if (mode === this.mode) return;
    if (isWebRTCVoiceDebugEnabled()) {
      console.log(`[WebRTCVoice] switch mode ${this.mode} → ${mode} (params only)`);
    }
    this.mode = mode;
    if (!this.distanceGain && isWebRTCVoiceDebugEnabled()) {
      console.warn('[WebRTCVoice] mode changed but not wired — Enable Conv first');
    }
  }

  playDestinationTest(): void {
    void this.ctx.resume().then(() => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      g.gain.value = 0.12;
      osc.frequency.value = 440;
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.3);
      console.log('[WebRTCVoice:TEST] beep played');
    });
  }

  hasStream(): boolean {
    return !!this.inputGain;
  }

  setNpcPositionProvider(provider: NpcWorldPositionProvider | null): void {
    this.npcPositionProvider = provider;
  }

  attachStream(
    playbackElement: HTMLAudioElement,
    stream: MediaStream,
    label = 'npc',
    track?: MediaStreamTrack
  ): void {
    this.npcLabel = label;
    this.playbackElement = playbackElement;

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    if (this.inputGain) {
      playbackElement.muted = true;
      playbackElement.srcObject = stream;
      void playbackElement.play().catch(() => {/* ignore */});
      return;
    }

    if (wiredElements.has(playbackElement)) {
      console.warn('[WebRTCVoice] element already tapped — start a new session');
      return;
    }

    const audioTrack = track ?? stream.getAudioTracks()[0];
    void this.wireAudio(playbackElement, stream, audioTrack);
  }

  nudgePlayback(): void {
    if (!this.playbackElement?.srcObject || !this.inputGain) return;
    void this.playbackElement.play().catch(() => {/* ignore */});
  }

  detach(): void {
    this.processorAbort?.abort();
    this.processorAbort = null;
    this.teardownAll();
    if (isWebRTCVoiceDebugEnabled()) {
      console.log('[WebRTCVoice] detached');
    }
  }

  update(camera: THREE.Camera, delta = 0): void {
    if (!this.distanceGain || !this.panner) return;

    camera.updateMatrixWorld(true);
    this.syncListenerFromCamera(camera);
    camera.getWorldPosition(this.listenerPos);

    if (this.gainOverride !== null) {
      this.distanceGain.gain.value = this.gainOverride;
      this.lastGain = this.gainOverride;
    } else if (this.mode === 'A') {
      this.sourcePos.copy(this.listenerPos);
      this.distanceGain.gain.value = 1;
      this.lastGain = 1;
      this.lastDistance = 0;
    } else {
      this.resolveSourcePosition();
      const distance = this.listenerPos.distanceTo(this.sourcePos);
      const gain = theatricalGainFromDistance(distance, 'speech');
      this.distanceGain.gain.value = gain;
      this.lastDistance = distance;
      this.lastGain = gain;
    }

    this.applySourceToPanner();
    this.lastRms = this.measureRms();

    this.distanceLogTimer += delta;
    if (isWebRTCVoiceDebugEnabled() && this.distanceLogTimer >= 2) {
      this.distanceLogTimer = 0;
      const distStr = this.mode === 'A' ? 'n/a' : `${this.lastDistance.toFixed(1)}m`;
      console.log(
        `[WebRTCVoice:DIST] wire=${this.wireMethod ?? '?'} mode=${this.mode} dist=${distStr} ` +
          `gain=${this.lastGain.toFixed(3)} rms=${this.lastRms.toFixed(4)} ` +
          `listener z=${this.listenerPos.z.toFixed(1)} source z=${this.sourcePos.z.toFixed(1)}`
      );
    }
  }

  forceGain(value: number): void {
    this.gainOverride = value;
    if (this.distanceGain) {
      this.distanceGain.gain.value = value;
    }
    console.log(
      `[WebRTCVoice] forceGain(${value}) locked — arcVoice.clearGain() to restore distance`
    );
  }

  clearGain(): void {
    this.gainOverride = null;
    console.log('[WebRTCVoice] gain override cleared — distance attenuation active');
  }

  forceInput(value: number): void {
    if (this.inputGain) {
      this.inputGain.gain.value = value;
      console.log(`[WebRTCVoice] forceInput(${value})`);
    }
  }

  readRms(): number {
    return this.measureRms();
  }

  /** Briefly duck gain to prove the graph controls heard volume. */
  proveGraph(): void {
    if (!this.distanceGain) {
      console.warn('[WebRTCVoice] not wired yet');
      return;
    }
    const prev = this.gainOverride;
    this.forceGain(0);
    console.log('[WebRTCVoice] proveGraph: silent for 800ms…');
    window.setTimeout(() => {
      if (prev === null) this.clearGain();
      else this.forceGain(prev);
      console.log('[WebRTCVoice] proveGraph: restored');
    }, 800);
  }

  getStatus(): {
    mode: WebRTCVoiceTestMode;
    wired: boolean;
    wireMethod: WireMethod | null;
    hasPanner: boolean;
    distanceM: number;
    gain: number;
    rms: number;
    pannerPosition: { x: number; y: number; z: number } | null;
  } {
    let pannerPosition: { x: number; y: number; z: number } | null = null;
    if (this.panner) {
      pannerPosition = {
        x: this.panner.positionX?.value ?? 0,
        y: this.panner.positionY?.value ?? 0,
        z: this.panner.positionZ?.value ?? 0,
      };
    }
    return {
      mode: this.mode,
      wired: !!this.inputGain,
      wireMethod: this.wireMethod,
      hasPanner: !!this.panner,
      distanceM: this.lastDistance,
      gain: this.lastGain,
      rms: this.lastRms,
      pannerPosition,
    };
  }

  private async wireAudio(
    element: HTMLAudioElement,
    stream: MediaStream,
    track: MediaStreamTrack | undefined
  ): Promise<void> {
    // Never route WebRTC decode to speakers — Web Audio owns output.
    element.muted = true;
    element.srcObject = stream;
    if (isWebRTCVoiceDebugEnabled()) {
      console.log(`[WebRTCVoice] decode element muted=true (${this.npcLabel})`);
    }

    if (track?.muted) {
      await this.waitForTrackUnmute(track);
    }

    try {
      await element.play();
    } catch (err) {
      console.warn('[WebRTCVoice] muted decode play blocked:', err);
    }

    if (track && (await this.tryWireProcessor(track))) {
      this.scheduleHealthCheck();
      return;
    }

    if (await this.tryWireCapture(element)) {
      this.scheduleHealthCheck();
      return;
    }

    if (this.tryWireElementSource(element)) {
      // Element stays muted=true; processor/capture are the supported production paths.
      element.muted = true;
      try {
        await element.play();
      } catch { /* ignore */ }
      this.scheduleHealthCheck();
      return;
    }

    console.error('[WebRTCVoice] all wire methods failed');
  }

  private waitForTrackUnmute(track: MediaStreamTrack): Promise<void> {
    return new Promise((resolve) => {
      if (!track.muted) {
        resolve();
        return;
      }
      const done = (): void => {
        track.removeEventListener('unmute', done);
        resolve();
      };
      track.addEventListener('unmute', done);
      window.setTimeout(done, 8000);
    });
  }

  private async tryWireProcessor(track: MediaStreamTrack): Promise<boolean> {
    // MediaStreamTrackProcessor reads decoded frames from the WebRTC track (works when
    // createMediaStreamSource on the raw track yields silence). Generator re-emits a
    // track that Web Audio can consume reliably.
    const ProcessorCtor = (window as unknown as { MediaStreamTrackProcessor?: new (init: { track: MediaStreamTrack }) => MediaStreamTrackProcessor }).MediaStreamTrackProcessor;
    const GeneratorCtor = (window as unknown as { MediaStreamTrackGenerator?: new (init: { kind: 'audio' }) => MediaStreamTrackGenerator }).MediaStreamTrackGenerator;
    if (!ProcessorCtor || !GeneratorCtor) return false;

    try {
      const processor = new ProcessorCtor({ track });
      const generator = new GeneratorCtor({ kind: 'audio' });
      this.processorAbort = new AbortController();
      void processor.readable
        .pipeTo(generator.writable, { signal: this.processorAbort.signal })
        .catch((err: Error) => {
          if (err?.name !== 'AbortError') {
            console.warn('[WebRTCVoice] processor pipe error:', err);
          }
        });

      await new Promise((r) => window.setTimeout(r, 150));

      const outStream = new MediaStream([generator]);
      this.streamSource = this.ctx.createMediaStreamSource(outStream);
      this.finishWire('processor', this.streamSource);
      return true;
    } catch (err) {
      console.warn('[WebRTCVoice] processor path failed:', err);
      this.processorAbort?.abort();
      this.processorAbort = null;
      return false;
    }
  }

  private async tryWireCapture(element: HTMLMediaElement): Promise<boolean> {
    // Fallback: tap decoded output from a muted playing element (no speaker leak).
    const captureFn =
      (element as HTMLMediaElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }).captureStream ??
      (element as HTMLMediaElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;
    if (!captureFn) return false;

    await new Promise<void>((resolve) => {
      if (element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) resolve();
      else element.addEventListener('playing', () => resolve(), { once: true });
      window.setTimeout(resolve, 3000);
    });

    try {
      const captured = captureFn.call(element);
      const capTrack = captured.getAudioTracks()[0];
      if (!capTrack) return false;
      this.streamSource = this.ctx.createMediaStreamSource(captured);
      this.finishWire('capture', this.streamSource);
      return true;
    } catch (err) {
      console.warn('[WebRTCVoice] captureStream path failed:', err);
      return false;
    }
  }

  private tryWireElementSource(element: HTMLAudioElement): boolean {
    // Last-resort debug fallback — prefer processor path in production.
    if (wiredElements.has(element)) return false;
    if (isWebRTCVoiceDebugEnabled()) {
      console.log(`[WebRTCVoice] fallback createMediaElementSource (${this.npcLabel})`);
    }
    try {
      this.elementSource = this.ctx.createMediaElementSource(element);
      wiredElements.add(element);
      this.finishWire('element', this.elementSource);
      return true;
    } catch (err) {
      console.error('[WebRTCVoice] createMediaElementSource failed:', err);
      return false;
    }
  }

  private finishWire(method: WireMethod, source: AudioNode): void {
    this.wireMethod = method;

    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 1;

    this.distanceGain = this.ctx.createGain();
    this.distanceGain.gain.value = 1;

    this.panner = this.ctx.createPanner();
    applyPannerStereoOnly(this.panner);

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;

    source.connect(this.inputGain);
    this.inputGain.connect(this.distanceGain);
    this.distanceGain.connect(this.panner);
    this.panner.connect(this.ctx.destination);
    this.distanceGain.connect(this.analyser);

    if (isWebRTCVoiceDebugEnabled()) {
      console.log(
        `[WebRTCVoice] wired via ${method}: source → inputGain → distanceGain → panner → destination`
      );
    }
  }

  private scheduleHealthCheck(): void {
    if (!isWebRTCVoiceDebugEnabled()) return;
    window.setTimeout(() => {
      const rms = this.measureRms();
      console.log(`[WebRTCVoice:LEVEL] wire=${this.wireMethod} rms=${rms.toFixed(5)}`);
      if (rms < 0.002) {
        console.warn(
          '[WebRTCVoice:LEAK?] graph rms≈0 — if voice is audible, audio bypasses Web Audio. ' +
            'Try arcVoice.proveGraph() while guard speaks.'
        );
      }
    }, 2500);
  }

  private resolveSourcePosition(): void {
    if (this.mode === 'B') {
      this.sourcePos.set(VOICE_TEST_B_POSITION.x, VOICE_TEST_B_POSITION.y, VOICE_TEST_B_POSITION.z);
    } else if (this.npcPositionProvider) {
      this.sourcePos.copy(this.npcPositionProvider());
    }
  }

  private applySourceToPanner(): void {
    if (!this.panner) return;
    const t = this.ctx.currentTime;
    if (this.panner.positionX) {
      this.panner.positionX.setValueAtTime(this.sourcePos.x, t);
      this.panner.positionY.setValueAtTime(this.sourcePos.y, t);
      this.panner.positionZ.setValueAtTime(this.sourcePos.z, t);
    } else {
      this.panner.setPosition(this.sourcePos.x, this.sourcePos.y, this.sourcePos.z);
    }
  }

  private measureRms(): number {
    if (!this.analyser) return 0;
    this.analyser.getByteTimeDomainData(this.analyserBuf);
    let sum = 0;
    for (let i = 0; i < this.analyserBuf.length; i++) {
      const v = (this.analyserBuf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / this.analyserBuf.length);
  }

  private teardownAll(): void {
    try {
      this.streamSource?.disconnect();
    } catch { /* no-op */ }
    try {
      this.elementSource?.disconnect();
    } catch { /* no-op */ }
    try {
      this.inputGain?.disconnect();
    } catch { /* no-op */ }
    try {
      this.distanceGain?.disconnect();
    } catch { /* no-op */ }
    try {
      this.panner?.disconnect();
    } catch { /* no-op */ }
    try {
      this.analyser?.disconnect();
    } catch { /* no-op */ }
    this.streamSource = null;
    this.elementSource = null;
    this.inputGain = null;
    this.distanceGain = null;
    this.panner = null;
    this.analyser = null;
    this.wireMethod = null;
    this.gainOverride = null;
    this.playbackElement = null;
  }

  private syncListenerFromCamera(camera: THREE.Camera): void {
    const apiListener = this.ctx.listener;
    const t = this.ctx.currentTime;
    const pos = this.scratchPos;
    const forward = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    camera.getWorldPosition(pos);
    camera.getWorldDirection(forward);

    if (apiListener.positionX) {
      apiListener.positionX.setValueAtTime(pos.x, t);
      apiListener.positionY.setValueAtTime(pos.y, t);
      apiListener.positionZ.setValueAtTime(pos.z, t);
      apiListener.forwardX.setValueAtTime(forward.x, t);
      apiListener.forwardY.setValueAtTime(forward.y, t);
      apiListener.forwardZ.setValueAtTime(forward.z, t);
      apiListener.upX.setValueAtTime(up.x, t);
      apiListener.upY.setValueAtTime(up.y, t);
      apiListener.upZ.setValueAtTime(up.z, t);
    } else {
      apiListener.setPosition(pos.x, pos.y, pos.z);
      apiListener.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }
}

export function exposeWebRTCVoiceConsole(pipeline: WebRTCVoicePipeline): void {
  if (!isWebRTCVoiceDebugEnabled()) return;

  const api = {
    setMode: (mode: WebRTCVoiceTestMode) => pipeline.setMode(mode),
    getMode: () => pipeline.getMode(),
    status: () => pipeline.getStatus(),
    beep: () => pipeline.playDestinationTest(),
    forceGain: (v: number) => pipeline.forceGain(v),
    clearGain: () => pipeline.clearGain(),
    forceInput: (v: number) => pipeline.forceInput(v),
    rms: () => pipeline.readRms(),
    proveGraph: () => pipeline.proveGraph(),
    help: () =>
      console.log(
        'While guard speaks:\n' +
          '  arcVoice.proveGraph()  — 800ms silence if graph controls volume\n' +
          '  arcVoice.forceGain(0)  — lock silent until arcVoice.clearGain()\n' +
          '  arcVoice.rms()         — PCM in graph (>0.01 when speaking)\n' +
          '  arcVoice.status()      — wire method: processor | capture | element'
      ),
  };
  (window as unknown as { arcVoice: typeof api }).arcVoice = api;
  console.log('[WebRTCVoice] console API ready — arcVoice.help()');
}
