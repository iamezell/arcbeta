import { Server } from 'socket.io';
import User from '../models/User';

/**
 * Server-side "current audience target" for Stream Deck control.
 *
 * Stream Deck buttons are static, but private cues need a dynamic target. So the
 * director first selects a target (everyone / all audience / random / slot N / a
 * name) and then fires private cues that apply to whatever is currently selected.
 */
export type AudienceTargetType = 'everyone' | 'audience' | 'random' | 'slot' | 'name' | 'id';

export interface AudienceTarget {
  type: AudienceTargetType;
  /** slot index (1-based), name, or socket id depending on `type`. */
  value?: string;
}

export interface AudienceMemberInfo {
  socketId: string;
  name: string;
  role: string;
  slot: number;
}

let currentTarget: AudienceTarget = { type: 'audience' };

export function getAudienceTarget(): AudienceTarget {
  return currentTarget;
}

export function setAudienceTarget(target: AudienceTarget): AudienceTarget {
  currentTarget = target;
  return currentTarget;
}

export function describeTarget(target: AudienceTarget): string {
  switch (target.type) {
    case 'everyone':
      return 'Everyone in scene';
    case 'audience':
      return 'All audience';
    case 'random':
      return 'Random audience member';
    case 'slot':
      return `Audience slot #${target.value}`;
    case 'name':
      return `Audience "${target.value}"`;
    case 'id':
      return `Socket ${target.value}`;
    default:
      return 'Unknown';
  }
}

/**
 * Live in-scene roster (audience first, stable slot ordering by socket id) for
 * connected sockets only. Slots are 1-based and assigned to AUDIENCE members.
 */
export async function getAudienceRoster(io: Server): Promise<AudienceMemberInfo[]> {
  const connected = new Set(io.sockets.sockets.keys());
  const users = await User.find({ roomId: 'lobby', inScene: true });
  const audience = users
    .filter((u) => connected.has(u.socketId) && u.role === 'Audience')
    .sort((a, b) => a.socketId.localeCompare(b.socketId));
  return audience.map((u, i) => ({
    socketId: u.socketId,
    name: u.name,
    role: u.role,
    slot: i + 1,
  }));
}

export interface ResolvedAudienceTarget {
  socketIds: string[];
  description: string;
}

/** Resolve the current target into concrete connected socket ids. */
export async function resolveAudienceTarget(
  io: Server,
  target: AudienceTarget
): Promise<ResolvedAudienceTarget> {
  const connected = new Set(io.sockets.sockets.keys());
  const description = describeTarget(target);

  if (target.type === 'id') {
    const id = target.value && connected.has(target.value) ? [target.value] : [];
    return { socketIds: id, description };
  }

  if (target.type === 'everyone') {
    const users = await User.find({ roomId: 'lobby', inScene: true });
    return {
      socketIds: users.map((u) => u.socketId).filter((id) => connected.has(id)),
      description,
    };
  }

  const roster = await getAudienceRoster(io);
  switch (target.type) {
    case 'audience':
      return { socketIds: roster.map((m) => m.socketId), description };
    case 'random': {
      if (roster.length === 0) return { socketIds: [], description };
      const pick = roster[Math.floor(Math.random() * roster.length)];
      return { socketIds: [pick.socketId], description: `${description} → ${pick.name}` };
    }
    case 'slot': {
      const slot = Number(target.value);
      const member = roster.find((m) => m.slot === slot);
      return {
        socketIds: member ? [member.socketId] : [],
        description: member ? `${description} → ${member.name}` : `${description} (empty)`,
      };
    }
    case 'name': {
      const wanted = (target.value || '').toLowerCase();
      const member = roster.find((m) => m.name.toLowerCase() === wanted);
      return { socketIds: member ? [member.socketId] : [], description };
    }
    default:
      return { socketIds: [], description };
  }
}
