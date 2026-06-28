import { SceneId, TransitionMode, SCENE_ACT_1, SCENE_LABELS } from './scenes';
import { CueAction } from '../cueEngine/types';
import {
  ACT1_CUE_DEFINITIONS,
  EMERGENCY_CUE_ACTIONS,
  STORM_CUE_ACTIONS,
} from '../cueEngine/definitions/act1Moments';
import { makeDraggablePanel } from '../ui/DraggablePanel';

// Director panel: scene control, theatrical beats/moments, and emergency overrides.
// Atomic storm/visual actions are data-driven cue definitions (not hardcoded handlers).

export class ShowDirectorUI {
  private panel: HTMLDivElement;
  private sceneLabel: HTMLSpanElement;
  private modeSelect: HTMLSelectElement;
  private beatStatus: HTMLDivElement;

  public onStartAct: (sceneId: SceneId, mode: TransitionMode) => void = () => {};
  public onFireAction: (action: CueAction) => void = () => {};
  public onStartBeat: (beatId: string) => void = () => {};
  public onStartMoment: (momentId: string) => void = () => {};
  public onPauseBeat: () => void = () => {};
  public onResumeBeat: () => void = () => {};
  public onStopBeat: () => void = () => {};

  constructor() {
    this.injectStyles();
    this.panel = document.createElement('div');
    this.panel.id = 'arc-show-director';
    this.panel.innerHTML = `
      <h4>🎭 Stage Director</h4>
      <div class="asd-row">
        <span class="asd-label">Current Scene</span>
        <span class="asd-scene">—</span>
      </div>
      <div class="asd-row">
        <span class="asd-label">Transition</span>
        <select class="asd-mode">
          <option value="instant">Instant Load</option>
          <option value="assemble">Assemble Scene</option>
        </select>
      </div>
      <button class="asd-start">Start Act 1</button>
      <div class="asd-cues-title">Theatrical Moments</div>
      <div class="asd-moments"></div>
      <div class="asd-cues-title">Act 1 Beats</div>
      <div class="asd-beats"></div>
      <div class="asd-transport">
        <button type="button" data-transport="pause">Pause</button>
        <button type="button" data-transport="resume">Resume</button>
        <button type="button" data-transport="stop">Stop</button>
      </div>
      <div class="asd-beat-status">Beat idle</div>
      <div class="asd-cues-title asd-emergency-title">Emergency Overrides</div>
      <div class="asd-emergency"></div>
      <div class="asd-cues-title">Visual Cues</div>
      <div class="asd-cues">
        <button data-action="visual" data-cue="lightning">Lightning</button>
        <button data-action="visual" data-cue="rainUp">Rain Up</button>
        <button data-action="visual" data-cue="gateLight">Gate Light</button>
      </div>
      <div class="asd-cues-title asd-storm-title">Storm Audio</div>
      <div class="asd-storm-cues"></div>
      <p class="asd-hint">Hotkeys 1–0 for storm cues (Director only)</p>
    `;
    document.body.appendChild(this.panel);

    this.sceneLabel = this.panel.querySelector('.asd-scene') as HTMLSpanElement;
    this.modeSelect = this.panel.querySelector('.asd-mode') as HTMLSelectElement;
    this.beatStatus = this.panel.querySelector('.asd-beat-status') as HTMLDivElement;

    (this.panel.querySelector('.asd-start') as HTMLButtonElement).addEventListener('click', () => {
      this.onStartAct(SCENE_ACT_1, this.modeSelect.value as TransitionMode);
    });

    const momentsEl = this.panel.querySelector('.asd-moments')!;
    for (const moment of Object.values(ACT1_CUE_DEFINITIONS.moments)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'asd-moment-btn';
      btn.textContent = moment.label;
      btn.title = moment.description ?? '';
      btn.addEventListener('click', () => this.onStartMoment(moment.id));
      momentsEl.appendChild(btn);
    }

    const beatsEl = this.panel.querySelector('.asd-beats')!;
    for (const beat of Object.values(ACT1_CUE_DEFINITIONS.beats)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'asd-beat-btn';
      btn.textContent = beat.label;
      btn.title = beat.description ?? '';
      btn.addEventListener('click', () => this.onStartBeat(beat.id));
      beatsEl.appendChild(btn);
    }

    this.panel.querySelectorAll('[data-transport]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = (btn as HTMLElement).dataset.transport;
        if (t === 'pause') this.onPauseBeat();
        if (t === 'resume') this.onResumeBeat();
        if (t === 'stop') this.onStopBeat();
      });
    });

    const emergencyEl = this.panel.querySelector('.asd-emergency')!;
    for (const entry of EMERGENCY_CUE_ACTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'asd-emergency-btn';
      btn.textContent = entry.label;
      btn.addEventListener('click', () => this.onFireAction(entry.action));
      emergencyEl.appendChild(btn);
    }

    this.panel.querySelectorAll('[data-action="visual"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cue = (btn as HTMLElement).dataset.cue!;
        this.onFireAction({ type: 'visual_cue', cue: cue as import('./scenes').VisualShowCue });
      });
    });

    const stormList = this.panel.querySelector('.asd-storm-cues')!;
    for (const entry of STORM_CUE_ACTIONS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'asd-storm-btn';
      btn.textContent = entry.key ? `${entry.label} [${entry.key}]` : entry.label;
      btn.addEventListener('click', () => this.onFireAction(entry.action));
      stormList.appendChild(btn);
    }

    makeDraggablePanel(this.panel);
  }

  setCurrentScene(scene: SceneId): void {
    this.sceneLabel.textContent = SCENE_LABELS[scene] ?? scene;
  }

  setBeatStatus(text: string): void {
    this.beatStatus.textContent = text;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #arc-show-director {
        position: fixed; left: 16px; bottom: 16px; width: 240px; max-height: 90vh;
        overflow-y: auto;
        background: rgba(12,14,20,0.92); border: 1px solid rgba(120,160,255,0.25);
        border-radius: 10px; padding: 14px; z-index: 320; color: #e8ecff;
        font: 13px 'Segoe UI', sans-serif;
      }
      #arc-show-director h4 { margin: 0 0 12px; font-size: 14px; }
      #arc-show-director .asd-row {
        display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
      }
      #arc-show-director .asd-label { opacity: 0.7; }
      #arc-show-director .asd-scene { font-weight: 600; color: #8fd0ff; text-align: right; max-width: 120px; }
      #arc-show-director .asd-mode {
        background: #20242f; color: #fff; border: 1px solid rgba(255,255,255,0.18);
        border-radius: 6px; padding: 4px 6px; font-size: 12px;
      }
      #arc-show-director .asd-start {
        width: 100%; margin: 6px 0 12px; padding: 10px; border: 0; border-radius: 8px;
        cursor: pointer; background: #3a6cff; color: #fff; font-size: 14px; font-weight: 600;
      }
      #arc-show-director .asd-start:hover { background: #4d7dff; }
      #arc-show-director .asd-cues-title { opacity: 0.7; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
      #arc-show-director .asd-moments, #arc-show-director .asd-beats, #arc-show-director .asd-emergency {
        display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px;
      }
      #arc-show-director .asd-moment-btn {
        padding: 8px; border: 0; border-radius: 6px; cursor: pointer;
        background: #2a3a5c; color: #fff; font-size: 12px; font-weight: 600; text-align: left;
      }
      #arc-show-director .asd-moment-btn:hover { background: #3a4a6c; }
      #arc-show-director .asd-beat-btn {
        padding: 7px 8px; border: 0; border-radius: 6px; cursor: pointer;
        background: #252a38; color: #d8e4ff; font-size: 11px; text-align: left;
      }
      #arc-show-director .asd-beat-btn:hover { background: #323848; }
      #arc-show-director .asd-transport { display: flex; gap: 4px; margin-bottom: 6px; }
      #arc-show-director .asd-transport button {
        flex: 1; padding: 5px; border: 1px solid rgba(255,255,255,0.15); border-radius: 5px;
        background: #1e2430; color: #ccc; font-size: 10px; cursor: pointer;
      }
      #arc-show-director .asd-beat-status {
        padding: 5px 6px; margin-bottom: 10px; background: #141820; border-radius: 5px;
        font-size: 10px; font-family: monospace; color: #8fd0ff;
      }
      #arc-show-director .asd-emergency-title { color: #ffb4a0; opacity: 1; }
      #arc-show-director .asd-emergency-btn {
        padding: 7px 8px; border: 1px solid rgba(255,120,80,0.35); border-radius: 6px;
        cursor: pointer; background: #2a1818; color: #ffd0c0; font-size: 11px; text-align: left;
      }
      #arc-show-director .asd-emergency-btn:hover { background: #3a2020; }
      #arc-show-director .asd-cues { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px; }
      #arc-show-director .asd-cues button {
        padding: 8px; border: 0; border-radius: 6px; cursor: pointer;
        background: #2a2f3c; color: #fff; font-size: 12px;
      }
      #arc-show-director .asd-cues button:hover { background: #3a4150; }
      #arc-show-director .asd-storm-title { margin-top: 4px; }
      #arc-show-director .asd-storm-cues {
        display: flex; flex-direction: column; gap: 5px; max-height: 160px;
        overflow-y: auto; margin-bottom: 6px;
      }
      #arc-show-director .asd-storm-btn {
        padding: 7px 8px; border: 0; border-radius: 6px; cursor: pointer;
        background: #1e2838; color: #c8d8ff; font-size: 11px; text-align: left;
      }
      #arc-show-director .asd-storm-btn:hover { background: #2a3848; }
      #arc-show-director .asd-hint {
        margin: 0; font-size: 10px; opacity: 0.55; line-height: 1.3;
      }
    `;
    document.head.appendChild(style);
  }
}
