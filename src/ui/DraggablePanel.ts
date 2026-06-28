/**
 * makeDraggablePanel — drag a fixed-position HUD panel by its header/handle.
 * Position is saved to localStorage so it persists across reloads.
 */

export interface DraggablePanelOptions {
  /** CSS selector for the drag handle (defaults to the panel's first h4). */
  handle?: string;
  /** localStorage key; defaults to panel.id. */
  storageKey?: string;
}

const STORAGE_PREFIX = 'arc-panel-pos:';

export function makeDraggablePanel(panel: HTMLElement, opts: DraggablePanelOptions = {}): () => void {
  const handleSel = opts.handle ?? 'h4, .aap-head, .asd-drag-handle';
  const storageKey = opts.storageKey ?? panel.id;
  if (!storageKey) return () => {};

  injectDragStyles();

  // Restore a saved position (if any).
  restorePosition(panel, storageKey);

  const handle = panel.querySelector(handleSel) as HTMLElement | null;
  if (!handle) return () => {};

  handle.classList.add('arc-panel-drag-handle');
  handle.title = (handle.title ? handle.title + ' · ' : '') + 'Drag to move';

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originLeft = 0;
  let originTop = 0;

  const onPointerDown = (e: PointerEvent): void => {
    // Don't steal clicks from buttons inside the header.
    if ((e.target as HTMLElement).closest('button, select, input, textarea, a')) return;

    dragging = true;
    panel.classList.add('arc-panel-dragging');
    handle.setPointerCapture(e.pointerId);

    const rect = panel.getBoundingClientRect();
    // Pin to left/top so dragging math is simple (drop right/bottom anchoring).
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;

    startX = e.clientX;
    startY = e.clientY;
    originLeft = rect.left;
    originTop = rect.top;
    e.preventDefault();
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const left = clamp(originLeft + dx, 0, window.innerWidth - panel.offsetWidth);
    const top = clamp(originTop + dy, 0, window.innerHeight - 40);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  };

  const onPointerUp = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    panel.classList.remove('arc-panel-dragging');
    try {
      handle.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    savePosition(panel, storageKey);
  };

  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerUp);
  handle.addEventListener('pointercancel', onPointerUp);

  return () => {
    handle.removeEventListener('pointerdown', onPointerDown);
    handle.removeEventListener('pointermove', onPointerMove);
    handle.removeEventListener('pointerup', onPointerUp);
    handle.removeEventListener('pointercancel', onPointerUp);
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function savePosition(panel: HTMLElement, key: string): void {
  const left = parseFloat(panel.style.left);
  const top = parseFloat(panel.style.top);
  if (Number.isFinite(left) && Number.isFinite(top)) {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ left, top }));
    } catch {
      /* quota / private mode */
    }
  }
}

function restorePosition(panel: HTMLElement, key: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return;
    const { left, top } = JSON.parse(raw) as { left: number; top: number };
    if (!Number.isFinite(left) || !Number.isFinite(top)) return;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  } catch {
    /* ignore corrupt storage */
  }
}

let stylesInjected = false;
function injectDragStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .arc-panel-drag-handle { cursor: grab; user-select: none; touch-action: none; }
    .arc-panel-drag-handle:active, .arc-panel-dragging .arc-panel-drag-handle { cursor: grabbing; }
    .arc-panel-dragging { opacity: 0.96; box-shadow: 0 8px 32px rgba(0,0,0,0.55); }
  `;
  document.head.appendChild(style);
}
