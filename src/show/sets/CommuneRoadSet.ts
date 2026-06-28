import * as THREE from 'three';
import { ACT1_GROUND } from '../act1Ground';

/**
 * createCommuneRoadSet — a modular, procedurally generated rehearsal set for the
 * Act 1 stormy commune road.
 *
 * This is a *blocking/rehearsal* environment, not final art: it gives actors and
 * the director real spatial landmarks (a curving muddy road that leads the eye to
 * the gate, a dangerous-feeling forest of silhouette trees, fences, a broken
 * signpost, rocks/bushes, lantern posts, distant commune buildings) while staying
 * cheap for WebXR/Quest.
 *
 * Performance choices:
 *   - Trees / fence posts / rocks / bushes are InstancedMesh (one draw call each).
 *   - Materials are created once and reused.
 *   - Environment props do NOT cast shadows (silhouettes are enough); only the
 *     hero props (bus/gate, owned by ShowController) cast the moon's shadow.
 *   - Only two extra warm point lights (lantern posts) — everything else is
 *     emissive, so the dynamic-light count stays low.
 *
 * Everything lives under one returned Group so ShowController can fade/reveal it
 * as a unit and later swap these primitives for real models without touching the
 * rest of the show.
 */

export interface CommuneRoadSetOptions {
  /** Z of the commune gate (road leads here). Default -73. */
  gateZ?: number;
  /** Approximate player spawn (road starts here). Default { x: 2.5, z: 15 }. */
  spawn?: { x: number; z: number };
  /** Scale tree/prop density (1 = default). Lower on weak devices. */
  density?: number;
}

interface Transform {
  pos: THREE.Vector3;
  rotY: number;
  scale: THREE.Vector3;
}

export function createCommuneRoadSet(options: CommuneRoadSetOptions = {}): THREE.Group {
  const gateZ = options.gateZ ?? -73;
  const spawn = options.spawn ?? { x: 2.5, z: 15 };
  const density = options.density ?? 1;

  const group = new THREE.Group();
  group.name = 'commune-road-set';

  // ---- Shared, reused materials ----
  const mats = {
    ground: new THREE.MeshStandardMaterial({ color: 0x1c1810, roughness: 1, metalness: 0 }),
    road: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.05 }),
    puddle: new THREE.MeshStandardMaterial({
      color: 0x0a0d12,
      roughness: 0.18,
      metalness: 0.0,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x1b1610, roughness: 1 }),
    crown: new THREE.MeshStandardMaterial({ color: 0x0e140d, roughness: 1 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x241d13, roughness: 0.95 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x2b2c30, roughness: 1 }),
    bush: new THREE.MeshStandardMaterial({ color: 0x12180f, roughness: 1 }),
    metalDark: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8, metalness: 0.3 }),
    lampGlow: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, emissive: 0xffb066, emissiveIntensity: 1.1 }),
  };

  // The road spine: a gentle S-curve from spawn to the gate. Trees/props are
  // placed relative to this curve so the whole layout reads as "follow the road".
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(spawn.x, 0, spawn.z + 2),
    new THREE.Vector3(spawn.x - 0.5, 0, spawn.z - 9),
    new THREE.Vector3(1, 0, (spawn.z + gateZ) * 0.5 + 6),
    new THREE.Vector3(-2.5, 0, (spawn.z + gateZ) * 0.5 - 12),
    new THREE.Vector3(-1, 0, gateZ + 16),
    new THREE.Vector3(0, 0, gateZ + 2),
  ]);

  const rng = makeRng(1337); // deterministic so rehearsals look identical run-to-run

  group.add(buildGround(mats.ground));
  group.add(buildRoadRibbon(curve, mats.road, rng));
  group.add(buildPuddles(curve, mats.puddle, rng));
  buildForest(group, curve, mats, rng, density);
  buildFences(group, curve, mats, rng);
  group.add(buildBrokenSign(mats, spawn));
  buildRocksAndBushes(group, curve, mats, rng, density);
  buildLanternPosts(group, mats, gateZ);
  // Real placeholder commune buildings are added by communeAssets'
  // createCommuneSetDressing (wired in ShowController), so the old distant
  // silhouette boxes are intentionally omitted here.

  return group;
}

// ---------------------------------------------------------------------------
// Ground + road
// ---------------------------------------------------------------------------

function buildGround(mat: THREE.Material): THREE.Mesh {
  const { centerZ, planeWidth, planeDepth } = ACT1_GROUND;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(planeWidth, planeDepth), mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, centerZ);
  ground.receiveShadow = true;
  return ground;
}

/**
 * A ribbon mesh swept along the road curve, with subtle per-vertex mud color
 * variation so it never reads as a flat rectangle.
 */
function buildRoadRibbon(curve: THREE.CatmullRomCurve3, mat: THREE.Material, rng: () => number): THREE.Mesh {
  const segments = 90;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const base = new THREE.Color(0x2e2618);
  const tmp = new THREE.Color();

  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    // Perpendicular in the XZ plane.
    let nx = t.z;
    let nz = -t.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const halfW = 3.4 + Math.sin(u * Math.PI * 3) * 0.35;

    positions.push(p.x + nx * halfW, 0.02, p.z + nz * halfW);
    positions.push(p.x - nx * halfW, 0.02, p.z - nz * halfW);

    for (let s = 0; s < 2; s++) {
      const v = 0.78 + rng() * 0.42;
      tmp.copy(base).multiplyScalar(v);
      colors.push(tmp.r, tmp.g, tmp.b);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'mud-road';
  return mesh;
}

function buildPuddles(curve: THREE.CatmullRomCurve3, mat: THREE.Material, rng: () => number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'puddles';
  const geo = new THREE.CircleGeometry(1, 14);
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  const count = 9;
  for (let i = 0; i < count; i++) {
    const u = 0.08 + (i / count) * 0.85;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    let nx = t.z;
    let nz = -t.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const off = (rng() - 0.5) * 4;
    const puddle = new THREE.Mesh(geo, mat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(p.x + nx * off, 0.012, p.z + nz * off);
    const sx = 1.1 + rng() * 2.2;
    const sz = 0.7 + rng() * 1.6;
    puddle.scale.set(sx, sz, 1);
    puddle.rotation.z = rng() * Math.PI;
    g.add(puddle);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Forest (instanced silhouettes)
// ---------------------------------------------------------------------------

function buildForest(
  group: THREE.Group,
  curve: THREE.CatmullRomCurve3,
  mats: Record<string, THREE.Material>,
  rng: () => number,
  density: number
): void {
  const trunks: Transform[] = [];
  const crowns: Transform[] = [];

  const samples = 46;
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    let nx = t.z;
    let nz = -t.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;

    for (const side of [-1, 1]) {
      // 1–2 rows per side; denser farther from the road. Center stays clear.
      const rows = rng() < 0.55 * density ? 2 : 1;
      for (let r = 0; r < rows; r++) {
        if (rng() > 0.85 * density) continue; // gaps so it's not a wall
        const offset = 6.5 + r * 7 + rng() * 6;
        const jitterZ = (rng() - 0.5) * 4;
        const s = 0.7 + rng() * 1.5;
        const heightVar = 0.9 + rng() * 0.7;
        const x = p.x + nx * offset * side + (rng() - 0.5) * 2;
        const z = p.z + nz * offset * side + jitterZ;
        const rotY = rng() * Math.PI * 2;

        trunks.push({ pos: new THREE.Vector3(x, 1.5 * s, z), rotY, scale: new THREE.Vector3(s, s, s) });
        crowns.push({
          pos: new THREE.Vector3(x, 3.0 * s + 1.9 * s * heightVar, z),
          rotY,
          scale: new THREE.Vector3(s * 1.05, s * heightVar, s * 1.05),
        });
      }
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.28, 3, 5);
  const crownGeo = new THREE.ConeGeometry(1.7, 4, 7);
  group.add(makeInstanced(trunkGeo, mats.trunk, trunks, 'tree-trunks'));
  group.add(makeInstanced(crownGeo, mats.crown, crowns, 'tree-crowns'));
}

// ---------------------------------------------------------------------------
// Fences
// ---------------------------------------------------------------------------

function buildFences(
  group: THREE.Group,
  curve: THREE.CatmullRomCurve3,
  mats: Record<string, THREE.Material>,
  rng: () => number
): void {
  const posts: Transform[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();

  // A broken run of fence posts along the right edge near the start of the road.
  for (let i = 0; i < 14; i++) {
    const u = 0.05 + i * 0.045;
    if (u > 0.6) break;
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    let nx = t.z;
    let nz = -t.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    if (rng() < 0.18) continue; // missing posts = broken/old
    const off = 4.6 + rng() * 0.5;
    const lean = (rng() - 0.5) * 0.25;
    posts.push({
      pos: new THREE.Vector3(p.x + nx * off, 0.6, p.z + nz * off),
      rotY: lean,
      scale: new THREE.Vector3(1, 0.85 + rng() * 0.5, 1),
    });
  }

  const postGeo = new THREE.BoxGeometry(0.14, 1.3, 0.14);
  group.add(makeInstanced(postGeo, mats.wood, posts, 'fence-posts'));
}

// ---------------------------------------------------------------------------
// Broken signpost (points toward the commune)
// ---------------------------------------------------------------------------

function buildBrokenSign(mats: Record<string, THREE.Material>, spawn: { x: number; z: number }): THREE.Group {
  const g = new THREE.Group();
  g.name = 'broken-sign';

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.4, 6), mats.wood);
  post.position.y = 1.2;
  post.rotation.z = 0.12; // leaning
  g.add(post);

  const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), mats.wood);
  board.position.set(0.15, 1.9, 0);
  board.rotation.z = -0.08;
  g.add(board);

  // A faint warm arrow on the board pointing down-road (-Z / toward the gate).
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 3), mats.lampGlow);
  arrow.rotation.z = Math.PI / 2; // point along -X face... rotate to read as forward arrow
  arrow.rotation.y = Math.PI / 2;
  arrow.position.set(-0.45, 1.9, 0.06);
  g.add(arrow);

  g.position.set(spawn.x + 3.5, 0, spawn.z - 1);
  g.rotation.y = -0.3;
  return g;
}

// ---------------------------------------------------------------------------
// Rocks + bushes
// ---------------------------------------------------------------------------

function buildRocksAndBushes(
  group: THREE.Group,
  curve: THREE.CatmullRomCurve3,
  mats: Record<string, THREE.Material>,
  rng: () => number,
  density: number
): void {
  const rocks: Transform[] = [];
  const bushes: Transform[] = [];
  const p = new THREE.Vector3();
  const t = new THREE.Vector3();

  const samples = Math.floor(30 * density);
  for (let i = 0; i < samples; i++) {
    const u = rng();
    curve.getPointAt(u, p);
    curve.getTangentAt(u, t);
    let nx = t.z;
    let nz = -t.x;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
    const side = rng() < 0.5 ? -1 : 1;
    const off = 3.6 + rng() * 3.5; // hug the road edge
    const x = p.x + nx * off * side;
    const z = p.z + nz * off * side;
    const rotY = rng() * Math.PI * 2;
    if (rng() < 0.5) {
      const s = 0.3 + rng() * 0.8;
      rocks.push({ pos: new THREE.Vector3(x, s * 0.4, z), rotY, scale: new THREE.Vector3(s, s * 0.8, s) });
    } else {
      const s = 0.5 + rng() * 0.9;
      bushes.push({ pos: new THREE.Vector3(x, s * 0.4, z), rotY, scale: new THREE.Vector3(s, s * 0.7, s) });
    }
  }

  const rockGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const bushGeo = new THREE.IcosahedronGeometry(0.7, 0); // low-poly blob; dark green mat
  group.add(makeInstanced(rockGeo, mats.rock, rocks, 'rocks'));
  group.add(makeInstanced(bushGeo, mats.bush, bushes, 'bushes'));
}

// ---------------------------------------------------------------------------
// Lantern posts (warm pools of light guiding toward the gate)
// ---------------------------------------------------------------------------

function buildLanternPosts(group: THREE.Group, mats: Record<string, THREE.Material>, gateZ: number): void {
  const postGeo = new THREE.CylinderGeometry(0.08, 0.12, 3, 6);
  const lampGeo = new THREE.BoxGeometry(0.4, 0.5, 0.4);

  // Two lanterns flanking the final approach to the gate.
  for (const x of [-4.5, 4.5]) {
    const lantern = new THREE.Group();
    const post = new THREE.Mesh(postGeo, mats.metalDark);
    post.position.y = 1.5;
    lantern.add(post);

    const lamp = new THREE.Mesh(lampGeo, mats.lampGlow);
    lamp.position.y = 3.1;
    lantern.add(lamp);

    // One modest warm light per lantern — kept low/limited range for Quest.
    const light = new THREE.PointLight(0xffb066, 1.0, 22, 1.8);
    light.position.set(0, 3.1, 0);
    lantern.add(light);

    lantern.position.set(x, 0, gateZ + 10);
    group.add(lantern);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstanced(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  transforms: Transform[],
  name: string
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, transforms.length));
  mesh.name = name;
  // Silhouette props: no shadow casting keeps the moon's shadow pass cheap.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  transforms.forEach((tr, i) => {
    e.set(0, tr.rotY, 0);
    q.setFromEuler(e);
    m.compose(tr.pos, q, tr.scale);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = transforms.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

/** Tiny deterministic PRNG (mulberry32) so the layout is stable across runs. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
