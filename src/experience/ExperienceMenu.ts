import { AudienceExperienceManager } from './AudienceExperienceManager';
import { AudienceRegistry } from '../audience/AudienceRegistry';
import { ExperienceMode } from './types';

/**
 * ExperienceMenu — mobile-friendly UI for choosing an Audience Experience Mode.
 *
 *   Experience Mode:  [ Participant ] [ Follow ] [ Observer ]
 *   Follow   -> list of live participants to follow (+ Exit Follow)
 *   Observer -> list of predefined viewpoints (seats)
 *
 * Purely a view over AudienceExperienceManager; it issues setMode /
 * followParticipant / setObserverCamera calls and re-renders on change. It
 * subscribes to the registry too, so the Follow list stays live as people join
 * or leave.
 */
export class ExperienceMenu {
  private manager: AudienceExperienceManager;
  private registry: AudienceRegistry;
  private root: HTMLElement;
  private panel!: HTMLElement;
  private open = false;
  private unsub: Array<() => void> = [];

  constructor(manager: AudienceExperienceManager, registry: AudienceRegistry) {
    this.manager = manager;
    this.registry = registry;
    this.injectStyles();
    this.root = this.build();
    document.body.appendChild(this.root);

    this.unsub.push(this.manager.onChange(() => this.render()));
    this.unsub.push(this.registry.onChange(() => this.render()));
    this.render();
  }

  private injectStyles(): void {
    if (document.getElementById('arc-exp-styles')) return;
    const style = document.createElement('style');
    style.id = 'arc-exp-styles';
    style.textContent = `
      #arc-exp { position:fixed; top:max(58px,calc(env(safe-area-inset-top) + 50px)); left:50%;
        transform:translateX(-50%); z-index:360; font-family:'Segoe UI',Tahoma,sans-serif;
        display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; }
      #arc-exp .launch, #arc-exp .panel { pointer-events:auto; -webkit-tap-highlight-color:transparent; }
      #arc-exp .launch { background:rgba(18,22,32,0.85); border:1px solid rgba(150,205,255,0.3);
        color:#dcebff; border-radius:20px; padding:9px 16px; font-size:14px; cursor:pointer;
        backdrop-filter:blur(6px); display:flex; align-items:center; gap:8px; }
      #arc-exp .panel { display:none; flex-direction:column; gap:12px; width:min(320px,86vw);
        background:rgba(15,19,28,0.96); border:1px solid rgba(150,205,255,0.25); border-radius:16px;
        padding:16px; box-shadow:0 14px 44px rgba(0,0,0,0.55); }
      #arc-exp.open .panel { display:flex; }
      #arc-exp h4 { margin:0; font-size:12px; letter-spacing:0.8px; color:#9fd0ff; }
      #arc-exp .modes { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
      #arc-exp .opt, #arc-exp .modes button { background:#1a2030; border:1.5px solid rgba(150,205,255,0.2);
        color:#cfe2ff; border-radius:12px; padding:14px 10px; font-size:15px; cursor:pointer; text-align:center; }
      #arc-exp .opt { display:flex; align-items:center; justify-content:space-between; }
      #arc-exp .opt small { opacity:0.55; font-size:12px; margin-left:8px; }
      #arc-exp .opt:active, #arc-exp .modes button:active { background:#243150; }
      #arc-exp .sel { border-color:#39a074; background:#1f4a3a; color:#bff5da; }
      #arc-exp .list { display:flex; flex-direction:column; gap:8px; max-height:42vh; overflow-y:auto; }
      #arc-exp .empty { opacity:0.5; font-size:13px; padding:6px 2px; }
      #arc-exp .exit { background:#3a2226; border-color:rgba(255,150,150,0.4); color:#ffc7c7; border-radius:12px;
        padding:13px; font-size:15px; cursor:pointer; }
    `;
    document.head.appendChild(style);
  }

  private build(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'arc-exp';

    const launch = document.createElement('button');
    launch.className = 'launch';
    launch.innerHTML = '🎭 <span id="arc-exp-label">Experience</span>';
    launch.addEventListener('click', () => {
      this.open = !this.open;
      root.classList.toggle('open', this.open);
      this.render();
    });

    this.panel = document.createElement('div');
    this.panel.className = 'panel';

    root.appendChild(launch);
    root.appendChild(this.panel);
    return root;
  }

  private modeButton(label: string, mode: ExperienceMode, current: ExperienceMode): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    if (mode === current) b.classList.add('sel');
    b.addEventListener('click', () => {
      if (mode === 'participant') this.manager.stopFollowing();
      else this.manager.setMode(mode);
    });
    return b;
  }

  private render(): void {
    const label = document.getElementById('arc-exp-label');
    const mode = this.manager.getMode();
    if (label) label.textContent = this.modeLabel(mode);
    if (!this.open) return;

    this.panel.innerHTML = '';

    const title = document.createElement('h4');
    title.textContent = 'EXPERIENCE MODE';
    const modes = document.createElement('div');
    modes.className = 'modes';
    modes.appendChild(this.modeButton('Participant', 'participant', mode));
    modes.appendChild(this.modeButton('Follow', 'follow', mode));
    modes.appendChild(this.modeButton('Observer', 'observer', mode));
    this.panel.appendChild(title);
    this.panel.appendChild(modes);

    if (mode === 'follow') this.renderFollow();
    else if (mode === 'observer') this.renderObserver();
  }

  private renderFollow(): void {
    const h = document.createElement('h4');
    h.textContent = 'FOLLOW';
    this.panel.appendChild(h);

    const list = document.createElement('div');
    list.className = 'list';
    // Only participants that actually have an avatar in-scene can be followed.
    const followable = this.registry.getFollowable().filter((p) => !!p.object);
    if (followable.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No one to follow yet. Waiting for participants…';
      list.appendChild(empty);
    } else {
      const currentTarget = this.manager.getFollowTargetId();
      for (const p of followable) {
        const b = document.createElement('button');
        b.className = 'opt';
        if (p.id === currentTarget) b.classList.add('sel');
        b.innerHTML = `<span>${escapeHtml(p.displayName)}</span><small>${escapeHtml(p.role)}</small>`;
        b.addEventListener('click', () => this.manager.followParticipant(p.id));
        list.appendChild(b);
      }
    }
    this.panel.appendChild(list);

    const exit = document.createElement('button');
    exit.className = 'exit';
    exit.textContent = '⤺ Exit Follow';
    exit.addEventListener('click', () => this.manager.stopFollowing());
    this.panel.appendChild(exit);
  }

  private renderObserver(): void {
    const h = document.createElement('h4');
    h.textContent = 'VIEWPOINTS';
    this.panel.appendChild(h);

    const list = document.createElement('div');
    list.className = 'list';
    const current = this.manager.getObserverViewpointId();
    for (const vp of this.manager.getViewpoints()) {
      const b = document.createElement('button');
      b.className = 'opt';
      if (vp.id === current) b.classList.add('sel');
      b.innerHTML = `<span>${escapeHtml(vp.label)}</span><small>seat</small>`;
      b.addEventListener('click', () => this.manager.setObserverCamera(vp.id));
      list.appendChild(b);
    }
    this.panel.appendChild(list);
  }

  private modeLabel(mode: ExperienceMode): string {
    switch (mode) {
      case 'follow':
        return 'Following';
      case 'observer':
        return 'Observing';
      default:
        return 'Experience';
    }
  }

  public dispose(): void {
    this.unsub.forEach((fn) => fn());
    this.unsub = [];
    this.root.remove();
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
