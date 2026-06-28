import os from 'os';

/**
 * LAN network detection for the local-rehearsal join flow. Finds the IPv4
 * address a phone/headset on the same Wi-Fi can use to reach this server, so the
 * host never has to run `ifconfig` by hand.
 */

export interface NetworkInfo {
  localIps: string[];
  recommendedIp: string;
  hostname: string | null;
  frontendPort: number;
  backendPort: number;
  /** true when no LAN IP was found and we fell back to localhost. */
  fallback: boolean;
  joinUrl: string;
}

// Interface-name hints, best first. macOS Wi-Fi is usually en0.
const PREFERRED_IFACE_HINTS = ['en0', 'wi-fi', 'wlan', 'wlp', 'eth', 'en'];

function isPrivateLanIPv4(ip: string): boolean {
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('10.')) return true;
  // 172.16.0.0 – 172.31.255.255
  const m = ip.match(/^172\.(\d+)\./);
  if (m) {
    const second = Number(m[1]);
    return second >= 16 && second <= 31;
  }
  return false;
}

/** Rank IPs so Wi-Fi/private addresses come first. */
function rankIp(ifaceName: string): number {
  const lower = ifaceName.toLowerCase();
  const idx = PREFERRED_IFACE_HINTS.findIndex((h) => lower.includes(h));
  return idx === -1 ? PREFERRED_IFACE_HINTS.length : idx;
}

export function getLocalIps(): { ip: string; iface: string }[] {
  const out: { ip: string; iface: string; rank: number }[] = [];
  const ifaces = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      // Node <18 uses string family ('IPv4'); >=18 may use number 4.
      const isV4 = addr.family === 'IPv4' || (addr.family as unknown as number) === 4;
      if (!isV4 || addr.internal) continue;
      if (!isPrivateLanIPv4(addr.address)) continue;
      out.push({ ip: addr.address, iface: name, rank: rankIp(name) });
    }
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.map(({ ip, iface }) => ({ ip, iface }));
}

export function getHostnameLocal(): string | null {
  const host = os.hostname();
  if (!host) return null;
  // os.hostname() may already include .local on macOS; otherwise append it.
  return host.endsWith('.local') ? host : `${host}.local`;
}

export interface NetworkInfoOpts {
  /** Path to point the join URL at (default "/join"). */
  joinPath?: string;
  /** Optional show code appended as ?show=... */
  showCode?: string;
}

export function getBackendPort(): number {
  return Number(process.env.PORT || 443);
}

export function getFrontendPort(): number {
  // The Express server serves the pages too, so the frontend port defaults to
  // the backend port. Override with FRONTEND_PORT if you run vite separately.
  return Number(process.env.FRONTEND_PORT || getBackendPort());
}

export function buildJoinUrl(ip: string, port: number, opts: NetworkInfoOpts = {}): string {
  const path = opts.joinPath ?? '/join';
  // App runs over HTTPS (self-signed). Omit the port when it's the default.
  const portPart = port === 443 ? '' : `:${port}`;
  const query = opts.showCode ? `?show=${encodeURIComponent(opts.showCode)}` : '';
  return `https://${ip}${portPart}${path}${query}`;
}

export function getNetworkInfo(opts: NetworkInfoOpts = {}): NetworkInfo {
  const found = getLocalIps();
  const frontendPort = getFrontendPort();
  const backendPort = getBackendPort();
  const fallback = found.length === 0;
  const recommendedIp = fallback ? 'localhost' : found[0].ip;
  return {
    localIps: found.map((f) => f.ip),
    recommendedIp,
    hostname: getHostnameLocal(),
    frontendPort,
    backendPort,
    fallback,
    joinUrl: buildJoinUrl(recommendedIp, frontendPort, opts),
  };
}
