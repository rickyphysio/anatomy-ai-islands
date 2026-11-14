import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import {
  flatMat,
  buildFloatingIslandBase,
  buildIslandDetails,
  buildLandmark,
  buildSuspensionBridge,
  buildCharacterMesh,
  buildAnimalMesh,
  buildSeaTurtleShuttle
} from './models3d.js';

export class ArchipelagoWorld {
  constructor(opts) {
    this.container = opts.container;
    this.labelsLayer = opts.labelsLayer;
    this.meteorCanvas = opts.meteorCanvas;
    this.content = opts.content;
    this.onSelectIsland = opts.onSelectIsland;
    this.onSelectEntity = opts.onSelectEntity;
    this.onPickupShell = opts.onPickupShell;
    this.onOpenGuestbook = opts.onOpenGuestbook;
    this.onToast = opts.onToast;
    this.onTourInteracted = opts.onTourInteracted;

    this.webglSupported = true;
    this.reducedMotion = false;
    this.lowQuality = window.innerWidth <= 768;
    this.timeMode = 'day'; // 'day' | 'dusk' | 'night'
    this.walkMode = false;
    this.cinemaActive = false;

    this.islandNodes = new Map();
    this.clickableMeshes = [];
    this.animatedCallbacks = [];
    this.nightWindowMeshes = [];
    this.floatRockItems = [];
    this.residents3D = [];
    this.animals3D = [];
    this.shells3D = [];
    this.clouds3D = [];
    this.birdFlocks = [];
    this.boats3D = [];
    this.lanterns3D = [];
    this.pointLights = [];

    this.adventurer = null;
    this.adventurerIslandId = 'center';
    this.adventurerPath = [];
    this.adventurerTargetOnArrive = null;

    this.keysPressed = new Set();
    this.walkState = {
      pos: new THREE.Vector3(0, 1.9, 5.5),
      yaw: 0,
      pitch: 0,
      dragging: false,
      lastX: 0,
      lastY: 0,
      moveDir: { f: 0, b: 0, l: 0, r: 0 }
    };

    this.cameraTween = null;
    this.cinemaSkipHandler = null;
    this.meteors = [];
    this.nextSingleMeteorAt = 4;
    this.nextShowerAt = 32;

    this.fpsFrames = 0;
    this.fpsLastCheck = performance.now();
    this.lowFpsStreak = 0;

    this.init();
  }

  init() {
    try {
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.FogExp2(0xe4efe0, 0.0085);

      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera = new THREE.PerspectiveCamera(45, w / h, 0.3, 320);
      this.defaultCamPos = new THREE.Vector3(0, 34, 52);
      this.defaultCamTarget = new THREE.Vector3(0, 0, 2);
      this.camera.position.copy(this.defaultCamPos);

      this.renderer = new THREE.WebGLRenderer({ antialias: !this.lowQuality, alpha: false, powerPreference: 'high-performance' });
      this.renderer.setSize(w, h);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowQuality ? 1.25 : 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.08;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = !this.lowQuality;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.container.appendChild(this.renderer.domElement);

      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.defaultCamTarget);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.07;
      this.controls.maxPolarAngle = Math.PI * 0.47;
      this.controls.minDistance = 7;
      this.controls.maxDistance = 95;
      this.controls.addEventListener('start', () => {
        if (this.onTourInteracted) this.onTourInteracted();
      });

      this.setupLightsAndSky();
      this.setupCloudSeaAndHorizon();
      this.setupArchipelago();
      this.setupLivingEntities();
      this.setupSkyLife();
      this.setupEvents();
      this.resizeMeteorCanvas();

      this.clock = new THREE.Clock();
      this.animate();
    } catch (err) {
      console.warn('WebGL fallback triggered:', err);
      this.webglSupported = false;
    }
  }

  setupLightsAndSky() {
    this.hemiLight = new THREE.HemisphereLight(0xdff2ff, 0x5c8051, 0.85);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4d6, 1.45);
    this.dirLight.position.set(28, 44, 24);
    this.dirLight.castShadow = !this.lowQuality;
    const mapSize = window.innerWidth <= 768 ? 1024 : 2048;
    this.dirLight.shadow.mapSize.set(mapSize, mapSize);
    this.dirLight.shadow.camera.near = 5;
    this.dirLight.shadow.camera.far = 120;
    const d = 44;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.scene.add(this.dirLight);

    // Night Central Plaza PointLights (Max 4 PointLights per spec)
    const lightCoords = [[0, 3.8, 3.5], [-16, 3.2, 0], [16, 3.2, 0], [0, 3.2, -16]];
    lightCoords.forEach(([lx, ly, lz]) => {
      const pl = new THREE.PointLight(0xffb84d, 0, 14, 1.5);
      pl.position.set(lx, ly, lz);
      this.scene.add(pl);
      this.pointLights.push(pl);
    });

    // Sky Dome with Vertex Color Gradient
    const skyGeo = new THREE.SphereGeometry(150, 24, 16);
    const count = skyGeo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);

    this.skyCurrentTop = new THREE.Color(0x7cc0eb);
    this.skyCurrentBottom = new THREE.Color(0xeef3e6);
    this.skyTargetTop = new THREE.Color(0x7cc0eb);
    this.skyTargetBottom = new THREE.Color(0xeef3e6);
    this.updateSkyDomeColors();

    // Sun & Moon Discs with Halos
    this.celestialGroup = new THREE.Group();
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(4.2, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffe484, fog: false }));
    this.sunHalo = new THREE.Mesh(
      new THREE.SphereGeometry(6.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffeba1, transparent: true, opacity: 0.32, fog: false })
    );
    this.sunMesh.add(this.sunHalo);
    this.sunMesh.position.set(45, 58, -65);

    this.moonMesh = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 16), new THREE.MeshBasicMaterial({ color: 0xf4f8ff, fog: false }));
    this.moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(5.4, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x9ec5ff, transparent: true, opacity: 0.28, fog: false })
    );
    this.moonMesh.add(this.moonHalo);
    this.moonMesh.position.set(-45, 56, -65);
    this.moonMesh.visible = false;

    this.celestialGroup.add(this.sunMesh, this.moonMesh);
    this.scene.add(this.celestialGroup);

    // Night Stars + Fireflies
    const starPositions = new Float32Array(360 * 3);
    for (let i = 0; i < 360; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.44;
      const r = 128;
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi) + 12;
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starsPoints = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0, fog: false })
    );
    this.scene.add(this.starsPoints);

    // Fireflies (螢火蟲) on islands at night
    const ffPositions = new Float32Array(70 * 3);
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const rad = Math.random() * 26;
      ffPositions[i * 3] = Math.cos(a) * rad;
      ffPositions[i * 3 + 1] = 1.0 + Math.random() * 2.6;
      ffPositions[i * 3 + 2] = Math.sin(a) * rad;
    }
    const ffGeo = new THREE.BufferGeometry();
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPositions, 3));
    this.firefliesPoints = new THREE.Points(
      ffGeo,
      new THREE.PointsMaterial({ color: 0xffe866, size: 0.55, transparent: true, opacity: 0 })
    );
    this.scene.add(this.firefliesPoints);
  }

  updateSkyDomeColors() {
    const pos = this.skyDome.geometry.attributes.position;
    const col = this.skyDome.geometry.attributes.color;
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = THREE.MathUtils.clamp((y + 20) / 140, 0, 1);
      tmp.copy(this.skyCurrentBottom).lerp(this.skyCurrentTop, t);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
  }

  setupCloudSeaAndHorizon() {
    // Undulating Cloud Sea Plane (浮空群島下方流動雲海)
    const segs = this.lowQuality ? 28 : 48;
    this.cloudSeaGeo = new THREE.PlaneGeometry(240, 240, segs, segs);
    this.cloudSeaGeo.rotateX(-Math.PI / 2);
    const pos = this.cloudSeaGeo.attributes.position;
    this.cloudSeaBaseY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this.cloudSeaBaseY[i] = (Math.random() - 0.5) * 0.6;
    }
    this.cloudSeaMat = new THREE.MeshStandardMaterial({
      color: 0xe6f2ec,
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
      transparent: true,
      opacity: 0.94
    });
    this.cloudSeaMesh = new THREE.Mesh(this.cloudSeaGeo, this.cloudSeaMat);
    this.cloudSeaMesh.position.y = -3.8;
    this.cloudSeaMesh.receiveShadow = true;
    this.scene.add(this.cloudSeaMesh);

    // Volumetric low-poly cloud puffs resting on the cloud sea
    const seaPuffGroup = new THREE.Group();
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + (i % 3) * 0.2;
      const dist = 32 + (i % 4) * 11;
      const puff = new THREE.Mesh(
        new THREE.DodecahedronGeometry(3.2 + (i % 3) * 1.4, 1),
        flatMat(0xf4f9f5)
      );
      puff.scale.set(1.6, 0.45, 1.3);
      puff.position.set(Math.cos(a) * dist, -3.5, Math.sin(a) * dist);
      seaPuffGroup.add(puff);
    }
    this.scene.add(seaPuffGroup);

    // Outer Horizon Silhouette Mountains (遠景外海一圈遠山剪影)
    const horizonGroup = new THREE.Group();
    for (let m = 0; m < 24; m++) {
      const ang = (m / 24) * Math.PI * 2;
      const dist = 96 + (m % 2) * 8;
      const h = 12 + (m % 4) * 4.5;
      const w = 11 + (m % 3) * 3.5;
      const mt = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), flatMat(0x5a7d66));
      mt.position.set(Math.cos(ang) * dist, h * 0.35 - 4, Math.sin(ang) * dist);
      horizonGroup.add(mt);
    }
    this.scene.add(horizonGroup);
  }

  setupArchipelago() {
    this.archipelagoGroup = new THREE.Group();
    this.scene.add(this.archipelagoGroup);

    // 1. Center Island: Ricky's anatomy learning island (Grand Musculoskeletal Citadel)
    const centerRadius = 7.4;
    const centerBase = buildFloatingIslandBase(centerRadius, 0, true);
    const centerDetails = buildIslandDetails(centerRadius, 0, 0, false);
    const centerLandmark = buildLandmark('center');

    const centerRoot = new THREE.Group();
    centerRoot.position.set(0, 0, 0);
    centerRoot.add(centerBase.group, centerDetails.group, centerLandmark.group);
    this.archipelagoGroup.add(centerRoot);

    centerBase.group.traverse((c) => {
      if (c.isMesh) {
        c.userData.islandId = 'center';
        this.clickableMeshes.push(c);
      }
    });
    centerLandmark.group.traverse((c) => {
      if (c.isMesh) {
        c.userData.islandId = 'center';
        this.clickableMeshes.push(c);
      }
    });

    this.nightWindowMeshes.push(...centerDetails.nightWindows, ...centerLandmark.nightLights);
    this.animatedCallbacks.push(...centerDetails.animatedParts, ...centerLandmark.animatedParts);
    this.floatRockItems.push(...centerBase.floatRocks);

    // Daily Treasure Chest on Center Island (每日鑰匙開寶箱)
    const chestGroup = new THREE.Group();
    chestGroup.position.set(3.4, 0.38, 2.8);
    chestGroup.rotation.y = -0.6;
    const chestBox = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.6), flatMat(0xb86528));
    chestBox.position.y = 0.28;
    const chestLid = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 8, 1, false, 0, Math.PI), flatMat(0xe3a33b));
    chestLid.rotation.z = Math.PI / 2;
    chestLid.position.y = 0.55;
    chestGroup.add(chestBox, chestLid);
    chestGroup.traverse((c) => {
      if (c.isMesh) {
        c.userData.entityType = 'chest';
        this.clickableMeshes.push(c);
      }
    });
    centerRoot.add(chestGroup);

    // Wishing Lantern Pavilion area on Center Island (許願燈籠區)
    this.lanternPlazaGroup = new THREE.Group();
    this.lanternPlazaGroup.position.set(3.8, 0.4, -2.5);
    centerRoot.add(this.lanternPlazaGroup);
    this.rebuildGuestbookLanterns([]);

    this.islandNodes.set('center', {
      id: 'center',
      name: this.content.centerIsland.name,
      order: 0,
      root: centerRoot,
      pos: new THREE.Vector3(0, 0, 0),
      radius: centerRadius,
      labelEl: this.createIslandLabel('center', '👑 ' + this.content.centerIsland.name, 'Final Boss Citadel')
    });

    // 2. 8 Regional Islands arranged in an octagon ring around the Center Island
    const ringDistance = 21.5;
    this.content.islands.forEach((isl, idx) => {
      const angle = (idx / 8) * Math.PI * 2 - Math.PI / 2;
      const ix = Math.cos(angle) * ringDistance;
      const iz = Math.sin(angle) * ringDistance;
      const radius = 5.2;
      const seed = (idx + 1) * 2.3;

      const islRoot = new THREE.Group();
      islRoot.position.set(ix, 0, iz);
      // Orient island so its front footpath faces the Center Island
      const faceCenterAngle = Math.atan2(-ix, -iz);
      islRoot.rotation.y = faceCenterAngle;

      const base = buildFloatingIslandBase(radius, seed, false);
      const hasWaterfall = [1, 4, 7].includes(idx); // Waterfalls on Shoulder, Trunk, Ankle & Foot
      const details = buildIslandDetails(radius, seed, idx + 1, hasWaterfall);
      const landmark = buildLandmark(isl.id);

      islRoot.add(base.group, details.group, landmark.group);
      this.archipelagoGroup.add(islRoot);

      base.group.traverse((c) => {
        if (c.isMesh) {
          c.userData.islandId = isl.id;
          this.clickableMeshes.push(c);
        }
      });
      landmark.group.traverse((c) => {
        if (c.isMesh) {
          c.userData.islandId = isl.id;
          this.clickableMeshes.push(c);
        }
      });

      this.nightWindowMeshes.push(...details.nightWindows, ...landmark.nightLights);
      this.animatedCallbacks.push(...details.animatedParts, ...landmark.animatedParts);
      this.floatRockItems.push(...base.floatRocks);

      // Suspension Bridge connecting Center Island edge to this Regional Island edge
      const dirVec = new THREE.Vector3(ix, 0, iz).normalize();
      const bridgeStart = dirVec.clone().multiplyScalar(centerRadius * 0.9);
      bridgeStart.y = 0.32;
      const bridgeEnd = new THREE.Vector3(ix, 0.32, iz).sub(dirVec.clone().multiplyScalar(radius * 0.9));
      const bridgeMesh = buildSuspensionBridge(bridgeStart, bridgeEnd);
      this.archipelagoGroup.add(bridgeMesh);

      // Clickable Calcium Shell (🐚 貝殼) on each island's shore (picks up +1, respawns in 20s)
      const shellGroup = new THREE.Group();
      const shAng = angle + 0.45;
      shellGroup.position.set(ix + Math.cos(shAng) * (radius * 0.78), 0.44, iz + Math.sin(shAng) * (radius * 0.78));
      const shellMesh = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 7), flatMat(0xffd6e0));
      shellMesh.rotation.x = Math.PI * 0.35;
      shellGroup.add(shellMesh);
      shellMesh.userData.entityType = 'shell';
      shellMesh.userData.shellIndex = idx;
      shellMesh.userData.islandId = isl.id;
      this.clickableMeshes.push(shellMesh);
      this.archipelagoGroup.add(shellGroup);
      this.shells3D.push({ group: shellGroup, mesh: shellMesh, active: true, respawnAt: 0, islandId: isl.id });

      this.islandNodes.set(isl.id, {
        id: isl.id,
        name: isl.name,
        order: isl.order,
        root: islRoot,
        pos: new THREE.Vector3(ix, 0, iz),
        bridgeStart,
        bridgeEnd,
        radius,
        labelEl: this.createIslandLabel(isl.id, `#${isl.order} ${isl.name}`, `${isl.muscleCount} Muscles`)
      });
    });
  }

  createIslandLabel(islandId, titleText, badgeText) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'island-label';
    btn.dataset.islandId = islandId;
    const tSpan = document.createElement('span');
    tSpan.className = 'il-title';
    tSpan.textContent = titleText;
    const bSpan = document.createElement('span');
    bSpan.className = 'il-badge';
    bSpan.textContent = badgeText;
    btn.append(tSpan, bSpan);
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (this.onSelectIsland) this.onSelectIsland(islandId, 'label');
    });
    this.labelsLayer.appendChild(btn);
    return btn;
  }

  updateIslandLabelBadge(islandId, badgeText, cleared = false) {
    const node = this.islandNodes.get(islandId);
    if (!node || !node.labelEl) return;
    const b = node.labelEl.querySelector('.il-badge');
    if (b) b.textContent = badgeText;
    node.labelEl.classList.toggle('is-cleared', !!cleared);
  }

  setupLivingEntities() {
    // 1. Mentor Wilson on Central Island
    const wilsonNode = this.islandNodes.get('center');
    const wilsonMesh = buildCharacterMesh({ isWilson: true, shirtColor: 0xf07e26 });
    wilsonMesh.position.set(1.8, 0.35, 3.2);
    wilsonNode.root.add(wilsonMesh);
    this.registerClickableEntity(wilsonMesh, {
      entityType: 'gatekeeper',
      islandId: 'center',
      npc: this.content.centerIsland.npc
    });
    this.residents3D.push({
      id: 'npc-wilson',
      mesh: wilsonMesh,
      worldPos: new THREE.Vector3(1.8, 0.35, 3.2),
      islandId: 'center',
      roleType: 'gatekeeper',
      state: 'idle',
      timer: 2
    });

    // 2. 8 Regional Gatekeepers (standing near each island's landmark)
    const gkColors = [0x2e7d32, 0x1565c0, 0xad1457, 0x6a1b9a, 0x00838f, 0xef6c00, 0x4527a0, 0x283593];
    this.content.islands.forEach((isl, idx) => {
      const node = this.islandNodes.get(isl.id);
      const gkMesh = buildCharacterMesh({
        isGatekeeper: true,
        shirtColor: gkColors[idx % gkColors.length]
      });
      // Place in world coordinates near the island center
      const worldPos = node.pos.clone().add(new THREE.Vector3(1.55, 0.35, 1.45));
      gkMesh.position.copy(worldPos);
      this.archipelagoGroup.add(gkMesh);
      this.registerClickableEntity(gkMesh, {
        entityType: 'gatekeeper',
        islandId: isl.id,
        npc: isl.npc
      });
      this.residents3D.push({
        id: isl.npc.id,
        mesh: gkMesh,
        worldPos,
        islandId: isl.id,
        roleType: 'gatekeeper',
        state: 'idle',
        timer: 1.5
      });
    });

    // 3. 23 Living World Residents, Couriers & Merchant (from content.residents)
    const paletteShirts = [0xd9534f, 0x4599d1, 0xe3a33b, 0x6aa84f, 0x8e63ce, 0xe07a5f];
    this.content.residents.forEach((res, rIdx) => {
      const node = this.islandNodes.get(res.islandId) || this.islandNodes.get('center');
      const isCourier = res.type === 'courier';
      const isMerchant = res.type === 'merchant';
      const mesh = buildCharacterMesh({
        shirtColor: paletteShirts[rIdx % paletteShirts.length],
        hatColor: paletteShirts[(rIdx + 2) % paletteShirts.length],
        hasCrate: isCourier
      });

      let startPos;
      if (isMerchant) {
        startPos = new THREE.Vector3(-3.3, 0.35, 2.7);
      } else if (isCourier) {
        startPos = new THREE.Vector3(0, 0.35, 0).lerp(node.pos, 0.35);
      } else {
        const ang = (rIdx * 1.9) % (Math.PI * 2);
        const rad = node.radius * 0.45;
        startPos = node.pos.clone().add(new THREE.Vector3(Math.cos(ang) * rad, 0.35, Math.sin(ang) * rad));
      }
      mesh.position.copy(startPos);
      this.archipelagoGroup.add(mesh);

      this.registerClickableEntity(mesh, {
        entityType: 'resident',
        islandId: res.islandId,
        resident: res
      });

      this.residents3D.push({
        id: res.id,
        data: res,
        mesh,
        islandNode: node,
        islandId: res.islandId,
        roleType: res.type,
        state: isMerchant ? 'merchant' : isCourier ? 'outbound' : 'walk',
        progress: (rIdx * 0.23) % 1,
        targetPos: startPos.clone(),
        timer: 1 + (rIdx % 3),
        talking: false,
        hideOnLowQuality: rIdx % 2 === 1 && !isMerchant
      });
    });

    // 4. All 9 Animal Species distributed across the islands & cloud sea
    const animalAssignments = [
      { id: 'squirrel', islandId: 'island-01', count: 2 },
      { id: 'rabbit', islandId: 'island-02', count: 2 },
      { id: 'duck', islandId: 'island-03', count: 2 },
      { id: 'butterfly', islandId: 'island-04', count: 2 },
      { id: 'penguin', islandId: 'island-08', count: 2 },
      { id: 'dolphin', islandId: 'island-06', count: 2 },
      { id: 'cat', islandId: 'center', count: 2 },
      { id: 'whale', islandId: 'island-08', count: 1 },
      { id: 'seagull', islandId: 'island-05', count: 2 }
    ];

    animalAssignments.forEach((assign, aIdx) => {
      const animalInfo = this.content.animals.find((a) => a.id === assign.id);
      const node = this.islandNodes.get(assign.islandId) || this.islandNodes.get('center');
      for (let c = 0; c < assign.count; c++) {
        const aMesh = buildAnimalMesh(assign.id);
        const phase = aIdx * 1.3 + c * 2.4;
        let basePos;
        if (animalInfo.where === 'sea') {
          const seaAngle = phase;
          const seaDist = 30 + c * 4;
          basePos = new THREE.Vector3(Math.cos(seaAngle) * seaDist, -3.2, Math.sin(seaAngle) * seaDist);
        } else if (animalInfo.where === 'air') {
          basePos = node.pos.clone().add(new THREE.Vector3(Math.cos(phase) * 2.4, 2.3, Math.sin(phase) * 2.4));
        } else if (animalInfo.where === 'shore') {
          const shA = phase;
          basePos = node.pos.clone().add(new THREE.Vector3(Math.cos(shA) * (node.radius * 0.76), 0.36, Math.sin(shA) * (node.radius * 0.76)));
        } else {
          basePos = node.pos.clone().add(new THREE.Vector3(Math.cos(phase) * 2.2, 0.36, Math.sin(phase) * 2.2));
        }
        aMesh.position.copy(basePos);
        this.archipelagoGroup.add(aMesh);

        this.registerClickableEntity(aMesh, {
          entityType: 'animal',
          islandId: assign.islandId,
          animal: animalInfo
        });

        this.animals3D.push({
          typeId: assign.id,
          where: animalInfo.where,
          info: animalInfo,
          mesh: aMesh,
          node,
          basePos: basePos.clone(),
          phase,
          talkingTimer: 0,
          extraInstance: c > 0
        });
      }
    });

    // 5. Sea-Turtle Shuttle Guide (🐢 海龜接駁嚮導)
    this.seaTurtleMesh = buildSeaTurtleShuttle();
    this.seaTurtleState = {
      angle: 0,
      radius: 28.5,
      stopIndex: 0,
      pauseTimer: 0,
      nextIslandName: this.content.islands[0].name
    };
    this.seaTurtleMesh.position.set(0, -3.1, -28.5);
    this.archipelagoGroup.add(this.seaTurtleMesh);
    this.registerClickableEntity(this.seaTurtleMesh, {
      entityType: 'turtle'
    });
  }

  registerClickableEntity(rootObj, userDataPayload) {
    rootObj.traverse((child) => {
      if (child.isMesh) {
        Object.assign(child.userData, userDataPayload, { rootEntity: rootObj });
        this.clickableMeshes.push(child);
      }
    });
  }

  setupSkyLife() {
    // 1. 10 Fluffy Low-Poly Clouds orbiting outside the camera cone (8~12 朵雲)
    for (let i = 0; i < 10; i++) {
      const cGroup = new THREE.Group();
      const puffs = 3 + (i % 3);
      for (let p = 0; p < puffs; p++) {
        const sphere = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.5 + (p % 2) * 0.55, 1),
          flatMat(0xffffff)
        );
        sphere.position.set((p - 1.2) * 1.35, (p % 2) * 0.35, 0);
        cGroup.add(sphere);
      }
      const angle = (i / 10) * Math.PI * 2;
      const dist = 56 + (i % 3) * 8;
      const height = 16 + (i % 4) * 3.5;
      cGroup.position.set(Math.cos(angle) * dist, height, Math.sin(angle) * dist);
      this.scene.add(cGroup);
      this.clouds3D.push({ group: cGroup, angle, dist, height, speed: 0.025 + (i % 3) * 0.008 });
    }

    // 2. 3 V-Formation Bird Flocks (2~3 群、每群 5 隻 V 字隊形)
    for (let f = 0; f < 3; f++) {
      const flockGroup = new THREE.Group();
      const birds = [];
      const offsets = [[0, 0], [-0.8, -0.7], [0.8, -0.7], [-1.6, -1.4], [1.6, -1.4]];
      offsets.forEach(([ox, oz], bIdx) => {
        const bGroup = new THREE.Group();
        bGroup.position.set(ox, 0, oz);
        const wL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.14), flatMat(0xffffff));
        wL.position.x = -0.16;
        const wR = wL.clone();
        wR.position.x = 0.16;
        bGroup.add(wL, wR);
        flockGroup.add(bGroup);
        birds.push({ wL, wR, phase: bIdx * 0.5 });
      });
      const angle = (f / 3) * Math.PI * 2;
      this.scene.add(flockGroup);
      this.birdFlocks.push({ group: flockGroup, birds, angle, dist: 25 + f * 6, height: 11 + f * 2.2 });
    }

    // 3. 2 Sky-Sailboats (帆船繞外海航行並隨浪搖擺)
    for (let s = 0; s < 2; s++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 2.6), flatMat(0x8c5327));
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 6), flatMat(0xd9cfc1));
      mast.position.y = 1.15;
      const sail = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.8, 3), flatMat(s === 0 ? 0xf5efe6 : 0xe3a33b));
      sail.position.set(0, 1.25, 0.15);
      boat.add(hull, mast, sail);
      const angle = s * Math.PI + 0.8;
      this.scene.add(boat);
      this.boats3D.push({ group: boat, angle, dist: 34.5 + s * 4, speed: 0.055 });
    }
  }

  // Create or update 3D Wishing Lanterns on Central Island (許願燈籠)
  rebuildGuestbookLanterns(entries = []) {
    while (this.lanternPlazaGroup.children.length > 0) {
      this.lanternPlazaGroup.remove(this.lanternPlazaGroup.children[0]);
    }
    this.lanterns3D = [];

    // Always place the ceremonial Central Wishing Lantern Post + up to 30 visitor lanterns
    const displayList = entries.length > 0
      ? entries.slice(0, 30)
      : [{ name: 'Light a Wish ✍️', isPlaceholder: true }];

    displayList.forEach((entry, idx) => {
      const lGroup = new THREE.Group();
      const ring = Math.floor(idx / 6);
      const ang = ((idx % 6) / 6) * Math.PI * 2;
      const rad = 0.85 + ring * 0.75;
      lGroup.position.set(Math.cos(ang) * rad, 1.35 + (idx % 3) * 0.38, Math.sin(ang) * rad);

      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.18, 0.45, 8),
        new THREE.MeshBasicMaterial({ color: 0xff9f43 })
      );
      const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 8), flatMat(0x5c3a21));
      capTop.position.y = 0.24;
      lGroup.add(body, capTop);

      // CanvasTexture name tag hanging beneath lantern (uses fillText only, never innerHTML!)
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(24, 40, 25, 0.85)';
      ctx.fillRect(8, 8, 240, 48);
      ctx.strokeStyle = '#e3a33b';
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, 240, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(entry.name || '').slice(0, 16), 128, 32);

      const tex = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      sprite.scale.set(1.35, 0.34, 1);
      sprite.position.y = -0.45;
      lGroup.add(sprite);

      body.userData.entityType = 'lantern';
      body.userData.entry = entry;
      this.clickableMeshes.push(body);

      this.lanternPlazaGroup.add(lGroup);
      this.lanterns3D.push({ group: lGroup, baseY: lGroup.position.y, phase: idx * 0.9 });
    });
  }

  // Spawn or update the player's Adventurer character on the archipelago
  setAdventurer(profile) {
    if (!profile) {
      if (this.adventurer) this.adventurer.visible = false;
      return;
    }
    if (this.adventurer) {
      this.archipelagoGroup.remove(this.adventurer);
    }
    const styleColors = [
      { shirt: 0x3f7d3a, hat: 0xe3a33b, style: 0 },
      { shirt: 0x256b9c, hat: 0xf07e26, style: 1 },
      { shirt: 0xa83c48, hat: 0xffd166, style: 2 }
    ];
    const st = styleColors[(profile.style || 0) % styleColors.length];
    this.adventurer = buildCharacterMesh({
      shirtColor: st.shirt,
      hatColor: st.hat,
      style: st.style
    });

    const startId = profile.currentIsland || 'center';
    this.adventurerIslandId = startId;
    const node = this.islandNodes.get(startId) || this.islandNodes.get('center');
    this.adventurer.position.copy(this.getIslandStandPos(node));
    this.archipelagoGroup.add(this.adventurer);
  }

  getIslandStandPos(node) {
    if (!node || node.id === 'center') return new THREE.Vector3(0, 0.36, 2.2);
    const dirToCenter = node.pos.clone().negate().normalize();
    return node.pos.clone().add(dirToCenter.multiplyScalar(node.radius * 0.52)).setY(0.36);
  }

  // Walk Adventurer along suspension bridges from current island to target island (no teleporting unless reducedMotion!)
  walkAdventurerToIsland(targetIslandId, onArrive) {
    const targetNode = this.islandNodes.get(targetIslandId);
    if (!targetNode) return;

    if (!this.adventurer || this.reducedMotion || this.adventurerIslandId === targetIslandId) {
      if (this.adventurer) {
        this.adventurer.position.copy(this.getIslandStandPos(targetNode));
      }
      this.adventurerIslandId = targetIslandId;
      if (onArrive) onArrive();
      return;
    }

    const waypoints = [];
    const curNode = this.islandNodes.get(this.adventurerIslandId) || this.islandNodes.get('center');
    if (curNode.id !== 'center') {
      waypoints.push(curNode.bridgeEnd.clone());
      waypoints.push(curNode.bridgeStart.clone());
    }
    waypoints.push(new THREE.Vector3(0, 0.36, 2.0));
    if (targetNode.id !== 'center') {
      waypoints.push(targetNode.bridgeStart.clone());
      waypoints.push(targetNode.bridgeEnd.clone());
    }
    waypoints.push(this.getIslandStandPos(targetNode));

    this.adventurerPath = waypoints;
    this.adventurerIslandId = targetIslandId;
    this.adventurerTargetOnArrive = onArrive || null;
  }

  // Epic Cinema Intro Sweep (4.5s desktop / 3.2s mobile, skippable anytime by click/Esc/key)
  playEpicCinemaIntro(onComplete) {
    if (this.reducedMotion || !this.webglSupported) {
      this.resetToPanorama(true);
      if (onComplete) onComplete();
      return;
    }
    this.cinemaActive = true;
    this.controls.enabled = false;
    const duration = window.innerWidth <= 768 ? 3.1 : 4.6;
    const startTime = performance.now();

    const finishCinema = () => {
      if (!this.cinemaActive) return;
      this.cinemaActive = false;
      this.controls.enabled = true;
      this.camera.position.copy(this.defaultCamPos);
      this.controls.target.copy(this.defaultCamTarget);
      this.controls.update();
      if (this.cinemaSkipHandler) {
        window.removeEventListener('keydown', this.cinemaSkipHandler);
        window.removeEventListener('pointerdown', this.cinemaSkipHandler);
        this.cinemaSkipHandler = null;
      }
      if (onComplete) onComplete();
    };

    this.cinemaSkipHandler = () => finishCinema();
    setTimeout(() => {
      if (this.cinemaActive) {
        window.addEventListener('keydown', this.cinemaSkipHandler, { once: true });
        window.addEventListener('pointerdown', this.cinemaSkipHandler, { once: true });
      }
    }, 120);

    this.cameraTween = {
      update: (now) => {
        if (!this.cinemaActive) return true;
        const rawT = Math.min(1, (now - startTime) / (duration * 1000));
        const t = rawT * rawT * (3 - 2 * rawT); // smoothstep

        // Sweep from high cloud altitude -> arc around archipelago -> dive near Citadel -> pull back to panorama
        const angle = (1 - t) * Math.PI * 0.85;
        const dive = Math.sin(t * Math.PI);
        const radius = THREE.MathUtils.lerp(68, 52, t) - dive * 18;
        const height = THREE.MathUtils.lerp(56, 34, t) - dive * 14;

        this.camera.position.set(
          Math.sin(angle) * radius,
          height,
          Math.cos(angle) * radius
        );
        this.controls.target.set(0, (1 - t) * 3, 2);
        this.camera.lookAt(this.controls.target);

        if (rawT >= 1) {
          finishCinema();
          return true;
        }
        return false;
      }
    };
  }

  // Smooth Arc Camera Fly-To Island (1.6s easeInOutCubic)
  flyToIsland(islandId, onDone) {
    const node = this.islandNodes.get(islandId);
    if (!node || !this.webglSupported) {
      if (onDone) onDone();
      return;
    }
    if (this.cinemaActive && this.cinemaSkipHandler) {
      this.cinemaSkipHandler();
    }

    const targetLook = node.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const outDir = node.id === 'center'
      ? new THREE.Vector3(0, 0, 1)
      : node.pos.clone().normalize();
    const targetCam = node.pos.clone()
      .add(outDir.multiplyScalar(node.id === 'center' ? 14 : 11.5))
      .add(new THREE.Vector3(0, node.id === 'center' ? 8.5 : 6.8, 0));

    if (this.reducedMotion) {
      this.camera.position.copy(targetCam);
      this.controls.target.copy(targetLook);
      this.controls.update();
      if (onDone) onDone();
      return;
    }

    const startCam = this.camera.position.clone();
    const startLook = this.controls.target.clone();
    const duration = window.innerWidth <= 768 ? 1150 : 1650;
    const startTime = performance.now();

    this.cameraTween = {
      update: (now) => {
        const rawT = Math.min(1, (now - startTime) / duration);
        const t = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
        const arcLift = Math.sin(rawT * Math.PI) * 5.5;

        this.camera.position.lerpVectors(startCam, targetCam, t);
        this.camera.position.y += arcLift;
        this.controls.target.lerpVectors(startLook, targetLook, t);
        this.camera.lookAt(this.controls.target);

        if (rawT >= 1) {
          this.controls.update();
          if (onDone) onDone();
          return true;
        }
        return false;
      }
    };
  }

  resetToPanorama(instant = false) {
    if (!this.webglSupported) return;
    if (this.walkMode) this.setWalkMode(false);
    if (instant || this.reducedMotion) {
      this.cameraTween = null;
      this.camera.position.copy(this.defaultCamPos);
      this.controls.target.copy(this.defaultCamTarget);
      this.controls.update();
      return;
    }
    const startCam = this.camera.position.clone();
    const startLook = this.controls.target.clone();
    const startTime = performance.now();
    this.cameraTween = {
      update: (now) => {
        const rawT = Math.min(1, (now - startTime) / 1100);
        const t = rawT * rawT * (3 - 2 * rawT);
        this.camera.position.lerpVectors(startCam, this.defaultCamPos, t);
        this.controls.target.lerpVectors(startLook, this.defaultCamTarget, t);
        this.camera.lookAt(this.controls.target);
        if (rawT >= 1) {
          this.controls.update();
          return true;
        }
        return false;
      }
    };
  }

  // First-Person Walk Mode on Islands & Suspension Bridges (地面漫遊)
  setWalkMode(enabled) {
    this.walkMode = !!enabled;
    if (!this.webglSupported) return;
    if (this.walkMode) {
      this.cameraTween = null;
      this.controls.enabled = false;
      this.walkState.pos.set(0, 2.15, -5.1);
      this.walkState.yaw = 0;
      this.walkState.pitch = -0.04;
      this.updateWalkCamera();
    } else {
      this.controls.enabled = true;
      this.resetToPanorama(false);
    }
  }

  isWalkablePosition(x, z) {
    // 1. Check if inside any island radius (but outside landmark core)
    for (const node of this.islandNodes.values()) {
      const d = Math.hypot(x - node.pos.x, z - node.pos.z);
      const landmarkRadius = node.id === 'center' ? 2.7 : 1.55;
      if (d <= node.radius * 0.92 && d >= landmarkRadius) {
        return true;
      }
    }
    // 2. Check if on any radial suspension bridge between Center Island and Regional Island
    for (const node of this.islandNodes.values()) {
      if (node.id === 'center') continue;
      const len = node.pos.length();
      const dirX = node.pos.x / len;
      const dirZ = node.pos.z / len;
      const proj = x * dirX + z * dirZ;
      const perp = Math.abs(-x * dirZ + z * dirX);
      if (proj >= 5.0 && proj <= len - 3.5 && perp <= 1.05) {
        return true;
      }
    }
    return false;
  }

  updateWalkCamera() {
    const { pos, yaw, pitch } = this.walkState;
    this.camera.position.copy(pos);
    const lookX = pos.x - Math.sin(yaw) * Math.cos(pitch) * 10;
    const lookY = pos.y + Math.sin(pitch) * 10;
    const lookZ = pos.z - Math.cos(yaw) * Math.cos(pitch) * 10;
    this.camera.lookAt(lookX, lookY, lookZ);
  }

  setTimeOfDay(mode, paletteColors = null) {
    this.timeMode = mode; // 'day' | 'dusk' | 'night'
    if (!this.webglSupported) return;

    const isNight = mode === 'night';
    const isDusk = mode === 'dusk';

    if (paletteColors) {
      this.skyTargetTop.set(paletteColors.skyTop);
      this.skyTargetBottom.set(paletteColors.skyBottom);
    } else if (isNight) {
      this.skyTargetTop.set(0x0b1622);
      this.skyTargetBottom.set(0x1b2a20);
    } else if (isDusk) {
      this.skyTargetTop.set(0xd98a59);
      this.skyTargetBottom.set(0xdfe8d3);
    } else {
      this.skyTargetTop.set(0x7cc0eb);
      this.skyTargetBottom.set(0xeef3e6);
    }

    this.sunMesh.visible = !isNight;
    this.moonMesh.visible = isNight;
    if (isDusk) {
      this.sunMesh.position.set(55, 22, -65);
      this.dirLight.color.setHex(0xffb070);
      this.dirLight.intensity = 1.05;
      this.hemiLight.intensity = 0.65;
    } else if (isNight) {
      this.dirLight.color.setHex(0x6e94c4);
      this.dirLight.intensity = 0.42;
      this.hemiLight.intensity = 0.35;
    } else {
      this.sunMesh.position.set(45, 58, -65);
      this.dirLight.color.setHex(0xfff4d6);
      this.dirLight.intensity = 1.45;
      this.hemiLight.intensity = 0.85;
    }

    // Toggle Night Windows, Streetlamps, PointLights, Stars & Fireflies
    this.nightWindowMeshes.forEach((m) => {
      m.material.color.setHex(isNight ? 0xffd166 : isDusk ? 0xe3a33b : 0x45545e);
    });
    this.pointLights.forEach((pl) => {
      pl.intensity = isNight ? 2.2 : isDusk ? 0.8 : 0;
    });
    this.starsPoints.material.opacity = isNight ? 0.92 : isDusk ? 0.25 : 0;
    this.firefliesPoints.material.opacity = isNight ? 0.95 : 0;
    this.birdFlocks.forEach((f) => { f.group.visible = !isNight; });
  }

  setLowQuality(low) {
    this.lowQuality = !!low;
    if (!this.webglSupported) return;
    this.renderer.shadowMap.enabled = !this.lowQuality;
    this.dirLight.castShadow = !this.lowQuality;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowQuality ? 1.15 : 2));
    this.residents3D.forEach((r) => {
      if (r.hideOnLowQuality) r.mesh.visible = !this.lowQuality;
    });
    this.animals3D.forEach((a) => {
      if (a.extraInstance) a.mesh.visible = !this.lowQuality;
    });
  }

  setReducedMotion(rm) {
    this.reducedMotion = !!rm;
    if (this.reducedMotion) {
      this.meteors = [];
      this.clearMeteorCanvas();
    }
  }

  // Trigger a Meteor Shower Burst (🌠 許願 / 夜晚流星雨)
  triggerMeteorShower(count = 11) {
    if (this.reducedMotion || this.walkMode) return;
    const w = this.meteorCanvas.width || window.innerWidth;
    const h = this.meteorCanvas.height || window.innerHeight;
    for (let i = 0; i < count; i++) {
      this.meteors.push({
        x: w * (0.25 + Math.random() * 0.72),
        y: h * (0.02 + Math.random() * 0.35),
        vx: -(360 + Math.random() * 240),
        vy: 240 + Math.random() * 180,
        len: 75 + Math.random() * 65,
        life: 0,
        delay: i * 0.14,
        maxLife: 0.85 + Math.random() * 0.45,
        gold: i % 3 === 0
      });
    }
  }

  clearMeteorCanvas() {
    if (!this.meteorCanvas) return;
    const ctx = this.meteorCanvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.meteorCanvas.width, this.meteorCanvas.height);
  }

  resizeMeteorCanvas() {
    if (!this.meteorCanvas) return;
    this.meteorCanvas.width = window.innerWidth;
    this.meteorCanvas.height = window.innerHeight;
  }

  setupEvents() {
    window.addEventListener('resize', () => {
      if (!this.webglSupported) return;
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.resizeMeteorCanvas();
    });

    window.addEventListener('keydown', (e) => {
      this.keysPressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keysPressed.delete(e.code);
    });

    const dom = this.renderer.domElement;
    let downX = 0, downY = 0;
    dom.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
      if (this.walkMode) {
        this.walkState.dragging = true;
        this.walkState.lastX = e.clientX;
        this.walkState.lastY = e.clientY;
      }
    });

    window.addEventListener('pointermove', (e) => {
      if (this.walkMode && this.walkState.dragging) {
        const dx = e.clientX - this.walkState.lastX;
        const dy = e.clientY - this.walkState.lastY;
        this.walkState.lastX = e.clientX;
        this.walkState.lastY = e.clientY;
        this.walkState.yaw -= dx * 0.0045;
        this.walkState.pitch = THREE.MathUtils.clamp(this.walkState.pitch - dy * 0.0035, -0.65, 0.65);
        this.updateWalkCamera();
      }
    });

    window.addEventListener('pointerup', (e) => {
      this.walkState.dragging = false;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) return;
      if (e.target !== dom) return;
      this.handleCanvasTap(e.clientX, e.clientY);
    });
  }

  handleCanvasTap(clientX, clientY) {
    if (!this.webglSupported) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );

    // 1. Mobile-friendly screen-space proximity check for Residents & Animals first
    let closestResident = null;
    let minPxDist = window.innerWidth <= 768 ? 44 : 28;
    const projVec = new THREE.Vector3();

    this.residents3D.forEach((r) => {
      if (!r.mesh.visible) return;
      r.mesh.getWorldPosition(projVec);
      projVec.y += 0.9;
      projVec.project(this.camera);
      if (projVec.z > 1) return;
      const sx = (projVec.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-projVec.y * 0.5 + 0.5) * rect.height + rect.top;
      const dist = Math.hypot(clientX - sx, clientY - sy);
      if (dist < minPxDist) {
        minPxDist = dist;
        closestResident = r;
      }
    });

    if (closestResident) {
      this.focusAndTalkEntity(closestResident.mesh, closestResident);
      return;
    }

    // 2. Raycast against clickable 3D meshes
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const hits = raycaster.intersectObjects(this.clickableMeshes, false);
    if (!hits.length) {
      if (this.onSelectEntity) this.onSelectEntity(null);
      return;
    }

    const hit = hits[0].object;
    const ud = hit.userData;

    if (ud.entityType === 'shell') {
      const sh = this.shells3D[ud.shellIndex];
      if (sh && sh.active) {
        sh.active = false;
        sh.group.visible = false;
        sh.respawnAt = performance.now() + 20000;
        if (this.onPickupShell) this.onPickupShell(sh.islandId);
      }
      return;
    }

    if (ud.entityType === 'chest') {
      if (this.onSelectEntity) this.onSelectEntity({ type: 'chest' });
      return;
    }

    if (ud.entityType === 'lantern') {
      if (this.onOpenGuestbook) this.onOpenGuestbook();
      return;
    }

    if (ud.entityType === 'turtle') {
      if (this.onSelectEntity) {
        this.onSelectEntity({
          type: 'turtle',
          nextIslandName: this.seaTurtleState.nextIslandName,
          mesh: this.seaTurtleMesh
        });
      }
      return;
    }

    if (ud.entityType === 'gatekeeper' || ud.entityType === 'resident' || ud.entityType === 'animal') {
      this.focusAndTalkEntity(ud.rootEntity || hit, ud);
      return;
    }

    if (ud.islandId) {
      if (this.onSelectIsland) this.onSelectIsland(ud.islandId, '3d');
    }
  }

  focusAndTalkEntity(rootMesh, meta) {
    // Turn entity toward camera and wave
    const camPos = this.camera.position.clone();
    rootMesh.lookAt(camPos.x, rootMesh.position.y, camPos.z);

    const resEntry = this.residents3D.find((r) => r.mesh === rootMesh);
    if (resEntry) {
      resEntry.talking = true;
      resEntry.timer = 6.0;
    }

    const animEntry = this.animals3D.find((a) => a.mesh === rootMesh);
    if (animEntry) {
      animEntry.talkingTimer = 4.0;
    }

    if (this.onSelectEntity) {
      const entityType = meta.entityType || (resEntry && resEntry.roleType === 'gatekeeper' ? 'gatekeeper' : 'resident');
      this.onSelectEntity({
        type: entityType,
        mesh: rootMesh,
        resident: meta.resident || (resEntry ? resEntry.data : null),
        npc: meta.npc || (resEntry && resEntry.id === 'npc-wilson' ? this.content.centerIsland.npc : null),
        animal: meta.animal || (animEntry ? animEntry.info : null),
        islandId: meta.islandId || (resEntry ? resEntry.islandId : 'center')
      });
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (document.hidden || !this.webglSupported) return;

    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.getElapsedTime();
    const now = performance.now();

    // FPS auto-downgrade check
    this.fpsFrames++;
    if (now - this.fpsLastCheck >= 1000) {
      const fps = (this.fpsFrames * 1000) / (now - this.fpsLastCheck);
      this.fpsFrames = 0;
      this.fpsLastCheck = now;
      if (fps < 24 && !this.lowQuality) {
        this.lowFpsStreak++;
        if (this.lowFpsStreak >= 3) this.setLowQuality(true);
      } else {
        this.lowFpsStreak = 0;
      }
    }

    // Smooth Sky & Fog Color Interpolation (>= 1.5s transition)
    this.skyCurrentTop.lerp(this.skyTargetTop, dt * 1.8);
    this.skyCurrentBottom.lerp(this.skyTargetBottom, dt * 1.8);
    this.updateSkyDomeColors();
    this.scene.fog.color.copy(this.skyCurrentBottom);
    this.cloudSeaMat.color.copy(this.skyCurrentBottom).lerp(new THREE.Color(0xffffff), 0.35);

    // Camera Tween or Controls
    if (this.cameraTween) {
      const done = this.cameraTween.update(now);
      if (done) this.cameraTween = null;
    } else if (this.walkMode) {
      this.stepWalkMovement(dt);
    } else {
      this.stepAdventurerKeyboardWalk(dt);
      this.controls.update();
    }

    // Shell Respawns (20s)
    this.shells3D.forEach((sh) => {
      if (!sh.active && now >= sh.respawnAt) {
        sh.active = true;
        sh.group.visible = true;
      }
      if (sh.active && !this.reducedMotion) {
        sh.mesh.rotation.y = elapsed * 1.5;
      }
    });

    if (!this.reducedMotion) {
      this.stepWorldAnimations(dt, elapsed);
    }

    this.stepMeteors(dt);
    this.updateHtmlLabels();
    this.renderer.render(this.scene, this.camera);
  }

  stepWalkMovement(dt) {
    const speed = 6.5 * dt;
    const f = (this.keysPressed.has('KeyW') || this.keysPressed.has('ArrowUp') || this.walkState.moveDir.f) ? 1 : 0;
    const b = (this.keysPressed.has('KeyS') || this.keysPressed.has('ArrowDown') || this.walkState.moveDir.b) ? 1 : 0;
    const l = (this.keysPressed.has('KeyA') || this.keysPressed.has('ArrowLeft') || this.walkState.moveDir.l) ? 1 : 0;
    const r = (this.keysPressed.has('KeyD') || this.keysPressed.has('ArrowRight') || this.walkState.moveDir.r) ? 1 : 0;

    if (l) this.walkState.yaw += 1.6 * dt;
    if (r) this.walkState.yaw -= 1.6 * dt;

    const moveZ = f - b;
    if (moveZ !== 0) {
      const nx = this.walkState.pos.x - Math.sin(this.walkState.yaw) * moveZ * speed;
      const nz = this.walkState.pos.z - Math.cos(this.walkState.yaw) * moveZ * speed;
      if (this.isWalkablePosition(nx, nz)) {
        this.walkState.pos.x = nx;
        this.walkState.pos.z = nz;
      }
    }
    this.updateWalkCamera();
  }

  stepAdventurerKeyboardWalk(dt) {
    if (!this.adventurer || this.adventurerPath.length > 0) return;
    let dx = 0, dz = 0;
    if (this.keysPressed.has('ArrowUp') || this.keysPressed.has('KeyW')) dz -= 1;
    if (this.keysPressed.has('ArrowDown') || this.keysPressed.has('KeyS')) dz += 1;
    if (this.keysPressed.has('ArrowLeft') || this.keysPressed.has('KeyA')) dx -= 1;
    if (this.keysPressed.has('ArrowRight') || this.keysPressed.has('KeyD')) dx += 1;
    if (dx === 0 && dz === 0) return;

    const len = Math.hypot(dx, dz);
    const nx = this.adventurer.position.x + (dx / len) * 5.5 * dt;
    const nz = this.adventurer.position.z + (dz / len) * 5.5 * dt;
    if (this.isWalkablePosition(nx, nz)) {
      this.adventurer.lookAt(nx, this.adventurer.position.y, nz);
      this.adventurer.position.x = nx;
      this.adventurer.position.z = nz;
      this.animateCharacterLimbs(this.adventurer, performance.now() * 0.012, true, false);
    }
  }

  stepWorldAnimations(dt, elapsed) {
    // 1. Subtle Floating Island Bobbing (Amplitude <= 0.06 so bridges stay connected) & Under-rock Fragments
    for (const node of this.islandNodes.values()) {
      node.root.position.y = Math.sin(elapsed * 1.1 + node.order) * 0.06;
    }
    this.floatRockItems.forEach((fr) => {
      fr.mesh.position.y = fr.baseY + Math.sin(elapsed * 1.6 + fr.phase) * 0.22;
      fr.mesh.rotation.y = elapsed * 0.35;
    });

    // 2. Cloud Sea Waves
    const pos = this.cloudSeaGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.cloudSeaBaseY[i] + Math.sin(x * 0.08 + elapsed * 1.1) * 0.35 + Math.cos(z * 0.08 + elapsed * 0.9) * 0.35);
    }
    pos.needsUpdate = true;

    // 3. Landmark Mechanisms & Waterfalls
    this.animatedCallbacks.forEach((fn) => fn(elapsed));

    // 4. Wishing Lanterns gentle float
    this.lanterns3D.forEach((lt) => {
      lt.group.position.y = lt.baseY + Math.sin(elapsed * 1.8 + lt.phase) * 0.12;
    });

    // 5. Adventurer Pathfinding Movement along Suspension Bridges
    if (this.adventurer && this.adventurerPath.length > 0) {
      const target = this.adventurerPath[0];
      const dir = new THREE.Vector3().subVectors(target, this.adventurer.position);
      const dist = dir.length();
      const step = 8.5 * dt;
      if (dist <= step) {
        this.adventurer.position.copy(target);
        this.adventurerPath.shift();
        if (this.adventurerPath.length === 0) {
          this.animateCharacterLimbs(this.adventurer, elapsed, false, true);
          if (this.adventurerTargetOnArrive) {
            const cb = this.adventurerTargetOnArrive;
            this.adventurerTargetOnArrive = null;
            cb();
          }
        }
      } else {
        dir.normalize();
        this.adventurer.lookAt(target.x, this.adventurer.position.y, target.z);
        this.adventurer.position.addScaledVector(dir, step);
        this.animateCharacterLimbs(this.adventurer, elapsed * 10, true, false);
      }
    }

    // 6. Residents, Couriers & Gatekeepers
    const isNight = this.timeMode === 'night';
    this.residents3D.forEach((r, idx) => {
      if (r.talking) {
        r.timer -= dt;
        this.animateCharacterLimbs(r.mesh, elapsed * 5, false, true);
        if (r.timer <= 0) r.talking = false;
        return;
      }

      if (r.roleType === 'gatekeeper' || r.roleType === 'merchant') {
        this.animateCharacterLimbs(r.mesh, elapsed * 3 + idx, false, Math.sin(elapsed + idx) > 0.4);
        return;
      }

      if (r.roleType === 'courier') {
        // Courier walks along bridge between Central Island (0,0,0) and target island
        const speed = 0.16 * dt;
        if (r.state === 'outbound') {
          r.progress += speed;
          if (r.progress >= 0.86) {
            r.state = 'handoff';
            r.timer = 1.6;
          }
        } else if (r.state === 'handoff') {
          r.timer -= dt;
          this.animateCharacterLimbs(r.mesh, elapsed * 5, false, true);
          if (r.timer <= 0) {
            r.state = 'inbound';
            if (r.mesh.userData.parts.crateMesh) r.mesh.userData.parts.crateMesh.visible = false;
          }
          return;
        } else {
          r.progress -= speed;
          if (r.progress <= 0.14) {
            r.state = 'outbound';
            if (r.mesh.userData.parts.crateMesh) r.mesh.userData.parts.crateMesh.visible = true;
          }
        }
        const p = new THREE.Vector3(0, 0.36, 0).lerp(r.islandNode.pos, r.progress);
        p.y = 0.36 - Math.sin(r.progress * Math.PI) * 0.25;
        r.mesh.lookAt(r.state === 'outbound' ? r.islandNode.pos.x : 0, p.y, r.state === 'outbound' ? r.islandNode.pos.z : 0);
        r.mesh.position.copy(p);
        this.animateCharacterLimbs(r.mesh, elapsed * 8 + idx, true, false);
        return;
      }

      // Island Resident strolling inside safe ring around island landmark
      r.timer -= dt;
      if (r.state === 'walk') {
        const dir = new THREE.Vector3().subVectors(r.targetPos, r.mesh.position);
        if (dir.length() < 0.18 || r.timer <= 0) {
          r.state = 'idle';
          r.timer = 1.5 + (idx % 3) * 0.8;
        } else {
          dir.normalize();
          r.mesh.lookAt(r.targetPos.x, r.mesh.position.y, r.targetPos.z);
          r.mesh.position.addScaledVector(dir, 1.35 * dt);
          this.animateCharacterLimbs(r.mesh, elapsed * 7 + idx, true, false);
        }
      } else {
        this.animateCharacterLimbs(r.mesh, elapsed * 3 + idx, false, r.timer < 0.8);
        if (r.timer <= 0) {
          r.state = 'walk';
          r.timer = 4.0;
          const ang = Math.random() * Math.PI * 2;
          const rad = r.islandNode.radius * (isNight ? 0.56 : 0.44);
          r.targetPos.set(
            r.islandNode.pos.x + Math.cos(ang) * rad,
            0.35,
            r.islandNode.pos.z + Math.sin(ang) * rad
          );
        }
      }
    });

    // 7. 9 Animal Species Movement
    this.animals3D.forEach((a, idx) => {
      if (a.talkingTimer > 0) {
        a.talkingTimer -= dt;
        a.mesh.position.y = a.basePos.y + Math.abs(Math.sin(elapsed * 8)) * 0.25;
        return;
      }
      if (isNight && (a.where === 'land' || a.where === 'shore' || a.where === 'air')) {
        // Animals rest at night
        a.mesh.position.y = a.basePos.y;
        return;
      }
      const t = elapsed * 1.1 + a.phase;
      if (a.where === 'sea') {
        const seaAng = a.phase + elapsed * 0.12;
        const dist = a.typeId === 'whale' ? 35 : 29.5;
        const nx = Math.cos(seaAng) * dist;
        const nz = Math.sin(seaAng) * dist;
        a.mesh.lookAt(nx - Math.sin(seaAng), a.mesh.position.y, nz + Math.cos(seaAng));
        const jump = a.typeId === 'dolphin' ? Math.max(0, Math.sin(t * 1.7)) * 1.6 : 0;
        a.mesh.position.set(nx, -3.1 + jump, nz);
        if (a.mesh.userData.spout) {
          a.mesh.userData.spout.scale.y = 0.6 + Math.abs(Math.sin(t * 2)) * 0.8;
        }
      } else if (a.where === 'air') {
        const nx = a.node.pos.x + Math.cos(t) * 2.5;
        const nz = a.node.pos.z + Math.sin(t * 1.3) * 2.5;
        a.mesh.position.set(nx, 2.2 + Math.sin(t * 3) * 0.35, nz);
        if (a.mesh.userData.wings) {
          const flap = Math.sin(elapsed * 14 + idx) * 0.55;
          a.mesh.userData.wings.wingL.rotation.z = flap;
          a.mesh.userData.wings.wingR.rotation.z = -flap;
        }
      } else {
        const r = a.where === 'shore' ? a.node.radius * 0.75 : a.node.radius * 0.45;
        const nx = a.node.pos.x + Math.cos(t * 0.45) * r;
        const nz = a.node.pos.z + Math.sin(t * 0.45) * r;
        a.mesh.lookAt(nx, a.basePos.y, nz);
        a.mesh.position.set(nx, a.basePos.y + Math.abs(Math.sin(t * 4)) * 0.1, nz);
      }
    });

    // 8. Sea-Turtle Shuttle Guide (沿外圈游動、靠岸停靠接人)
    const ts = this.seaTurtleState;
    if (ts.pauseTimer > 0) {
      ts.pauseTimer -= dt;
    } else {
      ts.angle += 0.09 * dt;
      const stopStep = (Math.PI * 2) / 8;
      const nextStopIdx = Math.floor(((ts.angle + Math.PI / 2) % (Math.PI * 2)) / stopStep);
      if (nextStopIdx !== ts.stopIndex) {
        ts.stopIndex = nextStopIdx;
        ts.pauseTimer = 3.2;
        const nextIsl = this.content.islands[(nextStopIdx + 1) % this.content.islands.length];
        ts.nextIslandName = nextIsl ? nextIsl.name : this.content.islands[0].name;
      }
    }
    const tx = Math.cos(ts.angle - Math.PI / 2) * ts.radius;
    const tz = Math.sin(ts.angle - Math.PI / 2) * ts.radius;
    this.seaTurtleMesh.lookAt(
      tx - Math.sin(ts.angle - Math.PI / 2),
      -3.0,
      tz + Math.cos(ts.angle - Math.PI / 2)
    );
    this.seaTurtleMesh.position.set(tx, -3.0 + Math.sin(elapsed * 2) * 0.12, tz);
    if (this.seaTurtleMesh.userData.flippers) {
      this.seaTurtleMesh.userData.flippers.forEach((fl, fIdx) => {
        fl.rotation.z = Math.sin(elapsed * 4 + fIdx) * 0.25;
      });
    }

    // 9. Clouds, Bird Flocks & Sailboats
    this.clouds3D.forEach((c) => {
      c.angle += c.speed * dt;
      c.group.position.x = Math.cos(c.angle) * c.dist;
      c.group.position.z = Math.sin(c.angle) * c.dist;
    });
    this.birdFlocks.forEach((f) => {
      if (!f.group.visible) return;
      f.angle += 0.14 * dt;
      const bx = Math.cos(f.angle) * f.dist;
      const bz = Math.sin(f.angle) * f.dist;
      f.group.lookAt(bx - Math.sin(f.angle), f.height, bz + Math.cos(f.angle));
      f.group.position.set(bx, f.height + Math.sin(elapsed * 1.5) * 0.4, bz);
      f.birds.forEach((b) => {
        const flap = Math.sin(elapsed * 11 + b.phase) * 0.48;
        b.wL.rotation.z = flap;
        b.wR.rotation.z = -flap;
      });
    });
    this.boats3D.forEach((b, bIdx) => {
      b.angle += b.speed * dt;
      const sx = Math.cos(b.angle) * b.dist;
      const sz = Math.sin(b.angle) * b.dist;
      b.group.lookAt(sx - Math.sin(b.angle), -3.2, sz + Math.cos(b.angle));
      b.group.position.set(sx, -3.2 + Math.sin(elapsed * 2 + bIdx) * 0.15, sz);
      b.group.rotation.z = Math.sin(elapsed * 2.3 + bIdx) * 0.08;
    });
  }

  animateCharacterLimbs(charMesh, phase, walking, waving) {
    const parts = charMesh.userData.parts;
    if (!parts) return;
    if (walking) {
      parts.legL.rotation.x = Math.sin(phase) * 0.55;
      parts.legR.rotation.x = -Math.sin(phase) * 0.55;
      parts.armL.rotation.x = -Math.sin(phase) * 0.45;
      parts.armR.rotation.x = Math.sin(phase) * 0.45;
      parts.armR.rotation.z = 0;
    } else {
      parts.legL.rotation.x = 0;
      parts.legR.rotation.x = 0;
      parts.armL.rotation.x = 0;
      parts.armR.rotation.x = 0;
      parts.armR.rotation.z = waving ? 2.4 + Math.sin(phase * 2) * 0.35 : 0;
    }
  }

  // 2D Meteor Shower Canvas Overlay (夜晚流星雨)
  stepMeteors(dt) {
    if (!this.meteorCanvas) return;
    const ctx = this.meteorCanvas.getContext('2d');
    ctx.clearRect(0, 0, this.meteorCanvas.width, this.meteorCanvas.height);

    if (this.reducedMotion || this.walkMode) return;

    if (this.timeMode === 'night') {
      this.nextSingleMeteorAt -= dt;
      this.nextShowerAt -= dt;
      if (this.nextSingleMeteorAt <= 0) {
        this.triggerMeteorShower(1);
        this.nextSingleMeteorAt = 9 + Math.random() * 10;
      }
      if (this.nextShowerAt <= 0) {
        this.triggerMeteorShower(9);
        this.nextShowerAt = 48 + Math.random() * 50;
        if (this.onToast) this.onToast('🌠 A meteor shower has arrived! Make a wish! (流星雨來了！許個願吧)');
      }
    }

    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (m.delay > 0) {
        m.delay -= dt;
        continue;
      }
      m.life += dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.life >= m.maxLife) {
        this.meteors.splice(i, 1);
        continue;
      }
      const alpha = Math.sin((m.life / m.maxLife) * Math.PI);
      const mag = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / mag) * m.len;
      const ty = m.y - (m.vy / mag) * m.len;

      const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
      grad.addColorStop(0, m.gold ? `rgba(255, 230, 140, ${alpha})` : `rgba(255, 255, 255, ${alpha})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = m.gold ? 2.6 : 2.0;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();

      ctx.fillStyle = m.gold ? `rgba(255, 240, 175, ${alpha})` : `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Project 3D island positions to HTML labels & resolve any bounding-box overlaps
  updateHtmlLabels() {
    if (!this.labelsLayer) return;
    if (this.walkMode) {
      this.labelsLayer.style.opacity = '0';
      this.labelsLayer.style.pointerEvents = 'none';
      return;
    }
    this.labelsLayer.style.opacity = '1';
    this.labelsLayer.style.pointerEvents = 'none';

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const v = new THREE.Vector3();
    const placed = [];

    // Sort by distance to camera so closer labels stay on top
    const nodes = Array.from(this.islandNodes.values());
    nodes.forEach((node) => {
      v.copy(node.pos);
      v.y += node.id === 'center' ? 5.2 : 3.9;
      v.project(this.camera);
      node._visible = v.z < 1 && v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05;
      node._sx = (v.x * 0.5 + 0.5) * w;
      node._sy = (-v.y * 0.5 + 0.5) * h;
      node._depth = v.z;
    });

    nodes.sort((a, b) => a._depth - b._depth);

    const boxW = window.innerWidth <= 768 ? 118 : 148;
    const boxH = 38;

    nodes.forEach((node) => {
      const el = node.labelEl;
      if (!node._visible) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'inline-flex';
      let sx = THREE.MathUtils.clamp(node._sx, boxW * 0.52, w - boxW * 0.52);
      let sy = THREE.MathUtils.clamp(node._sy, 68, h - 68);

      // Push apart if overlapping with already placed label
      for (let pass = 0; pass < 3; pass++) {
        placed.forEach((p) => {
          const dx = sx - p.x;
          const dy = sy - p.y;
          if (Math.abs(dx) < boxW && Math.abs(dy) < boxH) {
            sy += dy >= 0 ? (boxH - Math.abs(dy) + 4) : -(boxH - Math.abs(dy) + 4);
          }
        });
      }
      placed.push({ x: sx, y: sy });
      el.style.transform = `translate(-50%, -50%) translate(${Math.round(sx)}px, ${Math.round(sy)}px)`;
    });
  }

  projectWorldToScreen(worldObj) {
    if (!worldObj || !this.webglSupported) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const v = new THREE.Vector3();
    worldObj.getWorldPosition(v);
    v.y += 1.5;
    v.project(this.camera);
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    return {
      x: THREE.MathUtils.clamp((v.x * 0.5 + 0.5) * w, 140, w - 140),
      y: THREE.MathUtils.clamp((-v.y * 0.5 + 0.5) * h, 90, h - 160)
    };
  }
}
