import { io, Socket } from 'socket.io-client';

export class SocketClient {
  private socket: Socket;
  private onStartExperienceCallback?: () => void;
  private onPlayerMoveCallback?: (data: any) => void;
  private onUserJoinedCallbacks: Array<(data: any) => void> = [];
  private onUserLeftCallbacks: Array<(data: any) => void> = [];
  private onRoomStateCallback?: (data: any) => void;
  private onStateChangedCallback?: (data: any) => void;
  private onRevealCallback?: (data: any) => void;
  private onNoticeCallback?: (data: any) => void;

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
      this.onUserJoinedCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('userLeft', (data: any) => {
      console.log('👋 User left:', data.name);
      this.onUserLeftCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('lobbyState', (data: any) => {
      console.log('📋 Lobby state:', data.users);
      // Update UI with current lobby users
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
  }

  public joinLobby(role: string, name: string, fromScene: boolean = false): void {
    this.socket.emit('joinLobby', { role, name, fromScene });
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

  public getSocketId(): string {
    return this.socket.id;
  }
}

