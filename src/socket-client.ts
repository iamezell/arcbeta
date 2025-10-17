import { io, Socket } from 'socket.io-client';

export class SocketClient {
  private socket: Socket;
  private onStartExperienceCallback?: () => void;
  private onPlayerMoveCallback?: (data: any) => void;
  private onUserJoinedCallback?: (data: any) => void;
  private onUserLeftCallback?: (data: any) => void;

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
      if (this.onUserJoinedCallback) {
        this.onUserJoinedCallback(data);
      }
    });

    this.socket.on('userLeft', (data: any) => {
      console.log('👋 User left:', data.name);
      if (this.onUserLeftCallback) {
        this.onUserLeftCallback(data);
      }
    });

    this.socket.on('lobbyState', (data: any) => {
      console.log('📋 Lobby state:', data.users);
      // Update UI with current lobby users
      if (this.onUserJoinedCallback) {
        data.users.forEach((user: any) => {
          if (user.id !== this.socket.id) {
            this.onUserJoinedCallback!(user);
          }
        });
      }
    });
  }

  public joinLobby(role: string, name: string): void {
    this.socket.emit('joinLobby', { role, name });
  }

  public activateLevel(): void {
    this.socket.emit('activateLevel');
  }

  public sendPlayerMove(position: any, rotation: any): void {
    this.socket.emit('playerMove', { position, rotation });
  }

  public onStartExperience(callback: () => void): void {
    this.onStartExperienceCallback = callback;
  }

  public onPlayerMove(callback: (data: any) => void): void {
    this.onPlayerMoveCallback = callback;
  }

  public onUserJoined(callback: (data: any) => void): void {
    this.onUserJoinedCallback = callback;
  }

  public onUserLeft(callback: (data: any) => void): void {
    this.onUserLeftCallback = callback;
  }

  public getSocketId(): string {
    return this.socket.id;
  }
}

