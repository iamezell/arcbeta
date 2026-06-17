import { SceneId, TransitionMode, ShowCue, SCENE_ACT_1, SCENE_LABELS } from './scenes';

// Minimal DOM panel for the Director to drive the show. Only created for the
// Director role; the audience never sees it (the experience stays 3D-first).

export class ShowDirectorUI {
  private panel: HTMLDivElement;
  private sceneLabel: HTMLSpanElement;
  private modeSelect: HTMLSelectElement;

  // Wired by the controller.
  public onStartAct: (sceneId: SceneId, mode: TransitionMode) => void = () => {};
  public onCue: (cue: ShowCue) => void = () => {};

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
      <div class="asd-cues-title">Cues</div>
      <div class="asd-cues">
        <button data-cue="thunder">Thunder</button>
        <button data-cue="lightning">Lightning</button>
        <button data-cue="rainUp">Rain Up</button>
        <button data-cue="gateLight">Gate Light On</button>
      </div>
    `;
    document.body.appendChild(this.panel);

    this.sceneLabel = this.panel.querySelector('.asd-scene') as HTMLSpanElement;
    this.modeSelect = this.panel.querySelector('.asd-mode') as HTMLSelectElement;

    (this.panel.querySelector('.asd-start') as HTMLButtonElement).addEventListener('click', () => {
      const mode = this.modeSelect.value as TransitionMode;
      this.onStartAct(SCENE_ACT_1, mode);
    });

    this.panel.querySelectorAll('.asd-cues button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cue = (btn as HTMLElement).dataset.cue as ShowCue;
        if (cue) this.onCue(cue);
      });
    });
  }

  setCurrentScene(scene: SceneId): void {
    this.sceneLabel.textContent = SCENE_LABELS[scene] ?? scene;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #arc-show-director {
        position: fixed; left: 16px; bottom: 16px; width: 220px;
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
      #arc-show-director .asd-cues-title { opacity: 0.7; margin-bottom: 6px; }
      #arc-show-director .asd-cues { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      #arc-show-director .asd-cues button {
        padding: 8px; border: 0; border-radius: 6px; cursor: pointer;
        background: #2a2f3c; color: #fff; font-size: 12px;
      }
      #arc-show-director .asd-cues button:hover { background: #3a4150; }
    `;
    document.head.appendChild(style);
  }
}
