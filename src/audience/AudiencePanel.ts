import { AudienceCueEngine } from './AudienceCueEngine';
import { AudienceRegistry } from './AudienceRegistry';
import { ParticipantSnapshot } from './types';
import { makeDraggablePanel } from '../ui/DraggablePanel';

/**
 * Director-only "Audience" panel. Lists active participants and exposes
 * personalized cue buttons per person, plus a global Calm/Reset.
 *
 * SAFETY: every per-person card has a "Silence" button and there is a prominent
 * global "Calm / Reset" that stops all private scary loops and returns everyone
 * to neutral. These effects are for voluntary immersive theater.
 */
export class AudiencePanel {
  private panel: HTMLDivElement;
  private listEl: HTMLDivElement;
  private registry: AudienceRegistry;
  private engine: AudienceCueEngine;
  private unsubscribe: () => void;

  constructor(registry: AudienceRegistry, engine: AudienceCueEngine) {
    this.registry = registry;
    this.engine = engine;
    this.injectStyles();

    this.panel = document.createElement('div');
    this.panel.id = 'arc-audience-panel';
    this.panel.innerHTML = `
      <div class="aap-head">
        <h4>👥 Audience</h4>
        <button class="aap-calm" title="Stop all private scary cues, restore neutral">Calm / Reset</button>
      </div>
      <div class="aap-everyone">
        <button data-everyone="thunder.distant">Distant Thunder (All)</button>
        <button data-everyone="storm.start">Storm Start (All)</button>
        <button data-everyone="storm.stop">Storm Stop (All)</button>
        <button data-everyone="whisper.private" data-target="random">Whisper (Random)</button>
      </div>
      <div class="aap-list"></div>
      <p class="aap-hint">Private cues are heard only by the targeted person. Mock members preview locally.</p>
    `;
    document.body.appendChild(this.panel);
    this.listEl = this.panel.querySelector('.aap-list') as HTMLDivElement;

    (this.panel.querySelector('.aap-calm') as HTMLButtonElement).addEventListener('click', () => {
      this.engine.calmReset();
      this.flash('Calm / Reset — all private cues stopped');
    });

    this.panel.querySelectorAll('[data-everyone]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cueId = (btn as HTMLElement).dataset.everyone!;
        const targetKind = (btn as HTMLElement).dataset.target;
        if (targetKind === 'random') {
          this.engine.triggerCue({ cueId, target: { type: 'randomAudienceMember' } });
        } else {
          this.engine.triggerCue({ cueId, target: { type: 'everyone' } });
        }
      });
    });

    this.unsubscribe = this.registry.onChange(() => this.render());
    this.render();
    makeDraggablePanel(this.panel, { handle: '.aap-head' });
  }

  dispose(): void {
    this.unsubscribe();
    this.panel.remove();
  }

  private render(): void {
    const members = this.registry.snapshot();
    if (members.length === 0) {
      this.listEl.innerHTML = `<div class="aap-empty">No participants yet.</div>`;
      return;
    }
    this.listEl.innerHTML = '';
    for (const m of members) {
      this.listEl.appendChild(this.renderCard(m));
    }
  }

  private renderCard(m: ParticipantSnapshot): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'aap-card';
    const fearPct = Math.round(m.affect.fearLevel * 100);
    const tags = [
      m.role,
      m.isMock ? 'mock' : m.isLocal ? 'you' : 'remote',
      m.audioEnabled ? 'audio✓' : 'audio✗',
    ].join(' · ');

    card.innerHTML = `
      <div class="aap-card-head">
        <span class="aap-name">${escapeHtml(m.displayName)}</span>
        <span class="aap-tags">${tags}</span>
      </div>
      <div class="aap-fear"><span style="width:${fearPct}%"></span></div>
      <div class="aap-btns">
        <button data-cue="whisper">Whisper</button>
        <button data-cue="childLaugh">Child Laugh</button>
        <button data-cue="heartbeat">Heartbeat</button>
        <button data-cue="wolfBehind">Wolf Behind</button>
        <button data-cue="reduceFear" class="aap-safe">Reduce Fear</button>
        <button data-cue="increaseTension">Increase Tension</button>
        <button data-cue="silence" class="aap-stop">Silence For Them</button>
      </div>
    `;

    card.querySelectorAll('[data-cue]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cue = (btn as HTMLElement).dataset.cue!;
        this.handleCardButton(cue, m.id, m.displayName);
      });
    });
    return card;
  }

  private handleCardButton(cue: string, id: string, name: string): void {
    switch (cue) {
      case 'whisper':
        this.engine.triggerPrivateWhisper(id);
        break;
      case 'childLaugh':
        this.engine.triggerPrivateChildLaugh(id);
        break;
      case 'heartbeat':
        this.engine.triggerPrivateHeartbeat(id);
        break;
      case 'wolfBehind':
        this.engine.triggerWolfBehindParticipant(id);
        break;
      case 'reduceFear':
        this.engine.reduceFearForParticipant(id);
        break;
      case 'increaseTension':
        this.engine.increaseTensionForParticipant(id);
        break;
      case 'silence':
        this.engine.silenceParticipant(id);
        break;
    }
    this.flash(`${labelFor(cue)} → ${name}`);
  }

  private flash(text: string): void {
    const note = this.panel.querySelector('.aap-hint') as HTMLElement;
    const prev = note.textContent;
    note.textContent = text;
    note.classList.add('aap-flash');
    window.setTimeout(() => {
      note.classList.remove('aap-flash');
      note.textContent = prev;
    }, 1600);
  }

  private injectStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      #arc-audience-panel {
        position: fixed; right: 286px; top: 16px; width: 260px; max-height: 86vh; overflow-y: auto;
        background: rgba(14,16,22,0.94); border: 1px solid rgba(120,200,255,0.25);
        border-radius: 10px; padding: 12px; z-index: 340; color: #e8f0ff;
        font: 12px 'Segoe UI', sans-serif;
      }
      #arc-audience-panel .aap-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
      #arc-audience-panel h4 { margin: 0; font-size: 14px; color: #9fd0ff; }
      #arc-audience-panel .aap-calm {
        padding: 6px 10px; border: 0; border-radius: 6px; cursor: pointer;
        background: #2a7d5c; color: #fff; font-size: 11px; font-weight: 600;
      }
      #arc-audience-panel .aap-calm:hover { background: #349670; }
      #arc-audience-panel .aap-everyone { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 10px; }
      #arc-audience-panel .aap-everyone button {
        padding: 6px; border: 0; border-radius: 5px; cursor: pointer;
        background: #233048; color: #cfe2ff; font-size: 10px;
      }
      #arc-audience-panel .aap-everyone button:hover { background: #2e3e5c; }
      #arc-audience-panel .aap-card {
        background: #171c26; border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px; padding: 8px; margin-bottom: 8px;
      }
      #arc-audience-panel .aap-card-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      #arc-audience-panel .aap-name { font-weight: 600; color: #fff; font-size: 13px; }
      #arc-audience-panel .aap-tags { font-size: 9px; opacity: 0.6; }
      #arc-audience-panel .aap-fear {
        height: 4px; background: #222a36; border-radius: 3px; overflow: hidden; margin-bottom: 7px;
      }
      #arc-audience-panel .aap-fear span { display: block; height: 100%; background: linear-gradient(90deg,#ffb454,#ff5c5c); }
      #arc-audience-panel .aap-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
      #arc-audience-panel .aap-btns button {
        padding: 6px 4px; border: 0; border-radius: 5px; cursor: pointer;
        background: #2a3142; color: #e8f0ff; font-size: 10px;
      }
      #arc-audience-panel .aap-btns button:hover { background: #364056; }
      #arc-audience-panel .aap-btns .aap-safe { background: #1f4a3a; color: #b6f5d6; }
      #arc-audience-panel .aap-btns .aap-safe:hover { background: #276049; }
      #arc-audience-panel .aap-btns .aap-stop { background: #4a1f1f; color: #ffc4c4; grid-column: 1 / -1; }
      #arc-audience-panel .aap-btns .aap-stop:hover { background: #5e2727; }
      #arc-audience-panel .aap-empty { opacity: 0.5; font-size: 11px; padding: 8px 0; }
      #arc-audience-panel .aap-hint { margin: 8px 0 0; font-size: 10px; opacity: 0.55; line-height: 1.35; }
      #arc-audience-panel .aap-hint.aap-flash { opacity: 1; color: #9fffd0; }
    `;
    document.head.appendChild(style);
  }
}

function labelFor(cue: string): string {
  const map: Record<string, string> = {
    whisper: 'Whisper',
    childLaugh: 'Child Laugh',
    heartbeat: 'Heartbeat',
    wolfBehind: 'Wolf Behind',
    reduceFear: 'Reduce Fear',
    increaseTension: 'Increase Tension',
    silence: 'Silence',
  };
  return map[cue] ?? cue;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );
}
