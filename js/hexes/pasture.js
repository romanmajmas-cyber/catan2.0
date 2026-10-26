/* ============================================================
   pasture.js — пастбище с овцами, пастухом, забором и кустами
   ОПТИМИЗИРОВАНО: ctx.rng для детерминизма в мультиплеере
   ============================================================ */
(function () {
  'use strict';

  const CFG = {
    SHEEP_COUNT_MIN: 20,
    SHEEP_COUNT_MAX: 25,
    SHEEP_SCALE: 0.50,
    SHEEP_SPEED: 0.1,
    SHEEP_TURN_SPEED: 2.0,
    SHEEP_GRAZE_TIME_MIN: 2.0,
    SHEEP_GRAZE_TIME_MAX: 3.0,
    SHEEP_STEPS_MIN: 6,
    SHEEP_STEPS_MAX: 7,
    SHEEP_STEP_TIME: 0.7,
    SHEEP_MIN_DIST: 0.09,

    SHEPHERD_SCALE: 0.28,
    SHEPHERD_SPEED: 0.05,
    SHEPHERD_RADIUS: 0.60,
    SHEPHERD_AVOID_RADIUS: 0.14,
    SHEPHERD_AVOID_STRENGTH: 3.0,
    SHEPHERD_TURN_SMOOTH: 3.0,

    HEX_RADIUS: 0.9,
    HEX_MARGIN: 0.10,
    SAFE_ZONE_RADIUS: 0.13,

    FENCE_RADIUS_SCALE: 0.94,
    FENCE_POST_H: 0.08,
    FENCE_POST_W: 0.012,
    FENCE_RAIL_H: 0.008,
    FENCE_RAIL_T: 0.004,
    FENCE_POST_SPACING: 0.10,

    BUSH_COUNT: 10,
    BUSH_SCALE_MIN: 0.7,
    BUSH_SCALE_MAX: 1.3,
  };

  const _woodMat      = (typeof MAT !== 'undefined' && MAT.wood)     || new THREE.MeshStandardMaterial({ color: 0x8B6B3D, roughness: 0.85 });
  const _postMat      = (typeof MAT !== 'undefined' && MAT.woodDark) || new THREE.MeshStandardMaterial({ color: 0x5D4527, roughness: 0.9  });
  const _shepherdMat  = (typeof MAT !== 'undefined' && MAT.cloth)    || new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9  });
  const _shepherdSkin = (typeof MAT !== 'undefined' && MAT.skin)     || new THREE.MeshStandardMaterial({ color: 0xF1C27D, roughness: 0.8  });
  const _eyeMat       = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 });
  const _bushDarkMat  = new THREE.MeshStandardMaterial({ color: 0x2D4A1F, roughness: 0.95 });
  const _bushLightMat = new THREE.MeshStandardMaterial({ color: 0x4A7A2E, roughness: 0.95 });
  const _bushBerryMat = new THREE.MeshStandardMaterial({ color: 0x8B1A1A, roughness: 0.7  });

  const _sheepWoolHex = (typeof MAT !== 'undefined' && MAT.sheepWool && MAT.sheepWool.color)
    ? MAT.sheepWool.color.getHex() : 0xefe9d6;
  const _sheepSkinHex = (typeof MAT !== 'undefined' && MAT.sheepSkin && MAT.sheepSkin.color)
    ? MAT.sheepSkin.color.getHex() : 0xf1c27d;

  const _sheepMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: (typeof MAT !== 'undefined' && MAT.sheepWool && MAT.sheepWool.roughness) || 0.95,
    flatShading: false
  });

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
      const pos = it.geo.attributes.position.array;
      const nor = it.geo.attributes.normal.array;
      const c = new THREE.Color(it.color);
      positions.set(pos, offset * 3);
      normals.set(nor, offset * 3);
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

  let _sheepBodyGeo = null;
  let _sheepHeadGeo = null;

  function _getSheepBodyGeo() {
    if (_sheepBodyGeo) return _sheepBodyGeo;
    const items = [];

    const WOOL       = _sheepWoolHex;
    const WOOL_LIGHT = 0xfaf5e2;
    const WOOL_DARK  = 0xd6c9a8;
    const SKIN       = _sheepSkinHex;
    const HOOF       = 0x1f1a17;

    const CY = 0.072;

    const front = new THREE.SphereGeometry(0.058, 12, 9);
    front.scale(0.98, 0.86, 1.05);
    front.translate(0, CY - 0.006, 0.042);
    items.push({ geo: front, color: WOOL });

    const mid = new THREE.SphereGeometry(0.072, 14, 11);
    mid.scale(1.00, 0.86, 1.10);
    mid.translate(0, CY, -0.008);
    items.push({ geo: mid, color: WOOL });

    const rear = new THREE.SphereGeometry(0.068, 13, 10);
    rear.scale(1.04, 0.92, 1.06);
    rear.translate(0, CY + 0.004, -0.062);
    items.push({ geo: rear, color: WOOL });

    const bustle = new THREE.SphereGeometry(0.050, 11, 9);
    bustle.scale(1.10, 0.95, 0.90);
    bustle.translate(0, CY + 0.022, -0.094);
    items.push({ geo: bustle, color: WOOL_LIGHT });

    const chest = new THREE.SphereGeometry(0.044, 10, 8);
    chest.scale(1.06, 0.90, 0.95);
    chest.translate(0, CY - 0.008, 0.068);
    items.push({ geo: chest, color: WOOL_LIGHT });

    [-1, 1].forEach(function(side) {
      const ear = new THREE.SphereGeometry(0.013, 6, 5);
      ear.scale(0.65, 1.55, 0.55);
      ear.rotateZ(side * 0.55);
      ear.rotateX(-0.35);
      ear.translate(side * 0.031, 0.106, 0.118);
      items.push({ geo: ear, color: SKIN });
    });

    const legPositions = [
      [-0.040, -0.045], [0.040, -0.045],
      [-0.040,  0.048], [0.040,  0.048]
    ];
    legPositions.forEach(function(p) {
      const leg = new THREE.CylinderGeometry(0.0062, 0.0055, 0.058, 6);
      leg.translate(p[0], 0.029, p[1]);
      items.push({ geo: leg, color: SKIN });

      const hoof = new THREE.CylinderGeometry(0.0065, 0.006, 0.012, 6);
      hoof.translate(p[0], 0.006, p[1]);
      items.push({ geo: hoof, color: HOOF });
    });

    const tail = new THREE.SphereGeometry(0.018, 7, 6);
    tail.scale(1.0, 1.0, 1.3);
    tail.translate(0, CY + 0.010, -0.122);
    items.push({ geo: tail, color: WOOL });

    _sheepBodyGeo = _mergeGeomsWithColors(items);
    return _sheepBodyGeo;
  }

  function _getSheepHeadGeo() {
    if (_sheepHeadGeo) return _sheepHeadGeo;
    const items = [];

    const SKIN   = _sheepSkinHex;
    const MUZZLE = 0xf7dcb8;
    const NOSE   = 0x2b1a15;
    const EYE_W  = 0xffffff;
    const EYE_P  = 0x0a0a0a;
    const WOOL   = _sheepWoolHex;
    const WOOL_L = 0xfaf5e2;

    const head = new THREE.SphereGeometry(0.032, 12, 9);
    head.scale(0.86, 0.90, 1.12);
    items.push({ geo: head, color: SKIN });

    const muzzle = new THREE.SphereGeometry(0.022, 9, 7);
    muzzle.scale(0.95, 0.78, 1.15);
    muzzle.translate(0, -0.012, 0.028);
    items.push({ geo: muzzle, color: MUZZLE });

    const tuft = new THREE.SphereGeometry(0.024, 9, 7);
    tuft.scale(1.10, 0.72, 0.98);
    tuft.translate(0, 0.019, -0.003);
    items.push({ geo: tuft, color: WOOL_L });

    [-1, 1].forEach(function(side) {
      const sclera = new THREE.SphereGeometry(0.0075, 7, 6);
      sclera.scale(1, 1, 0.9);
      sclera.translate(side * 0.0155, 0.004, 0.022);
      items.push({ geo: sclera, color: EYE_W });

      const pupil = new THREE.SphereGeometry(0.004, 5, 4);
      pupil.translate(side * 0.017, 0.004, 0.0275);
      items.push({ geo: pupil, color: EYE_P });

      const shine = new THREE.SphereGeometry(0.0013, 4, 3);
      shine.translate(side * 0.018, 0.006, 0.030);
      items.push({ geo: shine, color: 0xffffff });
    });

    const nose = new THREE.SphereGeometry(0.008, 7, 5);
    nose.scale(1.35, 0.85, 0.7);
    nose.translate(0, -0.015, 0.048);
    items.push({ geo: nose, color: NOSE });

    [-1, 1].forEach(function(side) {
      const n = new THREE.SphereGeometry(0.0028, 4, 3);
      n.translate(side * 0.005, -0.014, 0.053);
      items.push({ geo: n, color: 0x000000 });
    });

    const mouth = new THREE.BoxGeometry(0.014, 0.0015, 0.002);
    mouth.translate(0, -0.021, 0.049);
    items.push({ geo: mouth, color: 0x3a2018 });

    const beard = new THREE.SphereGeometry(0.014, 7, 6);
    beard.scale(1.1, 0.78, 0.9);
    beard.translate(0, -0.023, 0.016);
    items.push({ geo: beard, color: WOOL });

    _sheepHeadGeo = _mergeGeomsWithColors(items);
    return _sheepHeadGeo;
  }

  function _createSheepModel(scaleMul) {
    scaleMul = scaleMul || 1;
    const g = new THREE.Group();

    const bodyMesh = new THREE.Mesh(_getSheepBodyGeo(), _sheepMat);
    bodyMesh.castShadow = true;
    g.add(bodyMesh);

    const headMesh = new THREE.Mesh(_getSheepHeadGeo(), _sheepMat);
    headMesh.position.set(0, 0.082, 0.126);
    headMesh.rotation.x = 0.15;
    headMesh.castShadow = true;
    g.add(headMesh);
    g.userData.head = headMesh;

    const s = CFG.SHEEP_SCALE * scaleMul;
    g.scale.set(s, s, s);
    return g;
  }

  function _createShepherdModel() {
    const g = new THREE.Group();

    const legGeo = new THREE.CylinderGeometry(0.018, 0.015, 0.09, 5);
    const legL = new THREE.Mesh(legGeo, _shepherdMat);
    legL.position.set(-0.022, 0.045, 0);
    legL.castShadow = true;
    g.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.022;
    g.add(legR);

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.17, 7), _shepherdMat);
    body.position.y = 0.175;
    body.castShadow = true;
    g.add(body);

    const armGeo = new THREE.CylinderGeometry(0.014, 0.012, 0.13, 5);
    const armL = new THREE.Mesh(armGeo, _shepherdMat);
    armL.position.set(-0.06, 0.19, 0.005);
    armL.rotation.z = 0.35;
    armL.castShadow = true;
    g.add(armL);
    const armR = new THREE.Mesh(armGeo, _shepherdMat);
    armR.position.set(0.06, 0.19, 0.005);
    armR.rotation.z = -0.35;
    armR.rotation.x = -0.15;
    armR.castShadow = true;
    g.add(armR);

    const handGeo = new THREE.SphereGeometry(0.018, 5, 4);
    const handL = new THREE.Mesh(handGeo, _shepherdSkin);
    handL.position.set(-0.085, 0.128, 0.008);
    g.add(handL);
    const handR = new THREE.Mesh(handGeo, _shepherdSkin);
    handR.position.set(0.083, 0.13, 0.005);
    g.add(handR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), _shepherdSkin);
    head.position.y = 0.30;
    head.castShadow = true;
    g.add(head);

    const eyeGeo = new THREE.SphereGeometry(0.007, 5, 4);
    const eyeL = new THREE.Mesh(eyeGeo, _eyeMat);
    eyeL.position.set(-0.017, 0.008, 0.043);
    head.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.017;
    head.add(eyeR);

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.008, 10), _postMat);
    brim.position.y = 0.345;
    brim.castShadow = true;
    g.add(brim);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.05, 0.045, 8), _postMat);
    top.position.y = 0.371;
    top.castShadow = true;
    g.add(top);

    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.46, 5), _woodMat);
    staff.position.set(0.10, 0.23, 0.01);
    staff.rotation.z = 0.10;
    staff.castShadow = true;
    g.add(staff);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 4, 10, Math.PI * 1.2), _woodMat);
    hook.position.set(0.10 + Math.sin(0.10) * 0.23, 0.23 + Math.cos(0.10) * 0.23, 0.01);
    hook.rotation.z = Math.PI / 2 + 0.10;
    g.add(hook);

    const s = CFG.SHEPHERD_SCALE;
    g.scale.set(s, s, s);
    return g;
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

  function _buildPerimeterFence(cx, cy, cz, ctx, objs) {
    const Rf = CFG.HEX_RADIUS * CFG.FENCE_RADIUS_SCALE;

    const verts = [];
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      verts.push({
        x: cx + Math.cos(a) * Rf,
        z: cz + Math.sin(a) * Rf,
      });
    }

    const postData = [];
    const railData = [];

    for (let i = 0; i < 6; i++) {
      const v1 = verts[i];
      const v2 = verts[(i + 1) % 6];
      const dx = v2.x - v1.x;
      const dz = v2.z - v1.z;
      const sideLen = Math.hypot(dx, dz);
      const midX = (v1.x + v2.x) / 2;
      const midZ = (v1.z + v2.z) / 2;
      const railRotY = Math.atan2(-dz, dx);

      const postCount = Math.max(2, Math.round(sideLen / CFG.FENCE_POST_SPACING) + 1);
      for (let j = 0; j < postCount; j++) {
        const t = j / (postCount - 1);
        postData.push({ x: v1.x + dx * t, z: v1.z + dz * t });
      }

      [CFG.FENCE_POST_H * 0.75, CFG.FENCE_POST_H * 0.38].forEach(function(y) {
        railData.push({ x: midX, z: midZ, rotY: railRotY, y: y, len: sideLen });
      });
    }

    const postGeo = new THREE.BoxGeometry(CFG.FENCE_POST_W, CFG.FENCE_POST_H, CFG.FENCE_POST_W);
    const postInst = new THREE.InstancedMesh(postGeo, _postMat, postData.length);
    postInst.castShadow = true;
    postInst.receiveShadow = true;
    const _m4 = new THREE.Matrix4();
    const _v = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < postData.length; i++) {
      _v.set(postData[i].x, cy + CFG.FENCE_POST_H / 2, postData[i].z);
      _m4.compose(_v, _q, _s);
      postInst.setMatrixAt(i, _m4);
    }
    postInst.instanceMatrix.needsUpdate = true;
    ctx.boardGroup.add(postInst);
    objs.push(postInst);

    const railUnitGeo = new THREE.BoxGeometry(1, CFG.FENCE_RAIL_H, CFG.FENCE_RAIL_T);
    const railInst = new THREE.InstancedMesh(railUnitGeo, _woodMat, railData.length);
    railInst.castShadow = true;
    railInst.receiveShadow = true;
    const _e = new THREE.Euler();
    for (let i = 0; i < railData.length; i++) {
      const r = railData[i];
      _e.set(0, r.rotY, 0);
      _q.setFromEuler(_e);
      _v.set(r.x, cy + r.y, r.z);
      _s.set(r.len, 1, 1);
      _m4.compose(_v, _q, _s);
      railInst.setMatrixAt(i, _m4);
    }
    railInst.instanceMatrix.needsUpdate = true;
    ctx.boardGroup.add(railInst);
    objs.push(railInst);
  }

  const _bushPartsTemplate = [
    { x:  0.00,  y: 0.045, z:  0.00,  r: 0.048, mat: 'dark'  },
    { x:  0.030, y: 0.060, z:  0.020, r: 0.038, mat: 'light' },
    { x: -0.030, y: 0.052, z:  0.012, r: 0.036, mat: 'light' },
    { x:  0.008, y: 0.075, z: -0.028, r: 0.034, mat: 'dark'  },
    { x: -0.012, y: 0.030, z: -0.038, r: 0.030, mat: 'dark'  },
  ];

  function _buildBushInstances(bushPositions, scales, cy, ctx, objs) {
    const darkData = [];
    const lightData = [];

    for (let b = 0; b < bushPositions.length; b++) {
      const bp = bushPositions[b];
      const bs = scales[b];
      for (let p = 0; p < _bushPartsTemplate.length; p++) {
        const part = _bushPartsTemplate[p];
        const wx = bp.x + part.x * bs;
        const wz = bp.z + part.z * bs;
        const wy = cy + part.y * bs;
        const wr = part.r * bs;
        const entry = { x: wx, y: wy, z: wz, r: wr };
        if (part.mat === 'dark') darkData.push(entry);
        else lightData.push(entry);
      }
    }

    const _m4 = new THREE.Matrix4();
    const _v = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _s = new THREE.Vector3();
    const unitSphere = new THREE.SphereGeometry(1, 7, 6);

    function makeSphereInst(data, mat) {
      if (data.length === 0) return null;
      const inst = new THREE.InstancedMesh(unitSphere, mat, data.length);
      inst.castShadow = true;
      inst.receiveShadow = true;
      for (let i = 0; i < data.length; i++) {
        _v.set(data[i].x, data[i].y, data[i].z);
        _s.set(data[i].r, data[i].r * 0.85, data[i].r);
        _m4.compose(_v, _q, _s);
        inst.setMatrixAt(i, _m4);
      }
      inst.instanceMatrix.needsUpdate = true;
      return inst;
    }

    const darkInst = makeSphereInst(darkData, _bushDarkMat);
    if (darkInst) { ctx.boardGroup.add(darkInst); objs.push(darkInst); }

    const lightInst = makeSphereInst(lightData, _bushLightMat);
    if (lightInst) { ctx.boardGroup.add(lightInst); objs.push(lightInst); }

    const berryData = [];
    for (let b = 0; b < bushPositions.length; b++) {
      if (ctx.rng() >= 0.6) continue;
      const bp = bushPositions[b];
      const bs = scales[b];
      for (let i = 0; i < 2; i++) {
        const a = ctx.rng() * Math.PI * 2;
        const r = 0.03 + ctx.rng() * 0.02;
        berryData.push({
          x: bp.x + Math.cos(a) * r * bs,
          y: cy + (0.05 + ctx.rng() * 0.03) * bs,
          z: bp.z + Math.sin(a) * r * bs,
          r: 0.008 * bs
        });
      }
    }
    if (berryData.length > 0) {
      const berryGeo = new THREE.SphereGeometry(1, 5, 4);
      const berryInst = new THREE.InstancedMesh(berryGeo, _bushBerryMat, berryData.length);
      for (let i = 0; i < berryData.length; i++) {
        _v.set(berryData[i].x, berryData[i].y, berryData[i].z);
        _s.set(berryData[i].r, berryData[i].r, berryData[i].r);
        _m4.compose(_v, _q, _s);
        berryInst.setMatrixAt(i, _m4);
      }
      berryInst.instanceMatrix.needsUpdate = true;
      ctx.boardGroup.add(berryInst);
      objs.push(berryInst);
    }
  }

  function _buildGrassTufts(cx, cy, cz, ctx, objs) {
    const tuftData = [];
    for (let i = 0; i < 8; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = 0.46 + ctx.rng() * 0.25;
      const gx = cx + Math.cos(a) * d;
      const gz = cz + Math.sin(a) * d;
      if (Math.hypot(gx - cx, gz - cz) < CFG.SAFE_ZONE_RADIUS) continue;
      tuftData.push({
        x: gx, z: gz,
        h: 0.09 + ctx.rng() * 0.04,
        rotY: ctx.rng() * Math.PI * 2
      });
    }
    if (tuftData.length === 0) return;

    const unitCone = new THREE.ConeGeometry(0.04, 1, 4);
    const inst = new THREE.InstancedMesh(unitCone, MAT.grass, tuftData.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    const _m4 = new THREE.Matrix4();
    const _v = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    const _e = new THREE.Euler();
    const _s = new THREE.Vector3();
    for (let i = 0; i < tuftData.length; i++) {
      const t = tuftData[i];
      _e.set(0, t.rotY, 0);
      _q.setFromEuler(_e);
      _v.set(t.x, cy + t.h / 2, t.z);
      _s.set(1, t.h, 1);
      _m4.compose(_v, _q, _s);
      inst.setMatrixAt(i, _m4);
    }
    inst.instanceMatrix.needsUpdate = true;
    ctx.boardGroup.add(inst);
    objs.push(inst);
  }

  function _buildPastureDecor(cx, cy, cz, ctx) {
    const objs = [];

    _buildPerimeterFence(cx, cy, cz, ctx, objs);

    const maxRForBush = CFG.HEX_RADIUS * CFG.FENCE_RADIUS_SCALE - 0.05;
    let placedBushes = 0, bushAttempts = 0;
    const bushPositions = [];
    const bushScales = [];
    while (placedBushes < CFG.BUSH_COUNT && bushAttempts < 200) {
      bushAttempts++;
      const a = ctx.rng() * Math.PI * 2;
      const r = Math.sqrt(ctx.rng()) * maxRForBush;
      const bx = cx + Math.cos(a) * r;
      const bz = cz + Math.sin(a) * r;

      if (Math.hypot(bx - cx, bz - cz) < CFG.SAFE_ZONE_RADIUS + 0.06) continue;

      let ok = true;
      for (let k = 0; k < bushPositions.length; k++) {
        if (Math.hypot(bushPositions[k].x - bx, bushPositions[k].z - bz) < 0.12) { ok = false; break; }
      }
      if (!ok) continue;

      bushPositions.push({ x: bx, z: bz });
      bushScales.push(CFG.BUSH_SCALE_MIN + ctx.rng() * (CFG.BUSH_SCALE_MAX - CFG.BUSH_SCALE_MIN));
      placedBushes++;
    }
    _buildBushInstances(bushPositions, bushScales, cy, ctx, objs);

    _buildGrassTufts(cx, cy, cz, ctx, objs);

    const targetCount = CFG.SHEEP_COUNT_MIN + Math.floor(
      ctx.rng() * (CFG.SHEEP_COUNT_MAX - CFG.SHEEP_COUNT_MIN + 1)
    );
    const placed = [];
    const maxR = CFG.HEX_RADIUS * (1 - CFG.HEX_MARGIN) - 0.06;
    let attempts = 0;
    const minSpawnDist = CFG.SHEEP_MIN_DIST * 1.5;

    while (placed.length < targetCount && attempts < 1500) {
      attempts++;
      const a = ctx.rng() * Math.PI * 2;
      const r = Math.sqrt(ctx.rng()) * maxR;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;

      if (Math.hypot(px - cx, pz - cz) < CFG.SAFE_ZONE_RADIUS + 0.04) continue;

      let ok = true;
      for (let k = 0; k < placed.length; k++) {
        if (Math.hypot(placed[k].x - px, placed[k].z - pz) < minSpawnDist) { ok = false; break; }
      }
      if (!ok) continue;
      for (let k = 0; k < bushPositions.length; k++) {
        if (Math.hypot(bushPositions[k].x - px, bushPositions[k].z - pz) < 0.10) { ok = false; break; }
      }
      if (!ok) continue;

      placed.push({ x: px, z: pz });
    }

    const sheepList = [];
    placed.forEach(function (p) {
      const sheep = _createSheepModel();
      sheep.position.set(p.x, cy, p.z);
      ctx.boardGroup.add(sheep);
      objs.push(sheep);
      sheepList.push(sheep);
    });

    const shepherd = _createShepherdModel();
    shepherd.position.set(cx + CFG.SHEPHERD_RADIUS, cy, cz);
    shepherd.rotation.y = Math.PI / 2;
    ctx.boardGroup.add(shepherd);
    objs.push(shepherd);

    return { objs: objs, sheepList: sheepList, shepherd: shepherd };
  }

  function _createPastureAnim(cx, cy, cz, ctx, decorData) {
    const sheepStates = decorData.sheepList.map(function (mesh) {
      const angle = ctx.rng() * Math.PI * 2;
      const startGraze = ctx.rng() < 0.5;
      return {
        mesh: mesh,
        angle: angle,
        targetAngle: angle,
        state: startGraze ? 'GRAZE' : 'WALK',
        timer: startGraze
          ? (CFG.SHEEP_GRAZE_TIME_MIN + ctx.rng() * (CFG.SHEEP_GRAZE_TIME_MAX - CFG.SHEEP_GRAZE_TIME_MIN))
          : (0.5 + ctx.rng() * 2),
        stepsLeft: CFG.SHEEP_STEPS_MIN + Math.floor(ctx.rng() * (CFG.SHEEP_STEPS_MAX - CFG.SHEEP_STEPS_MIN + 1)),
        stepTimer: CFG.SHEEP_STEP_TIME * ctx.rng(),
        headY: startGraze ? 0.045 : 0.082,
        targetHeadY: startGraze ? 0.045 : 0.082,
        bobPhase: ctx.rng() * Math.PI * 2,
        baseY: cy,
      };
    });

    return {
      cx: cx, cz: cz,
      ctx: ctx,
      sheep: sheepStates,
      shepherd: { mesh: decorData.shepherd },
      localTime: 0,
    };
  }

  function _updatePastureAnim(state, dt, now) {
    if (!state || !state.sheep) return;

    state.localTime += dt;
    const t = state.localTime;

    const cx = state.cx, cz = state.cz;
    const R = CFG.HEX_RADIUS;
    const safeR = CFG.SAFE_ZONE_RADIUS;
    const sheep = state.sheep;
    const n = sheep.length;
    const maxR = R * (1 - CFG.HEX_MARGIN) - 0.02;

    for (let i = 0; i < n; i++) {
      const s = sheep[i];

      if (s.state === 'WALK') {
        s.timer -= dt;
        s.stepTimer -= dt;

        let dA = s.targetAngle - s.angle;
        while (dA >  Math.PI) dA -= Math.PI * 2;
        while (dA < -Math.PI) dA += Math.PI * 2;
        const maxTurn = CFG.SHEEP_TURN_SPEED * dt;
        if (Math.abs(dA) > maxTurn) dA = Math.sign(dA) * maxTurn;
        s.angle += dA;

        s.mesh.position.x += Math.cos(s.angle) * CFG.SHEEP_SPEED * dt;
        s.mesh.position.z += Math.sin(s.angle) * CFG.SHEEP_SPEED * dt;

        if (s.stepTimer <= 0) {
          s.stepsLeft--;
          s.stepTimer = CFG.SHEEP_STEP_TIME;
        }

        if (s.stepsLeft <= 0 || s.timer <= 0) {
          s.state = 'GRAZE';
          s.timer = CFG.SHEEP_GRAZE_TIME_MIN + state.ctx.rng() * (CFG.SHEEP_GRAZE_TIME_MAX - CFG.SHEEP_GRAZE_TIME_MIN);
          s.targetHeadY = 0.045;
        }
      } else {
        s.timer -= dt;
        if (s.timer <= 0) {
          s.state = 'WALK';
          s.stepsLeft = CFG.SHEEP_STEPS_MIN + Math.floor(state.ctx.rng() * (CFG.SHEEP_STEPS_MAX - CFG.SHEEP_STEPS_MIN + 1));
          s.stepTimer = CFG.SHEEP_STEP_TIME;
          s.targetHeadY = 0.082;
          s.targetAngle = s.angle + (state.ctx.rng() - 0.5) * Math.PI * 1.7;
        }
      }

      s.headY += (s.targetHeadY - s.headY) * Math.min(1, dt * 4);
    }

    const pushX = new Array(n).fill(0);
    const pushZ = new Array(n).fill(0);
    const minD = CFG.SHEEP_MIN_DIST;
    const minD2 = minD * minD;

    for (let i = 0; i < n; i++) {
      const pi = sheep[i].mesh.position;
      for (let j = i + 1; j < n; j++) {
        const pj = sheep[j].mesh.position;
        const dx = pi.x - pj.x;
        const dz = pi.z - pj.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < minD2 && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const force = ((minD - d) / minD) * 0.5;
          const fx = (dx / d) * force;
          const fz = (dz / d) * force;
          pushX[i] += fx; pushZ[i] += fz;
          pushX[j] -= fx; pushZ[j] -= fz;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      const s = sheep[i];
      const mesh = s.mesh;

      let newX = mesh.position.x + pushX[i];
      let newZ = mesh.position.z + pushZ[i];

      const sdx = newX - cx;
      const sdz = newZ - cz;
      const sd2 = sdx * sdx + sdz * sdz;
      if (sd2 < safeR * safeR) {
        const d = Math.sqrt(sd2) || 1e-6;
        newX = cx + (sdx / d) * safeR;
        newZ = cz + (sdz / d) * safeR;
      }

      const clamped = _clampToHex(newX, newZ, cx, cz, maxR);
      mesh.position.x = clamped[0];
      mesh.position.z = clamped[1];

      mesh.rotation.y = Math.PI / 2 - s.angle;

      const bob = Math.sin(t * 6 + s.bobPhase) * 0.003;
      if (mesh.userData.head) {
        mesh.userData.head.position.y = s.headY + bob;
      }

      if (s.state === 'WALK') {
        mesh.position.y = s.baseY + Math.abs(Math.sin(t * 8 + s.bobPhase)) * 0.0015;
      } else {
        mesh.position.y += (s.baseY - mesh.position.y) * Math.min(1, dt * 8);
      }
    }

    const sh = state.shepherd;
    if (sh && sh.mesh) {
      const mesh = sh.mesh;
      const px = mesh.position.x;
      const pz = mesh.position.z;

      const angleAround = Math.atan2(pz - cz, px - cx);
      const r = Math.hypot(px - cx, pz - cz);

      let vx = -Math.sin(angleAround);
      let vz =  Math.cos(angleAround);

      const radialErr = r - CFG.SHEPHERD_RADIUS;
      vx -= Math.cos(angleAround) * radialErr * 3.0;
      vz -= Math.sin(angleAround) * radialErr * 3.0;

      const avoidR = CFG.SHEPHERD_AVOID_RADIUS;
      for (let i = 0; i < n; i++) {
        const sp = sheep[i].mesh.position;
        const dx = px - sp.x;
        const dz = pz - sp.z;
        const d = Math.hypot(dx, dz);
        if (d < avoidR && d > 1e-6) {
          const strength = ((avoidR - d) / avoidR) * CFG.SHEPHERD_AVOID_STRENGTH;
          vx += (dx / d) * strength;
          vz += (dz / d) * strength;
        }
      }

      const dSafeR = safeR + 0.06;
      if (r < dSafeR && r > 1e-6) {
        const strength = ((dSafeR - r) / dSafeR) * 3.0;
        vx += (px - cx) / r * strength;
        vz += (pz - cz) / r * strength;
      }

      const vLen = Math.hypot(vx, vz);
      if (vLen > 1e-6) {
        vx /= vLen;
        vz /= vLen;

        const nx = px + vx * CFG.SHEPHERD_SPEED * dt;
        const nz = pz + vz * CFG.SHEPHERD_SPEED * dt;

        const cl = _clampToHex(nx, nz, cx, cz, R * CFG.FENCE_RADIUS_SCALE - 0.04);
        mesh.position.x = cl[0];
        mesh.position.z = cl[1];
      }

      const targetRot = Math.atan2(vx, vz);
      let dR = targetRot - mesh.rotation.y;
      while (dR >  Math.PI) dR -= Math.PI * 2;
      while (dR < -Math.PI) dR += Math.PI * 2;
      mesh.rotation.y += dR * Math.min(1, dt * CFG.SHEPHERD_TURN_SMOOTH);
    }
  }

  window.HexPasture = {
    create: function (cx, cy, cz, ctx) {
      const decorData = _buildPastureDecor(cx, cy, cz, ctx);
      const anim = _createPastureAnim(cx, cy, cz, ctx, decorData);
      return { decor: decorData.objs, anim: anim };
    },
    update: function (state, dt, now) {
      if (state && state.anim) _updatePastureAnim(state.anim, dt, now);
    },
    destroy: function (state) {
      if (state && state.decor) {
        state.decor.forEach(function (o) {
          if (o.parent) o.parent.remove(o);
        });
      }
    }
  };

  console.log('[HexPasture] OK — гладкие объёмные овцы, ctx.rng синхронизирован');
})();