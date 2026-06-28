/**
 * MobileHUD — a clean, theatrical overlay for phone audience members.
 *
 * Provides: Enable Audio, Fullscreen, a Menu with a volume slider, Gyro Look
 * toggle, Reduce Motion, Recenter, Calm/Stop, and Leave Experience, plus a small
 * connection-status pill and a soft "rotate sideways" orientation hint.
 *
 * The HUD is purely presentational: every action is delegated to a callback so
 * arc-client owns the wiring (audio, controller, sockets). The root is
 * pointer-events:none with interactive children opted back in, so it never steals
 * touches from the joystick / look zones underneath.
 */

export interface MobileHUDOptions {
  onEnableAudio: () => void | Promise<void>;
  onToggleGyro: () => Promise<boolean>;
  onRecenter: () => void;
  onCalm: () => void;
  onLeave: () => void;
  onVolume: (v: number) => void;
  onReduceMotion: (on: boolean) => void;
  gyroSupported: boolean;
  audioAlreadyEnabled?: boolean;
}

export class MobileHUD {
  private opts: MobileHUDOptions;
  private root: HTMLElement;
  private statusDot!: HTMLElement;
  private statusText!: HTMLElement;
  private audioOverlay!: HTMLElement;
  private menu!: HTMLElement;
  private menuOpen = false;

  constructor(opts: MobileHUDOptions) {
    this.opts = opts;
    this.injectStyles();
    this.root = this.build();
    document.body.appendChild(this.root);
    if (opts.audioAlreadyEnabled) this.hideAudioPrompt();
    this.maybeShowOrientationHint();
  }

  private injectStyles(): void {
    if (document.getElementById('arc-mhud-styles')) return;
    const style = document.createElement('style');
    style.id = 'arc-mhud-styles';
    style.textContent = `
      #arc-mhud { position:fixed; inset:0; z-index:350; pointer-events:none;
        font-family:'Segoe UI',Tahoma,sans-serif; color:#e9f2ff; }
      #arc-mhud .btn { pointer-events:auto; -webkit-tap-highlight-color:transparent;
        background:rgba(18,22,32,0.82); border:1px solid rgba(150,205,255,0.30); color:#dcebff;
        border-radius:14px; padding:0 16px; height:46px; min-width:46px; font-size:15px; cursor:pointer;
        display:inline-flex; align-items:center; justify-content:center; gap:8px; backdrop-filter:blur(6px); }
      #arc-mhud .btn:active { background:rgba(40,52,74,0.92); }
      #arc-mhud .top { position:absolute; top:max(10px,env(safe-area-inset-top)); left:0; right:0;
        display:flex; align-items:center; justify-content:space-between; padding:0 12px; }
      #arc-mhud .status { pointer-events:auto; display:flex; align-items:center; gap:8px;
        background:rgba(18,22,32,0.7); border-radius:20px; padding:7px 12px; font-size:12px; }
      #arc-mhud .dot { width:9px; height:9px; border-radius:50%; background:#5fd08a; box-shadow:0 0 8px #5fd08a; }
      #arc-mhud .dot.off { background:#d0695f; box-shadow:0 0 8px #d0695f; }
      #arc-mhud .top-right { display:flex; gap:8px; }
      #arc-audio-overlay { position:absolute; inset:0; pointer-events:auto; display:flex; align-items:center;
        justify-content:center; background:rgba(6,9,16,0.55); backdrop-filter:blur(2px); }
      #arc-audio-overlay .enable { font-size:20px; font-weight:700; height:64px; padding:0 32px;
        background:#2a7d5c; border-color:#39a074; color:#fff; border-radius:18px; }
      #arc-mhud .menu { position:absolute; top:64px; right:12px; width:min(280px,80vw);
        background:rgba(16,20,30,0.95); border:1px solid rgba(150,205,255,0.25); border-radius:16px;
        padding:14px; pointer-events:auto; display:none; flex-direction:column; gap:12px;
        box-shadow:0 12px 40px rgba(0,0,0,0.5); }
      #arc-mhud .menu.open { display:flex; }
      #arc-mhud .menu h4 { margin:0 0 2px; font-size:13px; color:#9fd0ff; letter-spacing:0.5px; }
      #arc-mhud .row { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:14px; }
      #arc-mhud input[type=range] { flex:1; accent-color:#5fd08a; }
      #arc-mhud .menu .btn { width:100%; }
      #arc-mhud .btn.calm { border-color:rgba(255,180,120,0.5); color:#ffd9b0; }
      #arc-mhud .btn.leave { border-color:rgba(255,120,120,0.5); color:#ffc0c0; }
      #arc-mhud .toggle.on { background:#1f4a3a; border-color:#39a074; color:#b6f5d6; }
      #arc-orient-hint { position:absolute; left:50%; bottom:84px; transform:translateX(-50%);
        background:rgba(18,22,32,0.92); border:1px solid rgba(150,205,255,0.3); border-radius:12px;
        padding:10px 16px; font-size:13px; pointer-events:none; text-align:center; max-width:80vw; }
    `;
    document.head.appendChild(style);
  }

  private build(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'arc-mhud';

    // Top bar: status pill + menu/fullscreen buttons.
    const top = document.createElement('div');
    top.className = 'top';

    const status = document.createElement('div');
    status.className = 'status';
    this.statusDot = document.createElement('span');
    this.statusDot.className = 'dot';
    this.statusText = document.createElement('span');
    this.statusText.textContent = 'Connected';
    status.appendChild(this.statusDot);
    status.appendChild(this.statusText);

    const topRight = document.createElement('div');
    topRight.className = 'top-right';

    if (document.fullscreenEnabled) {
      const fsBtn = this.makeButton('⛶', () => this.toggleFullscreen(), 'Fullscreen');
      topRight.appendChild(fsBtn);
    }
    const menuBtn = this.makeButton('☰', () => this.toggleMenu(), 'Menu');
    topRight.appendChild(menuBtn);

    top.appendChild(status);
    top.appendChild(topRight);

    // Audio enable prompt (covers screen until tapped — satisfies autoplay policy).
    this.audioOverlay = document.createElement('div');
    this.audioOverlay.id = 'arc-audio-overlay';
    const enableBtn = document.createElement('button');
    enableBtn.className = 'btn enable';
    enableBtn.textContent = '🔊 Enable Audio';
    enableBtn.addEventListener('click', async () => {
      await this.opts.onEnableAudio();
      this.hideAudioPrompt();
    });
    this.audioOverlay.appendChild(enableBtn);

    // Menu panel.
    this.menu = this.buildMenu();

    root.appendChild(top);
    root.appendChild(this.menu);
    root.appendChild(this.audioOverlay);
    return root;
  }

  private buildMenu(): HTMLElement {
    const menu = document.createElement('div');
    menu.className = 'menu';

    const volTitle = document.createElement('h4');
    volTitle.textContent = 'VOLUME';
    const volRow = document.createElement('div');
    volRow.className = 'row';
    const vol = document.createElement('input');
    vol.type = 'range';
    vol.min = '0';
    vol.max = '100';
    vol.value = '100';
    vol.addEventListener('input', () => this.opts.onVolume(Number(vol.value) / 100));
    volRow.appendChild(vol);

    const optTitle = document.createElement('h4');
    optTitle.textContent = 'COMFORT';

    let gyroBtn: HTMLButtonElement | null = null;
    if (this.opts.gyroSupported) {
      gyroBtn = this.makeButton('🧭 Gyro Look: Off', async () => {
        const on = await this.opts.onToggleGyro();
        gyroBtn!.textContent = on ? '🧭 Gyro Look: On' : '🧭 Gyro Look: Off';
        gyroBtn!.classList.toggle('on', on);
      });
      gyroBtn.classList.add('toggle');
    }

    const reduceBtn = this.makeButton('🌙 Reduce Motion: Off', () => {
      const on = !reduceBtn.classList.contains('on');
      reduceBtn.classList.toggle('on', on);
      reduceBtn.textContent = on ? '🌙 Reduce Motion: On' : '🌙 Reduce Motion: Off';
      this.opts.onReduceMotion(on);
    });
    reduceBtn.classList.add('toggle');

    const recenterBtn = this.makeButton('🎯 Recenter View', () => {
      this.opts.onRecenter();
      this.toggleMenu(false);
    });

    const calmBtn = this.makeButton('🛑 Stop / Calm', () => {
      this.opts.onCalm();
      this.toggleMenu(false);
    });
    calmBtn.classList.add('calm');

    const leaveBtn = this.makeButton('🚪 Leave Experience', () => this.opts.onLeave());
    leaveBtn.classList.add('leave');

    menu.appendChild(volTitle);
    menu.appendChild(volRow);
    menu.appendChild(optTitle);
    if (gyroBtn) menu.appendChild(gyroBtn);
    menu.appendChild(reduceBtn);
    menu.appendChild(recenterBtn);
    menu.appendChild(calmBtn);
    menu.appendChild(leaveBtn);
    return menu;
  }

  private makeButton(label: string, onClick: () => void, title?: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  private toggleMenu(force?: boolean): void {
    this.menuOpen = force ?? !this.menuOpen;
    this.menu.classList.toggle('open', this.menuOpen);
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      /* ignore — not all browsers allow this */
    }
  }

  private hideAudioPrompt(): void {
    this.audioOverlay.style.display = 'none';
  }

  /** Reflect connection state in the status pill. */
  public setStatus(text: string, connected = true): void {
    this.statusText.textContent = text;
    this.statusDot.classList.toggle('off', !connected);
  }

  private maybeShowOrientationHint(): void {
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    if (!isPortrait) return;
    const hint = document.createElement('div');
    hint.id = 'arc-orient-hint';
    hint.textContent = 'For the best ARC experience, rotate your phone sideways.';
    this.root.appendChild(hint);
    window.setTimeout(() => {
      hint.style.transition = 'opacity 0.6s';
      hint.style.opacity = '0';
      window.setTimeout(() => hint.remove(), 700);
    }, 5000);
  }

  public dispose(): void {
    this.root.remove();
  }
}
