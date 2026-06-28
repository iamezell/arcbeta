import * as THREE from 'three';

/**
 * ARC Dummy — Roblox-style blocky placeholder characters for scale testing,
 * blocking, and NPC staging. Built from basic Three.js primitives only.
 *
 * Swap these groups for real models later without changing placement logic —
 * dummies are purely visual and carry no AI/behavior.
 */

/** Toggle scale/blocking dummies in Act 1 (set false for production runs). */
export const SHOW_SCALE_DUMMIES = true;

/** Human-scale reference targets — use the 1.8m adult as the measuring stick. */
export const ARC_SCALE = {
  ADULT_HEIGHT: 1.8,
  CHILD_HEIGHT: 1.3,
  DOOR_HEIGHT: 2.2,
  DOOR_WIDTH: 1.1,
  CEILING_HEIGHT: 2.7,
  TABLE_HEIGHT: 0.75,
  CHAIR_SEAT_HEIGHT: 0.45,
  PORCH_HEIGHT: 0.3,
} as const;

export type DummyRole = 'adult' | 'child' | 'guard' | 'cultMember';
export type DummyPose = 'standing' | 'armsDown' | 'salute';

export interface ARCDummyOptions {
  height?: number;
  shirtColor?: number;
  pantsColor?: number;
  skinColor?: number;
  role?: DummyRole;
  name?: string;
  pose?: DummyPose;
  /** Y-axis rotation in radians (applied when placed). */
  facingDirection?: number;
  /** Floating label above the head (uses canvas sprite). */
  label?: string;
}

export interface BlockingDummySpec {
  name: string;
  role: DummyRole;
  position: [number, number, number];
  rotationY?: number;
  pose?: DummyPose;
}

// ---------------------------------------------------------------------------
// Shared materials (memoized)
// ---------------------------------------------------------------------------

interface DummyMats {
  skin: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  pants: THREE.MeshStandardMaterial;
  shoe: THREE.MeshStandardMaterial;
  hat: THREE.MeshStandardMaterial;
  frame: THREE.MeshStandardMaterial;
  ref: THREE.MeshStandardMaterial;
}

let _mats: DummyMats | null = null;

function mats(opts: ARCDummyOptions): DummyMats {
  if (!_mats) {
    _mats = {
      skin: std(0xc8956c),
      shirt: std(0x4a6a8a),
      pants: std(0x3a3a48),
      shoe: std(0x2a2a30),
      hat: std(0x1a1a22),
      frame: std(0x8a9098, 0.8, 0.2),
      ref: std(0x6a7080, 0.7, 0.15),
    };
  }
  const skin = std(opts.skinColor ?? 0xc8956c);
  const shirt = std(opts.shirtColor ?? 0x4a6a8a);
  const pants = std(opts.pantsColor ?? 0x3a3a48);
  return { ..._mats, skin, shirt, pants };
}

function std(color: number, roughness = 0.9, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// ---------------------------------------------------------------------------
// Core dummy builder
// ---------------------------------------------------------------------------

export function createARCDummy(options: ARCDummyOptions = {}): THREE.Group {
  const height = options.height ?? ARC_SCALE.ADULT_HEIGHT;
  const role = options.role ?? 'adult';
  const s = height / ARC_SCALE.ADULT_HEIGHT;
  const p = mats(options);
  const pose = options.pose ?? 'standing';

  const g = new THREE.Group();
  g.name = options.name ?? roleName(role);

  // Proportions for human-scale blocky body (feet on y=0).
  const footH = 0.08 * s;
  const legH = 0.82 * s;
  const torsoH = 0.58 * s;
  const headH = 0.32 * s;
  const torsoW = 0.42 * s;
  const torsoD = 0.26 * s;
  const headS = 0.26 * s;
  const armW = 0.13 * s;
  const armL = 0.52 * s;
  const handS = 0.1 * s;
  const footW = 0.16 * s;
  const footD = 0.28 * s;

  const legY = footH + legH / 2;
  const torsoY = footH + legH + torsoH / 2;
  const headY = footH + legH + torsoH + headH / 2;
  const shoulderY = footH + legH + torsoH * 0.88;

  // Feet.
  for (const x of [-torsoW * 0.22, torsoW * 0.22]) {
    g.add(box(footW, footH, footD, p.shoe, x, footH / 2, footD * 0.08));
  }
  // Legs.
  for (const x of [-torsoW * 0.22, torsoW * 0.22]) {
    g.add(box(armW, legH, armW * 1.1, p.pants, x, legY, 0));
  }
  // Torso.
  g.add(box(torsoW, torsoH, torsoD, p.shirt, 0, torsoY, 0));
  // Head.
  g.add(box(headS, headS, headS * 0.9, p.skin, 0, headY, 0));

  // Arms + hands.
  const armAngle = pose === 'salute' ? -1.4 : pose === 'armsDown' ? 0.08 : 0.15;
  for (const side of [-1, 1]) {
    const arm = box(armW, armL, armW, p.shirt, side * (torsoW / 2 + armW / 2), shoulderY - armL * 0.35, 0);
    arm.rotation.z = side * armAngle;
    if (pose === 'salute' && side === 1) arm.rotation.z = -1.5;
    g.add(arm);
    const hand = box(handS, handS, handS * 0.8, p.skin, side * (torsoW / 2 + armW / 2), shoulderY - armL * 0.85, 0);
    hand.rotation.z = arm.rotation.z;
    g.add(hand);
  }

  // Role extras.
  if (role === 'guard') {
    const hat = box(headS * 1.15, headS * 0.35, headS * 1.15, p.hat, 0, headY + headS * 0.55, 0);
    g.add(hat);
    const brim = box(headS * 1.35, headS * 0.06, headS * 1.35, p.hat, 0, headY + headS * 0.38, 0);
    g.add(brim);
  }

  if (options.label) {
    g.add(createFloatingLabel(options.label, headY + headS * 0.8));
  }

  const facing = options.facingDirection ?? 0;
  if (facing !== 0) g.rotation.y = facing;

  // Metadata for blocking, future NPC replacement, and optional collision.
  g.userData = {
    type: 'arc_dummy',
    role,
    height,
    collisionRadius: 0.35 * s,
    interactable: false,
  };

  return g;
}

function roleName(role: DummyRole): string {
  switch (role) {
    case 'child':
      return 'ARCDummy_Child';
    case 'guard':
      return 'ARCDummy_Guard';
    case 'cultMember':
      return 'ARCDummy_CultMember';
    default:
      return 'ARCDummy_Adult';
  }
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function createAdultDummy(options: Omit<ARCDummyOptions, 'role' | 'height'> = {}): THREE.Group {
  return createARCDummy({ ...options, role: 'adult', height: ARC_SCALE.ADULT_HEIGHT });
}

export function createChildDummy(options: Omit<ARCDummyOptions, 'role' | 'height'> = {}): THREE.Group {
  return createARCDummy({
    ...options,
    role: 'child',
    height: ARC_SCALE.CHILD_HEIGHT,
    shirtColor: options.shirtColor ?? 0x5a7a6a,
    pantsColor: options.pantsColor ?? 0x4a4a58,
  });
}

export function createGuardDummy(options: Omit<ARCDummyOptions, 'role' | 'height'> = {}): THREE.Group {
  return createARCDummy({
    ...options,
    role: 'guard',
    height: ARC_SCALE.ADULT_HEIGHT,
    shirtColor: options.shirtColor ?? 0x2a3238,
    pantsColor: options.pantsColor ?? 0x1a2028,
    pose: options.pose ?? 'standing',
  });
}

export function createCultMemberDummy(options: Omit<ARCDummyOptions, 'role' | 'height'> = {}): THREE.Group {
  return createARCDummy({
    ...options,
    role: 'cultMember',
    height: ARC_SCALE.ADULT_HEIGHT,
    shirtColor: options.shirtColor ?? 0x6a5a4a,
    pantsColor: options.pantsColor ?? 0x4a4038,
  });
}

// ---------------------------------------------------------------------------
// Scale reference props
// ---------------------------------------------------------------------------

/** Door frame outline at standard 2.2m × 1.1m. */
export function createDoorFrameReference(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'DoorFrameRef';
  const { DOOR_HEIGHT, DOOR_WIDTH } = ARC_SCALE;
  const t = 0.06;
  const mat = std(0x9aa0a8, 0.6, 0.3);
  // Jambs + lintel + sill (centered, bottom at y=0).
  g.add(box(t, DOOR_HEIGHT, t, mat, -DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0));
  g.add(box(t, DOOR_HEIGHT, t, mat, DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0));
  g.add(box(DOOR_WIDTH + t, t, t, mat, 0, DOOR_HEIGHT - t / 2, 0));
  g.add(box(DOOR_WIDTH + t, t, t, mat, 0, t / 2, 0));
  g.add(createFloatingLabel(`Door ${DOOR_HEIGHT}m`, DOOR_HEIGHT + 0.25));
  return g;
}

function createTableReference(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'TableRef';
  const h = ARC_SCALE.TABLE_HEIGHT;
  g.add(box(1.2, h, 0.8, std(0x6a5040), 0, h / 2, 0));
  g.add(createFloatingLabel(`Table ${h}m`, h + 0.2));
  return g;
}

function createChairReference(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ChairRef';
  const seat = ARC_SCALE.CHAIR_SEAT_HEIGHT;
  g.add(box(0.45, seat, 0.45, std(0x5a5048), 0, seat / 2, 0));
  g.add(box(0.45, 0.5, 0.08, std(0x5a5048), 0, seat + 0.25, -0.2));
  g.add(createFloatingLabel(`Chair ${seat}m`, seat + 0.55));
  return g;
}

function createMeterPost(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'MeterPost';
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1, 6), std(0xffcc44, 0.7, 0.2)).translateY(0.5));
  for (let m = 0; m <= 1; m++) {
    const tick = box(0.12, 0.02, 0.02, std(0x222228), 0.08, m, 0);
    g.add(tick);
  }
  g.add(createFloatingLabel('1m', 1.15));
  return g;
}

/**
 * A compact scale reference layout: adult + child + door + table + chair + 1m post.
 * Place off to the side during rehearsal to sanity-check proportions.
 */
export function createScaleReferenceSet(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'ScaleReferenceSet';

  const adult = createAdultDummy({ label: `Adult ${ARC_SCALE.ADULT_HEIGHT}m` });
  adult.position.set(0, 0, 0);
  g.add(adult);

  const child = createChildDummy({ label: `Child ${ARC_SCALE.CHILD_HEIGHT}m` });
  child.position.set(1.8, 0, 0);
  g.add(child);

  const door = createDoorFrameReference();
  door.position.set(4, 0, 0);
  g.add(door);

  const table = createTableReference();
  table.position.set(6.5, 0, 0);
  g.add(table);

  const chair = createChairReference();
  chair.position.set(8, 0, 0);
  g.add(chair);

  const post = createMeterPost();
  post.position.set(9.5, 0, 0);
  g.add(post);

  return g;
}

// ---------------------------------------------------------------------------
// Placement helpers
// ---------------------------------------------------------------------------

/** Place dummies at explicit world positions (blocking / director staging). */
export function placeBlockingDummies(
  parent: THREE.Object3D,
  specs: BlockingDummySpec[]
): THREE.Group {
  const root = new THREE.Group();
  root.name = 'BlockingDummies';

  for (const spec of specs) {
    let dummy: THREE.Group;
    switch (spec.role) {
      case 'child':
        dummy = createChildDummy({ name: spec.name, pose: spec.pose });
        break;
      case 'guard':
        dummy = createGuardDummy({ name: spec.name, pose: spec.pose });
        break;
      case 'cultMember':
        dummy = createCultMemberDummy({ name: spec.name, pose: spec.pose });
        break;
      default:
        dummy = createAdultDummy({ name: spec.name, pose: spec.pose });
    }
    dummy.position.set(spec.position[0], spec.position[1], spec.position[2]);
    if (spec.rotationY != null) dummy.rotation.y = spec.rotationY;
    dummy.name = spec.name;
    root.add(dummy);
  }

  parent.add(root);
  return root;
}

/**
 * Pre-placed scale/blocking dummies for Act 1 commune layout.
 * Coordinates match createCommuneSetDressing (COMMUNE_GATE_Z).
 */
export function placeScaleTestDummies(parent?: THREE.Object3D): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Act1ScaleDummies';

  // Import gate anchor lazily to avoid circular deps at module load.
  const gz = -75; // COMMUNE_GATE_Z — keep in sync with communeAssets
  const lodgeZ = gz - 52;
  const lodgeEntranceZ = lodgeZ + 13; // BUILD.lodge.d / 2
  const barnZ = gz - 62;

  const specs: BlockingDummySpec[] = [
    // Adults beside important doors.
    { name: 'AdultRefLodge', role: 'adult', position: [5.5, 0, lodgeEntranceZ + 2], rotationY: -0.5 },
    { name: 'AdultRefGuardHouse', role: 'adult', position: [-9.5, 0, gz + 2 + 3], rotationY: 0.4 },

    // Child near a dorm cabin porch.
    { name: 'ChildA', role: 'child', position: [-21, 0, gz - 72 + 5], rotationY: 0.2 },

    // Guards at the gate (NPC staging hooks).
    { name: 'GuardA', role: 'guard', position: [-2.5, 0, gz + 2], rotationY: Math.PI * 0.05 },
    { name: 'GuardB', role: 'guard', position: [2.5, 0, gz + 2], rotationY: -Math.PI * 0.05 },

    // Cult members near the lodge entrance.
    { name: 'CultLeader', role: 'cultMember', position: [5, 0, lodgeEntranceZ + 1], rotationY: Math.PI },
    { name: 'CultMemberA', role: 'cultMember', position: [-1.5, 0, lodgeEntranceZ], rotationY: Math.PI * 0.85 },
    { name: 'CultMemberB', role: 'cultMember', position: [0.5, 0, lodgeEntranceZ - 1], rotationY: Math.PI * 0.95 },

    // Extra adult at barn door area.
    { name: 'AdultRefBarn', role: 'adult', position: [30, 0, barnZ + 8], rotationY: -0.3 },
  ];

  placeBlockingDummies(root, specs);

  const ref = createScaleReferenceSet();
  ref.position.set(14, 0, 8);
  root.add(ref);

  if (parent) parent.add(root);
  return root;
}

// ---------------------------------------------------------------------------
// Label helper (canvas sprite — same technique as commune sign labels)
// ---------------------------------------------------------------------------

function createFloatingLabel(text: string, y: number): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(8,10,16,0.75)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#e8f0ff';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.position.y = y;
  sprite.scale.set(1.6, 0.4, 1);
  sprite.renderOrder = 999;
  return sprite;
}
