import * as THREE from 'three';
import { SocketClient } from '../socket-client';
import { RoomRenderer } from './RoomRenderer';
import { RoomUI } from './RoomUI';
import { AudioHooks } from './AudioHooks';
import { RoomStatePayload, StateChangePayload, RevealPayload, WireObject } from './types';

// Glue layer between the authoritative server, the greybox renderer and the DOM.
// Owns the client's mirror of room state (purely for choosing which prompt/action
// to offer — the server remains authoritative for every outcome).

const INTERACT_DISTANCE = 4.5;

export class RoomController {
  private camera: THREE.Camera;
  private socket: SocketClient;
  private renderer: RoomRenderer;
  private ui: RoomUI;
  private audio: AudioHooks;
  private role: string;

  private states: Record<string, string> = {};
  private flags: Record<string, boolean> = {};
  private complete = false;

  public onRoomRestart: () => void = () => {};

  private raycaster = new THREE.Raycaster();
  private targetObjectId: string | null = null;
  private pendingKeypadObjectId: string | null = null;

  constructor(opts: {
    camera: THREE.Camera;
    socket: SocketClient;
    sceneParent: THREE.Object3D;
    roomLight?: THREE.HemisphereLight;
    role: string;
  }) {
    this.camera = opts.camera;
    this.socket = opts.socket;
    this.role = opts.role;
    this.audio = new AudioHooks();
    this.renderer = new RoomRenderer(opts.sceneParent, opts.roomLight);
    this.ui = new RoomUI();

    this.wireSocket();
    this.wireInput();
    this.wireUI();
  }

  private wireSocket(): void {
    this.socket.onRoomState((data: RoomStatePayload) => this.onRoomState(data));
    this.socket.onStateChanged((data: StateChangePayload) => this.onStateChanged(data));
    this.socket.onReveal((data: RevealPayload) => this.ui.showReveal(data.name, data.text));
    this.socket.onNotice((data: { message: string }) => this.ui.toast(data.message, 'warn'));
  }

  private wireInput(): void {
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyE') return;
      if (this.complete || this.ui.isBlocking()) return;
      this.tryInteract();
    });
  }

  private wireUI(): void {
    this.ui.onKeypadSubmit = (code: string) => {
      if (this.pendingKeypadObjectId) {
        this.socket.interact(this.pendingKeypadObjectId, 'submitCode', { code });
        this.pendingKeypadObjectId = null;
      }
    };
    this.ui.onDirectorEvent = (eventId: string) => this.socket.directorAction(eventId);
    this.ui.onRestart = () => this.socket.restartRoom();
  }

  private onRoomState(data: RoomStatePayload): void {
    this.states = { ...data.states };
    this.flags = { ...data.flags };
    this.complete = data.complete;
    this.renderer.build(data.room, data.states);
    this.audio.setAmbient(data.room.ambientAudio);
    if (this.role === 'Director') {
      this.ui.buildDirectorPanel(data.room.directorEvents);
    }
    if (this.complete) this.ui.showComplete();
  }

  private onStateChanged(data: StateChangePayload): void {
    for (const change of data.changes) {
      this.states[change.id] = change.state;
      this.renderer.applyState(change.id, change.state);
    }
    this.flags = { ...data.flags };
    for (const cue of data.audioCues || []) this.audio.play(cue);
    if (data.feedback) this.ui.toast(data.feedback, 'success');
    if (data.complete && !this.complete) {
      this.complete = true;
      this.ui.showComplete();
    } else if (!data.complete && this.complete) {
      this.complete = false;
      this.ui.hideComplete();
    }
    if (data.roomReset) this.onRoomRestart();
  }

  // Pick the first interaction available in the object's current state.
  private availableInteraction(obj: WireObject): { action: string; label: string } | null {
    const state = this.states[obj.id];
    for (const i of obj.interactions) {
      if (i.fromStates.includes(state)) return { action: i.action, label: i.label };
    }
    return null;
  }

  private tryInteract(): void {
    if (!this.targetObjectId) return;
    const obj = this.renderer.getObjectDef(this.targetObjectId);
    if (!obj) return;
    const interaction = this.availableInteraction(obj);
    if (!interaction) return;

    if (interaction.action === 'submitCode') {
      this.pendingKeypadObjectId = obj.id;
      this.ui.openKeypad();
      return;
    }
    this.socket.interact(obj.id, interaction.action);
  }

  // Called every frame by the host render loop: raycast for the focused object.
  update(): void {
    if (this.complete || this.ui.isBlocking()) {
      this.renderer.highlight(null);
      this.ui.hidePrompt();
      return;
    }

    // The camera is driven directly (not parented to the scene), so its local
    // transform is its world transform. Derive the ray from it directly to avoid
    // depending on matrixWorld being refreshed this frame.
    const origin = this.camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.raycaster.set(origin, direction);
    this.raycaster.far = INTERACT_DISTANCE;

    const hits = this.raycaster.intersectObjects(this.renderer.getInteractableMeshes(), false);
    const hit = hits.find((h) => h.distance <= INTERACT_DISTANCE);

    if (hit) {
      const mesh = hit.object as THREE.Mesh;
      const objectId = mesh.userData.objectId as string;
      const obj = this.renderer.getObjectDef(objectId);
      const interaction = obj ? this.availableInteraction(obj) : null;
      if (obj && interaction) {
        this.targetObjectId = objectId;
        this.renderer.highlight(mesh);
        this.ui.showPrompt(interaction.label);
        return;
      }
    }

    this.targetObjectId = null;
    this.renderer.highlight(null);
    this.ui.hidePrompt();
  }
}
