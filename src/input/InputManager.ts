/**
 * InputManager — a unified, source-agnostic input layer for ARC.
 *
 * Movement and look are expressed as normalized values that any consumer (the
 * FPSController today, a VR rig tomorrow) can read without caring where the input
 * came from:
 *
 *   - getMoveVector(): { x, y } in -1..1   (x = strafe right, y = forward)
 *   - getLookDelta():  { x, y } radians-ish yaw/pitch delta since last read
 *   - isInteracting(): true while the user is actively driving input
 *   - update(delta):   per-frame bookkeeping
 *
 * Multiple "sources" feed the same shared state:
 *   - Built-in keyboard + pointer-lock mouse (desktop).
 *   - Touch joystick + touch look (mobile)  -> see TouchControls, which calls
 *     setTouchMove() / addLook().
 *   - VR controllers (future / current XR)  -> call setVRMove() from the XR loop.
 *
 * Because every source writes into the same normalized fields, adding a new
 * source (e.g. a gamepad) is just: read the device, call setExternalMove()/addLook().
 * No consumer code changes.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface InputManagerOptions {
  /** Attach keyboard + pointer-lock mouse listeners (desktop). Default true. */
  enableKeyboardMouse?: boolean;
  /** Look sensitivity for mouse (radians per pixel). */
  mouseLookSensitivity?: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class InputManager {
  private domElement: HTMLElement;

  // Per-source movement contributions (each normalized to -1..1).
  private keyboardMove: Vec2 = { x: 0, y: 0 };
  private touchMove: Vec2 = { x: 0, y: 0 };
  private vrMove: Vec2 = { x: 0, y: 0 };

  // Accumulated look delta consumed (and reset) by getLookDelta().
  private lookDelta: Vec2 = { x: 0, y: 0 };

  private jumpRequested = false;
  private lastInteractionAt = 0;

  private mouseLookSensitivity: number;
  /** Multiplier applied to touch/gyro look so the UI can offer a sensitivity slider. */
  public lookSensitivityScale = 1;

  private keysDown = new Set<string>();
  private disposed = false;
  private detachFns: Array<() => void> = [];

  constructor(domElement: HTMLElement, opts: InputManagerOptions = {}) {
    this.domElement = domElement;
    this.mouseLookSensitivity = opts.mouseLookSensitivity ?? 0.002;
    if (opts.enableKeyboardMouse !== false) {
      this.attachKeyboardMouse();
    }
  }

  // ---- Public read API (consumed by FPSController / future rigs) ----

  /** Combined, clamped movement intent. x = strafe (+right), y = forward (+fwd). */
  public getMoveVector(): Vec2 {
    const x = clamp(this.keyboardMove.x + this.touchMove.x + this.vrMove.x, -1, 1);
    const y = clamp(this.keyboardMove.y + this.touchMove.y + this.vrMove.y, -1, 1);
    return { x, y };
  }

  /** Accumulated yaw/pitch delta since the previous call; resets to zero. */
  public getLookDelta(): Vec2 {
    const d = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return d;
  }

  public isInteracting(): boolean {
    const m = this.getMoveVector();
    if (m.x !== 0 || m.y !== 0) return true;
    return Date.now() - this.lastInteractionAt < 120;
  }

  /** True once, then cleared — used to fire a single jump per request. */
  public consumeJump(): boolean {
    if (!this.jumpRequested) return false;
    this.jumpRequested = false;
    return true;
  }

  public update(_delta: number): void {
    // Reserved for smoothing/inertia if desired later. Look is consumed per-frame
    // by the controller via getLookDelta(); movement is polled live.
  }

  // ---- Source write API (called by TouchControls, XR loop, gamepad, etc.) ----

  /** Touch joystick output, normalized -1..1 (x strafe, y forward). */
  public setTouchMove(x: number, y: number): void {
    this.touchMove.x = clamp(x, -1, 1);
    this.touchMove.y = clamp(y, -1, 1);
    if (x !== 0 || y !== 0) this.lastInteractionAt = Date.now();
  }

  /** VR / future controller movement, normalized -1..1. */
  public setVRMove(x: number, y: number): void {
    this.vrMove.x = clamp(x, -1, 1);
    this.vrMove.y = clamp(y, -1, 1);
    if (x !== 0 || y !== 0) this.lastInteractionAt = Date.now();
  }

  /** Generic external movement source (alias for clarity in new sources). */
  public setExternalMove(x: number, y: number): void {
    this.setVRMove(x, y);
  }

  /** Add a look delta in screen-ish units (touch px or gyro radians*scale). */
  public addLook(dx: number, dy: number): void {
    this.lookDelta.x += dx * this.lookSensitivityScale;
    this.lookDelta.y += dy * this.lookSensitivityScale;
    this.lastInteractionAt = Date.now();
  }

  public requestJump(): void {
    this.jumpRequested = true;
    this.lastInteractionAt = Date.now();
  }

  // ---- Built-in keyboard + mouse source ----

  private attachKeyboardMouse(): void {
    const recompute = (): void => {
      let x = 0;
      let y = 0;
      if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) y += 1;
      if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) y -= 1;
      if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) x += 1;
      if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) x -= 1;
      this.keyboardMove.x = x;
      this.keyboardMove.y = y;
      if (x !== 0 || y !== 0) this.lastInteractionAt = Date.now();
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        this.requestJump();
        return;
      }
      this.keysDown.add(e.code);
      recompute();
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      this.keysDown.delete(e.code);
      recompute();
    };

    // Pointer-lock mouse look (desktop). On mobile this never fires (no lock).
    const onClick = (): void => {
      if (this.domElement.requestPointerLock) this.domElement.requestPointerLock();
    };
    const onMouseMove = (e: MouseEvent): void => {
      if (document.pointerLockElement !== this.domElement) return;
      this.addLook(e.movementX * this.mouseLookSensitivity, e.movementY * this.mouseLookSensitivity);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    this.domElement.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);

    this.detachFns.push(() => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      this.domElement.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detachFns.forEach((fn) => fn());
    this.detachFns = [];
  }
}
