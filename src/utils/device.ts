/**
 * Lightweight device/capability detection used to decide which input controls
 * to enable (desktop keyboard/mouse vs. mobile touch vs. VR). Kept dependency-free
 * and side-effect-free so it can be imported anywhere.
 */

export interface DeviceInfo {
  isMobile: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isTouchDevice: boolean;
  supportsDeviceOrientation: boolean;
}

function ua(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
}

export function isIOS(): boolean {
  const u = ua();
  // iPadOS 13+ reports as "Macintosh" but is a touch device.
  const iPadOS = /Macintosh/.test(u) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(u) || iPadOS;
}

export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

/** Phone/tablet (not a desktop). Headsets are handled separately via WebXR. */
export function isMobile(): boolean {
  const u = ua();
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(u)) return true;
  if (isIOS()) return true;
  return false;
}

/** Whether the DeviceOrientation API exists (gyro look). iOS also needs a permission grant. */
export function supportsDeviceOrientation(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** iOS 13+ gates DeviceOrientation behind an explicit permission request. */
export function deviceOrientationNeedsPermission(): boolean {
  return (
    supportsDeviceOrientation() &&
    typeof (DeviceOrientationEvent as unknown as { requestPermission?: unknown }).requestPermission === 'function'
  );
}

export function getDeviceInfo(): DeviceInfo {
  return {
    isMobile: isMobile(),
    isIOS: isIOS(),
    isAndroid: isAndroid(),
    isTouchDevice: isTouchDevice(),
    supportsDeviceOrientation: supportsDeviceOrientation(),
  };
}
