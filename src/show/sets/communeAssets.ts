import * as THREE from 'three';
import { ARC_SCALE } from '../dummies/arcDummies';

const { DOOR_HEIGHT, DOOR_WIDTH, PORCH_HEIGHT, CEILING_HEIGHT } = ARC_SCALE;

/** Shared gate anchor — dressing and blocking dummies use the same value. */
export const COMMUNE_GATE_Z = -75;

/**
 * Rural building footprints (meters). Doors/windows stay human-scale via ARC_SCALE;
 * only wall spans and roof volumes are enlarged so structures read as real buildings.
 */
const BUILD = {
  guard: { w: 5.5, d: 5.5, wall: CEILING_HEIGHT + 0.4 },
  lodge: { w: 18, d: 26, wall: 6.2 },
  generator: { w: 5.5, d: 4.8, wall: 3.2 },
  barn: { w: 12, d: 16, wall: 5.5 },
  dorm: { w: 7.2, d: 9.5, wall: CEILING_HEIGHT + 0.35 },
} as const;

/**
 * communeAssets — low-poly placeholder buildings & props for ARC Act 1, built
 * from basic Three.js primitives only (no external models). Roblox-ish /
 * theatrical blocking style: enough to make the commune feel lived-in and to
 * stage the first 10-minute experience.
 *
 * Conventions:
 *   - Every factory returns a named THREE.Group (group.name = "GuardHouse" etc.).
 *   - Materials are shared via a memoized palette (pal()) for low draw/material cost.
 *   - Buildings are tagged with simple collision metadata in userData.collider
 *     (an AABB) so a future physics pass can add colliders. TODO: consume these
 *     in PhysicsManager when world collision for props is wired.
 *   - Cylinders use low radial segments (6–10) for Quest/mobile.
 *   - Lanterns/windows use emissive materials, not lights, except a single warm
 *     porch light on the main lodge (the refuge focal point).
 *
 * Cue hooks: certain objects are given stable names so the Director/cue system
 * can find them later via group.getObjectByName(...):
 *   "Generator", "Bell", "Radio", "RoadLanterns", "LodgeWindows",
 *   "LockedDoor", "MapBoard". (Gate lanterns live on the gate in ShowController.)
 */

// ---------------------------------------------------------------------------
// Shared material palette (muted, theatrical)
// ---------------------------------------------------------------------------

interface Palette {
  darkWood: THREE.MeshStandardMaterial;
  lightWood: THREE.MeshStandardMaterial;
  dirt: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  barnRed: THREE.MeshStandardMaterial;
  cabinGreen: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  window: THREE.MeshStandardMaterial; // warm glow
  lamp: THREE.MeshStandardMaterial; // warm glow
  cloth: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  black: THREE.MeshStandardMaterial;
}

let _pal: Palette | null = null;

function pal(): Palette {
  if (_pal) return _pal;
  const std = (color: number, roughness = 0.95, metalness = 0): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const glow = (color: number, emissive: number, intensity: number): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.6 });
  _pal = {
    darkWood: std(0x3a2c1c),
    lightWood: std(0x8a6a40),
    dirt: std(0x4a3a26, 1),
    stone: std(0x6b6b70, 1),
    metal: std(0x55585f, 0.7, 0.4),
    barnRed: std(0x7a2f28),
    cabinGreen: std(0x3d5240),
    roof: std(0x2a2622),
    window: glow(0x3a2a14, 0xffc070, 1.2),
    lamp: glow(0x5a4a2a, 0xffb066, 1.5),
    cloth: std(0xb9b3a4, 1),
    leaf: std(0x2f4a2a, 1),
    paper: std(0xcfc7b2, 1),
    rope: std(0x6b5a3a, 1),
    black: std(0x101116, 0.8),
  };
  return _pal;
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  mat: THREE.Material,
  seg = 8,
  x = 0,
  y = 0,
  z = 0
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Gable (pitched) roof from two sloped box panels + triangular end caps. */
function gableRoof(w: number, d: number, roofH: number, mat: THREE.Material, eaveY: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roof';
  const angle = Math.atan2(roofH, d / 2);
  const panelLen = Math.hypot(d / 2, roofH) + 0.1;
  const panelGeo = new THREE.BoxGeometry(w + 0.3, 0.12, panelLen);
  for (const side of [1, -1]) {
    const panel = new THREE.Mesh(panelGeo, mat);
    panel.castShadow = true;
    panel.position.set(0, eaveY + roofH / 2, (side * d) / 4);
    panel.rotation.x = side * -angle;
    g.add(panel);
  }
  // Triangular gable ends.
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0);
  shape.lineTo(d / 2, 0);
  shape.lineTo(0, roofH);
  shape.closePath();
  const capGeo = new THREE.ShapeGeometry(shape);
  for (const side of [1, -1]) {
    const cap = new THREE.Mesh(capGeo, mat);
    cap.position.set((side * w) / 2, eaveY, 0);
    cap.rotation.y = side * (Math.PI / 2);
    g.add(cap);
  }
  return g;
}

function windowPanel(w: number, h: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), pal().window);
  m.castShadow = false;
  return m;
}

/** Canvas-textured label so signs are readable (placeholder text support). */
function labelTexture(text: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1c160e';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#5a4a2a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#e8dcc0';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Wrap to two lines if long.
  const words = text.split(' ');
  if (words.length > 1 && text.length > 9) {
    const mid = Math.ceil(words.length / 2);
    ctx.fillText(words.slice(0, mid).join(' '), 128, 50);
    ctx.fillText(words.slice(mid).join(' '), 128, 86);
  } else {
    ctx.fillText(text, 128, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Tag a group with a simple AABB collider for a future physics pass. */
function tagCollider(group: THREE.Group, w: number, h: number, d: number): void {
  // TODO: PhysicsManager can read userData.collider to add a static box collider.
  group.userData.collidable = true;
  group.userData.collider = { type: 'box', size: [w, h, d] };
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

export function createGuardHouse(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'GuardHouse';
  const { w, d, wall: h } = BUILD.guard;
  g.add(box(w, h, d, p.lightWood, 0, h / 2, 0));
  g.add(gableRoof(w, d, 1.35, p.roof, h));

  // Standard door: 2.2m × 1.1m (see ARC_SCALE).
  g.add(box(DOOR_WIDTH, DOOR_HEIGHT, 0.1, p.darkWood, -w * 0.16, DOOR_HEIGHT / 2, d / 2 + 0.02));
  const win = windowPanel(1.0, 0.95);
  win.position.set(w * 0.22, 1.65, d / 2 + 0.03);
  g.add(win);

  // Porch at target porch height (0.3m).
  g.add(box(w, PORCH_HEIGHT, 1.6, p.darkWood, 0, PORCH_HEIGHT / 2, d / 2 + 0.85));
  g.add(cyl(0.07, 0.07, 2.0, p.darkWood, 6, -w / 2 + 0.25, 1.0 + PORCH_HEIGHT, d / 2 + 1.35));
  g.add(cyl(0.07, 0.07, 2.0, p.darkWood, 6, w / 2 - 0.25, 1.0 + PORCH_HEIGHT, d / 2 + 1.35));
  g.add(box(w + 0.2, 0.1, 1.8, p.roof, 0, 2.05 + PORCH_HEIGHT, d / 2 + 0.85));

  // Radio table + lantern.
  g.add(box(0.7, 0.7, 0.4, p.darkWood, w * 0.24, 0.35, -d * 0.06));
  const radio = createRadio();
  radio.position.set(w * 0.24, 0.78, -d * 0.06);
  radio.scale.setScalar(0.8);
  g.add(radio);
  const lantern = createLanternPost();
  lantern.scale.setScalar(0.7);
  lantern.position.set(w / 2 + 0.6, 0, d / 2 + 1.2);
  g.add(lantern);

  tagCollider(g, w, h, d);
  return g;
}

export function createMainLodge(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'MainLodge';
  const { w, d, wall: h } = BUILD.lodge;
  g.add(box(w, h, d, p.lightWood, 0, h / 2, 0));
  g.add(gableRoof(w, d, 3.2, p.roof, h));

  // Warm window rows (named for cue control).
  const windows = new THREE.Group();
  windows.name = 'LodgeWindows';
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const win = windowPanel(1.2, 1.5);
      win.position.set((side * w) / 2 + side * 0.03, h * 0.45, -d * 0.32 + i * (d * 0.22));
      win.rotation.y = side * (Math.PI / 2);
      windows.add(win);
    }
  }
  // Entrance windows on +Z face.
  for (const x of [-w * 0.33, w * 0.33]) {
    const win = windowPanel(1.1, 1.5);
    win.position.set(x, h * 0.45, d / 2 + 0.03);
    windows.add(win);
  }
  g.add(windows);

  // Double doors (total ~2.2m wide × 2.2m tall) + porch steps.
  g.add(box(DOOR_WIDTH * 2, DOOR_HEIGHT, 0.12, p.darkWood, 0, DOOR_HEIGHT / 2, d / 2 + 0.02));
  g.add(box(5.2, 0.2, 0.75, p.stone, 0, PORCH_HEIGHT / 2, d / 2 + 0.55));
  g.add(box(6.0, 0.2, 0.75, p.stone, 0, 0.1, d / 2 + 1.05));
  for (const x of [-2.8, 2.8]) {
    g.add(cyl(0.1, 0.1, 3.4, p.darkWood, 6, x, 1.7, d / 2 + 1.45));
  }
  g.add(box(w, 0.15, 2.2, p.roof, 0, h * 0.58, d / 2 + 1.1));

  // A small chapel-style cross on the ridge to read as community hall.
  g.add(box(0.18, 1.4, 0.18, p.darkWood, 0, h + 3.2 + 0.7, d / 2 - 1.0));
  g.add(box(0.9, 0.18, 0.18, p.darkWood, 0, h + 3.2 + 1.05, d / 2 - 1.0));

  // Single warm porch light — the refuge focal point. (Only real light in the set.)
  const porchLight = new THREE.PointLight(0xffb066, 2.0, 28, 1.8);
  porchLight.position.set(0, h * 0.48, d / 2 + 1.2);
  porchLight.name = 'LodgePorchLight';
  g.add(porchLight);

  tagCollider(g, w, h, d);
  return g;
}

export function createGeneratorShed(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'GeneratorShed';
  const { w, d, wall: h } = BUILD.generator;
  // Open-sided: back + two side half-walls + 4 posts + roof.
  g.add(box(w, h, 0.12, p.darkWood, 0, h / 2, -d / 2)); // back wall
  g.add(box(0.12, h, d, p.darkWood, -w / 2, h / 2, 0)); // left
  g.add(box(0.12, h, d, p.darkWood, w / 2, h / 2, 0)); // right
  for (const x of [-w / 2, w / 2]) {
    g.add(cyl(0.08, 0.08, h, p.darkWood, 6, x, h / 2, d / 2));
  }
  const roof = box(w + 0.3, 0.12, d + 0.3, p.roof, 0, h, 0);
  roof.rotation.x = -0.12;
  g.add(roof);

  const gen = createGeneratorProp();
  gen.position.set(0, 0, -0.2);
  g.add(gen);

  tagCollider(g, w, h, d);
  return g;
}

export function createBarn(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Barn';
  const { w, d, wall: h } = BUILD.barn;
  g.add(box(w, h, d, p.barnRed, 0, h / 2, 0));
  g.add(gableRoof(w, d, 2.8, p.roof, h));

  // Barn double doors (~2.2m wide opening × 2.2m tall).
  for (const side of [-1, 1]) {
    const door = box(DOOR_WIDTH * 0.95, DOOR_HEIGHT, 0.12, p.darkWood, side * (DOOR_WIDTH * 0.5 + 0.05), DOOR_HEIGHT / 2, d / 2 + 0.02);
    g.add(door);
    const x1 = box(0.12, DOOR_HEIGHT + 0.2, 0.06, p.cloth, side * (DOOR_WIDTH * 0.5 + 0.05), DOOR_HEIGHT / 2, d / 2 + 0.1);
    x1.rotation.z = 0.7;
    const x2 = x1.clone();
    x2.rotation.z = -0.7;
    g.add(x1, x2);
  }
  // Hayloft window.
  const win = windowPanel(1.2, 1.1);
  win.position.set(0, h * 0.82, d / 2 + 0.03);
  g.add(win);

  tagCollider(g, w, h, d);
  return g;
}

export function createDormCabin(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'DormCabin';
  const { w, d, wall: h } = BUILD.dorm;
  g.add(box(w, h, d, p.cabinGreen, 0, h / 2, 0));
  g.add(gableRoof(w, d, 1.6, p.roof, h));

  // Standard door + porch (dorm cabin).
  g.add(box(DOOR_WIDTH, DOOR_HEIGHT, 0.1, p.darkWood, 0, DOOR_HEIGHT / 2, d / 2 + 0.02));
  for (const x of [-w * 0.31, w * 0.31]) {
    const win = windowPanel(0.9, 1.0);
    win.position.set(x, h * 0.58, d / 2 + 0.03);
    g.add(win);
  }
  g.add(box(w, PORCH_HEIGHT, 1.4, p.darkWood, 0, PORCH_HEIGHT / 2, d / 2 + 0.75));
  for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) {
    g.add(cyl(0.07, 0.07, 2.2, p.darkWood, 6, x, 1.1, d / 2 + 1.15));
  }
  g.add(box(w + 0.2, 0.1, 1.5, p.roof, 0, h * 0.68, d / 2 + 0.65));

  tagCollider(g, w, h, d);
  return g;
}

export function createWaterTower(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'WaterTower';
  const legH = 9;
  const spread = 2.4;
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ]) {
    const leg = cyl(0.12, 0.16, legH, p.darkWood, 6, sx * spread, legH / 2, sz * spread);
    leg.rotation.x = sz * 0.06;
    leg.rotation.z = -sx * 0.06;
    g.add(leg);
  }
  // Cross-bracing.
  for (const y of [1.8, 3.8]) {
    for (const r of [0, Math.PI / 2]) {
      const brace = box(spread * 2.2, 0.08, 0.08, p.darkWood, 0, y, 0);
      brace.rotation.y = r;
      g.add(brace);
    }
  }
  // Tank + conical roof.
  g.add(cyl(2.2, 2.2, 3.0, p.metal, 12, 0, legH + 1.5, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.5, 12), p.roof);
  roof.position.y = legH + 3.0 + 0.75;
  roof.castShadow = true;
  g.add(roof);
  // Ladder.
  for (let i = 0; i < 8; i++) {
    g.add(box(0.5, 0.05, 0.05, p.metal, 0, 0.6 + i * 0.7, spread + 0.1));
  }
  tagCollider(g, spread * 2 + 0.5, legH + 3, spread * 2 + 0.5);
  return g;
}

// ---------------------------------------------------------------------------
// Outdoor props
// ---------------------------------------------------------------------------

export function createDirtRoad(length = 40, width = 7): THREE.Group {
  const g = new THREE.Group();
  g.name = 'DirtRoadExtension';
  const road = new THREE.Mesh(new THREE.PlaneGeometry(width, length), pal().dirt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.015;
  road.receiveShadow = true;
  g.add(road);
  return g;
}

export function createClothesline(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Clothesline';
  for (const x of [-2.5, 2.5]) {
    g.add(cyl(0.06, 0.06, 2.2, p.darkWood, 6, x, 1.1, 0));
    g.add(box(0.8, 0.08, 0.08, p.darkWood, x, 2.0, 0));
  }
  const line = cyl(0.02, 0.02, 5, p.rope, 4, 0, 2.0, 0);
  line.rotation.z = Math.PI / 2;
  g.add(line);
  // Hanging cloths.
  for (const [x, c] of [
    [-1.6, 0xb9b3a4],
    [-0.4, 0x6f7a8a],
    [0.8, 0x8a6a40],
  ] as [number, number][]) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshStandardMaterial({ color: c, roughness: 1, side: THREE.DoubleSide }));
    cloth.position.set(x, 1.5, 0);
    g.add(cloth);
  }
  return g;
}

export function createFirewoodPile(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'FirewoodPile';
  const logGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6);
  let count = 0;
  for (let row = 0; row < 3; row++) {
    const n = 5 - row;
    for (let i = 0; i < n; i++) {
      const log = new THREE.Mesh(logGeo, p.lightWood);
      log.rotation.z = Math.PI / 2;
      log.position.set(-0.5 + i * 0.26 + row * 0.13, 0.12 + row * 0.22, 0);
      log.castShadow = true;
      g.add(log);
      count++;
    }
  }
  void count;
  return g;
}

export function createVegetableGarden(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'VegetableGarden';
  g.add(box(4, 0.2, 3, p.dirt, 0, 0.1, 0, false));
  // Low border.
  for (const [w, d, x, z] of [
    [4, 0.2, 0, 1.5],
    [4, 0.2, 0, -1.5],
    [0.2, 3, 2, 0],
    [0.2, 3, -2, 0],
  ] as [number, number, number, number][]) {
    g.add(box(w, 0.3, d, p.lightWood, x, 0.15, z));
  }
  // Crop rows (little green tufts).
  const tuft = new THREE.ConeGeometry(0.18, 0.4, 5);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(tuft, p.leaf);
      c.position.set(-1.5 + i * 0.6, 0.4, -1 + r);
      g.add(c);
    }
  }
  return g;
}

export function createChickenCoop(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'ChickenCoop';
  g.add(box(1.8, 1.2, 1.4, p.lightWood, 0, 0.6, 0));
  const roof = box(2.0, 0.1, 1.6, p.roof, 0, 1.2, 0);
  roof.rotation.x = -0.2;
  g.add(roof);
  // Entry hole + ramp.
  g.add(box(0.4, 0.4, 0.05, p.black, 0.4, 0.4, 0.72));
  const ramp = box(0.5, 0.05, 1.0, p.darkWood, 0.4, 0.25, 1.1);
  ramp.rotation.x = 0.5;
  g.add(ramp);
  // Little wire fence posts.
  for (let i = 0; i < 4; i++) {
    g.add(cyl(0.04, 0.04, 0.6, p.darkWood, 4, -0.8 + i * 0.6, 0.3, 1.6));
  }
  return g;
}

export function createWaterPump(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'WaterPump';
  g.add(box(0.6, 0.4, 0.6, p.stone, 0, 0.2, 0));
  g.add(cyl(0.08, 0.1, 1.0, p.metal, 8, 0, 0.9, 0));
  g.add(box(0.5, 0.08, 0.08, p.metal, 0.2, 1.35, 0)); // handle
  g.add(box(0.1, 0.1, 0.35, p.metal, 0, 1.1, 0.25)); // spout
  return g;
}

export function createBench(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Bench';
  g.add(box(1.8, 0.12, 0.5, p.lightWood, 0, 0.5, 0)); // seat
  g.add(box(1.8, 0.5, 0.12, p.lightWood, 0, 0.8, -0.2)); // back
  for (const x of [-0.75, 0.75]) {
    g.add(box(0.12, 0.5, 0.45, p.darkWood, x, 0.25, 0));
  }
  return g;
}

export function createLanternPost(withLight = true): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'LanternPost';
  g.add(cyl(0.07, 0.1, 2.8, p.metal, 6, 0, 1.4, 0));
  g.add(box(0.06, 0.06, 0.5, p.metal, 0, 2.8, 0.2)); // arm
  const lamp = box(0.35, 0.45, 0.35, p.lamp, 0, 2.75, 0.4);
  lamp.name = 'lantern';
  g.add(lamp);
  if (withLight) {
    const light = new THREE.PointLight(0xffb066, 0.85, 16, 1.8);
    light.position.set(0, 2.75, 0.4);
    g.add(light);
  }
  return g;
}

export function createWoodenSign(label?: string): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'WoodenSign';
  g.add(cyl(0.07, 0.08, 1.8, p.darkWood, 6, 0, 0.9, 0));
  if (label) {
    const mat = new THREE.MeshBasicMaterial({ map: labelTexture(label), side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), mat);
    board.position.set(0, 1.6, 0.05);
    g.add(board);
    g.userData.label = label;
  } else {
    // TODO: add readable text once a label/text system is standardized.
    g.add(box(1.4, 0.7, 0.08, p.lightWood, 0, 1.6, 0));
  }
  return g;
}

export function createFenceSegment(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'FenceSegment';
  for (const x of [-1.4, 1.4]) {
    g.add(box(0.12, 1.2, 0.12, p.darkWood, x, 0.6, 0));
  }
  for (const y of [0.4, 0.9]) {
    g.add(box(2.9, 0.08, 0.08, p.lightWood, 0, y, 0));
  }
  return g;
}

export function createRockPile(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'RockPile';
  const geo = new THREE.IcosahedronGeometry(0.5, 0);
  for (const [x, y, z, s] of [
    [0, 0.25, 0, 1],
    [0.5, 0.2, 0.2, 0.7],
    [-0.4, 0.18, 0.3, 0.6],
    [0.1, 0.45, -0.1, 0.5],
  ] as [number, number, number, number][]) {
    const r = new THREE.Mesh(geo, p.stone);
    r.position.set(x, y, z);
    r.scale.setScalar(s);
    r.rotation.set(Math.random(), Math.random(), Math.random());
    r.castShadow = true;
    g.add(r);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Small interactive / cue props
// ---------------------------------------------------------------------------

export function createRadio(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Radio';
  g.add(box(0.5, 0.3, 0.28, p.darkWood, 0, 0.15, 0));
  g.add(box(0.3, 0.15, 0.02, p.lamp, 0, 0.18, 0.15)); // dial face (glow)
  g.add(cyl(0.01, 0.01, 0.5, p.metal, 4, 0.18, 0.5, 0)); // antenna
  return g;
}

export function createFlashlight(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Flashlight';
  g.add(cyl(0.05, 0.05, 0.4, p.metal, 8, 0, 0, 0));
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.12, 8), p.metal);
  head.position.y = 0.25;
  g.add(head);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 8), p.lamp);
  lens.position.set(0, 0.31, 0);
  g.add(lens);
  return g;
}

export function createGuestBook(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'GuestBook';
  g.add(box(0.6, 1.0, 0.5, p.darkWood, 0, 0.5, 0)); // podium
  const top = box(0.7, 0.08, 0.55, p.lightWood, 0, 1.02, 0);
  top.rotation.x = -0.25;
  g.add(top);
  const pages = box(0.5, 0.04, 0.4, p.paper, 0, 1.08, 0.02);
  pages.rotation.x = -0.25;
  g.add(pages);
  return g;
}

export function createBellRope(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'BellRope';
  // A-frame support.
  for (const x of [-0.6, 0.6]) {
    const leg = cyl(0.08, 0.08, 2.6, p.darkWood, 6, x, 1.3, 0);
    leg.rotation.z = x > 0 ? 0.18 : -0.18;
    g.add(leg);
  }
  g.add(box(1.6, 0.12, 0.12, p.darkWood, 0, 2.5, 0));
  // Bell (named for cue: ring the bell).
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 10), p.metal);
  bell.position.set(0, 2.2, 0);
  bell.name = 'Bell';
  g.add(bell);
  // Rope.
  const rope = cyl(0.02, 0.02, 1.4, p.rope, 4, 0, 1.4, 0);
  g.add(rope);
  return g;
}

export function createGeneratorProp(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Generator';
  g.add(box(1.4, 0.8, 0.9, p.metal, 0, 0.4, 0)); // engine block
  g.add(cyl(0.25, 0.25, 0.8, p.metal, 8, 0.4, 0.95, 0)); // cylinder housing
  const exhaust = cyl(0.05, 0.05, 0.6, p.black, 6, -0.5, 1.0, 0.3);
  g.add(exhaust);
  g.add(box(0.12, 0.12, 0.02, p.lamp, 0.6, 0.5, 0.46)); // status light (glow)
  return g;
}

export function createLockedDoor(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'LockedDoor';
  // Frame + door at standard 2.2m × 1.1m.
  g.add(box(DOOR_WIDTH + 0.25, DOOR_HEIGHT + 0.15, 0.2, p.darkWood, 0, DOOR_HEIGHT / 2, 0));
  g.add(box(DOOR_WIDTH, DOOR_HEIGHT, 0.1, p.lightWood, 0, DOOR_HEIGHT / 2, 0.08));
  g.add(box(0.15, 0.2, 0.08, p.metal, DOOR_WIDTH * 0.35, DOOR_HEIGHT * 0.5, 0.15));
  g.add(cyl(0.04, 0.04, 0.12, p.metal, 6, DOOR_WIDTH * 0.35, DOOR_HEIGHT * 0.58, 0.15));
  return g;
}

export function createMapBoard(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'MapBoard';
  for (const x of [-0.9, 0.9]) {
    g.add(cyl(0.07, 0.07, 2.0, p.darkWood, 6, x, 1.0, 0));
  }
  g.add(box(2.1, 1.3, 0.1, p.darkWood, 0, 1.6, 0)); // backing
  // Simple "map" face.
  const map = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.1), new THREE.MeshStandardMaterial({ color: 0x6b6f5a, roughness: 1 }));
  map.position.set(0, 1.6, 0.06);
  g.add(map);
  // Small roof to protect it.
  const roof = box(2.3, 0.08, 0.6, p.roof, 0, 2.3, 0);
  roof.rotation.x = -0.3;
  g.add(roof);
  return g;
}

export function createCrate(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Crate';
  const s = 0.8;
  g.add(box(s, s, s, p.lightWood, 0, s / 2, 0));
  // Edge planks (darker) for a crate look.
  for (const y of [0.05, s - 0.05]) {
    g.add(box(s + 0.02, 0.08, 0.08, p.darkWood, 0, y, s / 2));
    g.add(box(s + 0.02, 0.08, 0.08, p.darkWood, 0, y, -s / 2));
  }
  return g;
}

export function createBarrel(): THREE.Group {
  const p = pal();
  const g = new THREE.Group();
  g.name = 'Barrel';
  g.add(cyl(0.4, 0.45, 1.1, p.darkWood, 12, 0, 0.55, 0));
  for (const y of [0.25, 0.85]) {
    g.add(cyl(0.47, 0.47, 0.06, p.metal, 12, 0, y, 0));
  }
  return g;
}

// ---------------------------------------------------------------------------
// Set dressing — assemble a believable commune entrance behind the gate
// ---------------------------------------------------------------------------

export interface CommuneDressingOptions {
  /** Z of the gate; the commune is built behind it (more negative Z). */
  gateZ?: number;
  /** If provided, the dressing is also added to this parent. */
  parent?: THREE.Object3D;
}

/**
 * Lay out the commune interior behind the gate to form the Act 1 refuge.
 * Buildings sit to the sides; the central corridor (|x| < ~3) stays walkable
 * from the gate to the lodge so the bus -> gate -> lodge route is never blocked.
 *
 * Returns the THREE.Group (also added to `options.parent` if given).
 */
export function createCommuneSetDressing(options: CommuneDressingOptions = {}): THREE.Group {
  const gz = options.gateZ ?? COMMUNE_GATE_Z;
  const set = new THREE.Group();
  set.name = 'CommuneSetDressing';

  const place = (obj: THREE.Group, x: number, y: number, z: number, rotY = 0): THREE.Group => {
    obj.position.set(x, y, z);
    obj.rotation.y = rotY;
    set.add(obj);
    return obj;
  };

  // Z offsets from the gate (negative = deeper into the commune).
  const lodgeZ = gz - 52;
  const barnZ = gz - 62;

  // Dirt road continues through the gate toward the lodge (|x| < ~6 stays walkable).
  place(createDirtRoad(72, 9), 0, 0, gz - 36);

  // Guard house beside the gate (just inside).
  place(createGuardHouse(), -12, 0, gz + 2, 0.25);
  place(createMapBoard(), 11, 0, gz - 5, -0.4); // "MapBoard"

  // Main lodge: centered, entrance facing the gate (+Z).
  place(createMainLodge(), 0, 0, lodgeZ);

  // Generator shed off to one side near the lodge.
  place(createGeneratorShed(), -24, 0, gz - 44, 0.4);
  // Barn farther back/side (faded red).
  place(createBarn(), 28, 0, barnZ, -0.5);

  // Dorm cabins — spaced around the lodge, not clustered.
  place(createDormCabin(), -24, 0, gz - 72, 0.5);
  place(createDormCabin(), 26, 0, gz - 40, -0.4);
  place(createDormCabin(), -16, 0, gz - 92, 0.2);

  // Water tower in the background.
  place(createWaterTower(), -34, 0, gz - 88);

  // Lantern posts + fences along the interior road (named group for cues).
  const roadLanterns = new THREE.Group();
  roadLanterns.name = 'RoadLanterns';
  for (let i = 0; i < 5; i++) {
    const z = gz - 8 - i * 14;
    for (const x of [-7, 7]) {
      const lp = createLanternPost();
      lp.position.set(x, 0, z);
      roadLanterns.add(lp);
    }
  }
  set.add(roadLanterns);
  for (let i = 0; i < 6; i++) {
    const z = gz - 12 - i * 9;
    place(createFenceSegment(), -8.5, 0, z);
    place(createFenceSegment(), 8.5, 0, z);
  }

  // Signs.
  place(createWoodenSign('WELCOME'), 7, 0, gz - 7, -0.5);
  place(createWoodenSign('DINING HALL'), 9, 0, gz - 48, -0.4);
  place(createWoodenSign('CHAPEL'), -7, 0, gz - 38, 0.4);
  place(createWoodenSign('STAFF ONLY'), -18, 0, gz - 42, 0.4);
  place(createWoodenSign('INFIRMARY'), 14, 0, gz - 36, -0.4);

  // Lived-in clutter around the buildings (kept off the central path).
  place(createClothesline(), -18, 0, gz - 58, 0.3);
  place(createFirewoodPile(), 10, 0, gz - 54);
  place(createVegetableGarden(), 14, 0, gz - 48);
  place(createChickenCoop(), 16, 0, gz - 52, -0.3);
  place(createWaterPump(), 12, 0, gz - 46);
  place(createBench(), 7, 0, gz - 56, Math.PI);
  place(createBench(), -7, 0, gz - 56, Math.PI);
  place(createGuestBook(), 3.5, 0, lodgeZ + BUILD.lodge.d / 2 - 2); // near lodge entrance
  place(createBellRope(), -4, 0, lodgeZ + BUILD.lodge.d / 2 - 2.5); // "Bell"

  // Barrels + crates.
  place(createBarrel(), -14, 0, gz - 38);
  place(createBarrel(), -13.2, 0, gz - 37.2);
  place(createCrate(), 12, 0, gz - 42);
  place(createCrate(), 12.6, 0, gz - 42.6);
  place(createCrate(), 12.2, 0.8, gz - 42.3);

  // Rocks at the treeline edges.
  place(createRockPile(), -22, 0, gz - 18);
  place(createRockPile(), 20, 0, gz - 12);

  // A locked door prop on the barn side (mystery / future cue).
  place(createLockedDoor(), 28, 0, barnZ + 6, Math.PI); // "LockedDoor"

  if (options.parent) options.parent.add(set);
  return set;
}
