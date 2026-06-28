import { InputManager } from './InputManager';
import { deviceOrientationNeedsPermission, supportsDeviceOrientation } from '../utils/device';

/**
 * TouchControls — on-screen mobile input that feeds the shared InputManager.
 *
 *   - Left half of the screen = a dynamic virtual joystick (appears under the
 *     thumb). Up/down = forward/back, left/right = strafe. Output -1..1.
 *   - Right half = touch look (drag to rotate). Horizontal = yaw, vertical = pitch.
 *   - Optional gyro look feeds the same look channel.
 *
 * It writes through InputManager.setTouchMove() / addLook(), so the FPSController
 * (and any future rig) consumes it identically to keyboard/VR input. Multitouch
 * is supported via pointerId tracking, so you can move and look simultaneously.
 *
 * Hidden by default on desktop/VR; arc-client only constructs it on phones.
 */

const JOY_MAX_RADIUS = 64; // px from base before clamping to full deflection
const TOUCH_LOOK_SENS = 0.0045; // radians per px (scaled by InputManager.lookSensitivityScale)
const GYRO_LOOK_SENS = 1.0; // multiplier for orientation-derived deltas

export class TouchControls {
  private input: InputManager;
  private root: HTMLElement;
  private moveZone!: HTMLElement;
  private lookZone!: HTMLElement;
  private joyBase!: HTMLElement;
  private joyThumb!: HTMLElement;

  // Active pointer tracking.
  private movePointerId: number | null = null;
  private moveOrigin = { x: 0, y: 0 };
  private lookPointerId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  // Gyro state.
  private gyroEnabled = false;
  private gyroPrev: { yaw: number; pitch: number } | null = null;
  private onOrientation?: (e: DeviceOrientationEvent) => void;

  constructor(input: InputManager, parent: HTMLElement = document.body) {
    this.input = input;
    this.injectStyles();
    this.root = this.buildDom();
    parent.appendChild(this.root);
    this.attach();
  }

  private injectStyles(): void {
    if (document.getElementById('arc-touch-styles')) return;
    const style = document.createElement('style');
    style.id = 'arc-touch-styles';
    style.textContent = `
      #arc-touch { position:fixed; inset:0; z-index:300; pointer-events:none; touch-action:none; }
      #arc-touch .zone { position:absolute; top:0; bottom:0; pointer-events:auto; touch-action:none; }
      #arc-move-zone { left:0; width:50%; }
      #arc-look-zone { right:0; width:50%; }
      #arc-joy-base {
        position:absolute; width:140px; height:140px; margin-left:-70px; margin-top:-70px;
        border-radius:50%; background:radial-gradient(circle, rgba(140,200,255,0.10), rgba(140,200,255,0.04));
        border:2px solid rgba(150,205,255,0.35); opacity:0; transition:opacity 0.12s; pointer-events:none;
      }
      #arc-joy-thumb {
        position:absolute; width:62px; height:62px; margin-left:-31px; margin-top:-31px;
        border-radius:50%; background:rgba(150,205,255,0.32); border:2px solid rgba(190,225,255,0.7);
        box-shadow:0 2px 12px rgba(0,0,0,0.4); pointer-events:none;
      }
      #arc-touch.active-move #arc-joy-base { opacity:1; }
      #arc-touch .hint {
        position:absolute; bottom:18px; left:0; right:0; text-align:center; color:rgba(220,235,255,0.35);
        font:12px/1.3 "Segoe UI",sans-serif; pointer-events:none; user-select:none;
      }
    `;
    document.head.appendChild(style);
  }

  private buildDom(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'arc-touch';

    this.moveZone = document.createElement('div');
    this.moveZone.id = 'arc-move-zone';
    this.moveZone.className = 'zone';

    this.lookZone = document.createElement('div');
    this.lookZone.id = 'arc-look-zone';
    this.lookZone.className = 'zone';

    this.joyBase = document.createElement('div');
    this.joyBase.id = 'arc-joy-base';
    this.joyThumb = document.createElement('div');
    this.joyThumb.id = 'arc-joy-thumb';
    this.joyBase.appendChild(this.joyThumb);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Left thumb: move · Right thumb: look';

    this.moveZone.appendChild(this.joyBase);
    root.appendChild(this.moveZone);
    root.appendChild(this.lookZone);
    root.appendChild(hint);
    return root;
  }

  private attach(): void {
    // --- Movement joystick (left zone) ---
    this.moveZone.addEventListener('pointerdown', (e) => {
      if (this.movePointerId !== null) return;
      e.preventDefault();
      this.movePointerId = e.pointerId;
      this.moveOrigin = { x: e.clientX, y: e.clientY };
      this.joyBase.style.left = `${e.clientX}px`;
      this.joyBase.style.top = `${e.clientY}px`;
      this.joyThumb.style.left = '0px';
      this.joyThumb.style.top = '0px';
      this.root.classList.add('active-move');
    });

    // --- Look (right zone) ---
    this.lookZone.addEventListener('pointerdown', (e) => {
      if (this.lookPointerId !== null) return;
      e.preventDefault();
      this.lookPointerId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    });

    // Track moves/ups globally so a finger that slides across zones still works.
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    // Belt-and-suspenders: stop page scroll/zoom gestures inside the experience.
    this.root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.movePointerId) {
      e.preventDefault();
      let dx = e.clientX - this.moveOrigin.x;
      let dy = e.clientY - this.moveOrigin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > JOY_MAX_RADIUS) {
        dx = (dx / dist) * JOY_MAX_RADIUS;
        dy = (dy / dist) * JOY_MAX_RADIUS;
      }
      this.joyThumb.style.left = `${dx}px`;
      this.joyThumb.style.top = `${dy}px`;
      // Up on screen (negative dy) = forward.
      this.input.setTouchMove(dx / JOY_MAX_RADIUS, -dy / JOY_MAX_RADIUS);
    } else if (e.pointerId === this.lookPointerId) {
      e.preventDefault();
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast = { x: e.clientX, y: e.clientY };
      this.input.addLook(dx * TOUCH_LOOK_SENS, dy * TOUCH_LOOK_SENS);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerId === this.movePointerId) {
      this.movePointerId = null;
      this.input.setTouchMove(0, 0);
      this.root.classList.remove('active-move');
    } else if (e.pointerId === this.lookPointerId) {
      this.lookPointerId = null;
    }
  };

  // ---- Gyro look (optional) ----

  /** Returns true if gyro look is now active. Handles the iOS permission gesture. */
  public async enableGyro(): Promise<boolean> {
    if (!supportsDeviceOrientation()) return false;
    try {
      if (deviceOrientationNeedsPermission()) {
        const req = (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission;
        const result = await req();
        if (result !== 'granted') return false;
      }
    } catch {
      return false;
    }

    this.gyroPrev = null;
    this.onOrientation = (ev: DeviceOrientationEvent) => this.handleOrientation(ev);
    window.addEventListener('deviceorientation', this.onOrientation, true);
    this.gyroEnabled = true;
    return true;
  }

  public disableGyro(): void {
    if (this.onOrientation) {
      window.removeEventListener('deviceorientation', this.onOrientation, true);
      this.onOrientation = undefined;
    }
    this.gyroEnabled = false;
    this.gyroPrev = null;
  }

  public isGyroEnabled(): boolean {
    return this.gyroEnabled;
  }

  private handleOrientation(ev: DeviceOrientationEvent): void {
    if (ev.alpha == null || ev.beta == null) return;
    // Convert degrees to radians; derive incremental look deltas vs. last sample.
    const yaw = (ev.alpha * Math.PI) / 180;
    const pitch = (ev.beta * Math.PI) / 180;
    if (this.gyroPrev) {
      let dYaw = yaw - this.gyroPrev.yaw;
      // Wrap around the 0/2π seam.
      if (dYaw > Math.PI) dYaw -= 2 * Math.PI;
      if (dYaw < -Math.PI) dYaw += 2 * Math.PI;
      const dPitch = pitch - this.gyroPrev.pitch;
      // alpha increases counter-clockwise; negate so turning right looks right.
      this.input.addLook(-dYaw * GYRO_LOOK_SENS, dPitch * GYRO_LOOK_SENS);
    }
    this.gyroPrev = { yaw, pitch };
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? '' : 'none';
  }

  public dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.disableGyro();
    this.root.remove();
  }
}
