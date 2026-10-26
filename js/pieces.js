// ==================== ФИГУРЫ ИГРОКОВ ====================

// ---------- Анимационная система ----------
const _buildAnims = [];
let _animRAF = null;

function _easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
function _easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function _easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

function _animLoop() {
  const now = performance.now();
  for (let i = _buildAnims.length - 1; i >= 0; i--) {
    const a = _buildAnims[i];
    if (now < a.start) continue;
    const t = Math.min(1, (now - a.start) / a.duration);
    a.update(t);
    if (t >= 1) _buildAnims.splice(i, 1);
  }
  if (_buildAnims.length > 0) _animRAF = requestAnimationFrame(_animLoop);
  else _animRAF = null;
}
function _queueAnim(anim) {
  _buildAnims.push(anim);
  if (!_animRAF) _animRAF = requestAnimationFrame(_animLoop);
}
function clearBuildAnims() { _buildAnims.length = 0; }

function animateBuildSettlement(mesh, delay) {
  const baseY = mesh.position.y;
  const baseRotY = mesh.rotation.y;
  mesh.scale.set(0.01, 0.01, 0.01);
  mesh.position.y = baseY - 0.20;
  mesh.rotation.y = baseRotY - Math.PI * 0.4;
  _queueAnim({
    start: performance.now() + (delay || 0),
    duration: 550,
    update: function(t) {
      const e = _easeOutBack(t);
      const s = Math.max(0.01, e);
      mesh.scale.set(s, s, s);
      mesh.position.y = baseY - 0.20 * (1 - Math.min(1, e));
      mesh.rotation.y = baseRotY - Math.PI * 0.4 * (1 - t);
    }
  });
}

function animateBuildCity(mesh, delay) {
  const baseY = mesh.position.y;
  const baseRotY = mesh.rotation.y;
  mesh.scale.set(0.01, 0.01, 0.01);
  mesh.position.y = baseY - 0.28;
  mesh.rotation.y = baseRotY - Math.PI * 0.55;
  _queueAnim({
    start: performance.now() + (delay || 0),
    duration: 720,
    update: function(t) {
      const e = _easeOutBack(t);
      const s = Math.max(0.01, e);
      mesh.scale.set(s, s, s);
      mesh.position.y = baseY - 0.28 * (1 - Math.min(1, e));
      mesh.rotation.y = baseRotY - Math.PI * 0.55 * (1 - t);
    }
  });
}

function animateBuildRoad(mesh, delay) {
  // Дорога «растёт» из центра вдоль локальной оси Z
  mesh.scale.z = 0.01;
  _queueAnim({
    start: performance.now() + (delay || 0),
    duration: 420,
    update: function(t) {
      const e = _easeOutQuart(t);
      mesh.scale.z = Math.max(0.01, e);
    }
  });
}

// ---------- Материалы для доп. деталей ----------
const _stoneMat  = new THREE.MeshStandardMaterial({ color: 0x6a6660, roughness: 0.95 });
const _woodTrim  = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.85 });
const _doorMat   = new THREE.MeshStandardMaterial({ color: 0x2a1508, roughness: 0.8 });
const _handleMat = new THREE.MeshStandardMaterial({ color: 0xc0a060, metalness: 0.85, roughness: 0.25 });
const _glowMat   = new THREE.MeshBasicMaterial({ color: 0xffd88a });
const _chimneyMat= new THREE.MeshStandardMaterial({ color: 0x8a7060, roughness: 0.9 });
const _capMat    = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.9 });
const _poleMat   = new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 });

function _playerFlagColor(pi) {
  const pc = (typeof PLAYER_COLORS !== 'undefined' && PLAYER_COLORS[players[pi].colorIdx]) || null;
  if (pc && pc.css) return pc.css;
  return '#ffffff';
}

// ---------- ПОСЕЛЕНИЕ (детальный домик) ----------
function createSettlementMesh(pi, setup) {
  const g = new THREE.Group();
  const mats = getPlayerMats(players[pi].colorIdx, setup);
  const flagColor = _playerFlagColor(pi);

  // Фундамент (камень)
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.02, 0.18),
    _stoneMat
  );
  foundation.position.y = 0.01;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  g.add(foundation);

  // Стены (цвет игрока)
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.12, 0.16),
    mats.base
  );
  walls.position.y = 0.08;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);

  // Угловые балки (тёмные акценты)
  [[-0.075, -0.075], [0.075, -0.075], [-0.075, 0.075], [0.075, 0.075]].forEach(function(p) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.014, 0.125, 0.014),
      _woodTrim
    );
    beam.position.set(p[0], 0.08, p[1]);
    beam.castShadow = true;
    g.add(beam);
  });

  // Дверь
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.075, 0.004),
    _doorMat
  );
  door.position.set(0, 0.05, 0.082);
  g.add(door);

  // Ручка двери
  const handle = new THREE.Mesh(
    new THREE.SphereGeometry(0.005, 6, 4),
    _handleMat
  );
  handle.position.set(0.013, 0.045, 0.086);
  g.add(handle);

  // Окно (светящееся)
  const win = new THREE.Mesh(
    new THREE.BoxGeometry(0.034, 0.034, 0.003),
    _glowMat
  );
  win.position.set(-0.048, 0.09, 0.082);
  g.add(win);

  // Рамы окна (крестик)
  const frameH = new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.003, 0.004), _woodTrim);
  frameH.position.set(-0.048, 0.09, 0.0835);
  g.add(frameH);
  const frameV = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.037, 0.004), _woodTrim);
  frameV.position.set(-0.048, 0.09, 0.0835);
  g.add(frameV);

  // Основание крыши (свес)
  const roofBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.014, 0.19),
    mats.dark
  );
  roofBase.position.y = 0.145;
  roofBase.castShadow = true;
  g.add(roofBase);

  // Крыша (пирамида)
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.145, 0.11, 4),
    mats.roof
  );
  roof.position.y = 0.21;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // Труба
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.024, 0.07, 0.024),
    _chimneyMat
  );
  chimney.position.set(0.055, 0.20, -0.055);
  chimney.castShadow = true;
  g.add(chimney);

  // Колпак трубы
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.008, 0.032),
    _capMat
  );
  cap.position.set(0.055, 0.24, -0.055);
  g.add(cap);

  // Флагшток
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0025, 0.0025, 0.10, 6),
    _poleMat
  );
  pole.position.set(0, 0.315, 0);
  g.add(pole);

  // Флаг (цвет игрока)
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.036, 0.022),
    new THREE.MeshBasicMaterial({ color: flagColor, side: THREE.DoubleSide })
  );
  flag.position.set(0.018, 0.335, 0);
  g.add(flag);

  return g;
}

// ---------- ГОРОД (большой дом с башней) ----------
function createCityMesh(pi) {
  const g = new THREE.Group();
  const mats = getPlayerMats(players[pi].colorIdx);
  const flagColor = _playerFlagColor(pi);

  // Фундамент (шире)
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.03, 0.26),
    _stoneMat
  );
  foundation.position.y = 0.015;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  g.add(foundation);

  // Основные стены
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.16, 0.22),
    mats.base
  );
  walls.position.y = 0.11;
  walls.castShadow = true;
  walls.receiveShadow = true;
  g.add(walls);

  // Второй этаж (меньше)
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.10, 0.16),
    mats.base
  );
  upper.position.y = 0.24;
  upper.castShadow = true;
  g.add(upper);

  // Угловые балки
  [[-0.105, -0.105], [0.105, -0.105], [-0.105, 0.105], [0.105, 0.105]].forEach(function(p) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(0.016, 0.17, 0.016),
      _woodTrim
    );
    beam.position.set(p[0], 0.11, p[1]);
    beam.castShadow = true;
    g.add(beam);
  });

  // Окна (2 спереди, 2 наверху)
  [
    [-0.055, 0.09, 0.111], [0.055, 0.09, 0.111],
    [-0.045, 0.22, 0.081], [0.045, 0.22, 0.081]
  ].forEach(function(p) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.003), _glowMat);
    w.position.set(p[0], p[1], p[2]);
    g.add(w);
  });

  // Дверь
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.09, 0.005),
    _doorMat
  );
  door.position.set(0, 0.06, 0.111);
  g.add(door);

  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), _handleMat);
  handle.position.set(0.015, 0.055, 0.115);
  g.add(handle);

  // Основание крыши
  const roofBase = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.016, 0.24),
    mats.dark
  );
  roofBase.position.y = 0.30;
  roofBase.castShadow = true;
  g.add(roofBase);

  // Крыша
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.185, 0.13, 4),
    mats.roof
  );
  roof.position.y = 0.375;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // Труба
  const chimney = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.09, 0.028),
    _chimneyMat
  );
  chimney.position.set(-0.07, 0.30, -0.07);
  chimney.castShadow = true;
  g.add(chimney);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, 0.009, 0.036),
    _capMat
  );
  cap.position.set(-0.07, 0.35, -0.07);
  g.add(cap);

  // Башня (сбоку)
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.36, 0.10),
    mats.dark
  );
  tower.position.set(0.12, 0.20, -0.12);
  tower.castShadow = true;
  g.add(tower);

  // Окна башни
  [-1, 1].forEach(function(side) {
    const tw = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.034, 0.003), _glowMat);
    tw.position.set(0.12, 0.30, -0.12 + side * 0.051);
    g.add(tw);
  });
  const twFront = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.04, 0.003), _glowMat);
  twFront.position.set(0.12, 0.14, -0.069);
  g.add(twFront);

  // Крыша башни (золотая)
  const towerTop = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.12, 4),
    MAT.armorGold
  );
  towerTop.position.set(0.12, 0.44, -0.12);
  towerTop.rotation.y = Math.PI / 4;
  towerTop.castShadow = true;
  g.add(towerTop);

  // Флагшток башни
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.14, 6),
    _poleMat
  );
  pole.position.set(0.12, 0.57, -0.12);
  g.add(pole);

  // Флаг побольше
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.055, 0.035),
    new THREE.MeshBasicMaterial({ color: flagColor, side: THREE.DoubleSide })
  );
  flag.position.set(0.12 + 0.028, 0.605, -0.12);
  g.add(flag);

  return g;
}

// ---------- ДОРОГА (гравий + покрытие + камушки) ----------
function createRoadMesh(length, angle, pi, setup) {
  const g = new THREE.Group();
  const mats = getPlayerMats(players[pi].colorIdx, setup);
  const L = length * 0.92;

  // Нижний слой — гравийная насыпь (шире и тёмная)
  const gravel = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.02, L),
    new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.98 })
  );
  gravel.position.y = 0.01;
  gravel.castShadow = true;
  gravel.receiveShadow = true;
  g.add(gravel);

  // Основное покрытие (цвет игрока)
  const road = new THREE.Mesh(
    new THREE.BoxGeometry(0.075, 0.03, L),
    mats.base
  );
  road.position.y = 0.032;
  road.castShadow = true;
  g.add(road);

  // Поперечные «доски» (тёмные линии)
  const plankCount = Math.max(3, Math.floor(L / 0.06));
  for (let i = 0; i < plankCount; i++) {
    const t = (i + 0.5) / plankCount - 0.5;
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(0.078, 0.032, 0.006),
      mats.dark
    );
    plank.position.set(0, 0.033, t * L);
    g.add(plank);
  }

  // Камушки по краям
  const stoneCount = Math.max(2, Math.floor(L / 0.14));
  for (let i = 0; i < stoneCount; i++) {
    const t = (i + 0.5) / stoneCount - 0.5;
    [-1, 1].forEach(function(side) {
      const stone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.011, 0),
        _stoneMat
      );
      stone.position.set(side * 0.058, 0.02, t * L);
      stone.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      stone.scale.y = 0.55;
      stone.castShadow = true;
      g.add(stone);
    });
  }

  g.rotation.y = angle;
  return g;
}

// ---------- РАЗМЕЩЕНИЕ С АНИМАЦИЯМИ ----------
function placeSettlement(vIdx, pi, setup) {
  const v = vertices[vIdx];
  const mesh = createSettlementMesh(pi, setup);
  mesh.position.set(v.x, TERRAIN_Y, v.z);
  pieceGroup.add(mesh);
  animateBuildSettlement(mesh, 0);
  v.building = { type: 'settlement', player: pi, mesh: mesh };
  players[pi].settlements.push(vIdx);
  updatePlayerPorts(pi);
  updateLongestRoad();
}

function placeCity(vIdx, pi) {
  const v = vertices[vIdx];
  if (v.building && v.building.mesh) {
    pieceGroup.remove(v.building.mesh);
    const si = players[pi].settlements.indexOf(vIdx);
    if (si >= 0) players[pi].settlements.splice(si, 1);
  }
  const mesh = createCityMesh(pi);
  mesh.position.set(v.x, TERRAIN_Y, v.z);
  pieceGroup.add(mesh);
  animateBuildCity(mesh, 0);
  v.building = { type: 'city', player: pi, mesh: mesh };
  players[pi].cities.push(vIdx);
  updatePlayerPorts(pi);
  updateLongestRoad();
}

function placeRoad(eIdx, pi, setup) {
  const e = edges[eIdx];
  const mesh = createRoadMesh(e.length, e.angle, pi, setup);
  mesh.position.set(e.x, TERRAIN_Y, e.z);
  // ВАЖНО: rotation.y уже задан внутри createRoadMesh. Но чтобы анимация
  // масштабировала вдоль правильной оси, оборачиваем: анимируем scale.z.
  pieceGroup.add(mesh);
  animateBuildRoad(mesh, 0);
  e.road = { player: pi, mesh: mesh };
  players[pi].roads.push(eIdx);
  updateLongestRoad();
}

// ==================== ПОРТЫ ====================
function findExposedEdges(list) {
  const offsets = [
    { dx: SQRT3, dz: 0 }, { dx: SQRT3/2, dz: -1.5 }, { dx: -SQRT3/2, dz: -1.5 },
    { dx: -SQRT3, dz: 0 }, { dx: -SQRT3/2, dz: 1.5 }, { dx: SQRT3/2, dz: 1.5 }
  ];
  const result = [];
  list.forEach(function(h, hi) {
    offsets.forEach(function(off) {
      const nx = h.x + off.dx, nz = h.z + off.dz;
      if (!list.some(function(o) { return Math.abs(o.x - nx) < 0.1 && Math.abs(o.z - nz) < 0.1; })) {
        result.push({ x: h.x + off.dx/2, z: h.z + off.dz/2, angle: Math.atan2(off.dz, off.dx), angleFromCenter: Math.atan2(h.z + off.dz/2, h.x + off.dx/2), hexIdx: hi, offset: off });
      }
    });
  });
  return result;
}
function selectPortEdges(edges) {
  if (edges.length < 9) return edges;
  edges.sort(function(a, b) { return a.angleFromCenter - b.angleFromCenter; });
  const picks = [];
  for (let i = 0; i < 9; i++) {
    const target = -Math.PI + i * 2 * Math.PI / 9;
    let best = null, bestDist = Infinity;
    for (let e = 0; e < edges.length; e++) {
      const ed = edges[e];
      if (picks.indexOf(ed) >= 0) continue;
      let d = Math.abs(ed.angleFromCenter - target);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d < bestDist) { bestDist = d; best = ed; }
    }
    if (best) picks.push(best);
  }
  return picks;
}
function createPort(edge, ratio, resource) {
  const g = new THREE.Group();
  const dockLen = 0.90, dockW = 0.50, deckY = 0.20;
  for (let i = 0; i < 8; i++) {
    const t = (i/7) - 0.5;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(dockLen/8 * 0.92, 0.05, dockW), i % 2 === 0 ? MAT.wood : MAT.woodLight);
    plank.position.set(t * (dockLen - dockLen/8), deckY, 0);
    plank.castShadow = true;
    g.add(plank);
  }
  [[-dockLen/2 + 0.10, -dockW/2 + 0.08], [-dockLen/2 + 0.10, dockW/2 - 0.08],
   [dockLen/2 - 0.10, -dockW/2 + 0.08], [dockLen/2 - 0.10, dockW/2 - 0.08]].forEach(function(pos) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.55, 8), MAT.woodDark);
    p.position.set(pos[0], 0.125, pos[1]);
    g.add(p);
  });
  const mastH = 0.85, mastX = dockLen/2 - 0.08;
  [-dockW/2 + 0.10, dockW/2 - 0.10].forEach(function(zSide) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, mastH, 8), MAT.wood);
    mast.position.set(mastX, mastH/2 + 0.05, zSide);
    g.add(mast);
  });
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 320;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 320);
  grad.addColorStop(0, '#f5e6c8'); grad.addColorStop(1, '#e0d0a8');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 320);
  ctx.strokeStyle = '#5a3818'; ctx.lineWidth = 14; ctx.strokeRect(10, 10, 492, 300);
  ctx.fillStyle = '#1a3a5c'; ctx.font = 'bold 92px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(ratio, 256, 95);
  if (resource) {
    ctx.font = '70px Arial, sans-serif';
    ctx.fillText(RES_NAMES[resource].icon, 170, 240);
    ctx.font = 'bold 40px Georgia, serif'; ctx.textAlign = 'left';
    ctx.fillText(RES_NAMES[resource].name, 240, 240);
  } else {
    ctx.fillStyle = '#d4a020'; ctx.beginPath(); ctx.arc(170, 230, 55, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 60px Arial, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★', 170, 248);
    ctx.fillStyle = '#1a3a5c'; ctx.font = 'bold 40px Georgia, serif'; ctx.textAlign = 'left';
    ctx.fillText('Любой', 240, 240);
  }
  const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = 16;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  sign.position.set(mastX, mastH - 0.26, 0);
  sign.rotation.y = -Math.PI/2;
  g.add(sign);
  g.position.set(edge.x, WATER_Y + 0.08, edge.z);
  g.rotation.y = -edge.angle;

  const h = hexList[edge.hexIdx];
  const candidates = [];
  for (let k = 0; k < 6; k++) {
    const o1 = HEX_VERT_OFFSETS[k], o2 = HEX_VERT_OFFSETS[(k+1)%6];
    const p1x = h.x + o1.dx, p1z = h.z + o1.dz, p2x = h.x + o2.dx, p2z = h.z + o2.dz;
    const midX = (p1x + p2x)/2, midZ = (p1z + p2z)/2;
    const d = Math.hypot(midX - (h.x + edge.offset.dx/2), midZ - (h.z + edge.offset.dz/2));
    candidates.push({ d: d, p1: { x: p1x, z: p1z }, p2: { x: p2x, z: p2z } });
  }
  candidates.sort(function(a, b) { return a.d - b.d; });
  const best = candidates[0];
  const vertIdxs = [];
  [best.p1, best.p2].forEach(function(vp) {
    for (let vi = 0; vi < vertices.length; vi++) {
      if (Math.abs(vertices[vi].x - vp.x) < 0.01 && Math.abs(vertices[vi].z - vp.z) < 0.01) { vertIdxs.push(vi); break; }
    }
  });
  return { group: g, ratio: ratio, resource: resource, vertexIdxs: vertIdxs };
}

// ==================== МАРКЕРЫ ====================
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();

function clearMarkers() { clearGroup(markerGroup); }

function addVertexMarker(v, i, color, yo, r) {
  yo = yo === undefined ? 0.06 : yo;
  r = r === undefined ? 0.13 : r;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.04, 16), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 }));
  m.position.set(v.x, TERRAIN_Y + yo, v.z);
  m.userData = { type: 'vertex', idx: i };
  markerGroup.add(m);
}
function addEdgeMarker(e, i, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.03, e.length * 0.85), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.65 }));
  m.position.set(e.x, TERRAIN_Y + 0.05, e.z);
  m.rotation.y = e.angle;
  m.userData = { type: 'edge', idx: i };
  markerGroup.add(m);
}
function addHexMarker(h, i, color) {
  const m = new THREE.Mesh(makeHexGeo(HEX_R * 0.75, 0.03), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.55 }));
  m.position.set(h.x, TERRAIN_Y + 0.04, h.z);
  m.userData = { type: 'hex', idx: i };
  markerGroup.add(m);
}
function showMarkers() {
  clearMarkers();
  if (!gameActive) return;
  if (gamePhase === 'setup_settlement' || gamePhase === 'setup_settlement_2') {
    vertices.forEach(function(v, i) { if (canSetupSettlement(i)) addVertexMarker(v, i, 0x66ff66); });
    return;
  }
  if (gamePhase === 'setup_road' || gamePhase === 'setup_road_2') {
    if (lastPlacedSettlement !== null) {
      Array.from(vertices[lastPlacedSettlement].edgeIndices).forEach(function(eIdx) {
        if (canSetupRoad(eIdx, lastPlacedSettlement)) addEdgeMarker(edges[eIdx], eIdx, 0x88ccff);
      });
    }
    return;
  }
  if (turnState.robberMoveMode) {
    hexList.forEach(function(h, i) { if (i !== robberHexIdx) addHexMarker(h, i, 0xff4444); });
    return;
  }
  const mode = turnState.buildMode;
  if (!mode) return;
  if (mode === 'settlement') {
    vertices.forEach(function(v, i) { if (canPlaceSettlement(i, currentPlayer)) addVertexMarker(v, i, 0x66ff66); });
  } else if (mode === 'city') {
    vertices.forEach(function(v, i) { if (canPlaceCity(i, currentPlayer)) addVertexMarker(v, i, 0xffd700, 0.10, 0.15); });
  } else if (mode === 'road' || mode === 'roadBuilding') {
    if (mode === 'roadBuilding') {
      edges.forEach(function(e, i) {
        if (e.road) return;
        const v1 = vertices[e.v1], v2 = vertices[e.v2];
        const hasOwn = (v1.building && v1.building.player === currentPlayer) || (v2.building && v2.building.player === currentPlayer) ||
          Array.from(v1.edgeIndices).some(function(j) { return edges[j].road && edges[j].road.player === currentPlayer; }) ||
          Array.from(v2.edgeIndices).some(function(j) { return edges[j].road && edges[j].road.player === currentPlayer; });
        if (hasOwn) addEdgeMarker(e, i, 0x90ff90);
      });
    } else {
      edges.forEach(function(e, i) { if (canPlaceRoad(i, currentPlayer)) addEdgeMarker(e, i, 0x88ccff); });
    }
  }
}

console.log('[pieces] OK — детальные дома/дороги + анимации постройки');