// инициализация three.js
function initThreeScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081420);
  scene.fog = new THREE.FogExp2(0x081420, 0.014);

  camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(8, 9, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  document.getElementById('gameContainer').appendChild(renderer.domElement);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.inset = '0';

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 3;
  controls.maxDistance = 32;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 0.3, 0);

  // Свет
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  scene.add(new THREE.HemisphereLight(0x8090b0, 0x1a2530, 0.35));
  const sun = new THREE.DirectionalLight(0xffeedd, 1.0);
  sun.position.set(10, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.camera.left = -16; sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16; sun.shadow.camera.bottom = -16;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x5588ff, 0.15);
  rim.position.set(-8, 6, -8);
  scene.add(rim);

  // Вода
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x143a5a, roughness: 0.3, metalness: 0.5, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  scene.add(water);

  waves = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80, 30, 30),
    new THREE.MeshBasicMaterial({ color: 0x3a7aab, transparent: true, opacity: 0.08, wireframe: true })
  );
  waves.rotation.x = -Math.PI / 2;
  waves.position.y = WATER_Y + 0.02;
  scene.add(waves);

  // Группы
  boardGroup = new THREE.Group(); scene.add(boardGroup);
  pieceGroup = new THREE.Group(); scene.add(pieceGroup);
  markerGroup = new THREE.Group(); scene.add(markerGroup);
  deckGroup = new THREE.Group(); scene.add(deckGroup);
  robberGroup = new THREE.Group(); scene.add(robberGroup);
}

// генерация
function generateTerrain() {
  const sh = sShuffle(HEX_POOL); const list = []; let idx = 0;
  for (let row = 0; row < 5; row++) {
    const count = ROW_LAYOUT[row];
    const z = (row - 2) * 1.5 * HEX_R;
    const xOff = -(count - 1) * 0.5 * SQRT3 * HEX_R;
    for (let col = 0; col < count; col++) {
      list.push({ x: col * SQRT3 * HEX_R + xOff, z: z, terrain: sh[idx], number: null });
      idx++;
    }
  }
  return list;
}

function computeNeighbors(list) {
  const D2 = 3 * HEX_R * HEX_R, eps = 0.01;
  const nbrs = list.map(function() { return []; });
  list.forEach(function(h, i) {
    list.forEach(function(o, j) {
      if (i === j) return;
      const dx = o.x - h.x, dz = o.z - h.z;
      if (Math.abs(dx*dx + dz*dz - D2) < eps) nbrs[i].push(j);
    });
  });
  return nbrs;
}

function placeNumbers(list, nbrs) {
  const nonDesert = list.map(function(h, i) { return h.terrain !== 'desert' ? i : -1; }).filter(function(i) { return i >= 0; });
  for (let t = 0; t < 400; t++) {
    const nums = sShuffle(NUMBER_TOKENS);
    const assign = {};
    nonDesert.forEach(function(idx, k) { assign[idx] = nums[k]; });
    let valid = true;
    for (let a = 0; a < nonDesert.length; a++) {
      const idx = nonDesert[a];
      const num = assign[idx];
      if (num !== 6 && num !== 8 && num !== 2 && num !== 12) continue;
      for (let b = 0; b < nbrs[idx].length; b++) {
        const nn = assign[nbrs[idx][b]];
        if (nn === undefined) continue;
        if ((num === 6 || num === 8) && (nn === 6 || nn === 8)) { valid = false; break; }
        if ((num === 2 && nn === 12) || (num === 12 && nn === 2)) { valid = false; break; }
      }
      if (!valid) break;
    }
    if (valid) { nonDesert.forEach(function(idx) { list[idx].number = assign[idx]; }); return; }
  }
  const fb = sShuffle(NUMBER_TOKENS);
  nonDesert.forEach(function(idx, k) { list[idx].number = fb[k]; });
}

function computeGraph(list) {
  const vertMap = new Map(), newV = [], newE = [], edgeMap = new Map();
  function keyOf(x, z) { return Math.round(x*1000) + ',' + Math.round(z*1000); }
  function getV(x, z) {
    const k = keyOf(x, z);
    if (vertMap.has(k)) return vertMap.get(k);
    const idx = newV.length;
    newV.push({ x: x, z: z, hexes: [], adjacentVertices: new Set(), edgeIndices: new Set(), building: null });
    vertMap.set(k, idx);
    return idx;
  }
  function getE(v1, v2) {
    const a = Math.min(v1, v2), b = Math.max(v1, v2);
    const k = a + '-' + b;
    if (edgeMap.has(k)) return edgeMap.get(k);
    const idx = newE.length;
    const va = newV[a], vb = newV[b];
    newE.push({ v1: a, v2: b, x: (va.x+vb.x)/2, z: (va.z+vb.z)/2, angle: Math.atan2(vb.x - va.x, vb.z - va.z), length: Math.hypot(vb.x-va.x, vb.z-va.z), road: null });
    edgeMap.set(k, idx);
    newV[a].edgeIndices.add(idx); newV[b].edgeIndices.add(idx);
    newV[a].adjacentVertices.add(b); newV[b].adjacentVertices.add(a);
    return idx;
  }
  list.forEach(function(h, hi) {
    const vs = [];
    for (let k = 0; k < 6; k++) {
      const off = HEX_VERT_OFFSETS[k];
      const vi = getV(h.x + off.dx, h.z + off.dz);
      newV[vi].hexes.push(hi);
      vs.push(vi);
    }
    for (let k = 0; k < 6; k++) getE(vs[k], vs[(k + 1) % 6]);
  });
  return { vertices: newV, edges: newE };
}

// разбойник
function createRobberMesh() {
  if (window.KnightPiece) {
    return window.KnightPiece.create(1); // чистый рыцарь, масштаб выставим в placeRobber
  }
  // Резерв — если knight_piece.js почему-то не загрузился
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.10, 0.20, 8),
    new THREE.MeshStandardMaterial({ color: 0x111111 })
  );
  body.position.y = 0.10;
  g.add(body);
  return g;
}
function placeRobber(hexIdx) {
  if (!robberMesh) {
    robberMesh = createRobberMesh();
    robberGroup.add(robberMesh);
  }
  const h = hexList[hexIdx];
  robberHexIdx = hexIdx;

  // Размер и поворот — сразу
  robberMesh.scale.setScalar(0.55);
  robberMesh.rotation.y = Math.atan2(-h.x, -h.z);

  // Плавный переход
  const startX = robberMesh.position.x;
  const startZ = robberMesh.position.z;
  const endX = h.x;
  const endZ = h.z;

  // Если это первый вызов (фишка ещё в 0,0) — телепортируем
  if (startX === 0 && startZ === 0 && !robberMesh.userData._placed) {
    robberMesh.position.set(endX, TERRAIN_Y, endZ);
    robberMesh.userData._placed = true;
    return;
  }
  robberMesh.userData._placed = true;

  const t0 = performance.now();
  const DURATION = 600;
  function step() {
    const k = Math.min(1, (performance.now() - t0) / DURATION);
    const e = k < 0.5 ? 2*k*k : 1 - 2*(1-k)*(1-k); // easeInOut
    robberMesh.position.x = startX + (endX - startX) * e;
    robberMesh.position.z = startZ + (endZ - startZ) * e;
    // «шаги» — лёгкий подскок
    robberMesh.position.y = TERRAIN_Y + Math.abs(Math.sin(k * Math.PI * 3)) * 0.03;
    if (k < 1) requestAnimationFrame(step);
    else robberMesh.position.y = TERRAIN_Y;
  }
  step();
}

// колода ресурсов
function createCardTexture(res) {
  const W = 512, H = 720;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const colors = {
    wood: ['#3a6a2a', '#0a3a15'], brick: ['#a85a20', '#4a1808'],
    sheep: ['#6fb050', '#2a6a1a'], wheat: ['#d0b030', '#906010'], ore: ['#4a4a52', '#1a1a20']
  };
  const cc = colors[res];
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, cc[0]); grad.addColorStop(1, cc[1]);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  ctx.font = '220px Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(RES_NAMES[res].icon, W/2, 320);
  ctx.strokeStyle = '#e0d0a8'; ctx.lineWidth = 14; ctx.strokeRect(20, 20, W - 40, H - 40);
  ctx.fillStyle = 'rgba(224, 208, 168, 0.95)'; ctx.fillRect(60, 580, W - 120, 100);
  ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 60px Georgia, serif';
  ctx.fillText(RES_NAMES[res].name, W/2, 635);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  return tex;
}

function buildResourceDecks() {
  const resources = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const positions = [{ x: -4.6, z: 5.6 }, { x: -2.3, z: 5.6 }, { x: 0, z: 5.6 }, { x: 2.3, z: 5.6 }, { x: 4.6, z: 5.6 }];
  resources.forEach(function(res, i) {
    const g = new THREE.Group();
    const ped = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.14, 0.35), MAT.woodDark);
    ped.position.y = 0.07; g.add(ped);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.20, 0.03, 0.30), MAT.wood);
    top.position.y = 0.155; g.add(top);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.05), MAT.wood);
    back.position.set(0, 0.44, -0.15); back.rotation.x = 0.28; g.add(back);
    const tex = createCardTexture(res);
    const cardGeo = new THREE.BoxGeometry(0.95, 1.35, 0.04);
    const faceMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const card = new THREE.Mesh(cardGeo, [MAT.cardEdge, MAT.cardEdge, MAT.cardEdge, MAT.cardEdge, faceMat, MAT.cardEdge]);
    card.castShadow = true;
    card.position.set(0, 0.85, -0.02);
    card.rotation.x = -0.28;
    g.add(card);
    g.position.set(positions[i].x, WATER_Y + 0.05, positions[i].z);
    deckGroup.add(g);
  });
}

console.log('[scene] OK');