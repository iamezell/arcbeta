import {
  RoomDef,
  ObjectDef,
  InteractionOption,
  InteractionCondition,
  InteractionEffect,
  RoomStatePayload,
  WireRoom,
  WireObject,
} from './types';

// Result of applying an interaction or director event. The socket layer turns
// this into the appropriate broadcast / private emits.
export interface ApplyResult {
  ok: boolean;
  // State changes to broadcast (object id -> new state).
  changes: { id: string; state: string }[];
  flags: Record<string, boolean>;
  complete: boolean;
  audioCues: string[];
  // Broadcast to everyone (shared progress / shared sfx).
  feedback?: string;
  // Private to the acting player (note contents).
  reveal?: { objectId: string; name: string; text: string };
  // Private to the acting player (blocked / nothing-happens messages).
  notice?: string;
  directorEventId?: string;
}

// Authoritative, in-memory state for a single running room.
//
// In-memory is deliberate for the prototype: it resets on restart and on
// `startRoom`. Persisting to Mongo later only means swapping the backing store;
// the public surface (apply*) stays the same.
export class RoomSession {
  private def: RoomDef;
  private states: Map<string, string> = new Map();
  private flags: Record<string, boolean> = {};
  private completedOnce: Set<string> = new Set(); // keys for oncePerSession
  private complete = false;

  constructor(def: RoomDef) {
    this.def = def;
    this.reset();
  }

  reset(): void {
    this.states.clear();
    this.flags = {};
    this.completedOnce.clear();
    this.complete = false;
    for (const obj of this.def.objects) {
      this.states.set(obj.id, obj.initialState);
    }
  }

  getRoomDef(): RoomDef {
    return this.def;
  }

  // Full snapshot sent to a client on join.
  serialize(): RoomStatePayload {
    return {
      room: this.toWireRoom(),
      states: Object.fromEntries(this.states),
      flags: { ...this.flags },
      complete: this.complete,
    };
  }

  private toWireRoom(): WireRoom {
    const objects: WireObject[] = this.def.objects.map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      geometry: o.geometry,
      colorByState: o.colorByState,
      interactions: o.interactions.map((i) => ({
        action: i.action,
        label: i.label,
        fromStates: i.fromStates,
      })),
    }));
    return {
      id: this.def.id,
      name: this.def.name,
      ambientAudio: this.def.ambientAudio,
      objects,
      scenery: this.def.scenery,
      directorEvents: this.def.directorEvents.map((e) => ({ id: e.id, label: e.label })),
    };
  }

  private findObject(objectId: string): ObjectDef | undefined {
    return this.def.objects.find((o) => o.id === objectId);
  }

  private conditionMet(cond: InteractionCondition | undefined, payload?: { code?: string }): boolean {
    if (!cond) return true;
    if (cond.flags) {
      for (const [flag, expected] of Object.entries(cond.flags)) {
        if ((this.flags[flag] || false) !== expected) return false;
      }
    }
    if (cond.objectStates) {
      for (const req of cond.objectStates) {
        if (this.states.get(req.objectId) !== req.state) return false;
      }
    }
    if (cond.code !== undefined) {
      if (!payload || String(payload.code ?? '').trim() !== cond.code) return false;
    }
    return true;
  }

  // Apply the declarative effect and accumulate its results.
  private applyEffect(effect: InteractionEffect, selfId: string | null, result: ApplyResult): void {
    if (effect.setState && selfId) {
      this.states.set(selfId, effect.setState);
      result.changes.push({ id: selfId, state: effect.setState });
    }
    if (effect.setStates) {
      for (const s of effect.setStates) {
        this.states.set(s.objectId, s.state);
        result.changes.push({ id: s.objectId, state: s.state });
      }
    }
    if (effect.setFlags) {
      for (const [k, v] of Object.entries(effect.setFlags)) this.flags[k] = v;
    }
    if (effect.audioCue) result.audioCues.push(effect.audioCue);
    if (effect.feedback) result.feedback = effect.feedback;
    if (effect.complete) {
      this.complete = true;
      result.complete = true;
    }
  }

  private emptyResult(): ApplyResult {
    return { ok: false, changes: [], flags: this.flags, complete: this.complete, audioCues: [] };
  }

  // Player interaction. Authoritative: validates state, conditions and dedupe.
  applyInteraction(objectId: string, action: string, payload?: { code?: string }): ApplyResult {
    const result = this.emptyResult();
    const obj = this.findObject(objectId);
    if (!obj) {
      result.notice = 'That object no longer exists.';
      return result;
    }

    const currentState = this.states.get(objectId) ?? obj.initialState;

    // Candidate interactions: matching action AND available in the current state.
    const candidates = obj.interactions.filter(
      (i) => i.action === action && i.fromStates.includes(currentState)
    );
    if (candidates.length === 0) {
      result.notice = `Nothing happens with the ${obj.name.toLowerCase()}.`;
      return result;
    }

    // Prefer a candidate whose conditions are satisfied; otherwise report the
    // first one's blocked message.
    const satisfied = candidates.find((c: InteractionOption) => this.conditionMet(c.requires, payload));
    const chosen = satisfied ?? candidates[0];

    if (!satisfied) {
      const blocked = chosen.onBlocked;
      result.notice = blocked?.feedback ?? 'That does not work right now.';
      if (blocked?.audioCue) result.audioCues.push(blocked.audioCue);
      return result;
    }

    const onceKey = `${objectId}:${action}`;
    if (chosen.oncePerSession && this.completedOnce.has(onceKey)) {
      result.notice = `You have already done that.`;
      return result;
    }

    this.applyEffect(chosen.onSuccess, objectId, result);
    if (chosen.oncePerSession) this.completedOnce.add(onceKey);
    if (chosen.onSuccess.reveal) {
      result.reveal = { objectId, name: obj.name, text: chosen.onSuccess.reveal };
    }
    result.ok = true;
    result.flags = this.flags;
    return result;
  }

  // Director-triggered scripted event (in-scene Director role or Stream Deck HTTP).
  applyDirectorEvent(eventId: string): ApplyResult {
    const result = this.emptyResult();
    const event = this.def.directorEvents.find((e) => e.id === eventId);
    if (!event) {
      result.notice = `Unknown director event: ${eventId}`;
      return result;
    }
    if (event.effect.resetRoom) this.reset();
    this.applyEffect(event.effect, null, result);
    result.ok = true;
    result.flags = this.flags;
    result.directorEventId = eventId;
    // After a reset, broadcast the full state so late visuals re-sync.
    if (event.effect.resetRoom) {
      result.changes = Array.from(this.states.entries()).map(([id, state]) => ({ id, state }));
    }
    return result;
  }
}
