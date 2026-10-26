/* ============================================================
   hills.js — глиняное болото: реалистичный fbm-рельеф,
   рабочие ходят ПО холмам, мягкая анимация копания
   ОПТИМИЗИРОВАНО: InstancedMesh + merged workers
   ИСПРАВЛЕНО: Math.random() -> ctx.rng() для мультиплеера
   ============================================================ */
(function () {
  'use strict';

  const CFG = {
    HEX_RADIUS: 0.9,
    HEX_MARGIN: 0.14,
    SAFE_ZONE_RADIUS: 0.17,

    WORKER_SCALE: 0.3,
    WORKER_RADIUS: 0.06,
    WORKER_TURN_SMOOTH: 4.0,

    DIGGER_RELOCATE_TIME: 13.0,
    DIGGER_WALK_SPEED: 0.09,
    DIGGER_WALK_ZONE_MIN: 0.40,
    DIGGER_WALK_ZONE_MAX: 0.60,

    PILE_MIN_SCALE: 0.78,
    PILE_MAX_SCALE: 1.12,

    CARRIER_CYCLE_SPEED: 0.42,
    DIG_ANIM_SPEED: 0.9,

    CLAY_PATCHES: 18,
    CLAY_HILLS: 5,

    HILL_RADIUS_MIN: 0.12,
    HILL_RADIUS_MAX: 0.19,
    HILL_HEIGHT_MIN: 0.022,
    HILL_HEIGHT_MAX: 0.045,
  };

  const COL = {
    vest:       0xFF7A1A,
    vestStripe: 0xEEEEEE,
    vestDark:   0xC55A0A,
    belt:       0x3A2010,
    helmet:     0xFAFAFA,
    helmetDark: 0xD0D0D0,
    skin:       0xE8B07A,
    skinDark:   0xC99060,
    pants:      0x2A3A5C,
    pantsDark:  0x1E2A44,
    boot:       0x3A2515,
    bootDark:   0x1A0E05,
    metal:      0x777777,
    metalDark:  0x4A4A4A,
    wood:       0x8B6B3D,
    woodDark:   0x5A4020,
    eye:        0x111111,
    wheel:      0x1A1A1A,
    clayWet:    0x6B4423,
  };

  const _clayColors = [0xA0623C, 0x8B4A28, 0xB8794E, 0x9B6B44, 0x7A5030, 0xA9704A, 0x8D5A3A, 0xC58B5D];

  const _clayMats = _clayColors.map(function(c) {
    return new THREE.MeshStandardMaterial({
      color: c, roughness: 0.55, metalness: 0.05, flatShading: false,
    });
  });

  const _clayWetMat = new THREE.MeshStandardMaterial({
    color: 0x6B4423, roughness: 0.35, metalness: 0.12, flatShading: false,
  });

  const _clayInstMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.55, metalness: 0.05, flatShading: false,
  });

  const _workerVertexMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.78, metalness: 0.05,
  });

  const _shovelVertexMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.55, metalness: 0.35,
  });

  const _barrowVertexMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0.4,
  });

  const _clayLoadMat = _clayWetMat;

  function _mergeGeomsWithColors(items) {
    const nonIndexed = [];
    items.forEach(function(it) {
      const g = it.geo.index ? it.geo.toNonIndexed() : it.geo;
      nonIndexed.push({ geo: g, color: it.color });
    });
    let totalVerts = 0;
    nonIndexed.forEach(function(it) { totalVerts += it.geo.attributes.position.count; });

    const positions = new Float32Array(totalVerts * 3);
    const normals   = new Float32Array(totalVerts * 3);
    const colors    = new Float32Array(totalVerts * 3);
    let offset = 0;

    nonIndexed.forEach(function(it) {
      const count = it.geo.attributes.position.count;
      positions.set(it.geo.attributes.position.array, offset * 3);
      normals.set(it.geo.attributes.normal.array, offset * 3);
      const c = new THREE.Color(it.color);
      for (let i = 0; i < count; i++) {
        colors[(offset + i) * 3]     = c.r;
        colors[(offset + i) * 3 + 1] = c.g;
        colors[(offset + i) * 3 + 2] = c.b;
      }
      offset += count;
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    merged.setAttribute('normal',   new THREE.BufferAttribute(normals, 3));
    merged.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    return merged;
  }

  let _workerBodyGeo = null;
  function _getWorkerBodyGeo() {
    if (_workerBodyGeo) return _workerBodyGeo;
    const items = [];

    const torso = new THREE.CylinderGeometry(0.06, 0.075, 0.18, 10);
    torso.translate(0, 0.09, 0);
    items.push({ geo: torso, color: COL.vest });

    const stripe1 = new THREE.CylinderGeometry(0.062, 0.062, 0.012, 12);
    stripe1.translate(0, 0.12, 0);
    items.push({ geo: stripe1, color: COL.vestStripe });

    const stripe2 = new THREE.CylinderGeometry(0.068, 0.068, 0.012, 12);
    stripe2.translate(0, 0.07, 0);
    items.push({ geo: stripe2, color: COL.vestStripe });

    const belt = new THREE.CylinderGeometry(0.074, 0.074, 0.012, 12);
    belt.translate(0, 0.01, 0);
    items.push({ geo: belt, color: COL.belt });

    const buckle = new THREE.BoxGeometry(0.016, 0.010, 0.006);
    buckle.translate(0, 0.01, 0.076);
    items.push({ geo: buckle, color: COL.metalDark });

    const pocket = new THREE.BoxGeometry(0.024, 0.020, 0.004);
    pocket.translate(-0.028, 0.115, 0.058);
    items.push({ geo: pocket, color: COL.vestStripe });

    const zipper = new THREE.BoxGeometry(0.006, 0.13, 0.003);
    zipper.translate(0, 0.09, 0.062);
    items.push({ geo: zipper, color: COL.vestDark });

    const pocketSideL = new THREE.BoxGeometry(0.004, 0.030, 0.020);
    pocketSideL.translate(-0.062, 0.045, 0.020);
    items.push({ geo: pocketSideL, color: COL.vestStripe });

    const pocketSideR = new THREE.BoxGeometry(0.004, 0.030, 0.020);
    pocketSideR.translate(0.062, 0.045, 0.020);
    items.push({ geo: pocketSideR, color: COL.vestStripe });

    const collar = new THREE.TorusGeometry(0.032, 0.008, 6, 12);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0.175, 0);
    items.push({ geo: collar, color: COL.vestStripe });

    const neck = new THREE.CylinderGeometry(0.020, 0.022, 0.030, 8);
    neck.translate(0, 0.185, 0);
    items.push({ geo: neck, color: COL.skin });

    const shoulderL = new THREE.SphereGeometry(0.024, 8, 6);
    shoulderL.translate(-0.062, 0.155, 0);
    items.push({ geo: shoulderL, color: COL.vest });

    const shoulderR = new THREE.SphereGeometry(0.024, 8, 6);
    shoulderR.translate(0.062, 0.155, 0);
    items.push({ geo: shoulderR, color: COL.vest });

    const armL = new THREE.CylinderGeometry(0.018, 0.016, 0.14, 6);
    armL.rotateZ(0.28);
    armL.translate(-0.075, 0.08, 0);
    items.push({ geo: armL, color: COL.vest });

    const armR = new THREE.CylinderGeometry(0.018, 0.016, 0.14, 6);
    armR.rotateZ(-0.28);
    armR.translate(0.075, 0.08, 0);
    items.push({ geo: armR, color: COL.vest });

    const handL = new THREE.SphereGeometry(0.020, 7, 5);
    handL.translate(-0.105, 0.010, 0);
    items.push({ geo: handL, color: COL.skin });

    const handR = new THREE.SphereGeometry(0.020, 7, 5);
    handR.translate(0.105, 0.010, 0);
    items.push({ geo: handR, color: COL.skin });

    const head = new THREE.SphereGeometry(0.048, 12, 9);
    head.translate(0, 0.225, 0);
    items.push({ geo: head, color: COL.skin });

    const eyeGeo = new THREE.SphereGeometry(0.006, 6, 5);
    const eyeL = eyeGeo.clone();
    eyeL.translate(-0.017, 0.230, 0.043);
    items.push({ geo: eyeL, color: COL.eye });

    const eyeR = eyeGeo.clone();
    eyeR.translate(0.017, 0.230, 0.043);
    items.push({ geo: eyeR, color: COL.eye });

    const mouth = new THREE.BoxGeometry(0.014, 0.003, 0.004);
    mouth.translate(0, 0.208, 0.047);
    items.push({ geo: mouth, color: COL.skinDark });

    const helmet = new THREE.SphereGeometry(0.055, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    helmet.scale(1, 0.85, 1);
    helmet.translate(0, 0.245, 0);
    items.push({ geo: helmet, color: COL.helmet });

    const helmetBack = new THREE.SphereGeometry(0.050, 12, 8, 0, Math.PI, 0, Math.PI / 2);
    helmetBack.rotateY(-Math.PI / 2);
    helmetBack.scale(1, 0.75, 1);
    helmetBack.translate(0, 0.245, -0.008);
    items.push({ geo: helmetBack, color: COL.helmet });

    const brim = new THREE.CylinderGeometry(0.058, 0.058, 0.006, 16);
    brim.translate(0, 0.242, 0);
    items.push({ geo: brim, color: COL.helmetDark });

    const visor = new THREE.BoxGeometry(0.055, 0.005, 0.024);
    visor.translate(0, 0.240, 0.058);
    items.push({ geo: visor, color: COL.helmetDark });

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const rivet = new THREE.SphereGeometry(0.003, 5, 4);
      rivet.translate(Math.cos(a) * 0.050, 0.260, Math.sin(a) * 0.050);
      items.push({ geo: rivet, color: COL.metalDark });
    }

    _workerBodyGeo = _mergeGeomsWithColors(items);
    return _workerBodyGeo;
  }

  let _legGeo = null;
  function _getLegGeo() {
    if (_legGeo) return _legGeo;
    const items = [];

    const leg = new THREE.CylinderGeometry(0.028, 0.024, 0.16, 6);
    leg.translate(0, -0.08, 0);
    items.push({ geo: leg, color: COL.pants });

    const cuff = new THREE.CylinderGeometry(0.026, 0.028, 0.015, 6);
    cuff.translate(0, -0.145, 0);
    items.push({ geo: cuff, color: COL.pantsDark });

    const boot = new THREE.BoxGeometry(0.055, 0.03, 0.08);
    boot.translate(0, -0.155, 0.015);
    items.push({ geo: boot, color: COL.boot });

    const toe = new THREE.BoxGeometry(0.055, 0.02, 0.02);
    toe.translate(0, -0.165, 0.055);
    items.push({ geo: toe, color: COL.bootDark });

    const lace = new THREE.BoxGeometry(0.045, 0.003, 0.006);
    lace.translate(0, -0.145, 0.030);
    items.push({ geo: lace, color: COL.bootDark });

    _legGeo = _mergeGeomsWithColors(items);
    return _legGeo;
  }

  let _shovelGeo = null;
  function _getShovelGeo() {
    if (_shovelGeo) return _shovelGeo;
    const items = [];

    const shaft = new THREE.CylinderGeometry(0.007, 0.007, 0.28, 6);
    shaft.translate(0, -0.14, 0);
    items.push({ geo: shaft, color: COL.wood });

    const wrap = new THREE.CylinderGeometry(0.008, 0.008, 0.04, 6);
    wrap.translate(0, -0.24, 0);
    items.push({ geo: wrap, color: COL.woodDark });

    const grip = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6);
    grip.rotateZ(Math.PI / 2);
    grip.translate(0, 0, 0);
    items.push({ geo: grip, color: COL.wood });

    const collet = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8);
    collet.translate(0, -0.27, 0);
    items.push({ geo: collet, color: COL.metal });

    const blade = new THREE.BoxGeometry(0.055, 0.07, 0.012);
    blade.translate(0, -0.315, 0);
    items.push({ geo: blade, color: COL.metal });

    const tip = new THREE.ConeGeometry(0.028, 0.04, 4);
    tip.rotateY(Math.PI / 4);
    tip.translate(0, -0.37, 0);
    items.push({ geo: tip, color: COL.metal });

    _shovelGeo = _mergeGeomsWithColors(items);
    return _shovelGeo;
  }

  let _barrowStaticGeo = null;
  function _getBarrowStaticGeo() {
    if (_barrowStaticGeo) return _barrowStaticGeo;
    const items = [];

    const tray = new THREE.BoxGeometry(0.16, 0.07, 0.22);
    tray.translate(0, 0.02, 0);
    items.push({ geo: tray, color: COL.metal });

    const wallF = new THREE.BoxGeometry(0.16, 0.09, 0.012);
    wallF.translate(0, 0.045, 0.11);
    items.push({ geo: wallF, color: COL.metal });

    const wallB = new THREE.BoxGeometry(0.16, 0.09, 0.012);
    wallB.translate(0, 0.045, -0.11);
    items.push({ geo: wallB, color: COL.metal });

    const wallL = new THREE.BoxGeometry(0.012, 0.09, 0.22);
    wallL.translate(-0.08, 0.045, 0);
    items.push({ geo: wallL, color: COL.metal });

    const wallR = new THREE.BoxGeometry(0.012, 0.09, 0.22);
    wallR.translate(0.08, 0.045, 0);
    items.push({ geo: wallR, color: COL.metal });

    for (let sx = -1; sx <= 1; sx += 2) {
      for (let sz = -1; sz <= 1; sz += 2) {
        for (let k = 0; k < 2; k++) {
          const rivet = new THREE.SphereGeometry(0.004, 5, 4);
          rivet.translate(sx * 0.075, 0.045 + k * 0.05, sz * 0.105);
          items.push({ geo: rivet, color: COL.metalDark });
        }
      }
    }

    const handleL = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6);
    handleL.rotateX(Math.PI / 2);
    handleL.translate(-0.075, 0.04, -0.19);
    items.push({ geo: handleL, color: COL.wood });

    const handleR = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6);
    handleR.rotateX(Math.PI / 2);
    handleR.translate(0.075, 0.04, -0.19);
    items.push({ geo: handleR, color: COL.wood });

    const supL = new THREE.CylinderGeometry(0.006, 0.006, 0.10, 5);
    supL.rotateX(0.15);
    supL.translate(-0.06, -0.02, -0.08);
    items.push({ geo: supL, color: COL.metal });

    const supR = new THREE.CylinderGeometry(0.006, 0.006, 0.10, 5);
    supR.rotateX(0.15);
    supR.translate(0.06, -0.02, -0.08);
    items.push({ geo: supR, color: COL.metal });

    _barrowStaticGeo = _mergeGeomsWithColors(items);
    return _barrowStaticGeo;
  }

  let _wheelGeo = null;
  function _getWheelGeo() {
    if (_wheelGeo) return _wheelGeo;
    const items = [];

    const tire = new THREE.CylinderGeometry(0.045, 0.045, 0.02, 18);
    tire.rotateZ(Math.PI / 2);
    items.push({ geo: tire, color: COL.wheel });

    const rim = new THREE.TorusGeometry(0.045, 0.004, 8, 22);
    rim.rotateY(Math.PI / 2);
    items.push({ geo: rim, color: COL.metal });

    const hub = new THREE.CylinderGeometry(0.012, 0.012, 0.024, 10);
    hub.rotateZ(Math.PI / 2);
    items.push({ geo: hub, color: COL.metal });

    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.BoxGeometry(0.004, 0.088, 0.004);
      spoke.rotateX(i * Math.PI / 4);
      items.push({ geo: spoke, color: COL.metal });
    }

    _wheelGeo = _mergeGeomsWithColors(items);
    return _wheelGeo;
  }

  function _createWorker(kind) {
    const g = new THREE.Group();
    g.userData.kind = kind;

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.16;
    g.add(bodyGroup);

    const bodyMesh = new THREE.Mesh(_getWorkerBodyGeo(), _workerVertexMat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyGroup.add(bodyMesh);
    g.userData.bodyGroup = bodyGroup;
    g.userData.torso = bodyGroup;

    const legLGroup = new THREE.Group();
    legLGroup.position.set(-0.035, 0.16, 0);
    const legLMesh = new THREE.Mesh(_getLegGeo(), _workerVertexMat);
    legLMesh.castShadow = true;
    legLGroup.add(legLMesh);
    g.add(legLGroup);
    g.userData.legL = legLGroup;

    const legRGroup = new THREE.Group();
    legRGroup.position.set(0.035, 0.16, 0);
    const legRMesh = new THREE.Mesh(_getLegGeo(), _workerVertexMat);
    legRMesh.castShadow = true;
    legRGroup.add(legRMesh);
    g.add(legRGroup);
    g.userData.legR = legRGroup;

    if (kind === 'digger') {
      const shovel = new THREE.Mesh(_getShovelGeo(), _shovelVertexMat);
      shovel.position.set(0.105, 0.06, 0.02);
      shovel.rotation.z = 0.5;
      shovel.castShadow = true;
      bodyGroup.add(shovel);
      g.userData.shovel = shovel;
    } else if (kind === 'carrier') {
      const barrow = new THREE.Group();
      barrow.position.set(0, 0.06, 0.14);

      const staticMesh = new THREE.Mesh(_getBarrowStaticGeo(), _barrowVertexMat);
      staticMesh.castShadow = true;
      staticMesh.receiveShadow = true;
      barrow.add(staticMesh);

      const loadGeo = new THREE.SphereGeometry(0.075, 12, 10);
      loadGeo.scale(1, 0.55, 1.3);
      const load = new THREE.Mesh(loadGeo, _clayLoadMat);
      load.position.y = 0.075;
      load.castShadow = true;
      barrow.add(load);
      barrow.userData.load = load;

      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(0, -0.025, 0.10);
      const wheelMesh = new THREE.Mesh(_getWheelGeo(), _barrowVertexMat);
      wheelMesh.castShadow = true;
      wheelPivot.add(wheelMesh);
      barrow.add(wheelPivot);
      barrow.userData.wheel = wheelPivot;

      g.add(barrow);
      g.userData.barrow = barrow;
    }

    g.scale.setScalar(CFG.WORKER_SCALE);
    return g;
  }

  function _hash2(ix, iy) {
    let h = ix * 374761393 + iy * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h >>> 0) / 4294967296;
  }

  function _valueNoise(x, y) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const n00 = _hash2(x0, y0);
    const n10 = _hash2(x0 + 1, y0);
    const n01 = _hash2(x0, y0 + 1);
    const n11 = _hash2(x0 + 1, y0 + 1);
    const nx0 = n00 * (1 - u) + n10 * u;
    const nx1 = n01 * (1 - u) + n11 * u;
    return nx0 * (1 - v) + nx1 * v;
  }

  function _fbm(x, y, octaves) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += _valueNoise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  function _hillHeightAt(nx, nz, seed, height) {
    const r2 = nx * nx + nz * nz;
    if (r2 >= 1) return 0;
    const r = Math.sqrt(r2);
    const falloff = Math.pow(1 - r * r, 1.35);
    const n1 = _fbm(nx * 2.2 + seed, nz * 2.2 + seed, 2);
    const n2 = _valueNoise(nx * 7 + seed * 1.7, nz * 7 + seed * 1.7);
    const bump = (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.30;
    const h = height * (falloff + bump * falloff * 0.7);
    return Math.max(0, h);
  }

  function _createHillGeometry(radius, height, seed, rings, segs) {
    rings = rings || 8;
    segs = segs || 24;
    const positions = [];
    const uvs = [];
    const indices = [];

    positions.push(0, height, 0);
    uvs.push(0.5, 0.5);

    for (let r = 1; r <= rings; r++) {
      const rr = r / rings;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const nx = Math.cos(a) * rr;
        const nz = Math.sin(a) * rr;
        const y = _hillHeightAt(nx, nz, seed, height);
        positions.push(nx * radius, y, nz * radius);
        uvs.push(0.5 + nx * 0.5, 0.5 + nz * 0.5);
      }
    }

    for (let s = 0; s < segs; s++) {
      const next = (s + 1) % segs;
      indices.push(0, 1 + next, 1 + s);
    }
    for (let r = 1; r < rings; r++) {
      const innerStart = 1 + (r - 1) * segs;
      const outerStart = 1 + r * segs;
      for (let s = 0; s < segs; s++) {
        const next = (s + 1) % segs;
        indices.push(innerStart + s, innerStart + next, outerStart + s);
        indices.push(innerStart + next, outerStart + next, outerStart + s);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  const _hillSeeds = [42, 137, 891];
  let _hillTemplates = null;
  function _getHillTemplates() {
    if (_hillTemplates) return _hillTemplates;
    _hillTemplates = _hillSeeds.map(function(s) {
      return _createHillGeometry(1, 1, s, 8, 24);
    });
    return _hillTemplates;
  }

  function _getGroundOffsetAt(wx, wz, hills) {
    let maxH = 0;
    for (let i = 0; i < hills.length; i++) {
      const h = hills[i];
      const nx = (wx - h.x) / h.radius;
      const nz = (wz - h.z) / h.radius;
      const r2 = nx * nx + nz * nz;
      if (r2 >= 1) continue;
      const hh = _hillHeightAt(nx, nz, h.seed, h.height);
      if (hh > maxH) maxH = hh;
    }
    return maxH;
  }

  function _hexBoundaryDist(angle, R) {
    const apothem = R * Math.sqrt(3) / 2;
    const phi = Math.round(angle / (Math.PI / 3)) * (Math.PI / 3);
    return apothem / Math.cos(angle - phi);
  }

  function _clampToHex(x, z, cx, cz, R) {
    const dx = x - cx, dz = z - cz;
    const r = Math.hypot(dx, dz);
    if (r < 1e-6) return [x, z];
    const angle = Math.atan2(dz, dx);
    const maxR = _hexBoundaryDist(angle, R);
    if (r > maxR) {
      const k = maxR / r;
      return [cx + dx * k, cz + dz * k];
    }
    return [x, z];
  }

  function _safeRadiusFor(objR) {
    return CFG.HEX_RADIUS * (1 - CFG.HEX_MARGIN) - objR;
  }

  function _inSafeZone(x, z, cx, cz, extra) {
    extra = extra || 0;
    const dx = x - cx, dz = z - cz;
    return Math.hypot(dx, dz) < CFG.SAFE_ZONE_RADIUS + extra;
  }

  function _clampOutOfSafe(x, z, cx, cz, workerR) {
    const dx = x - cx, dz = z - cz;
    const d = Math.hypot(dx, dz);
    const minD = CFG.SAFE_ZONE_RADIUS + workerR;
    if (d < minD && d > 1e-6) {
      const k = minD / d;
      return [cx + dx * k, cz + dz * k];
    }
    return [x, z];
  }

  function _smoothDeform(geo, amp, freq, squashY) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + amp * (
        Math.sin(x * freq + y * freq * 0.7) * 0.5 +
        Math.cos(z * freq * 1.1 - y * freq * 0.5) * 0.5
      );
      pos.setX(i, x * n);
      pos.setY(i, y * n * (squashY || 1));
      pos.setZ(i, z * n);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  function _buildClayTerrain(cx, cy, cz, ctx, avoidPoints) {
    const objs = [];
    const hills = [];

    const _m = new THREE.Matrix4();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _v = new THREE.Vector3();
    const _s = new THREE.Vector3();
    const _c = new THREE.Color();

    const patchData = [];
    for (let i = 0; i < CFG.CLAY_PATCHES; i++) {
      const rad = 0.08 + ctx.rng() * 0.12;
      const maxR = _safeRadiusFor(rad + 0.03);
      if (maxR <= 0.05) continue;
      const a = ctx.rng() * Math.PI * 2;
      const r = Math.sqrt(ctx.rng()) * maxR;
      let px = cx + Math.cos(a) * r;
      let pz = cz + Math.sin(a) * r;
      const cl = _clampToHex(px, pz, cx, cz, maxR);
      px = cl[0]; pz = cl[1];
      if (_inSafeZone(px, pz, cx, cz, rad * 0.8)) continue;

      patchData.push({
        x: px, z: pz, r: rad,
        yOff: 0.008 + ctx.rng() * 0.005,
        colorIdx: Math.floor(ctx.rng() * _clayColors.length),
        hasWet: ctx.rng() < 0.55,
      });
    }

    if (patchData.length > 0) {
      const patchGeo = new THREE.CircleGeometry(1, 24);
      const patchInst = new THREE.InstancedMesh(patchGeo, _clayInstMat, patchData.length);
      patchInst.receiveShadow = true;
      for (let i = 0; i < patchData.length; i++) {
        const p = patchData[i];
        _e.set(-Math.PI / 2, 0, 0);
        _q.setFromEuler(_e);
        _v.set(p.x, cy + p.yOff, p.z);
        _s.set(p.r, p.r, 1);
        _m.compose(_v, _q, _s);
        patchInst.setMatrixAt(i, _m);
        _c.setHex(_clayColors[p.colorIdx]);
        patchInst.setColorAt(i, _c);
      }
      patchInst.instanceMatrix.needsUpdate = true;
      if (patchInst.instanceColor) patchInst.instanceColor.needsUpdate = true;
      ctx.boardGroup.add(patchInst);
      objs.push(patchInst);

      const wetData = patchData.filter(function(p) { return p.hasWet; });
      if (wetData.length > 0) {
        const wetGeo = new THREE.CircleGeometry(1, 20);
        const wetInst = new THREE.InstancedMesh(wetGeo, _clayWetMat, wetData.length);
        for (let i = 0; i < wetData.length; i++) {
          const p = wetData[i];
          _e.set(-Math.PI / 2, 0, 0);
          _q.setFromEuler(_e);
          _v.set(p.x, cy + 0.013, p.z);
          _s.set(p.r * 0.5, p.r * 0.5, 1);
          _m.compose(_v, _q, _s);
          wetInst.setMatrixAt(i, _m);
        }
        wetInst.instanceMatrix.needsUpdate = true;
        ctx.boardGroup.add(wetInst);
        objs.push(wetInst);
      }
    }

    const hillCount = 3 + Math.floor(ctx.rng() * (CFG.CLAY_HILLS - 2));
    const hillData = [];
    let attempts = 0;
    let placed = 0;

    while (placed < hillCount && attempts < 80) {
      attempts++;
      const radius = CFG.HILL_RADIUS_MIN + ctx.rng() * (CFG.HILL_RADIUS_MAX - CFG.HILL_RADIUS_MIN);
      const height = CFG.HILL_HEIGHT_MIN + ctx.rng() * (CFG.HILL_HEIGHT_MAX - CFG.HILL_HEIGHT_MIN);
      const templateIdx = Math.floor(ctx.rng() * 3);
      const seed = _hillSeeds[templateIdx];

      const maxR = _safeRadiusFor(radius + 0.02);
      if (maxR <= 0.15) break;

      const a = ctx.rng() * Math.PI * 2;
      const r = 0.28 + ctx.rng() * (maxR - 0.28);
      let hx = cx + Math.cos(a) * r;
      let hz = cz + Math.sin(a) * r;
      const cl = _clampToHex(hx, hz, cx, cz, maxR);
      hx = cl[0]; hz = cl[1];

      if (_inSafeZone(hx, hz, cx, cz, radius + 0.02)) continue;

      let skip = false;
      if (avoidPoints) {
        for (let k = 0; k < avoidPoints.length; k++) {
          if (Math.hypot(hx - avoidPoints[k].x, hz - avoidPoints[k].z) < radius + 0.06) {
            skip = true; break;
          }
        }
      }
      if (skip) continue;

      let overlap = false;
      for (let k = 0; k < hillData.length; k++) {
        const h2 = hillData[k];
        if (Math.hypot(hx - h2.x, hz - h2.z) < (radius + h2.radius) * 0.85) {
          overlap = true; break;
        }
      }
      if (overlap) continue;

      hillData.push({
        x: hx, z: hz,
        radius: radius, height: height, seed: seed,
        templateIdx: templateIdx,
        colorIdx: Math.floor(ctx.rng() * _clayColors.length),
      });
      hills.push({ x: hx, z: hz, radius: radius, height: height, seed: seed });
      placed++;
    }

    if (hillData.length > 0) {
      const templates = _getHillTemplates();
      for (let ti = 0; ti < templates.length; ti++) {
        const group = hillData.filter(function(h) { return h.templateIdx === ti; });
        if (group.length === 0) continue;
        const inst = new THREE.InstancedMesh(templates[ti], _clayInstMat, group.length);
        inst.castShadow = true;
        inst.receiveShadow = true;
        for (let i = 0; i < group.length; i++) {
          const h = group[i];
          _q.set(0, 0, 0, 1);
          _v.set(h.x, cy, h.z);
          _s.set(h.radius, h.height, h.radius);
          _m.compose(_v, _q, _s);
          inst.setMatrixAt(i, _m);
          _c.setHex(_clayColors[h.colorIdx]);
          inst.setColorAt(i, _c);
        }
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        ctx.boardGroup.add(inst);
        objs.push(inst);
      }
    }

    return { objs: objs, hills: hills };
  }

  function _createClayPile(radius, mat, ctx) {
    const g = new THREE.Group();

    const baseGeo = new THREE.SphereGeometry(radius, 20, 16);
    _smoothDeform(baseGeo, 0.14, 14, 0.62);
    const base = new THREE.Mesh(baseGeo, mat);
    base.position.y = radius * 0.32;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    for (let i = 0; i < 5; i++) {
      const lr = radius * (0.42 + ctx.rng() * 0.22);
      const lumpGeo = new THREE.SphereGeometry(lr, 12, 10);
      _smoothDeform(lumpGeo, 0.12, 11, 0.68);
      const lump = new THREE.Mesh(lumpGeo, mat);
      const a = (i / 5) * Math.PI * 2 + ctx.rng() * 0.7;
      const r = radius * 0.45 * ctx.rng();
      lump.position.set(
        Math.cos(a) * r,
        radius * (0.30 + ctx.rng() * 0.22),
        Math.sin(a) * r
      );
      lump.castShadow = true;
      g.add(lump);
    }

    const sheen = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.22, 12, 10), _clayWetMat);
    sheen.position.set(0, radius * 0.78, 0);
    sheen.scale.y = 0.4;
    g.add(sheen);

    return g;
  }

  // ★ ИСПРАВЛЕНО: принимает rng параметром
  function _pickDiggerPosition(cx, cz, pilePos, rng) {
    const baseAngle = Math.atan2(pilePos.z - cz, pilePos.x - cx);
    for (let i = 0; i < 40; i++) {
      const a = baseAngle + (rng() - 0.5) * Math.PI * 1.2;
      const r = CFG.DIGGER_WALK_ZONE_MIN +
                rng() * (CFG.DIGGER_WALK_ZONE_MAX - CFG.DIGGER_WALK_ZONE_MIN);
      let px = cx + Math.cos(a) * r;
      let pz = cz + Math.sin(a) * r;

      const maxR = _safeRadiusFor(0.05);
      const cl = _clampToHex(px, pz, cx, cz, maxR);
      px = cl[0]; pz = cl[1];

      const safe = _clampOutOfSafe(px, pz, cx, cz, CFG.WORKER_RADIUS + 0.02);
      px = safe[0]; pz = safe[1];

      if (Math.hypot(px - pilePos.x, pz - pilePos.z) > 0.55) continue;
      return { x: px, z: pz };
    }
    const cl = _clampToHex(cx - 0.42, cz + 0.24, cx, cz, _safeRadiusFor(0.05));
    const safe = _clampOutOfSafe(cl[0], cl[1], cx, cz, CFG.WORKER_RADIUS + 0.02);
    return { x: safe[0], z: safe[1] };
  }

  function _buildHillsDecor(cx, cy, cz, ctx) {
    const objs = [];

    const pilePos = { x: cx - 0.38, z: cz + 0.22 };
    const clPile = _clampToHex(pilePos.x, pilePos.z, cx, cz, _safeRadiusFor(0.09));
    pilePos.x = clPile[0]; pilePos.z = clPile[1];

    const edgeAngle = Math.PI * 0.65;
    const edgeR = _safeRadiusFor(0.10) * 0.85;
    const edgePos = {
      x: cx + Math.cos(edgeAngle) * edgeR,
      z: cz + Math.sin(edgeAngle) * edgeR,
    };

    const terrainResult = _buildClayTerrain(cx, cy, cz, ctx, [pilePos, edgePos]);
    terrainResult.objs.forEach(function(o) { objs.push(o); });
    const hills = terrainResult.hills;

    const mainPile = _createClayPile(0.085, _clayMats[0], ctx);
    mainPile.position.set(pilePos.x, cy, pilePos.z);
    ctx.boardGroup.add(mainPile);
    objs.push(mainPile);

    const edgePile = _createClayPile(0.095, _clayMats[2], ctx);
    edgePile.position.set(edgePos.x, cy, edgePos.z);
    ctx.boardGroup.add(edgePile);
    objs.push(edgePile);

    const digger = _createWorker('digger');
    // ★ ИСПРАВЛЕНО: передаём ctx.rng
    const digStart = _pickDiggerPosition(cx, cz, pilePos, ctx.rng);
    digger.position.set(digStart.x, cy, digStart.z);
    digger.rotation.y = Math.atan2(pilePos.x - digStart.x, pilePos.z - digStart.z);
    ctx.boardGroup.add(digger);
    objs.push(digger);

    const carrier = _createWorker('carrier');
    carrier.position.set(pilePos.x + 0.05, cy, pilePos.z + 0.14);
    ctx.boardGroup.add(carrier);
    objs.push(carrier);

    return {
      objs: objs,
      digger: digger,
      carrier: carrier,
      mainPile: mainPile,
      edgePile: edgePile,
      pilePos: pilePos,
      edgePos: edgePos,
      hills: hills,
      cx: cx, cy: cy, cz: cz,
    };
  }

  function _createHillsAnim(cx, cy, cz, ctx) {
    return { cx: cx, cy: cy, cz: cz, time: 0 };
  }

  function _updateHillsAnim(state, dt, now) {
    if (!state) return;
    state.time += dt;
    const t = state.time;

    const decor = state._decor;
    if (!decor) return;

    const cx = decor.cx, cz = decor.cz, cy = decor.cy;
    const hills = decor.hills || [];

    const cycle = (t * CFG.CARRIER_CYCLE_SPEED) % (Math.PI * 2);
    const prog = 0.5 - 0.5 * Math.cos(cycle);

    const pileScale = CFG.PILE_MIN_SCALE + (CFG.PILE_MAX_SCALE - CFG.PILE_MIN_SCALE) * prog;
    if (decor.mainPile) decor.mainPile.scale.setScalar(pileScale);
    if (decor.edgePile) decor.edgePile.scale.setScalar(0.72 + 0.46 * prog);

    const dg = decor.digger;
    if (dg) {
      if (!dg.userData.relocateTimer) {
        dg.userData.relocateTimer = CFG.DIGGER_RELOCATE_TIME;
        dg.userData.targetPos = { x: dg.position.x, z: dg.position.z };
        dg.userData.walking = false;
      }

      dg.userData.relocateTimer -= dt;
      if (dg.userData.relocateTimer <= 0) {
        dg.userData.relocateTimer = CFG.DIGGER_RELOCATE_TIME;
        // ★ ИСПРАВЛЕНО: используем state._ctx.rng
        dg.userData.targetPos = _pickDiggerPosition(cx, cz, decor.pilePos, state._ctx.rng);
        dg.userData.walking = true;
      }

      if (dg.userData.walking) {
        const tp = dg.userData.targetPos;
        const dx = tp.x - dg.position.x;
        const dz = tp.z - dg.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.02) {
          dg.userData.walking = false;
        } else {
          const step = Math.min(CFG.DIGGER_WALK_SPEED * dt, dist);
          let nx = dg.position.x + (dx / dist) * step;
          let nz = dg.position.z + (dz / dist) * step;

          const safe = _clampOutOfSafe(nx, nz, cx, cz, CFG.WORKER_RADIUS);
          nx = safe[0]; nz = safe[1];

          const cl = _clampToHex(nx, nz, cx, cz, _safeRadiusFor(0.05));
          dg.position.x = cl[0];
          dg.position.z = cl[1];

          const targetRot = Math.atan2(dx, dz);
          let dR = targetRot - dg.rotation.y;
          while (dR >  Math.PI) dR -= Math.PI * 2;
          while (dR < -Math.PI) dR += Math.PI * 2;
          dg.rotation.y += dR * Math.min(1, dt * CFG.WORKER_TURN_SMOOTH);

          const walk = Math.sin(t * 11) * 0.22;
          if (dg.userData.legL) dg.userData.legL.rotation.x =  walk;
          if (dg.userData.legR) dg.userData.legR.rotation.x = -walk;
        }
      } else {
        if (dg.userData.legL) dg.userData.legL.rotation.x *= 0.85;
        if (dg.userData.legR) dg.userData.legR.rotation.x *= 0.85;

        const digCycle = (t * CFG.DIG_ANIM_SPEED) % 1.0;
        let shovelAngle, torsoLean, shovelY;

        if (digCycle < 0.4) {
          const k = digCycle / 0.4;
          const eased = k * k * (3 - 2 * k);
          shovelAngle = -0.2 + 0.4 * eased;
          torsoLean = -0.06 + 0.04 * eased;
          shovelY = 0.06 + 0.03 * eased;
        } else if (digCycle < 0.6) {
          const k = (digCycle - 0.4) / 0.2;
          const eased = k * k;
          shovelAngle = 0.2 + 1.0 * eased;
          torsoLean = -0.02 + 0.28 * eased;
          shovelY = 0.09 - 0.05 * eased;
        } else if (digCycle < 0.7) {
          shovelAngle = 1.2;
          torsoLean = 0.26;
          shovelY = 0.04;
        } else {
          const k = (digCycle - 0.7) / 0.3;
          const eased = k * k * (3 - 2 * k);
          shovelAngle = 1.2 - 1.4 * eased;
          torsoLean = 0.26 - 0.32 * eased;
          shovelY = 0.04 + 0.02 * eased;
        }

        if (dg.userData.shovel) {
          dg.userData.shovel.rotation.x = shovelAngle;
          dg.userData.shovel.rotation.z = 0.5;
          dg.userData.shovel.position.y = shovelY;
        }
        if (dg.userData.bodyGroup) {
          dg.userData.bodyGroup.rotation.x = torsoLean;
        }
      }

      const safe2 = _clampOutOfSafe(dg.position.x, dg.position.z, cx, cz, CFG.WORKER_RADIUS);
      dg.position.x = safe2[0];
      dg.position.z = safe2[1];
      const groundOffset = _getGroundOffsetAt(dg.position.x, dg.position.z, hills);
      dg.position.y = cy + groundOffset;
    }

    const cr = decor.carrier;
    if (cr) {
      const barrow = cr.userData.barrow;
      const wheelPivot = barrow ? barrow.userData.wheel : null;
      const load = barrow ? barrow.userData.load : null;

      const start = decor.pilePos;
      const end = decor.edgePos;

      let px = start.x + (end.x - start.x) * prog;
      let pz = start.z + (end.z - start.z) * prog;

      const safe = _clampOutOfSafe(px, pz, cx, cz, CFG.WORKER_RADIUS);
      px = safe[0]; pz = safe[1];

      cr.position.x = px;
      cr.position.z = pz;

      const dProg = Math.sin(cycle);
      const dirX = (end.x - start.x) * Math.sign(dProg || 1);
      const dirZ = (end.z - start.z) * Math.sign(dProg || 1);

      if (Math.abs(dirX) + Math.abs(dirZ) > 0.001) {
        const targetRot = Math.atan2(dirX, dirZ);
        let dR = targetRot - cr.rotation.y;
        while (dR >  Math.PI) dR -= Math.PI * 2;
        while (dR < -Math.PI) dR += Math.PI * 2;
        cr.rotation.y += dR * Math.min(1, dt * 4);
      }

      if (load) {
        const loadAmt = dProg > 0 ? 1 : 0.15;
        const cur = load.scale.y / 0.55;
        const next = cur + (loadAmt - cur) * Math.min(1, dt * 3);
        load.scale.set(1, 0.55 * next, 1.3);
        load.visible = next > 0.25;
      }

      if (wheelPivot) {
        wheelPivot.rotation.x += dt * 7 * (dProg > 0 ? 1 : -1);
      }

      const groundOffset = _getGroundOffsetAt(px, pz, hills);
      cr.position.y = cy + groundOffset;

      const walk = Math.sin(t * 11) * 0.22;
      if (cr.userData.legL) cr.userData.legL.rotation.x =  walk;
      if (cr.userData.legR) cr.userData.legR.rotation.x = -walk;

      const safe2 = _clampOutOfSafe(cr.position.x, cr.position.z, cx, cz, CFG.WORKER_RADIUS);
      cr.position.x = safe2[0];
      cr.position.z = safe2[1];
    }
  }

  window.HexHills = {
    create: function (cx, cy, cz, ctx) {
      const decorData = _buildHillsDecor(cx, cy, cz, ctx);
      const anim = _createHillsAnim(cx, cy, cz, ctx);
      anim._decor = decorData;
      anim._ctx = ctx;
      return { decor: decorData.objs, anim: anim };
    },
    update: function (state, dt, now) {
      if (state && state.anim) _updateHillsAnim(state.anim, dt, now);
    },
    destroy: function (state) {
      if (state && state.decor) {
        state.decor.forEach(function (o) { if (o.parent) o.parent.remove(o); });
      }
    }
  };

  console.log('[HexHills] OK — детализированные рабочие, ctx.rng синхронизирован');
})();