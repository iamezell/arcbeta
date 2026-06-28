import { io, Socket } from 'socket.io-client';

export class SocketClient {
  private socket: Socket;
  private onStartExperienceCallback?: () => void;
  private onPlayerMoveCallback?: (data: any) => void;
  private onUserJoinedCallbacks: Array<(data: any) => void> = [];
  private onUserLeftCallbacks: Array<(data: any) => void> = [];
  private onLobbyStateCallback?: (data: any) => void;
  private onRoomStateCallback?: (data: any) => void;
  private onStateChangedCallback?: (data: any) => void;
  private onRevealCallback?: (data: any) => void;
  private onNoticeCallback?: (data: any) => void;
  private onShowStateCallback?: (data: any) => void;
  private onSceneTransitionCallback?: (data: any) => void;
  private onShowCueCallback?: (data: any) => void;
  private onCueEngineBeatStartCallback?: (data: any) => void;
  private onCueEngineMomentStartCallback?: (data: any) => void;
  private onPrivateCueCallback?: (data: any) => void;
  private onCalmResetCallback?: () => void;
  private onNpcRosterCallback?: (data: any) => void;
  private onNpcStateCallback?: (data: any) => void;
  private onNpcCueCallback?: (data: any) => void;
  private onNpcConversationCallback?: (data: any) => void;
  private onNpcSubtitleCallback?: (data: any) => void;
  private onNpcRealtimeSessionCallback?: (data: any) => void;
  private onNpcDetailCallback?: (data: any) => void;
  // Cached so a roster that arrives before CueManager wires its listener is not lost.
  private lastNpcRoster: any = null;

  constructor() {
    // Connect to Socket.IO server
    this.socket = io({
      transports: ['websocket', 'polling']
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on('connect', () => {
      console.log('✅ Connected to server:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Disconnected from server');
    });

    this.socket.on('error', (data: any) => {
      console.error('Socket error:', data.message);
      alert(`Error: ${data.message}`);
    });

    this.socket.on('startExperience', () => {
      console.log('🎬 Starting experience');
      if (this.onStartExperienceCallback) {
        this.onStartExperienceCallback();
      }
    });

    this.socket.on('playerMove', (data: any) => {
      if (this.onPlayerMoveCallback) {
        this.onPlayerMoveCallback(data);
      }
    });

    this.socket.on('userJoined', (data: any) => {
      console.log('👤 User joined:', data.name, data.role);
      if (data.inScene === false) return;
      this.onUserJoinedCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('userLeft', (data: any) => {
      console.log('👋 User left:', data.name);
      this.onUserLeftCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('lobbyState', (data: any) => {
      console.log('📋 Lobby state:', data.users);
      if (this.onLobbyStateCallback) {
        this.onLobbyStateCallback(data);
        return;
      }
      // Fallback: additive join for lobby HTML page.
      data.users.forEach((user: any) => {
        if (user.id !== this.socket.id) {
          this.onUserJoinedCallbacks.forEach(cb => cb(user));
        }
      });
    });

    // ----- ARC room interaction protocol -----

    this.socket.on('roomState', (data: any) => {
      console.log('🏛️ Room state received:', data?.room?.name);
      if (this.onRoomStateCallback) this.onRoomStateCallback(data);
    });

    this.socket.on('stateChanged', (data: any) => {
      if (this.onStateChangedCallback) this.onStateChangedCallback(data);
    });

    this.socket.on('reveal', (data: any) => {
      if (this.onRevealCallback) this.onRevealCallback(data);
    });

    this.socket.on('notice', (data: any) => {
      if (this.onNoticeCallback) this.onNoticeCallback(data);
    });

    // ----- ARC theatrical show protocol -----

    // Initial scene snapshot for this client (also drives late-joiner sync).
    this.socket.on('showState', (data: any) => {
      console.log('🎭 Show state received:', data?.currentScene);
      if (this.onShowStateCallback) this.onShowStateCallback(data);
    });

    // Synchronized scene transition broadcast to everyone.
    this.socket.on('sceneTransition', (data: any) => {
      console.log('🎬 Scene transition:', data?.currentScene, data?.mode);
      if (this.onSceneTransitionCallback) this.onSceneTransitionCallback(data);
    });

    // One-shot stage cue (thunder / lightning / rain / gate light).
    this.socket.on('showCue', (data: any) => {
      if (this.onShowCueCallback) this.onShowCueCallback(data);
    });

    this.socket.on('cueEngine:beatStart', (data: any) => {
      if (this.onCueEngineBeatStartCallback) this.onCueEngineBeatStartCallback(data);
    });

    this.socket.on('cueEngine:momentStart', (data: any) => {
      if (this.onCueEngineMomentStartCallback) this.onCueEngineMomentStartCallback(data);
    });

    // Private (per-participant) audience cue — only delivered to the target client.
    this.socket.on('audience:privateCue', (data: any) => {
      if (this.onPrivateCueCallback) this.onPrivateCueCallback(data);
    });

    // Global Calm / Reset broadcast (Stream Deck safety button).
    this.socket.on('audience:calmReset', () => {
      if (this.onCalmResetCallback) this.onCalmResetCallback();
    });

    // ----- ARC NPC system protocol -----

    this.socket.on('npc:roster', (data: any) => {
      console.log('🤖 NPC roster received:', data?.npcs?.length, 'NPCs');
      this.lastNpcRoster = data;
      if (this.onNpcRosterCallback) this.onNpcRosterCallback(data);
    });

    this.socket.on('npc:state', (data: any) => {
      if (this.onNpcStateCallback) this.onNpcStateCallback(data);
    });

    this.socket.on('npc:cue', (data: any) => {
      if (this.onNpcCueCallback) this.onNpcCueCallback(data);
    });

    this.socket.on('npc:conversation', (data: any) => {
      if (this.onNpcConversationCallback) this.onNpcConversationCallback(data);
    });

    this.socket.on('npc:subtitle', (data: any) => {
      if (this.onNpcSubtitleCallback) this.onNpcSubtitleCallback(data);
    });

    this.socket.on('npc:realtimeSession', (data: any) => {
      if (this.onNpcRealtimeSessionCallback) this.onNpcRealtimeSessionCallback(data);
    });

    this.socket.on('npc:detail', (data: any) => {
      if (this.onNpcDetailCallback) this.onNpcDetailCallback(data);
    });
  }

  public joinLobby(
    role: string,
    name: string,
    fromScene: boolean = false,
    opts: { showCode?: string; deviceType?: string } = {}
  ): void {
    this.socket.emit('joinLobby', { role, name, fromScene, ...opts });
  }

  public activateLevel(): void {
    this.socket.emit('activateLevel');
  }

  public sendPlayerMove(position: any, rotation: any): void {
    this.socket.emit('playerMove', { position, rotation });
  }

  // ----- ARC room interaction protocol -----

  public interact(objectId: string, action: string, payload?: { code?: string }): void {
    this.socket.emit('interact', { objectId, action, payload });
  }

  public directorAction(eventId: string): void {
    this.socket.emit('directorAction', { eventId });
  }

  public restartRoom(): void {
    this.socket.emit('restartRoom');
  }

  // ----- ARC theatrical show protocol -----

  public startAct(sceneId: string, mode: string): void {
    this.socket.emit('startAct', { sceneId, mode });
  }

  public showCue(cue: string): void {
    this.socket.emit('showCue', { cue });
  }

  public startBeat(beatId: string, startedAt: number, opts?: { momentId?: string; force?: boolean }): void {
    this.socket.emit('cueEngine:startBeat', {
      beatId,
      startedAt,
      momentId: opts?.momentId,
      force: opts?.force,
    });
  }

  public startMoment(momentId: string, startedAt: number, force?: boolean): void {
    this.socket.emit('cueEngine:startMoment', { momentId, startedAt, force });
  }

  /** Director → server: deliver a private cue to a single participant's socket. */
  public sendPrivateCue(targetSocketId: string, payload: unknown): void {
    this.socket.emit('audience:privateCue', { targetSocketId, payload });
  }

  /** Target client ← server: a private cue addressed to us. */
  public onPrivateCue(callback: (data: any) => void): void {
    this.onPrivateCueCallback = callback;
  }

  /** All clients ← server: global Calm / Reset. */
  public onCalmReset(callback: () => void): void {
    this.onCalmResetCallback = callback;
  }

  public onShowState(callback: (data: any) => void): void {
    this.onShowStateCallback = callback;
  }

  public onSceneTransition(callback: (data: any) => void): void {
    this.onSceneTransitionCallback = callback;
  }

  public onShowCue(callback: (data: any) => void): void {
    this.onShowCueCallback = callback;
  }

  public onCueEngineBeatStart(callback: (data: any) => void): void {
    this.onCueEngineBeatStartCallback = callback;
  }

  public onCueEngineMomentStart(callback: (data: any) => void): void {
    this.onCueEngineMomentStartCallback = callback;
  }

  // ----- ARC NPC system protocol -----

  public npcCue(npcId: string, cue: string, payload?: { socketId?: string }): void {
    this.socket.emit('npc:cue', { npcId, cue, payload });
  }

  public requestRealtimeSession(npcId: string): void {
    this.socket.emit('npc:requestRealtimeSession', { npcId });
  }

  public npcTranscript(npcId: string, speaker: string, text: string): void {
    this.socket.emit('npc:transcript', { npcId, speaker, text });
  }

  public requestNpcDetail(npcId: string): void {
    this.socket.emit('npc:requestDetail', { npcId });
  }

  public requestNpcRoster(): void {
    this.socket.emit('npc:requestRoster');
  }

  public onNpcRoster(callback: (data: any) => void): void {
    this.onNpcRosterCallback = callback;
    if (this.lastNpcRoster) callback(this.lastNpcRoster);
  }

  public onNpcState(callback: (data: any) => void): void {
    this.onNpcStateCallback = callback;
  }

  public onNpcCue(callback: (data: any) => void): void {
    this.onNpcCueCallback = callback;
  }

  public onNpcConversation(callback: (data: any) => void): void {
    this.onNpcConversationCallback = callback;
  }

  public onNpcSubtitle(callback: (data: any) => void): void {
    this.onNpcSubtitleCallback = callback;
  }

  public onNpcRealtimeSession(callback: (data: any) => void): void {
    this.onNpcRealtimeSessionCallback = callback;
  }

  public onNpcDetail(callback: (data: any) => void): void {
    this.onNpcDetailCallback = callback;
  }

  public onRoomState(callback: (data: any) => void): void {
    this.onRoomStateCallback = callback;
  }

  public onStateChanged(callback: (data: any) => void): void {
    this.onStateChangedCallback = callback;
  }

  public onReveal(callback: (data: any) => void): void {
    this.onRevealCallback = callback;
  }

  public onNotice(callback: (data: any) => void): void {
    this.onNoticeCallback = callback;
  }

  public onStartExperience(callback: () => void): void {
    this.onStartExperienceCallback = callback;
  }

  public onPlayerMove(callback: (data: any) => void): void {
    this.onPlayerMoveCallback = callback;
  }

  public onUserJoined(callback: (data: any) => void): void {
    this.onUserJoinedCallbacks.push(callback);
  }

  public onUserLeft(callback: (data: any) => void): void {
    this.onUserLeftCallbacks.push(callback);
  }

  public onLobbyState(callback: (data: any) => void): void {
    this.onLobbyStateCallback = callback;
  }

  public getSocketId(): string {
    return this.socket.id;
  }
}

