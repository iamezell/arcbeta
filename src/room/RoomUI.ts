// All ARC room DOM overlays in one place: interaction prompt, feedback toasts,
// the reveal/clue modal, the keypad entry pad, and the Director control panel.
// Styling is intentionally utilitarian (greybox UI).

export class RoomUI {
  private prompt: HTMLDivElement;
  private toastWrap: HTMLDivElement;
  private modal: HTMLDivElement;
  private keypad: HTMLDivElement;
  private directorPanel: HTMLDivElement;
  private completeBanner: HTMLDivElement;
  private keypadValue = '';

  // Callbacks wired by the controller.
  public onKeypadSubmit: (code: string) => void = () => {};
  public onDirectorEvent: (eventId: string) => void = () => {};

  constructor() {
    this.injectStyles();
    this.prompt = this.makePrompt();
    this.toastWrap = this.makeToastWrap();
    this.modal = this.makeModal();
    this.keypad = this.makeKeypad();
    this.directorPanel = this.makeDirectorPanel();
    this.completeBanner = this.makeCompleteBanner();
  }

  // ----- interaction prompt -----

  showPrompt(label: string): void {
    this.prompt.textContent = `[E] ${label}`;
    this.prompt.style.display = 'block';
  }

  hidePrompt(): void {
    this.prompt.style.display = 'none';
  }

  // ----- toasts (shared + private feedback) -----

  toast(message: string, kind: 'info' | 'success' | 'warn' = 'info'): void {
    const el = document.createElement('div');
    el.className = `arc-toast arc-toast-${kind}`;
    el.textContent = message;
    this.toastWrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 4200);
  }

  // ----- reveal / clue modal -----

  showReveal(title: string, text: string): void {
    this.modal.querySelector('.arc-modal-title')!.textContent = title;
    this.modal.querySelector('.arc-modal-body')!.textContent = text;
    this.modal.style.display = 'flex';
    // Release pointer lock so the overlay's buttons are clickable.
    document.exitPointerLock?.();
  }

  private hideModal(): void {
    this.modal.style.display = 'none';
  }

  // ----- keypad -----

  openKeypad(): void {
    this.keypadValue = '';
    this.updateKeypadDisplay();
    this.keypad.style.display = 'flex';
    // Release pointer lock so the keypad buttons are clickable.
    document.exitPointerLock?.();
  }

  private closeKeypad(): void {
    this.keypad.style.display = 'none';
  }

  isKeypadOpen(): boolean {
    return this.keypad.style.display === 'flex';
  }

  // True when a modal-like overlay has focus and world interaction should pause.
  isBlocking(): boolean {
    return this.keypad.style.display === 'flex' || this.modal.style.display === 'flex';
  }

  private updateKeypadDisplay(): void {
    const display = this.keypad.querySelector('.arc-keypad-display')!;
    display.textContent = this.keypadValue || '----';
  }

  // ----- director panel -----

  buildDirectorPanel(events: { id: string; label: string }[]): void {
    const list = this.directorPanel.querySelector('.arc-director-list')!;
    list.innerHTML = '';
    for (const ev of events) {
      const btn = document.createElement('button');
      btn.className = 'arc-director-btn';
      btn.textContent = ev.label;
      btn.addEventListener('click', () => this.onDirectorEvent(ev.id));
      list.appendChild(btn);
    }
    this.directorPanel.style.display = 'block';
  }

  // ----- completion -----

  showComplete(): void {
    this.completeBanner.style.display = 'flex';
  }

  hideComplete(): void {
    this.completeBanner.style.display = 'none';
  }

  // ----- DOM construction -----

  private makePrompt(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'arc-prompt';
    document.body.appendChild(el);
    return el;
  }

  private makeToastWrap(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'arc-toasts';
    document.body.appendChild(el);
    return el;
  }

  private makeModal(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'arc-modal';
    el.innerHTML = `
      <div class="arc-modal-card">
        <h3 class="arc-modal-title"></h3>
        <p class="arc-modal-body"></p>
        <button class="arc-modal-close">Close</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelector('.arc-modal-close')!.addEventListener('click', () => this.hideModal());
    el.addEventListener('click', (e) => {
      if (e.target === el) this.hideModal();
    });
    return el;
  }

  private makeKeypad(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'arc-keypad';
    el.innerHTML = `
      <div class="arc-keypad-card">
        <div class="arc-keypad-display">----</div>
        <div class="arc-keypad-grid"></div>
        <div class="arc-keypad-actions">
          <button data-k="clear">Clear</button>
          <button data-k="enter" class="primary">Enter</button>
          <button data-k="cancel">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const grid = el.querySelector('.arc-keypad-grid')!;
    for (let n = 1; n <= 9; n++) this.addKeypadKey(grid, String(n));
    this.addKeypadKey(grid, '0');

    el.querySelectorAll('.arc-keypad-actions button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const k = (btn as HTMLElement).dataset.k;
        if (k === 'clear') {
          this.keypadValue = '';
          this.updateKeypadDisplay();
        } else if (k === 'cancel') {
          this.closeKeypad();
        } else if (k === 'enter') {
          const code = this.keypadValue;
          this.closeKeypad();
          this.onKeypadSubmit(code);
        }
      });
    });
    return el;
  }

  private addKeypadKey(grid: Element, digit: string): void {
    const b = document.createElement('button');
    b.textContent = digit;
    b.addEventListener('click', () => {
      if (this.keypadValue.length < 8) {
        this.keypadValue += digit;
        this.updateKeypadDisplay();
      }
    });
    grid.appendChild(b);
  }

  private makeDirectorPanel(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'arc-director';
    el.innerHTML = `<h4>🎬 Director Controls</h4><div class="arc-director-list"></div>`;
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  private makeCompleteBanner(): HTMLDivElement {
    const el = document.createElement('div');
    el.id = 'arc-complete';
    el.innerHTML = `<div class="arc-complete-card"><h2>Experience Complete</h2></div>`;
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #arc-prompt {
        position: fixed; left: 50%; bottom: 16%; transform: translateX(-50%);
        display: none; padding: 8px 14px; background: rgba(0,0,0,0.75); color: #fff;
        border: 1px solid rgba(255,255,255,0.35); border-radius: 6px;
        font: 16px 'Segoe UI', sans-serif; z-index: 200; pointer-events: none;
      }
      #arc-crosshair {
        position: fixed; left: 50%; top: 50%; width: 6px; height: 6px;
        margin: -3px 0 0 -3px; background: rgba(255,255,255,0.7); border-radius: 50%;
        z-index: 150; pointer-events: none;
      }
      #arc-toasts {
        position: fixed; right: 16px; bottom: 16px; display: flex; flex-direction: column;
        gap: 8px; z-index: 250; max-width: 360px;
      }
      .arc-toast {
        padding: 10px 14px; border-radius: 6px; color: #fff; font: 14px 'Segoe UI', sans-serif;
        background: rgba(30,30,40,0.92); border-left: 4px solid #6c8cff; transition: opacity .4s;
      }
      .arc-toast-success { border-left-color: #4caf50; }
      .arc-toast-warn { border-left-color: #e0a13a; }
      #arc-modal {
        position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.6); z-index: 400;
      }
      .arc-modal-card {
        background: #1d1d24; color: #eee; padding: 24px; border-radius: 10px; max-width: 420px;
        font: 15px 'Segoe UI', sans-serif; border: 1px solid rgba(255,255,255,0.15);
      }
      .arc-modal-title { margin: 0 0 10px; }
      .arc-modal-body { line-height: 1.5; }
      .arc-modal-close, #arc-keypad button {
        margin-top: 16px; padding: 8px 16px; border: 0; border-radius: 6px; cursor: pointer;
        background: #3a3a48; color: #fff; font-size: 14px;
      }
      #arc-keypad {
        position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.6); z-index: 400;
      }
      .arc-keypad-card {
        background: #1d1d24; padding: 20px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15);
      }
      .arc-keypad-display {
        font: 28px 'Courier New', monospace; letter-spacing: 6px; color: #6cff9a;
        background: #11131a; padding: 10px; border-radius: 6px; text-align: center; margin-bottom: 12px;
      }
      .arc-keypad-grid { display: grid; grid-template-columns: repeat(3, 64px); gap: 8px; }
      .arc-keypad-grid button {
        height: 56px; font-size: 22px; border: 0; border-radius: 8px; cursor: pointer;
        background: #2e2e3a; color: #fff; margin: 0;
      }
      .arc-keypad-actions { display: flex; gap: 8px; margin-top: 12px; }
      .arc-keypad-actions button { flex: 1; margin-top: 0; }
      #arc-keypad button.primary { background: #3a6cff; }
      #arc-director {
        position: fixed; right: 16px; top: 16px; width: 200px; background: rgba(20,20,28,0.92);
        border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; padding: 12px; z-index: 300;
        font: 13px 'Segoe UI', sans-serif; color: #fff;
      }
      #arc-director h4 { margin: 0 0 10px; }
      .arc-director-list { display: flex; flex-direction: column; gap: 6px; }
      .arc-director-btn {
        padding: 8px; border: 0; border-radius: 6px; cursor: pointer; background: #3a3a48; color: #fff;
        text-align: left; font-size: 13px;
      }
      .arc-director-btn:hover { background: #4a4a5c; }
      #arc-complete {
        position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.7); z-index: 500;
      }
      .arc-complete-card {
        background: #14301a; color: #b8ffcf; padding: 40px 60px; border-radius: 12px;
        border: 1px solid #2e7d4f; font: 'Segoe UI', sans-serif; text-align: center;
      }
    `;
    document.head.appendChild(style);

    const crosshair = document.createElement('div');
    crosshair.id = 'arc-crosshair';
    document.body.appendChild(crosshair);
  }
}
