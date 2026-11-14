import * as THREE from 'three';

const matCache = new Map();
export function flatMat(color, opts = {}) {
  const key = `${color}-${opts.roughness || 0.78}-${opts.metalness || 0.08}-${opts.transparent || false}-${opts.opacity || 1}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.78,
    metalness: opts.metalness ?? 0.08,
    flatShading: true,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1
  });
  if (!opts.unique) matCache.set(key, m);
  return m;
}

// Create organic irregular cylinder/cone by radially perturbing vertices
function deformRadial(geo, seed = 1, amount = 0.14) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r > 0.1) {
      const ang = Math.atan2(z, x);
      const n = 1 + amount * (Math.sin(ang * 3 + seed) * 0.6 + Math.cos(ang * 5 - seed * 1.7) * 0.4);
      pos.setX(i, x * n);
      pos.setZ(i, z * n);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildFloatingIslandBase(radius, seed, isCenter = false) {
  const group = new THREE.Group();

  // 1.Shoreline / Cloud-mist Foam Ring
  const foamGeo = deformRadial(new THREE.RingGeometry(radius * 0.96, radius * 1.13, 28), seed, 0.12);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.48,
    side: THREE.DoubleSide
  });
  const foamMesh = new THREE.Mesh(foamGeo, foamMat);
  foamMesh.position.y = -0.35;
  group.add(foamMesh);

  // 2. Top Grass & Sand/Terrace Layers (3 color strata on top + patchwork details)
  const sandGeo = deformRadial(new THREE.CylinderGeometry(radius * 1.0, radius * 0.95, 0.55, 20), seed, 0.12);
  const sandMesh = new THREE.Mesh(sandGeo, flatMat(0xe6d2a8));
  sandMesh.position.y = -0.25;
  sandMesh.receiveShadow = true;
  group.add(sandMesh);

  const grassBaseGeo = deformRadial(new THREE.CylinderGeometry(radius * 0.95, radius * 0.98, 0.45, 20), seed, 0.12);
  const grassMesh = new THREE.Mesh(grassBaseGeo, flatMat(isCenter ? 0x56984d : 0x5c9e52));
  grassMesh.position.y = 0.12;
  grassMesh.receiveShadow = true;
  grassMesh.castShadow = true;
  group.add(grassMesh);

  // Patchwork grass color blocks on surface (Requirement: 地面有色塊拼貼與陰影細節)
  const patchColors = [0x4b8742, 0x6db05e, 0x7ab867];
  for (let p = 0; p < 5; p++) {
    const pAng = (p / 5) * Math.PI * 2 + seed;
    const pDist = radius * (0.28 + (p % 2) * 0.22);
    const pGeo = new THREE.CylinderGeometry(radius * 0.24, radius * 0.26, 0.08, 9);
    const pMesh = new THREE.Mesh(pGeo, flatMat(patchColors[p % patchColors.length]));
    pMesh.position.set(Math.cos(pAng) * pDist, 0.34, Math.sin(pAng) * pDist);
    pMesh.receiveShadow = true;
    group.add(pMesh);
  }

  // 3. Inverted Conical Stratified Under-Rock (Requirement: 底部是倒錐形岩層，往下收尖、分 2~3 層色階的土石)
  const strata1Geo = deformRadial(new THREE.CylinderGeometry(radius * 0.92, radius * 0.66, 2.0, 16), seed + 1, 0.15);
  const strata1 = new THREE.Mesh(strata1Geo, flatMat(0x8a7968));
  strata1.position.y = -1.4;
  strata1.castShadow = true;
  strata1.receiveShadow = true;
  group.add(strata1);

  const strata2Geo = deformRadial(new THREE.CylinderGeometry(radius * 0.66, radius * 0.36, 2.3, 14), seed + 2, 0.18);
  const strata2 = new THREE.Mesh(strata2Geo, flatMat(0x6e5f50));
  strata2.position.y = -3.4;
  strata2.castShadow = true;
  group.add(strata2);

  const strata3Geo = deformRadial(new THREE.ConeGeometry(radius * 0.36, 2.6, 12), seed + 3, 0.2);
  strata3Geo.rotateX(Math.PI);
  const strata3 = new THREE.Mesh(strata3Geo, flatMat(0x52453a));
  strata3.position.y = -5.7;
  strata3.castShadow = true;
  group.add(strata3);

  // Detached floating rock fragments under the island
  const floatRocks = [];
  for (let r = 0; r < 4; r++) {
    const ang = (r / 4) * Math.PI * 2 + seed * 0.7;
    const dist = radius * (0.55 + (r % 2) * 0.3);
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.35 + (r % 2) * 0.18, 0),
      flatMat(0x6e5f50)
    );
    const baseY = -3.2 - r * 0.9;
    rock.position.set(Math.cos(ang) * dist, baseY, Math.sin(ang) * dist);
    group.add(rock);
    floatRocks.push({ mesh: rock, baseY, phase: r * 1.4 + seed });
  }

  return { group, foamMesh, floatRocks };
}

export function buildIslandDetails(radius, seed, islandIndex, hasWaterfall = false) {
  const group = new THREE.Group();
  const nightWindows = [];
  const animatedParts = [];

  // Stone footpath from bridge entry toward landmark center
  for (let s = 0; s < 6; s++) {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.38, 0.08, 7),
      flatMat(0xb8b2a6)
    );
    const t = s / 5;
    stone.position.set((s % 2 === 0 ? 0.18 : -0.18), 0.36, -radius * 0.72 * (1 - t * 0.7));
    stone.receiveShadow = true;
    group.add(stone);
  }

  // 2 Cozy Low-Poly Cottages (with windows that glow at night)
  const houseAngles = [2.1, -2.1];
  houseAngles.forEach((ang, hIdx) => {
    const hGroup = new THREE.Group();
    const dist = radius * 0.56;
    hGroup.position.set(Math.cos(ang) * dist, 0.35, Math.sin(ang) * dist);
    hGroup.rotation.y = -ang + Math.PI / 2;

    const wallColor = hIdx === 0 ? 0xf7efe2 : 0xefe4d2;
    const roofColor = (islandIndex + hIdx) % 2 === 0 ? 0xc85a3c : 0x4b7d96;

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.45, 1.15, 1.25), flatMat(wallColor));
    body.position.y = 0.57;
    body.castShadow = true;
    body.receiveShadow = true;
    hGroup.add(body);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.22, 0.85, 4), flatMat(roofColor));
    roof.position.y = 1.55;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    hGroup.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.62, 0.06), flatMat(0x6e472b));
    door.position.set(0, 0.31, 0.63);
    hGroup.add(door);

    // Night-lit windows
    const winMat = new THREE.MeshBasicMaterial({ color: 0x3b4a54 });
    const win1 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), winMat);
    win1.position.set(0.42, 0.68, 0.64);
    hGroup.add(win1);
    const win2 = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.32), winMat);
    win2.position.set(-0.42, 0.68, 0.64);
    hGroup.add(win2);
    nightWindows.push(win1, win2);

    group.add(hGroup);
  });

  // 5 Trees (2 distinct shapes: clay spherical cluster & layered pine)
  const treeAngles = [0.65, 1.35, 2.75, -1.25, -2.75];
  treeAngles.forEach((ang, tIdx) => {
    const dist = radius * (0.62 + (tIdx % 2) * 0.14);
    const tGroup = new THREE.Group();
    tGroup.position.set(Math.cos(ang) * dist, 0.35, Math.sin(ang) * dist);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.75, 6), flatMat(0x755139));
    trunk.position.y = 0.37;
    trunk.castShadow = true;
    tGroup.add(trunk);

    if (tIdx % 2 === 0) {
      // Round clay-style tree crown
      const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.62, 1), flatMat(0x3f7d3a));
      c1.position.y = 1.05;
      c1.castShadow = true;
      tGroup.add(c1);
      const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 1), flatMat(0x589c4c));
      c2.position.set(0.28, 1.32, 0.15);
      c2.castShadow = true;
      tGroup.add(c2);
    } else {
      // Layered pine tree
      const p1 = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.95, 7), flatMat(0x2f6930));
      p1.position.y = 0.95;
      p1.castShadow = true;
      tGroup.add(p1);
      const p2 = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.82, 7), flatMat(0x3f7d3a));
      p2.position.y = 1.5;
      p2.castShadow = true;
      tGroup.add(p2);
    }
    group.add(tGroup);
  });

  // Flowerfield (🌷 花田) & Wooden Fence + Props (Bench, Crate, Signpost)
  const flowerPatch = new THREE.Group();
  const fAng = -0.65;
  flowerPatch.position.set(Math.cos(fAng) * radius * 0.54, 0.36, Math.sin(fAng) * radius * 0.54);
  const flowerColors = [0xff6b8b, 0xffd166, 0xa882dd, 0xff9f43];
  for (let fx = -2; fx <= 2; fx++) {
    for (let fz = -1; fz <= 1; fz++) {
      const stem = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.13, 0),
        flatMat(flowerColors[Math.abs(fx + fz * 2 + islandIndex) % flowerColors.length])
      );
      stem.position.set(fx * 0.28, 0.1, fz * 0.28);
      flowerPatch.add(stem);
    }
  }
  // Small fence next to flowerfield
  const fencePost1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), flatMat(0x8c6239));
  fencePost1.position.set(-0.75, 0.21, -0.5);
  const fencePost2 = fencePost1.clone();
  fencePost2.position.set(0.75, 0.21, -0.5);
  const fenceRail = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.06), flatMat(0xa67c52));
  fenceRail.position.set(0, 0.3, -0.5);
  flowerPatch.add(fencePost1, fencePost2, fenceRail);
  group.add(flowerPatch);

  // Props: Wooden Bench + Cargo Crate + Signpost + Rocks
  const bench = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.32), flatMat(0x9c6b3b));
  bench.position.set(0.95, 0.46, -radius * 0.35);
  bench.castShadow = true;
  group.add(bench);

  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), flatMat(0xc48f52));
  crate.position.set(-1.05, 0.54, -radius * 0.38);
  crate.castShadow = true;
  group.add(crate);

  // Streetlamp that lights up at night
  const lampGroup = new THREE.Group();
  lampGroup.position.set(1.15, 0.35, -radius * 0.52);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.45, 6), flatMat(0x3a474e));
  pole.position.y = 0.72;
  lampGroup.add(pole);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0x55626b });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bulbMat);
  bulb.position.y = 1.5;
  lampGroup.add(bulb);
  nightWindows.push(bulb);
  group.add(lampGroup);

  // Wooden Dock / Pier & Moored Boat on outer edge
  const pierGroup = new THREE.Group();
  const pierAng = Math.PI * 0.15;
  pierGroup.position.set(Math.cos(pierAng) * (radius * 0.94), 0.2, Math.sin(pierAng) * (radius * 0.94));
  pierGroup.rotation.y = -pierAng;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.75), flatMat(0x8c6239));
  deck.position.x = 0.65;
  pierGroup.add(deck);
  const smallBoat = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), flatMat(0xd97a36));
  smallBoat.rotation.z = Math.PI / 2;
  smallBoat.position.set(1.3, -0.25, 0.6);
  pierGroup.add(smallBoat);
  group.add(pierGroup);

  // Cascading Waterfall (💧 瀑布) from island edge into the cloud sea
  if (hasWaterfall) {
    const wfGroup = new THREE.Group();
    const wfAng = -Math.PI * 0.35;
    wfGroup.position.set(Math.cos(wfAng) * (radius * 0.92), -1.8, Math.sin(wfAng) * (radius * 0.92));
    wfGroup.rotation.y = -wfAng + Math.PI / 2;
    const wfMat = new THREE.MeshBasicMaterial({
      color: 0x7fd4ff,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    });
    const wfMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 4.4, 2, 8), wfMat);
    wfGroup.add(wfMesh);
    // Mist puffs at bottom of waterfall
    const mist = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.65, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 })
    );
    mist.position.set(0, -2.1, 0.2);
    wfGroup.add(mist);
    group.add(wfGroup);
    animatedParts.push((t) => {
      mist.scale.setScalar(0.9 + Math.sin(t * 4 + seed) * 0.18);
      wfMesh.position.y = Math.sin(t * 6 + seed) * 0.08;
    });
  }

  return { group, nightWindows, animatedParts };
}

// Build Unique Landmark + Moving Mechanism for each of the 9 islands
export function buildLandmark(islandId) {
  const group = new THREE.Group();
  const animatedParts = [];
  const nightLights = [];

  if (islandId === 'center') {
    // Grand Musculoskeletal Citadel + Fountain Plaza (⛲) + Market Stalls
    const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 1.2, 8), flatMat(0xe8dfd1));
    base.position.y = 0.6;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.9, 2.8, 8), flatMat(0xf5efe6));
    tower.position.y = 2.4;
    tower.castShadow = true;
    group.add(tower);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.55, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2), flatMat(0x3f7d3a));
    dome.position.y = 3.8;
    dome.castShadow = true;
    group.add(dome);

    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.1, 8, 24), flatMat(0xe3a33b));
    haloRing.position.y = 4.4;
    haloRing.rotation.x = Math.PI / 3;
    group.add(haloRing);

    // Fountain Plaza (⛲ 噴泉廣場) in front of Citadel
    const ftnGroup = new THREE.Group();
    ftnGroup.position.set(0, 0.35, 4.1);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.42, 14), flatMat(0xd6cfc2));
    basin.position.y = 0.21;
    ftnGroup.add(basin);
    const waterPool = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.36, 14), flatMat(0x52b6e8));
    waterPool.position.y = 0.25;
    ftnGroup.add(waterPool);
    const spoutPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 1.1, 8), flatMat(0xe8dfd1));
    spoutPillar.position.y = 0.55;
    ftnGroup.add(spoutPillar);

    const drops = [];
    for (let d = 0; d < 8; d++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), new THREE.MeshBasicMaterial({ color: 0x9ce2ff }));
      ftnGroup.add(drop);
      drops.push({ mesh: drop, ang: (d / 8) * Math.PI * 2, offset: d * 0.12 });
    }
    group.add(ftnGroup);

    // Market Stalls with glowing night bulbs
    const stallGroup = new THREE.Group();
    stallGroup.position.set(-3.8, 0.35, 2.2);
    stallGroup.rotation.y = 0.5;
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.65, 0.9), flatMat(0x9c6b3b));
    counter.position.y = 0.32;
    stallGroup.add(counter);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.35, 0.7, 4), flatMat(0xe3a33b));
    canopy.position.y = 1.6;
    canopy.rotation.y = Math.PI / 4;
    stallGroup.add(canopy);
    const stallBulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0x55626b }));
    stallBulb.position.set(0, 1.25, 0.4);
    stallGroup.add(stallBulb);
    nightLights.push(stallBulb);
    group.add(stallGroup);

    animatedParts.push((t) => {
      haloRing.rotation.z = t * 0.8;
      haloRing.rotation.y = t * 0.5;
      drops.forEach((d) => {
        const p = (t * 1.4 + d.offset) % 1;
        const r = p * 1.05;
        const y = 1.1 + Math.sin(p * Math.PI) * 0.85 - p * 0.6;
        d.mesh.position.set(Math.cos(d.ang) * r, y, Math.sin(d.ang) * r);
      });
    });
  } else if (islandId === 'island-01') {
    // 1. Head and Neck: Cranial Observatory Dome & Rotating Windmill (🌬️)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.6, 1.3, 10), flatMat(0xe8dfd1));
    base.position.y = 0.65;
    base.castShadow = true;
    group.add(base);
    const skullDome = new THREE.Mesh(new THREE.DodecahedronGeometry(1.35, 1), flatMat(0xf5efe6));
    skullDome.position.y = 1.95;
    skullDome.castShadow = true;
    group.add(skullDome);
    // Hyoid Golden Arch
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.14, 8, 18, Math.PI), flatMat(0xe3a33b));
    arch.position.set(0, 1.2, 0.9);
    group.add(arch);
    // Rotating Windmill Sails (🌬️ 風車)
    const hub = new THREE.Group();
    hub.position.set(0, 2.3, 1.38);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.45, 0.06), flatMat(0xe3a33b));
      blade.position.y = 0.72;
      const arm = new THREE.Group();
      arm.rotation.z = (b * Math.PI) / 2;
      arm.add(blade);
      hub.add(arm);
    }
    group.add(hub);
    animatedParts.push((t) => { hub.rotation.z = t * 1.4; });
  } else if (islandId === 'island-02') {
    // 2. Shoulder: Scapular Windmill Bastion & 4-Pillar SITS Sanctum
    const templeBase = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 2.5), flatMat(0xd9cfc1));
    templeBase.position.y = 0.25;
    group.add(templeBase);
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.8, 8), flatMat(0xf2ece1));
      p.position.set(i < 2 ? -0.85 : 0.85, 1.35, i % 2 === 0 ? -0.85 : 0.85);
      p.castShadow = true;
      group.add(p);
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.15, 2.4, 8), flatMat(0x3f7d3a));
    tower.position.y = 1.65;
    tower.castShadow = true;
    group.add(tower);
    // SITS 4-blade Windmill
    const rotor = new THREE.Group();
    rotor.position.set(0, 2.45, 1.05);
    for (let b = 0; b < 4; b++) {
      const sail = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.5, 0.08), flatMat(0xf09336));
      sail.position.y = 0.75;
      const pivot = new THREE.Group();
      pivot.rotation.z = (b * Math.PI) / 2;
      pivot.add(sail);
      rotor.add(pivot);
    }
    group.add(rotor);
    animatedParts.push((t) => { rotor.rotation.z = -t * 1.6; });
  } else if (islandId === 'island-03') {
    // 3. Elbow: Trochlear Hinge Waterwheel & Radioulnar Pivot Gear
    const mill = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.9, 1.6), flatMat(0xd99b66));
    mill.position.y = 0.95;
    mill.castShadow = true;
    group.add(mill);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.1, 4), flatMat(0x3f7d3a));
    roof.position.y = 2.45;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    const wheel = new THREE.Group();
    wheel.position.set(1.18, 1.1, 0);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.12, 8, 16), flatMat(0x6e472b));
    rim.rotation.y = Math.PI / 2;
    wheel.add(rim);
    for (let s = 0; s < 8; s++) {
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.35, 0.32), flatMat(0xe3a33b));
      const a = (s / 8) * Math.PI * 2;
      paddle.position.set(0, Math.cos(a) * 0.95, Math.sin(a) * 0.95);
      wheel.add(paddle);
    }
    group.add(wheel);
    animatedParts.push((t) => { wheel.rotation.x = t * 1.8; });
  } else if (islandId === 'island-04') {
    // 4. Wrist and Hands: Carpal Tunnel Archway & 5-Digit Tendon Loom
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.28, 8, 18, Math.PI), flatMat(0x528a9e));
    arch.position.y = 0.3;
    arch.castShadow = true;
    group.add(arch);

    const loomFrame = new THREE.Group();
    loomFrame.position.y = 1.9;
    const digits = [];
    for (let d = 0; d < 5; d++) {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.25 + (2 - Math.abs(d - 2)) * 0.22, 6), flatMat(0xe3a33b));
      rod.position.set((d - 2) * 0.42, 0.5, 0);
      loomFrame.add(rod);
      digits.push(rod);
    }
    group.add(loomFrame);
    animatedParts.push((t) => {
      digits.forEach((rod, idx) => {
        rod.rotation.x = Math.sin(t * 2.5 + idx * 0.6) * 0.35;
      });
    });
  } else if (islandId === 'island-05') {
    // 5. Trunk: Segmented Vertebral Spire & Breathing Diaphragm Dome
    const segments = [];
    for (let v = 0; v < 6; v++) {
      const vert = new THREE.Mesh(new THREE.CylinderGeometry(0.75 - v * 0.06, 0.82 - v * 0.06, 0.42, 8), flatMat(v % 2 === 0 ? 0xf2ece1 : 0x3f7d3a));
      vert.position.y = 0.5 + v * 0.52;
      vert.castShadow = true;
      group.add(vert);
      segments.push(vert);
    }
    const diaphragmDome = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
      flatMat(0xd96b52, { transparent: true, opacity: 0.85 })
    );
    diaphragmDome.position.y = 0.6;
    group.add(diaphragmDome);
    animatedParts.push((t) => {
      diaphragmDome.position.y = 0.65 + Math.sin(t * 2.0) * 0.22;
      diaphragmDome.scale.set(1 + Math.sin(t * 2.0) * 0.08, 1 - Math.sin(t * 2.0) * 0.08, 1 + Math.sin(t * 2.0) * 0.08);
    });
  } else if (islandId === 'island-06') {
    // 6. Hip: Acetabular Fortress & Pelvic Balance Scale Gate
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.3, 1.3, 12), flatMat(0xc9b89c));
    socket.position.y = 0.65;
    socket.castShadow = true;
    group.add(socket);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 2.4, 8), flatMat(0x5a4c3e));
    pillar.position.y = 1.6;
    group.add(pillar);

    const beamGroup = new THREE.Group();
    beamGroup.position.y = 2.75;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.18, 0.22), flatMat(0xe3a33b));
    const panL = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.25, 0.25, 8), flatMat(0x3f7d3a));
    panL.position.set(-1.3, -0.35, 0);
    const panR = panL.clone();
    panR.position.set(1.3, -0.35, 0);
    beamGroup.add(beam, panL, panR);
    group.add(beamGroup);
    animatedParts.push((t) => {
      beamGroup.rotation.z = Math.sin(t * 1.8) * 0.18;
    });
  } else if (islandId === 'island-07') {
    // 7. Knee: Patellar Pulley Tower & Popliteal Key
    const towerL = new THREE.Mesh(new THREE.BoxGeometry(0.75, 2.7, 0.75), flatMat(0xe6dccb));
    towerL.position.set(-0.85, 1.35, 0);
    towerL.castShadow = true;
    const towerR = towerL.clone();
    towerR.position.set(0.85, 1.35, 0);
    group.add(towerL, towerR);

    const pulley = new THREE.Group();
    pulley.position.set(0, 2.25, 0);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.35, 12), flatMat(0xe3a33b));
    wheel.rotation.z = Math.PI / 2;
    const patellaShield = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), flatMat(0x3f7d3a));
    patellaShield.position.z = 0.65;
    pulley.add(wheel, patellaShield);
    group.add(pulley);
    animatedParts.push((t) => {
      wheel.rotation.x = t * 2.0;
      patellaShield.position.y = Math.sin(t * 2.2) * 0.32;
    });
  } else if (islandId === 'island-08') {
    // 8. Ankle and Foot: Plantar Arch Viaduct & Calcaneal Lighthouse
    for (let a = -1; a <= 1; a++) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.16, 8, 14, Math.PI), flatMat(0xd9cfc1));
      arch.position.set(a * 1.25, 0.25, 0.85);
      group.add(arch);
    }
    const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.95, 3.1, 10), flatMat(0xf5efe6));
    lighthouse.position.y = 1.55;
    lighthouse.castShadow = true;
    group.add(lighthouse);

    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 0.75, 10), flatMat(0xd9534f));
    stripe.position.y = 1.65;
    group.add(stripe);

    const lanternTop = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.55, 10), new THREE.MeshBasicMaterial({ color: 0xffeba1 }));
    lanternTop.position.y = 3.3;
    group.add(lanternTop);
    nightLights.push(lanternTop);

    const beamPivot = new THREE.Group();
    beamPivot.position.y = 3.3;
    const beamCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.65, 2.8, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffe484, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
    );
    beamCone.rotation.x = Math.PI / 2;
    beamCone.position.z = 1.4;
    beamPivot.add(beamCone);
    group.add(beamPivot);
    animatedParts.push((t) => {
      beamPivot.rotation.y = t * 1.5;
    });
  }

  return { group, animatedParts, nightLights };
}

// Build Suspension Bridge with Catenary Curve & Bunting Flags (🎏 彩旗串)
export function buildSuspensionBridge(startVec, endVec) {
  const group = new THREE.Group();
  const dir = new THREE.Vector3().subVectors(endVec, startVec);
  const dist = dir.length();
  const steps = Math.max(8, Math.floor(dist / 1.1));
  const flagColors = [0xe3a33b, 0x3f7d3a, 0xd9534f, 0x4599d1];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = new THREE.Vector3().lerpVectors(startVec, endVec, t);
    const sag = -Math.sin(t * Math.PI) * 0.42;
    p.y += sag;

    const plank = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.52), flatMat(0x8c6239));
    plank.position.copy(p);
    plank.lookAt(endVec.x, p.y, endVec.z);
    plank.rotateY(Math.PI / 2);
    plank.receiveShadow = true;
    group.add(plank);

    if (i % 2 === 0 && i < steps) {
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.65, 5), flatMat(0x6e472b));
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(0.54);
      postL.position.copy(p).add(perp);
      postL.position.y += 0.32;
      const postR = postL.clone();
      postR.position.copy(p).sub(perp);
      postR.position.y += 0.32;
      group.add(postL, postR);

      // Colorful Bunting Flag (🎏 彩旗串)
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.26, 3), flatMat(flagColors[i % flagColors.length]));
      flag.rotation.x = Math.PI;
      flag.position.copy(p).add(perp);
      flag.position.y += 0.48;
      group.add(flag);
    }
  }
  return group;
}

// Build Articulated Chibi Character (Adventurer, Gatekeeper NPC, Wilson, Resident, Courier, Merchant)
export function buildCharacterMesh(opts = {}) {
  const {
    shirtColor = 0x3f7d3a,
    hatColor = 0xe3a33b,
    skinColor = 0xffdfc4,
    pantsColor = 0x2c3e50,
    style = 0,
    hasCrate = false,
    isGatekeeper = false,
    isWilson = false
  } = opts;

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Legs
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.16), flatMat(pantsColor));
  legL.position.set(-0.11, 0.18, 0);
  const legR = legL.clone();
  legR.position.set(0.11, 0.18, 0);
  bodyGroup.add(legL, legR);

  // Torso
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.26, 0.52, 8),
    flatMat(isWilson ? 0xf07e26 : shirtColor)
  );
  torso.position.y = 0.58;
  torso.castShadow = true;
  bodyGroup.add(torso);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 10), flatMat(skinColor));
  head.position.y = 1.05;
  head.castShadow = true;
  bodyGroup.add(head);

  // Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1d2b36 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), eyeMat);
  eyeL.position.set(-0.08, 1.07, 0.21);
  const eyeR = eyeL.clone();
  eyeR.position.set(0.08, 1.07, 0.21);
  bodyGroup.add(eyeL, eyeR);

  // Hat or Hair
  if (isWilson) {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), flatMat(0x2c221e));
    hair.position.y = 1.08;
    bodyGroup.add(hair);
  } else if (isGatekeeper) {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.42, 6), flatMat(0xe3a33b));
    crown.position.y = 1.36;
    bodyGroup.add(crown);
  } else if (style === 1) {
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.5, 0.08), flatMat(hatColor));
    cape.position.set(0, 0.58, -0.22);
    bodyGroup.add(cape);
  } else {
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 8), flatMat(hatColor));
    cap.position.y = 1.3;
    bodyGroup.add(cap);
  }

  // Arms
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.4, 0.13), flatMat(shirtColor));
  armL.position.set(-0.31, 0.62, 0);
  const armR = armL.clone();
  armR.position.set(0.31, 0.62, 0);
  bodyGroup.add(armL, armR);

  // Cargo Crate for Couriers
  let crateMesh = null;
  if (hasCrate) {
    crateMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.32, 0.36), flatMat(0xd4944e));
    crateMesh.position.set(0, 0.68, 0.34);
    bodyGroup.add(crateMesh);
  }

  root.userData.parts = { legL, legR, armL, armR, head, bodyGroup, crateMesh };
  return root;
}

// Build All 9 Low-Poly Animals + Sea-Turtle Shuttle Guide
export function buildAnimalMesh(typeId) {
  const g = new THREE.Group();
  if (typeId === 'squirrel') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), flatMat(0xb86532));
    body.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), flatMat(0xb86532));
    head.position.set(0, 0.34, 0.16);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), flatMat(0x9e5022));
    tail.scale.set(0.7, 1.5, 0.9);
    tail.position.set(0, 0.35, -0.22);
    g.add(body, head, tail);
  } else if (typeId === 'rabbit') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), flatMat(0xf7f4ef));
    body.position.y = 0.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), flatMat(0xf7f4ef));
    head.position.set(0, 0.34, 0.15);
    const earL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.06), flatMat(0xffb8c6));
    earL.position.set(-0.06, 0.52, 0.14);
    const earR = earL.clone();
    earR.position.x = 0.06;
    g.add(body, head, earL, earR);
  } else if (typeId === 'duck') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), flatMat(0xffd84d));
    body.scale.set(0.9, 0.85, 1.25);
    body.position.y = 0.18;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), flatMat(0xffd84d));
    head.position.set(0, 0.34, 0.16);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.15, 5), flatMat(0xf07e26));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.33, 0.29);
    g.add(body, head, beak);
  } else if (typeId === 'butterfly') {
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.18), flatMat(0xff80b5));
    wingL.position.x = -0.11;
    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.18), flatMat(0xff80b5));
    wingR.position.x = 0.11;
    g.add(wingL, wingR);
    g.userData.wings = { wingL, wingR };
  } else if (typeId === 'penguin') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.42, 8), flatMat(0x222c38));
    body.position.y = 0.21;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), flatMat(0xffffff));
    belly.position.set(0, 0.2, 0.07);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 5), flatMat(0xf09336));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.34, 0.2);
    g.add(body, belly, beak);
  } else if (typeId === 'cat') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.38), flatMat(0xf09c42));
    body.position.y = 0.18;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), flatMat(0xf09c42));
    head.position.set(0, 0.34, 0.18);
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), flatMat(0xd47a22));
    earL.position.set(-0.08, 0.49, 0.18);
    const earR = earL.clone();
    earR.position.x = 0.08;
    g.add(body, head, earL, earR);
  } else if (typeId === 'dolphin') {
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.35, 8), flatMat(0x4ba3d9));
    body.rotation.x = Math.PI / 2;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 4), flatMat(0x3684b5));
    fin.position.set(0, 0.28, -0.1);
    g.add(body, fin);
  } else if (typeId === 'whale') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), flatMat(0x2c5678));
    body.scale.set(1.0, 0.72, 1.85);
    const spout = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 6),
      new THREE.MeshBasicMaterial({ color: 0xbbe8ff, transparent: true, opacity: 0.7 })
    );
    spout.rotation.x = Math.PI;
    spout.position.set(0, 0.85, 0.25);
    g.add(body, spout);
    g.userData.spout = spout;
  } else if (typeId === 'seagull') {
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.14), flatMat(0xffffff));
    wingL.position.x = -0.16;
    const wingR = wingL.clone();
    wingR.position.x = 0.16;
    g.add(wingL, wingR);
    g.userData.wings = { wingL, wingR };
  }
  return g;
}

export function buildSeaTurtleShuttle() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
    flatMat(0x3f7d3a)
  );
  shell.scale.set(1.0, 0.65, 1.28);
  g.add(shell);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.12, 0.16, 12), flatMat(0xe3a33b));
  rim.scale.set(1.0, 1.0, 1.25);
  rim.position.y = 0.05;
  g.add(rim);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), flatMat(0x6aa85e));
  head.position.set(0, 0.22, 1.55);
  g.add(head);

  const flippers = [];
  [[-1.1, 0.6], [1.1, 0.6], [-0.95, -0.7], [0.95, -0.7]].forEach(([fx, fz]) => {
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.08, 0.34), flatMat(0x6aa85e));
    fl.position.set(fx, 0.05, fz);
    g.add(fl);
    flippers.push(fl);
  });

  // 2 Tiny passengers riding on the turtle's back
  const rider1 = buildCharacterMesh({ shirtColor: 0xe3a33b, hatColor: 0x3f7d3a });
  rider1.scale.setScalar(0.62);
  rider1.position.set(-0.28, 0.55, 0.1);
  const rider2 = buildCharacterMesh({ shirtColor: 0x4599d1, hatColor: 0xd9534f });
  rider2.scale.setScalar(0.62);
  rider2.position.set(0.28, 0.55, -0.2);
  g.add(rider1, rider2);

  g.userData.flippers = flippers;
  return g;
}
