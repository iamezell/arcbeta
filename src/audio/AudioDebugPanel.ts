import { AudioManager } from './AudioManager';
import { getLoadedLibraries } from './cueRegistry';
import { formatBytes } from './formatBytes';
import { AudioDebugVisualizer } from './AudioDebugVisualizer';

/**
 * Developer soundboard debug panel — active instances, cache, ambience layers.
 * Shown for Director role; toggle with backtick (`).
 */
export class AudioDebugPanel {
  private panel: HTMLDivElement;
  private visible = false;
  private audio: AudioManager;
  private visualizer: AudioDebugVisualizer | null;

  constructor(audio: AudioManager, visualizer?: AudioDebugVisualizer) {
    this.audio = audio;
    this.visualizer = visualizer ?? null;
    this.panel = document.createElement('div');
    this.panel.id = 'arc-audio-debug';
    this.panel.style.display = 'none';
    document.body.appendChild(this.panel);
    this.injectStyles();

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && !this.isTyping(e)) {
        this.toggle();
      }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.panel.style.display = this.visible ? 'block' : 'none';
    this.visualizer?.setEnabled(this.visible);
    if (this.visible) this.refresh();
  }

  isOpen(): boolean {
    return this.visible;
  }

  refresh(): void {
    if (!this.visible) return;
    const state = this.audio.getDebugState();
    const libs = getLoadedLibraries();
    const events = this.audio.getRecentEvents().slice(-5).reverse();
    const emitters = state.registeredEmitters;

    this.panel.innerHTML = `
      <h4>🔊 Audio Debug <span class="aad-hint">(\` toggle)</span></h4>
      <div class="aad-row"><span>Engine</span><strong>${state.enabled ? 'ON' : 'OFF — click Enable Audio'}</strong></div>
      <div class="aad-row"><span>Cache</span><strong>${state.cacheEntries} buffers · ${formatBytes(state.estimatedMemoryBytes)}</strong></div>
      <div class="aad-section">Cue libraries (${libs.length})</div>
      <div class="aad-list">${libs.map((l) => `<span class="aad-tag">${l}</span>`).join('')}</div>
      <div class="aad-section">Ambience layers (${state.ambienceLayers.length})</div>
      <div class="aad-list">${state.ambienceLayers.map((l) =>
        `<div>${l.spatial ? '📍' : '🌐'} ${l.layer} → ${l.cue}</div>`
      ).join('') || '<em>none</em>'}</div>
      <div class="aad-section">World emitters (${emitters.length})</div>
      <div class="aad-list aad-scroll">${emitters.map((e) =>
        `<div>📍 ${e.label} <small>${e.distanceToListener.toFixed(1)}m · vol ${e.volume.toFixed(2)}</small></div>`
      ).join('') || '<em>none</em>'}</div>
      <div class="aad-section">Active sounds (${state.activeInstances.length})</div>
      <div class="aad-list aad-scroll">${state.activeInstances.map((i) =>
        `<div>${i.spatial ? '📍' : '🔈'} ${i.cue} <small>(${i.group})</small></div>`
      ).join('') || '<em>none</em>'}</div>
      <div class="aad-row"><span>Moving emitters</span><strong>${state.movingEmitters}</strong></div>
      <div class="aad-section">Recent director cues</div>
      <div class="aad-list aad-scroll">${events.map((e) =>
        `<div>${e.cueName} → ${e.resolvedCue}</div>`
      ).join('') || '<em>none</em>'}</div>
      <div class="aad-section">Loaded assets</div>
      <div class="aad-list aad-scroll"><small>${state.loadedCues.join(', ') || 'none yet (lazy load)'}</small></div>
    `;

    this.visualizer?.sync(this.audio.getEmitterSnapshots());
  }

  private isTyping(e: KeyboardEvent): boolean {
    const t = e.target;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
  }

  private injectStyles(): void {
    if (document.getElementById('arc-audio-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'arc-audio-debug-styles';
    style.textContent = `
      #arc-audio-debug {
        position: fixed; right: 16px; bottom: 200px; width: 280px; max-height: 55vh;
        overflow-y: auto; background: rgba(10,12,18,0.94); border: 1px solid rgba(100,180,255,0.3);
        border-radius: 10px; padding: 12px; z-index: 450; color: #dce8ff;
        font: 11px 'Consolas', 'Segoe UI', monospace;
      }
      #arc-audio-debug h4 { margin: 0 0 10px; font-size: 12px; font-family: 'Segoe UI', sans-serif; }
      #arc-audio-debug .aad-hint { opacity: 0.5; font-weight: normal; font-size: 10px; }
      #arc-audio-debug .aad-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
      #arc-audio-debug .aad-section { margin: 10px 0 4px; opacity: 0.65; font-size: 10px; text-transform: uppercase; }
      #arc-audio-debug .aad-list { line-height: 1.5; }
      #arc-audio-debug .aad-scroll { max-height: 80px; overflow-y: auto; }
      #arc-audio-debug .aad-tag {
        display: inline-block; background: #1a2438; padding: 2px 6px; border-radius: 4px; margin: 2px;
      }
      #arc-audio-debug small { opacity: 0.75; }
    `;
    document.head.appendChild(style);
  }
}
