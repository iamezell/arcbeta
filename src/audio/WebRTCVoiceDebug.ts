import { WebRTCVoicePipeline, WebRTCVoiceTestMode } from './WebRTCVoicePipeline';

/** Small debug panel to switch WebRTC voice test modes A / B / C. */
export class WebRTCVoiceDebug {
  private pipeline: WebRTCVoicePipeline;
  private panel: HTMLDivElement;
  private statusEl: HTMLDivElement;
  private streamEl: HTMLDivElement;

  constructor(pipeline: WebRTCVoicePipeline) {
    this.pipeline = pipeline;
    this.injectStyles();
    this.panel = document.createElement('div');
    this.panel.id = 'webrtc-voice-debug';
    this.panel.innerHTML = `
      <h4>🎙 WebRTC Voice Test</h4>
      <div class="wvd-stream wvd-stream--idle">⚠ NO STREAM — Enable Conv on Guard 1 first</div>
      <button type="button" class="wvd-beep">Test Beep (speakers)</button>
      <div class="wvd-modes">
        <button data-mode="A" title="Direct — no panner">A Direct</button>
        <button data-mode="B" title="Fixed panner at gate" disabled>B Panner</button>
        <button data-mode="C" title="NPC-synced panner" disabled>C NPC</button>
      </div>
      <div class="wvd-status">—</div>
      <div class="wvd-hint">
        Chrome decodes WebRTC via hidden &lt;audio&gt;; Web Audio taps it.<br>
        1. Act 1 → Guard 1 → <b>Enable Conv</b><br>
        2. Mode A until voice heard → B → C
      </div>
    `;
    document.body.appendChild(this.panel);
    this.statusEl = this.panel.querySelector('.wvd-status') as HTMLDivElement;
    this.streamEl = this.panel.querySelector('.wvd-stream') as HTMLDivElement;

    this.panel.querySelector('.wvd-beep')?.addEventListener('click', () => {
      this.pipeline.playDestinationTest();
    });

    this.panel.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.mode as WebRTCVoiceTestMode;
        if (mode !== 'A' && !this.pipeline.getStatus().wired) {
          console.warn('[WebRTCVoice] Enable Conv on Guard 1 before testing modes B/C');
          return;
        }
        this.pipeline.setMode(mode);
        this.refresh();
      });
    });

    this.refresh();
  }

  refresh(): void {
    const s = this.pipeline.getStatus();
    const wired = s.wired;

    this.streamEl.className = wired ? 'wvd-stream wvd-stream--ok' : 'wvd-stream wvd-stream--idle';
    this.streamEl.textContent = wired
      ? `✓ WebRTC stream wired (mode ${s.mode})`
      : '⚠ NO STREAM — NPC Director → Guard 1 → Enable Conv';

    const pos = s.pannerPosition
      ? `panner (${s.pannerPosition.x.toFixed(1)}, ${s.pannerPosition.y.toFixed(1)}, ${s.pannerPosition.z.toFixed(1)})`
      : s.hasPanner ? 'panner' : 'no panner';
    const wire = s.wireMethod ? ` · ${s.wireMethod}` : '';
    this.statusEl.textContent =
      `Mode ${s.mode} · ${s.wired ? 'wired' : 'idle'}${wire} · ${pos}` +
      (s.wired ? `\ndist ${s.distanceM.toFixed(0)}m · gain ${s.gain.toFixed(2)} · rms ${s.rms.toFixed(3)}` : '');

    this.panel.querySelectorAll('[data-mode]').forEach((btn) => {
      const el = btn as HTMLButtonElement;
      const mode = el.dataset.mode;
      el.classList.toggle('active', mode === s.mode);
      if (mode === 'A') {
        el.disabled = false;
      } else {
        el.disabled = !wired;
      }
    });
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #webrtc-voice-debug {
        position: fixed; left: 16px; bottom: 16px; width: 240px; z-index: 330;
        background: rgba(14,16,22,0.94); border: 1px solid rgba(255,180,80,0.35);
        border-radius: 10px; padding: 12px; color: #ffe8cc;
        font: 12px 'Segoe UI', sans-serif;
      }
      #webrtc-voice-debug h4 { margin: 0 0 8px; font-size: 13px; color: #ffb450; }
      #webrtc-voice-debug .wvd-stream {
        padding: 6px 8px; border-radius: 5px; font-size: 11px; margin-bottom: 8px; line-height: 1.35;
      }
      #webrtc-voice-debug .wvd-stream--idle {
        background: rgba(180, 40, 40, 0.35); border: 1px solid rgba(255, 100, 100, 0.5); color: #ffc8c8;
      }
      #webrtc-voice-debug .wvd-stream--ok {
        background: rgba(40, 120, 60, 0.35); border: 1px solid rgba(100, 255, 140, 0.4); color: #c8ffd8;
      }
      #webrtc-voice-debug .wvd-beep {
        width: 100%; margin-bottom: 8px; padding: 7px; border: 1px solid rgba(255,180,80,0.35);
        border-radius: 5px; background: #2a2218; color: #ffe8cc; cursor: pointer; font-size: 11px;
      }
      #webrtc-voice-debug .wvd-beep:hover { background: #3a3020; }
      #webrtc-voice-debug .wvd-modes { display: flex; gap: 4px; margin-bottom: 8px; }
      #webrtc-voice-debug .wvd-modes button {
        flex: 1; padding: 6px 4px; border: 1px solid rgba(255,180,80,0.3);
        border-radius: 5px; background: #2a2218; color: #ffe8cc; cursor: pointer; font-size: 11px;
      }
      #webrtc-voice-debug .wvd-modes button:disabled { opacity: 0.35; cursor: not-allowed; }
      #webrtc-voice-debug .wvd-modes button:hover:not(:disabled) { background: #3a3020; }
      #webrtc-voice-debug .wvd-modes button.active { background: #ffb450; color: #1a1208; border-color: #ffb450; font-weight: 600; }
      #webrtc-voice-debug .wvd-status {
        padding: 6px; background: #1a1510; border-radius: 5px; font-size: 11px; line-height: 1.4;
        font-family: monospace; white-space: pre-line;
      }
      #webrtc-voice-debug .wvd-hint { margin-top: 6px; opacity: 0.65; font-size: 10px; line-height: 1.45; }
    `;
    document.head.appendChild(style);
  }
}
