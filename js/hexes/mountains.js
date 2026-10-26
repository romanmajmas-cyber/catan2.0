/* ============================================================
   mountains.js — горный гекс: рельеф, камни, шахтёры, экскаватор
   ИСПРАВЛЕНО: clampToHex баг, детерминированный hasExcavator, IIFE
   ============================================================ */
(function () {
  'use strict';

  // ==================== МАТЕРИАЛЫ КАМНЕЙ ====================
  let _mountainsRockMats = null;
  function _getRockMats() {
    if (_mountainsRockMats) return _mountainsRockMats;
    _mountainsRockMats = [
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.98, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.97, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.97, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.96, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x707070, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.94, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.98, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.98, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 0.97, flatShading: true })
    ];
    return _mountainsRockMats;
  }
  function _randRockMat(ctx) {
    const mats = _getRockMats();
    return mats[Math.floor(ctx.rng() * mats.length)];
  }

  // ==================== КЭШИРОВАННАЯ ГЕОМЕТРИЯ ====================
  let _unitRockGeo = null;
  function _getUnitRockGeo(ctx) {
    if (_unitRockGeo) return _unitRockGeo;
    _unitRockGeo = _makeRockGeometry(1, ctx);
    return _unitRockGeo;
  }

  let _unitMoundGeo = null;
  function _getUnitMoundGeo() {
    if (_unitMoundGeo) return _unitMoundGeo;
    _unitMoundGeo = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    return _unitMoundGeo;
  }

  const _m4tmp = new THREE.Matrix4();
  const _qtmp  = new THREE.Quaternion();
  const _etmp  = new THREE.Euler();
  const _vtmp  = new THREE.Vector3();
  const _stmp  = new THREE.Vector3();

  function _makeRockGeometry(size, ctx) {
    const geo = new THREE.IcosahedronGeometry(size, 0);
    const pos = geo.attributes.position;
    const sq = 0.80 + ctx.rng() * 0.22;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const nx = 0.88 + ctx.rng() * 0.24;
      const nz = 0.88 + ctx.rng() * 0.24;
      pos.setXYZ(i, x * nx, y * sq, z * nz);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  function _jaggedCone(r, h, rSeg, hSeg, seed, scale) {
    const s = scale || 1;
    const geo = new THREE.ConeGeometry(r, h, rSeg, hSeg);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const rad = Math.hypot(x, z);
      if (rad < 0.0001) continue;
      const a = Math.atan2(z, x);
      const n = 1
        + Math.sin(a * 2.7 + seed * 1.3) * 0.16 * s
        + Math.cos(a * 4.3 - seed * 2.1) * 0.10 * s
        + Math.sin(a * 6.1 + seed * 0.7) * 0.05 * s
        + Math.sin(a * 9.5 - seed * 3.7) * 0.03 * s;
      const yNoise = Math.sin(a * 3.3 + seed) * h * 0.04 * s;
      pos.setX(i, x * n);
      pos.setZ(i, z * n);
      pos.setY(i, y + yNoise);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  // ==================== СБОРКА ДЕКОРАЦИЙ ====================
  function _buildRockyGround(cx, cy, cz, ctx, objs) {
    const g = new THREE.Group();
    const groundMat  = new THREE.MeshStandardMaterial({ color: 0x6a5a4a, roughness: 1, flatShading: true });
    const groundMat2 = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1, flatShading: true });

    const R = 0.84;
    const geo = new THREE.CircleGeometry(R, 40, 0, Math.PI * 2);
    const pos = geo.attributes.position;
    const innerR = SAFE_RADIUS + 0.02;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const r = Math.hypot(x, y);
      const k = Math.max(0, Math.min(1, (r - innerR) / (R - innerR)));
      const k2 = k * k;
      const noise =
        Math.sin(x * 19 + 3.1) * Math.cos(y * 14 - 1.7) * 0.011 +
        Math.sin(x * 7 - y * 11) * 0.006 +
        Math.sin(x * 33 + y * 21) * 0.003;
      pos.setZ(i, noise * k2);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const ground = new THREE.Mesh(geo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, cy + 0.001, cz);
    ground.receiveShadow = true;
    g.add(ground);

    const mounds = 12 + Math.floor(ctx.rng() * 8);
    const moundsByMat = [[], []];
    for (let i = 0; i < mounds; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = innerR + 0.06 + ctx.rng() * (R - innerR - 0.12);
      const mr = 0.030 + ctx.rng() * 0.050;
      const mh = 0.006 + ctx.rng() * 0.014;
      moundsByMat[ctx.rng() < 0.5 ? 0 : 1].push({
        x: cx + Math.cos(a) * d,
        z: cz + Math.sin(a) * d,
        mr: mr, mh: mh
      });
    }

    const unitMoundGeo = _getUnitMoundGeo();
    for (let m = 0; m < moundsByMat.length; m++) {
      const list = moundsByMat[m];
      if (list.length === 0) continue;
      const inst = new THREE.InstancedMesh(unitMoundGeo, m === 0 ? groundMat : groundMat2, list.length);
      inst.receiveShadow = true;
      inst.castShadow = false;
      for (let i = 0; i < list.length; i++) {
        const md = list[i];
        _vtmp.set(md.x, cy + 0.001, md.z);
        _qtmp.set(0, 0, 0, 1);
        _stmp.set(md.mr, md.mh, md.mr);
        _m4tmp.compose(_vtmp, _qtmp, _stmp);
        inst.setMatrixAt(i, _m4tmp);
      }
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    ctx.boardGroup.add(g);
    objs.push(g);
    return g;
  }

  function _mountainsPeak(px, py, pz, radius, height, snowAmount, ctx) {
    const g = new THREE.Group();
    const matTop  = _randRockMat(ctx);
    const matMid  = _randRockMat(ctx);
    const matBase = _randRockMat(ctx);

    const baseGeo = _jaggedCone(radius * 1.10, height * 0.28, 7, 2, 0.5, 0.8);
    const base = new THREE.Mesh(baseGeo, matBase);
    base.position.y = height * 0.14;
    base.rotation.y = ctx.rng() * Math.PI * 2;
    base.castShadow = true; base.receiveShadow = true;
    g.add(base);

    const midGeo = _jaggedCone(radius * 0.85, height * 0.40, 7, 3, 1.7, 1.0);
    const mid = new THREE.Mesh(midGeo, matMid);
    mid.position.y = height * 0.34;
    mid.rotation.y = ctx.rng() * Math.PI * 2;
    mid.castShadow = true; mid.receiveShadow = true;
    g.add(mid);

    const topGeo = _jaggedCone(radius * 0.55, height * 0.42, 6, 3, 2.9, 1.2);
    const top = new THREE.Mesh(topGeo, matTop);
    top.position.y = height * 0.72;
    top.rotation.y = ctx.rng() * Math.PI * 2;
    top.castShadow = true;
    g.add(top);

    const spireGeo = _jaggedCone(radius * 0.22, height * 0.22, 5, 2, 4.3, 1.4);
    const spire = new THREE.Mesh(spireGeo, matTop);
    spire.position.y = height * 0.94;
    spire.rotation.y = ctx.rng() * Math.PI * 2;
    spire.castShadow = true;
    g.add(spire);

    const spurs = 3 + Math.floor(ctx.rng() * 3);
    for (let i = 0; i < spurs; i++) {
      const a = (i / spurs) * Math.PI * 2 + ctx.rng() * 0.9;
      const d = radius * (0.60 + ctx.rng() * 0.40);
      const sh = height * (0.25 + ctx.rng() * 0.25);
      const sr = radius * (0.28 + ctx.rng() * 0.25);
      const spurGeo = _jaggedCone(sr, sh, 6, 2, i * 2.7 + 0.5, 1.0);
      const spur = new THREE.Mesh(spurGeo, _randRockMat(ctx));
      spur.position.set(Math.cos(a) * d, sh / 2, Math.sin(a) * d);
      spur.rotation.y = ctx.rng() * Math.PI * 2;
      spur.rotation.z = Math.cos(a) * 0.15;
      spur.rotation.x = Math.sin(a) * 0.15;
      spur.castShadow = true;
      spur.receiveShadow = true;
      g.add(spur);
    }

    const outcrops = 4 + Math.floor(ctx.rng() * 4);
    const outcropsByMat = _getRockMats().map(function() { return []; });
    for (let i = 0; i < outcrops; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = radius * (0.30 + ctx.rng() * 0.55);
      const y = height * (0.10 + ctx.rng() * 0.55);
      const s = radius * (0.08 + ctx.rng() * 0.10);
      const matIdx = Math.floor(ctx.rng() * _getRockMats().length);
      outcropsByMat[matIdx].push({
        x: Math.cos(a) * r, y: y, z: Math.sin(a) * r, s: s,
        rotX: ctx.rng() * Math.PI, rotY: ctx.rng() * Math.PI, rotZ: ctx.rng() * Math.PI
      });
    }
    const unitRockGeo = _getUnitRockGeo(ctx);
    for (let m = 0; m < outcropsByMat.length; m++) {
      const list = outcropsByMat[m];
      if (list.length === 0) continue;
      const inst = new THREE.InstancedMesh(unitRockGeo, _getRockMats()[m], list.length);
      inst.castShadow = true;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        _etmp.set(o.rotX, o.rotY, o.rotZ);
        _qtmp.setFromEuler(_etmp);
        _vtmp.set(o.x, o.y, o.z);
        _stmp.set(o.s, o.s * 0.85, o.s);
        _m4tmp.compose(_vtmp, _qtmp, _stmp);
        inst.setMatrixAt(i, _m4tmp);
      }
      inst.instanceMatrix.needsUpdate = true;
      g.add(inst);
    }

    if (snowAmount > 0) {
      const capH = height * snowAmount * 0.9;
      const capR = radius * 0.42;
      const capGeo = new THREE.ConeGeometry(capR, capH, 6, 2);
      const cp = capGeo.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        const x = cp.getX(i), z = cp.getZ(i);
        const rad = Math.hypot(x, z);
        if (rad < 0.0001) continue;
        const a = Math.atan2(z, x);
        const n = 1 + Math.sin(a * 3 + 1.3) * 0.20 + Math.cos(a * 5 - 2.1) * 0.12;
        cp.setX(i, x * n);
        cp.setZ(i, z * n);
      }
      cp.needsUpdate = true;
      capGeo.computeVertexNormals();
      const cap = new THREE.Mesh(capGeo, MAT.snow);
      cap.position.y = height - capH / 2 + height * 0.02;
      cap.rotation.y = ctx.rng() * Math.PI;
      cap.castShadow = true;
      g.add(cap);

      const patches = 2 + Math.floor(ctx.rng() * 3);
      for (let i = 0; i < patches; i++) {
        const a = ctx.rng() * Math.PI * 2;
        const r = radius * (0.25 + ctx.rng() * 0.40);
        const y = height * (0.35 + ctx.rng() * 0.40);
        const s = radius * (0.10 + ctx.rng() * 0.10);
        const patch = new THREE.Mesh(new THREE.SphereGeometry(s, 6, 5), MAT.snow);
        patch.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        patch.scale.y = 0.4;
        patch.castShadow = true;
        g.add(patch);
      }
    }

    g.position.set(px, py, pz);
    return g;
  }

  function _mountainsRock(px, py, pz, size, ctx) {
    const geo = _makeRockGeometry(size, ctx);
    const rock = new THREE.Mesh(geo, _randRockMat(ctx));
    rock.position.set(px, py + size * 0.60, pz);
    rock.rotation.set(ctx.rng() * Math.PI, ctx.rng() * Math.PI, ctx.rng() * Math.PI);
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  }

  function _buildMountainsDecor(cx, cy, cz, ctx) {
    const objs = [];
    const peakInfo = [];
    const rockInfo = [];

    _buildRockyGround(cx, cy, cz, ctx, objs);

    const baseAngle = ctx.rng() * Math.PI * 2;
    const peakData = [
      { angle: baseAngle,                  dist: 0.60, r: 0.15, h: 0.42, snow: 0.35 },
      { angle: baseAngle + Math.PI * 0.66, dist: 0.58, r: 0.17, h: 0.48, snow: 0.40 },
      { angle: baseAngle + Math.PI * 1.33, dist: 0.56, r: 0.13, h: 0.36, snow: 0.30 }
    ];

    peakData.forEach(function(p) {
      let px = cx + Math.cos(p.angle) * p.dist;
      let pz = cz + Math.sin(p.angle) * p.dist;
      const dC = Math.hypot(px - cx, pz - cz);
      const minD = SAFE_RADIUS + 0.06;
      if (dC < minD) {
        const k = minD / Math.max(dC, 0.001);
        px = cx + (px - cx) * k;
        pz = cz + (pz - cz) * k;
      }
      if (typeof clampToHex === 'function') {
        const c = clampToHex(px, pz, cx, cz, 0.82);
        px = c.x; pz = c.z;
      }
      const peak = _mountainsPeak(px, cy, pz, p.r, p.h, p.snow, ctx);
      ctx.boardGroup.add(peak);
      objs.push(peak);
      peakInfo.push({ x: px, z: pz, r: p.r, h: p.h });
    });

    const rockCount = 20 + Math.floor(ctx.rng() * 12);
    const rockMats = _getRockMats();
    const rocksByMat = rockMats.map(function() { return []; });

    for (let i = 0; i < rockCount; i++) {
      let placed = false, attempts = 0;
      while (!placed && attempts < 25) {
        attempts++;
        const a = ctx.rng() * Math.PI * 2;
        const d = 0.34 + ctx.rng() * 0.36;
        const rx = cx + Math.cos(a) * d;
        const rz = cz + Math.sin(a) * d;
        if (Math.hypot(rx - cx, rz - cz) < SAFE_RADIUS + 0.06) continue;
        const dx = rx - cx, dz = rz - cz;
        const LIM = SQRT3 / 2 * 0.84;
        if (Math.abs(dx) > LIM) continue;
        if (Math.abs(0.5 * dx + SQRT3 / 2 * dz) > LIM) continue;
        if (Math.abs(0.5 * dx - SQRT3 / 2 * dz) > LIM) continue;
        let bad = false;
        for (let k = 0; k < peakInfo.length; k++) {
          if (Math.hypot(rx - peakInfo[k].x, rz - peakInfo[k].z) < peakInfo[k].r + 0.05) { bad = true; break; }
        }
        if (bad) continue;
        for (let k = 0; k < rockInfo.length; k++) {
          if (Math.hypot(rx - rockInfo[k].x, rz - rockInfo[k].z) < 0.07) { bad = true; break; }
        }
        if (bad) continue;

        const size = 0.012 + ctx.rng() * 0.033;
        const matIdx = Math.floor(ctx.rng() * rockMats.length);
        rocksByMat[matIdx].push({
          x: rx, z: rz, size: size,
          rotX: ctx.rng() * Math.PI,
          rotY: ctx.rng() * Math.PI,
          rotZ: ctx.rng() * Math.PI
        });
        rockInfo.push({ x: rx, z: rz, size: size });
        placed = true;
      }
    }

    const unitRockGeo = _getUnitRockGeo(ctx);
    for (let m = 0; m < rocksByMat.length; m++) {
      const list = rocksByMat[m];
      if (list.length === 0) continue;
      const inst = new THREE.InstancedMesh(unitRockGeo, rockMats[m], list.length);
      inst.castShadow = false;
      inst.receiveShadow = true;
      for (let i = 0; i < list.length; i++) {
        const r = list[i];
        _etmp.set(r.rotX, r.rotY, r.rotZ);
        _qtmp.setFromEuler(_etmp);
        _vtmp.set(r.x, cy + r.size * 0.60, r.z);
        _stmp.set(r.size, r.size * 0.85, r.size);
        _m4tmp.compose(_vtmp, _qtmp, _stmp);
        inst.setMatrixAt(i, _m4tmp);
      }
      inst.instanceMatrix.needsUpdate = true;
      ctx.boardGroup.add(inst);
      objs.push(inst);
    }

    const pileAngle = baseAngle + Math.PI * 0.33;
    let pileX = cx + Math.cos(pileAngle) * 0.58;
    let pileZ = cz + Math.sin(pileAngle) * 0.58;
    if (typeof clampToHex === 'function') {
      const c = clampToHex(pileX, pileZ, cx, cz, 0.82);
      pileX = c.x; pileZ = c.z;
    }
    const pileGroup = new THREE.Group();
    pileGroup.position.set(pileX, cy, pileZ);
    for (let i = 0; i < 5; i++) {
      const rr = 0.012 + ctx.rng() * 0.010;
      const rock = _mountainsRock(0, 0, 0, rr, ctx);
      const a = ctx.rng() * Math.PI * 2, d = ctx.rng() * 0.045;
      rock.position.set(Math.cos(a) * d, rr * 0.4 + ctx.rng() * 0.015, Math.sin(a) * d);
      pileGroup.add(rock);
    }
    ctx.boardGroup.add(pileGroup);
    objs.push(pileGroup);

    // ★ ИСПРАВЛЕНО: детерминированный выбор гекса с экскаватором
    const hash = Math.abs(Math.floor(cx * 100 + cz * 31));
    const hasExcavator = (hash % 4 === 0); // Примерно каждый 4-й горный гекс

    const targetPeak = peakInfo[0] || { x: cx, z: cz, r: 0.15, h: 0.4 };
    let excX, excZ, baseRotY, dumpTurretAngle, excPileGroup, excPilePos;

    if (hasExcavator) {
      const dxp = targetPeak.x - cx, dzp = targetPeak.z - cz;
      const dpl = Math.max(0.001, Math.hypot(dxp, dzp));
      const radialX = dxp / dpl, radialZ = dzp / dpl;

      let excDist = dpl + 0.16;
      excX = cx + radialX * excDist;
      excZ = cz + radialZ * excDist;
      if (typeof clampToHex === 'function') {
        const c = clampToHex(excX, excZ, cx, cz, 0.80);
        excX = c.x; excZ = c.z;
      }

      const fx = targetPeak.x - excX, fz = targetPeak.z - excZ;
      const fl = Math.max(0.001, Math.hypot(fx, fz));
      const nx = fx / fl, nz = fz / fl;
      baseRotY = Math.atan2(-nz, nx);

      dumpTurretAngle = Math.PI * 0.62;

      const dumpWorldAng = baseRotY + dumpTurretAngle;
      const dumpReach = 0.22;
      let dumpX = excX + Math.cos(dumpWorldAng) * dumpReach;
      let dumpZ = excZ - Math.sin(dumpWorldAng) * dumpReach;
      if (typeof clampToHex === 'function') {
        const c = clampToHex(dumpX, dumpZ, cx, cz, 0.82);
        dumpX = c.x; dumpZ = c.z;
      }

      excPileGroup = new THREE.Group();
      excPileGroup.position.set(dumpX, cy, dumpZ);
      for (let i = 0; i < 3; i++) {
        const rr = 0.010 + ctx.rng() * 0.008;
        const rock = _mountainsRock(0, 0, 0, rr, ctx);
        const a = ctx.rng() * Math.PI * 2, d = ctx.rng() * 0.035;
        rock.position.set(Math.cos(a) * d, rr * 0.4 + ctx.rng() * 0.012, Math.sin(a) * d);
        excPileGroup.add(rock);
      }
      ctx.boardGroup.add(excPileGroup);
      objs.push(excPileGroup);
      excPilePos = { x: dumpX, z: dumpZ };
    }

    return {
      objs: objs,
      peakInfo: peakInfo,
      rockInfo: rockInfo,
      pileGroup: pileGroup,
      pilePos: { x: pileX, z: pileZ },
      excPileGroup: excPileGroup,
      excPilePos: excPilePos,
      hasExcavator: hasExcavator,
      excavatorPos: hasExcavator ? {
        x: excX, z: excZ,
        rotationY: baseRotY,
        dumpTurretAngle: dumpTurretAngle,
        targetPeak: targetPeak
      } : null
    };
  }

  // ==================== РАБОЧИЕ ====================
  const _mountainsMats = {};
  const _minerShirt = new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.85 });
  const _minerPantsColors = [0x2a2a2a, 0x1a1a2a, 0x3a3a2a, 0x2a2010, 0x302020, 0x1a2028];
  const _minerVestColors  = [0x4a3020, 0x3a4030, 0x504040, 0x302840, 0x404838, 0x383030];

  function _mountainsGetMats() {
    if (_mountainsMats.head) return _mountainsMats;
    _mountainsMats.head       = new THREE.MeshStandardMaterial({ color: 0xe8c8a0, roughness: 0.85 });
    _mountainsMats.helmet     = new THREE.MeshStandardMaterial({ color: 0xd4a020, roughness: 0.5, metalness: 0.3, flatShading: true });
    _mountainsMats.helmetDark = new THREE.MeshStandardMaterial({ color: 0x8a6010, roughness: 0.6, flatShading: true });
    return _mountainsMats;
  }

  function _mountainsCreatePickaxe() {
    const g = new THREE.Group();
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.95, flatShading: true });
    const headMat   = new THREE.MeshStandardMaterial({ color: 0x8a8a92, roughness: 0.4, metalness: 0.75, flatShading: true });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.075, 6), handleMat);
    handle.position.y = 0.0375; handle.castShadow = true; g.add(handle);

    const headCenter = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.012, 0.016), headMat);
    headCenter.position.y = 0.077; headCenter.castShadow = true; g.add(headCenter);

    const tip1 = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.030, 4), headMat);
    tip1.position.set(0.018, 0.077, 0); tip1.rotation.z = -Math.PI / 2; tip1.castShadow = true; g.add(tip1);

    const tip2 = new THREE.Mesh(new THREE.ConeGeometry(0.0055, 0.030, 4), headMat);
    tip2.position.set(-0.018, 0.077, 0); tip2.rotation.z = Math.PI / 2; tip2.castShadow = true; g.add(tip2);

    return g;
  }

  function _mountainsCreateWheelbarrow() {
    const g = new THREE.Group();
    const woodMat  = new THREE.MeshStandardMaterial({ color: 0x6a4820, roughness: 0.95, flatShading: true });
    const trayMat  = new THREE.MeshStandardMaterial({ color: 0x7a7a82, roughness: 0.55, metalness: 0.45, flatShading: true });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, flatShading: true });
    const hubMat   = new THREE.MeshStandardMaterial({ color: 0xa0a0a8, roughness: 0.5, metalness: 0.6, flatShading: true });

    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10), wheelMat);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0.030, 0.014, 0);
    wheel.castShadow = true; g.add(wheel);

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.011, 6), hubMat);
    hub.rotation.x = Math.PI / 2; hub.position.copy(wheel.position); g.add(hub);

    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.020, 0.040), trayMat);
    tray.position.set(0.002, 0.028, 0);
    tray.rotation.z = 0.10;
    tray.castShadow = true; g.add(tray);

    for (const side of [-1, 1]) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0030, 0.062, 5), woodMat);
      handle.rotation.z = Math.PI / 2 - 0.10;
      handle.position.set(-0.036, 0.040, side * 0.016);
      handle.castShadow = true; g.add(handle);
    }

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.022, 5), woodMat);
      leg.position.set(-0.032, 0.011, side * 0.016);
      leg.castShadow = true; g.add(leg);
    }

    return g;
  }

  function _mountainsCreateExcavator(ctx) {
    const g = new THREE.Group();

    const orangeMat     = new THREE.MeshStandardMaterial({ color: 0xe87b1e, roughness: 0.55, flatShading: true });
    const orangeDarkMat = new THREE.MeshStandardMaterial({ color: 0xb85c10, roughness: 0.65, flatShading: true });
    const grayMat       = new THREE.MeshStandardMaterial({ color: 0x7a7a82, roughness: 0.5, metalness: 0.5, flatShading: true });
    const grayDarkMat   = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.6, metalness: 0.4, flatShading: true });
    const whiteMat      = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.55, flatShading: true });
    const darkMat       = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95, flatShading: true });
    const glassMat      = new THREE.MeshStandardMaterial({ color: 0x3a6a8a, roughness: 0.15, metalness: 0.5, transparent: true, opacity: 0.6 });
    const hydMat        = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, roughness: 0.3, metalness: 0.85, flatShading: true });

    for (const side of [-1, 1]) {
      const track = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.020, 0.022), darkMat);
      track.position.set(0, 0.010, side * 0.036);
      track.castShadow = true; g.add(track);
      for (let i = 0; i < 7; i++) {
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.021, 0.026), grayDarkMat);
        plate.position.set(-0.045 + i * 0.015, 0.010, side * 0.036);
        g.add(plate);
      }
      for (let i = 0; i < 4; i++) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.024, 8), grayMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(-0.033 + i * 0.022, 0.010, side * 0.036);
        g.add(wheel);
      }
    }

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.110, 0.016, 0.072), orangeDarkMat);
    chassis.position.set(0, 0.028, 0);
    chassis.castShadow = true; g.add(chassis);

    const turretGroup = new THREE.Group();
    turretGroup.position.set(0, 0.038, 0);
    g.add(turretGroup);

    const turretBase = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.040, 0.010, 14), grayDarkMat);
    turretBase.position.y = 0.005; turretGroup.add(turretBase);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.026, 0.058), orangeMat);
    body.position.set(-0.024, 0.026, 0);
    body.castShadow = true; turretGroup.add(body);

    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.024, 0.056), orangeDarkMat);
    counterweight.position.set(-0.056, 0.024, 0);
    counterweight.castShadow = true; turretGroup.add(counterweight);

    for (let i = 0; i < 3; i++) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.018, 0.048), darkMat);
      vent.position.set(-0.066 + i * 0.002, 0.024, 0);
      turretGroup.add(vent);
    }

    const toolbox = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.010, 0.020), grayMat);
    toolbox.position.set(-0.024, 0.044, -0.024);
    turretGroup.add(toolbox);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.042, 0.044), orangeMat);
    cab.position.set(0.020, 0.032, 0);
    cab.castShadow = true; turretGroup.add(cab);

    const winFront = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.026, 0.002), glassMat);
    winFront.position.set(0.020, 0.038, 0.023); turretGroup.add(winFront);
    const winBack = winFront.clone(); winBack.position.z = -0.023; turretGroup.add(winBack);
    const winSideR = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.026, 0.042), glassMat);
    winSideR.position.set(0.038, 0.038, 0); turretGroup.add(winSideR);
    const winSideL = winSideR.clone(); winSideL.position.x = 0.002; turretGroup.add(winSideL);

    const stripeCab = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.006, 0.046), whiteMat);
    stripeCab.position.set(0.020, 0.014, 0); turretGroup.add(stripeCab);
    const stripeBody = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.005, 0.060), whiteMat);
    stripeBody.position.set(-0.024, 0.013, 0); turretGroup.add(stripeBody);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.040, 0.004, 0.048), grayDarkMat);
    roof.position.set(0.020, 0.055, 0); turretGroup.add(roof);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.036, 5), grayMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0.020, 0.059, 0); turretGroup.add(rail);

    const boomGroup = new THREE.Group();
    boomGroup.position.set(0.006, 0.040, 0);
    turretGroup.add(boomGroup);

    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.014, 0.012), orangeMat);
    boom.position.set(0.026, 0.004, 0);
    boom.rotation.z = 0.10;
    boom.castShadow = true; boomGroup.add(boom);
    const boomStripe = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.003, 0.013), whiteMat);
    boomStripe.position.copy(boom.position);
    boomStripe.rotation.z = 0.10;
    boomGroup.add(boomStripe);

    const armGroup = new THREE.Group();
    armGroup.position.set(0.056, 0.008, 0);
    boomGroup.add(armGroup);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.012, 0.010), orangeMat);
    arm.position.set(0.020, -0.006, 0);
    arm.rotation.z = -0.35;
    arm.castShadow = true; armGroup.add(arm);
    const armStripe = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.003, 0.011), whiteMat);
    armStripe.position.copy(arm.position);
    armStripe.rotation.z = -0.35;
    armGroup.add(armStripe);

    const stickGroup = new THREE.Group();
    stickGroup.position.set(0.040, -0.014, 0);
    armGroup.add(stickGroup);

    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.011, 0.009), grayMat);
    stick.position.set(0.016, -0.006, 0);
    stick.rotation.z = -0.55;
    stick.castShadow = true; stickGroup.add(stick);

    const bucketGroup = new THREE.Group();
    bucketGroup.position.set(0.032, -0.016, 0);
    stickGroup.add(bucketGroup);

    const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.020, 0.018, 0.024), grayDarkMat);
    bucket.position.set(0.008, -0.008, 0);
    bucket.castShadow = true; bucketGroup.add(bucket);
    for (let i = 0; i < 4; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.0018, 0.006, 4), grayDarkMat);
      tooth.position.set(0.019, -0.014, -0.008 + i * 0.0055);
      tooth.rotation.z = -Math.PI / 2;
      bucketGroup.add(tooth);
    }

    const bucketRockGeo = new THREE.IcosahedronGeometry(0.007, 0);
    const bucketRock = new THREE.Mesh(bucketRockGeo, grayMat);
    bucketRock.position.set(0.008, -0.001, 0);
    bucketRock.visible = false;
    bucketGroup.add(bucketRock);

    const hyd1 = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.030, 6), hydMat);
    hyd1.rotation.z = Math.PI / 2 - 0.5;
    hyd1.position.set(0.024, -0.008, 0.007);
    boomGroup.add(hyd1);
    const hyd1b = hyd1.clone(); hyd1b.position.z = -0.007; boomGroup.add(hyd1b);

    const hyd2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0020, 0.0020, 0.022, 6), hydMat);
    hyd2.rotation.z = Math.PI / 2 + 0.4;
    hyd2.position.set(0.020, 0.008, 0.005);
    armGroup.add(hyd2);
    const hyd2b = hyd2.clone(); hyd2b.position.z = -0.005; armGroup.add(hyd2b);

    const hyd3 = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.014, 6), hydMat);
    hyd3.rotation.z = Math.PI / 2 + 0.3;
    hyd3.position.set(0.014, 0.002, 0.004);
    stickGroup.add(hyd3);
    const hyd3b = hyd3.clone(); hyd3b.position.z = -0.004; stickGroup.add(hyd3b);

    g.userData.boomGroup   = boomGroup;
    g.userData.armGroup    = armGroup;
    g.userData.stickGroup  = stickGroup;
    g.userData.bucketGroup = bucketGroup;
    g.userData.turretGroup = turretGroup;
    g.userData.bucketRock  = bucketRock;

    return g;
  }

  function _mountainsMinerMesh(seed, variant) {
    const m = _mountainsGetMats();
    const g = new THREE.Group();
    const pantsMat = new THREE.MeshStandardMaterial({ color: _minerPantsColors[seed % _minerPantsColors.length], roughness: 0.95, flatShading: true });
    const vestMat  = new THREE.MeshStandardMaterial({ color: _minerVestColors[(seed * 3 + 1) % _minerVestColors.length], roughness: 0.9, flatShading: true });

    [-0.008, 0.008].forEach(function(dx) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0075, 0.024, 6), pantsMat);
      leg.position.set(dx, 0.012, 0); leg.castShadow = true; g.add(leg);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.010, 0.007, 0.016),
        new THREE.MeshStandardMaterial({ color: 0x1a0e05, roughness: 1, flatShading: true })
      );
      shoe.position.set(dx, 0.0035, 0.002); g.add(shoe);
    });

    const bodyGroup = new THREE.Group();
    bodyGroup.position.y = 0.022; g.add(bodyGroup);

    const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.020, 0.035, 8), _minerShirt);
    shirt.position.y = 0.018; shirt.castShadow = true; bodyGroup.add(shirt);

    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.0178, 0.0215, 0.030, 8), vestMat);
    vest.position.y = 0.026; vest.castShadow = true; bodyGroup.add(vest);

    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0028, 4, 10), _minerShirt);
    collar.rotation.x = Math.PI / 2; collar.position.y = 0.042; bodyGroup.add(collar);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), m.head);
    head.position.y = 0.058; head.castShadow = true; bodyGroup.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.019, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      m.helmet
    );
    helmet.position.y = 0.065; helmet.castShadow = true; bodyGroup.add(helmet);

    const helmetBrim = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0035, 4, 14), m.helmetDark);
    helmetBrim.rotation.x = Math.PI / 2; helmetBrim.position.y = 0.065; bodyGroup.add(helmetBrim);

    const armGroup = new THREE.Group();
    armGroup.position.set(0.019, 0.040, 0.005);
    bodyGroup.add(armGroup);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 6), _minerShirt);
    arm.position.y = -0.011; arm.castShadow = true; armGroup.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5), m.head);
    hand.position.y = -0.024; armGroup.add(hand);

    const leftArmGroup = new THREE.Group();
    leftArmGroup.position.set(-0.019, 0.040, 0.005);
    bodyGroup.add(leftArmGroup);
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.026, 6), _minerShirt);
    leftArm.position.y = -0.013; leftArm.castShadow = true; leftArmGroup.add(leftArm);
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), m.head);
    leftHand.position.y = -0.028; leftArmGroup.add(leftHand);

    let pickaxe = null, wheelbarrow = null;
    if (variant === 'wheelbarrow') {
      armGroup.rotation.x = 0.55;
      leftArmGroup.rotation.x = 0.55;
      leftArmGroup.rotation.z = 0.10;
      wheelbarrow = _mountainsCreateWheelbarrow();
      wheelbarrow.position.set(0, 0, 0.055);
      wheelbarrow.rotation.y = -Math.PI / 2;
      g.add(wheelbarrow);
    } else {
      leftArmGroup.rotation.z = 0.20;
      pickaxe = _mountainsCreatePickaxe();
      pickaxe.position.set(0, -0.026, 0);
      pickaxe.rotation.set(0, Math.PI / 2, 0);
      armGroup.add(pickaxe);
    }

    g.userData.bodyGroup    = bodyGroup;
    g.userData.armGroup     = armGroup;
    g.userData.leftArmGroup = leftArmGroup;
    g.userData.pickaxe      = pickaxe;
    g.userData.wheelbarrow  = wheelbarrow;
    g.userData.variant      = variant;
    return g;
  }

  function _mountainsAddRockToPile(pileGroup, ctx) {
    if (!pileGroup || !pileGroup.children) return;
    if (pileGroup.children.length > 40) return;
    const rr = 0.010 + ctx.rng() * 0.010;
    const rock = _mountainsRock(0, 0, 0, rr, ctx);
    const a = ctx.rng() * Math.PI * 2;
    const d = ctx.rng() * 0.05;
    const stack = pileGroup.children.length * 0.003;
    rock.position.set(Math.cos(a) * d, rr * 0.4 + 0.005 + Math.min(stack, 0.06), Math.sin(a) * d);
    pileGroup.add(rock);
  }

  function _mountainsAvoidSafe(Ax, Az, Bx, Bz, cx, cz, safeR) {
    const dx = Bx - Ax, dz = Bz - Az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return [{ x: Bx, z: Bz }];
    const t = Math.max(0, Math.min(1, ((cx - Ax) * dx + (cz - Az) * dz) / (len * len)));
    const px = Ax + dx * t;
    const pz = Az + dz * t;
    const dToC = Math.hypot(px - cx, pz - cz);
    if (dToC >= safeR) return [{ x: Bx, z: Bz }];

    const perpX = -dz / len;
    const perpZ = dx / len;
    const R = safeR + 0.02;
    const c1x = cx + perpX * R, c1z = cz + perpZ * R;
    const c2x = cx - perpX * R, c2z = cz - perpZ * R;
    const d1 = Math.hypot(c1x - Ax, c1z - Az) + Math.hypot(Bx - c1x, Bz - c1z);
    const d2 = Math.hypot(c2x - Ax, c2z - Az) + Math.hypot(Bx - c2x, Bz - c2z);
    const wp = d1 < d2 ? { x: c1x, z: c1z } : { x: c2x, z: c2z };
    return [wp, { x: Bx, z: Bz }];
  }

  function _mountainsCreateAnim(cx, cy, cz, ctx, decorResult) {
    const peakInfo = decorResult.peakInfo;
    const pileGroup = decorResult.pileGroup;

    const state = {
      cx: cx, cz: cz, ctx: ctx,
      peakInfo: peakInfo,
      pileGroup: pileGroup,
      pilePos: decorResult.pilePos,
      pickaxeWorker: null,
      wheelbarrowWorker: null,
      excavator: null
    };

    if (peakInfo.length === 0) return state;

    {
      const mesh = _mountainsMinerMesh(0, 'pickaxe');
      const startAngle = ctx.rng() * Math.PI * 2;
      const startDist  = 0.30 + ctx.rng() * 0.10;
      mesh.position.set(
        cx + Math.cos(startAngle) * startDist,
        TERRAIN_Y,
        cz + Math.sin(startAngle) * startDist
      );
      ctx.boardGroup.add(mesh);

      state.pickaxeWorker = {
        mesh: mesh,
        cx: cx, cz: cz,
        peakInfo: peakInfo,
        targetPeakIdx: 0,
        state: 'idle',
        timer: ctx.rng() * 1.5,
        speed: 0.20 + ctx.rng() * 0.10,
        path: null, pathIdx: 0,
        miningTimer: 0,
        strikeState: 'raising',
        strikeTimer: 0,
        armLift: 0, targetArmLift: 0, armSpeed: 8,
        bodyLean: 0, targetBodyLean: 0,
        phase: ctx.rng() * Math.PI * 2
      };
    }

    {
      const mesh = _mountainsMinerMesh(3, 'wheelbarrow');
      mesh.position.set(
        decorResult.pilePos.x + (ctx.rng() - 0.5) * 0.10,
        TERRAIN_Y,
        decorResult.pilePos.z + (ctx.rng() - 0.5) * 0.10
      );
      ctx.boardGroup.add(mesh);

      state.wheelbarrowWorker = {
        mesh: mesh,
        cx: cx, cz: cz,
        peakInfo: peakInfo,
        pilePos: decorResult.pilePos,
        pileGroup: pileGroup,
        state: 'idle',
        timer: 0.5 + ctx.rng() * 1.0,
        speed: 0.16 + ctx.rng() * 0.06,
        path: null, pathIdx: 0,
        carrying: false,
        phase: ctx.rng() * Math.PI * 2
      };
    }

    if (decorResult.hasExcavator && decorResult.excavatorPos) {
      const exc = _mountainsCreateExcavator(ctx);
      exc.position.set(decorResult.excavatorPos.x, TERRAIN_Y, decorResult.excavatorPos.z);
      exc.rotation.y = decorResult.excavatorPos.rotationY;
      ctx.boardGroup.add(exc);

      state.excavator = {
        mesh: exc,
        timer: 0,
        dumpTurretAngle: decorResult.excavatorPos.dumpTurretAngle,
        excPileGroup: decorResult.excPileGroup
      };
    }

    return state;
  }

  function _mountainsPickTarget(w, ctx) {
    const peak = w.peakInfo[w.targetPeakIdx];
    const angle = ctx.rng() * Math.PI * 2;
    const dist = peak.r + 0.08 + ctx.rng() * 0.05;
    let tx = peak.x + Math.cos(angle) * dist;
    let tz = peak.z + Math.sin(angle) * dist;

    if (Math.hypot(tx - w.cx, tz - w.cz) < SAFE_RADIUS + 0.05) {
      const a = Math.atan2(tz - w.cz, tx - w.cx);
      tx = w.cx + Math.cos(a) * (SAFE_RADIUS + 0.08);
      tz = w.cz + Math.sin(a) * (SAFE_RADIUS + 0.08);
    }
    // ★ ИСПРАВЛЕНО: один вызов clampToHex
    const c = clampToHex(tx, tz, w.cx, w.cz, 0.72);
    tx = c.x;
    tz = c.z;
    return { x: tx, z: tz };
  }

  function _mountainsMoveWorker(w, m, dt, now, speed) {
    if (!w.path || w.pathIdx >= w.path.length) return 'arrived';
    const wp = w.path[w.pathIdx];
    const dx = wp.x - m.position.x;
    const dz = wp.z - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) {
      w.pathIdx++;
      if (w.pathIdx >= w.path.length) return 'arrived';
      return 'moving';
    }
    const ease = Math.min(1, d / 0.15);
    const step = speed * dt * (0.4 + ease * 0.6);
    m.position.x += (dx / d) * step;
    m.position.z += (dz / d) * step;
    m.rotation.y = lerpAngle(m.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
    m.position.y = TERRAIN_Y + Math.abs(Math.sin(now * 0.012 + w.phase)) * 0.005;
    return 'moving';
  }

  function _mountainsUpdatePickaxe(w, dt, now, ctx) {
    const m = w.mesh;
    const bodyGroup = m.userData.bodyGroup;
    const armGroup = m.userData.armGroup;

    const k = Math.min(1, dt * w.armSpeed);
    w.armLift  += (w.targetArmLift  - w.armLift)  * k;
    w.bodyLean += (w.targetBodyLean - w.bodyLean) * k;

    armGroup.rotation.x = w.armLift;
    armGroup.rotation.z = 0;
    armGroup.rotation.y = 0;
    bodyGroup.rotation.x = w.bodyLean;
    bodyGroup.rotation.z = 0;

    w.timer -= dt;

    if (w.state === 'idle') {
      m.position.y = TERRAIN_Y + Math.sin(now * 0.003 + w.phase) * 0.0015;
      w.targetArmLift = 0;
      w.targetBodyLean = 0;
      if (w.timer <= 0) {
        const target = _mountainsPickTarget(w, ctx);
        w.path = _mountainsAvoidSafe(
          m.position.x, m.position.z, target.x, target.z,
          w.cx, w.cz, SAFE_RADIUS + 0.05
        );
        w.pathIdx = 0;
        w.state = 'walking';
      }
    }
    else if (w.state === 'walking') {
      const status = _mountainsMoveWorker(w, m, dt, now, w.speed);
      if (status === 'arrived') {
        const peak = w.peakInfo[w.targetPeakIdx];
        const toPeakX = peak.x - m.position.x;
        const toPeakZ = peak.z - m.position.z;
        m.rotation.y = Math.atan2(toPeakX, toPeakZ);
        w.state = 'mining';
        w.miningTimer = 15.0;
        w.strikeState = 'raising';
        w.strikeTimer = 0.30;
        w.targetArmLift = 2.2;
        w.targetBodyLean = -0.10;
        w.armSpeed = 7;
      }
    }
    else if (w.state === 'mining') {
      m.position.y = TERRAIN_Y;
      w.miningTimer -= dt;

      if (w.miningTimer <= 0) {
        w.state = 'idle';
        w.timer = 0.4 + ctx.rng() * 0.6;
        w.targetArmLift = 0;
        w.targetBodyLean = 0;
        w.targetPeakIdx = (w.targetPeakIdx + 1) % w.peakInfo.length;
        return;
      }

      if (w.strikeState === 'raising') {
        w.strikeTimer -= dt;
        if (w.strikeTimer <= 0) {
          w.strikeState = 'anticipation';
          w.strikeTimer = 0.10;
        }
      } else if (w.strikeState === 'anticipation') {
        w.strikeTimer -= dt;
        if (w.strikeTimer <= 0) {
          w.strikeState = 'striking';
          w.strikeTimer = 0.06;
          w.armLift = -0.55;
          w.targetArmLift = -0.55;
          w.bodyLean = 0.22;
          w.targetBodyLean = 0.22;
          w.armSpeed = 40;
        }
      } else if (w.strikeState === 'striking') {
        const shake = Math.sin(now * 0.15 + w.phase) * 0.025;
        bodyGroup.rotation.x = w.bodyLean + shake;
        armGroup.rotation.x = w.armLift;
        if (w.strikeTimer <= 0) {
          w.strikeState = 'recover';
          w.strikeTimer = 0.30 + ctx.rng() * 0.08;
          w.targetArmLift = -0.15;
          w.targetBodyLean = 0.05;
          w.armSpeed = 10;
        }
      } else {
        w.strikeTimer -= dt;
        if (w.strikeTimer <= 0) {
          w.strikeState = 'raising';
          w.strikeTimer = 0.30 + ctx.rng() * 0.10;
          w.targetArmLift = 2.2;
          w.targetBodyLean = -0.10;
          w.armSpeed = 7;
        }
      }
    }
  }

  function _mountainsUpdateWheelbarrow(w, dt, now, ctx) {
    const m = w.mesh;
    w.timer -= dt;

    if (w.state === 'idle') {
      m.position.y = TERRAIN_Y + Math.sin(now * 0.003 + w.phase) * 0.0015;
      if (w.timer <= 0) {
        let tx, tz;
        if (w.carrying) {
          tx = w.pilePos.x + (ctx.rng() - 0.5) * 0.06;
          tz = w.pilePos.z + (ctx.rng() - 0.5) * 0.06;
        } else {
          const peak = w.peakInfo[Math.floor(ctx.rng() * w.peakInfo.length)];
          const a = ctx.rng() * Math.PI * 2;
          const d = peak.r + 0.10 + ctx.rng() * 0.08;
          tx = peak.x + Math.cos(a) * d;
          tz = peak.z + Math.sin(a) * d;
          if (Math.hypot(tx - w.cx, tz - w.cz) < SAFE_RADIUS + 0.05) {
            const aa = Math.atan2(tz - w.cz, tx - w.cx);
            tx = w.cx + Math.cos(aa) * (SAFE_RADIUS + 0.10);
            tz = w.cz + Math.sin(aa) * (SAFE_RADIUS + 0.10);
          }
          // ★ ИСПРАВЛЕНО: один вызов clampToHex
          const c = clampToHex(tx, tz, w.cx, w.cz, 0.72);
          tx = c.x;
          tz = c.z;
        }
        w.path = _mountainsAvoidSafe(
          m.position.x, m.position.z, tx, tz,
          w.cx, w.cz, SAFE_RADIUS + 0.05
        );
        w.pathIdx = 0;
        w.state = 'walking';
      }
    }
    else if (w.state === 'walking') {
      const status = _mountainsMoveWorker(w, m, dt, now, w.speed);
      if (status === 'arrived') {
        w.state = 'work';
        w.timer = 1.2 + ctx.rng() * 0.8;
      }
    }
    else if (w.state === 'work') {
      m.position.y = TERRAIN_Y;
      if (w.timer <= 0) {
        if (w.carrying && w.pileGroup) {
          _mountainsAddRockToPile(w.pileGroup, ctx);
        }
        w.carrying = !w.carrying;
        w.state = 'idle';
        w.timer = 0.4 + ctx.rng() * 0.6;
      }
    }
  }

  function _mountainsUpdateExcavator(e, dt, now, ctx) {
    const g = e.mesh;
    const boomGroup   = g.userData.boomGroup;
    const armGroup    = g.userData.armGroup;
    const stickGroup  = g.userData.stickGroup;
    const bucketGroup = g.userData.bucketGroup;
    const turretGroup = g.userData.turretGroup;
    const bucketRock  = g.userData.bucketRock;

    e.timer += dt;
    const cycle = 9.0;
    const t = (e.timer % cycle) / cycle;
    const lerp = (a, b, k) => a + (b - a) * k;

    let boomAngle, armAngle, stickAngle, bucketAngle, turretAngle;
    let rockVisible = false;

    const dumpA = e.dumpTurretAngle;

    if (t < 0.12) {
      const k = t / 0.12;
      boomAngle   = lerp(0.05, -0.10, k);
      armAngle    = lerp(0.10, -0.10, k);
      stickAngle  = lerp(0.05, -0.05, k);
      bucketAngle = 0;
      turretAngle = 0;
    } else if (t < 0.26) {
      const k = (t - 0.12) / 0.14;
      boomAngle   = lerp(-0.10, -0.15, k);
      armAngle    = lerp(-0.10, 0.20, k);
      stickAngle  = lerp(-0.05, 0.20, k);
      bucketAngle = lerp(0, -0.45, k);
      turretAngle = 0;
      rockVisible = false;
    } else if (t < 0.40) {
      const k = (t - 0.26) / 0.14;
      boomAngle   = lerp(-0.15, 0.28, k);
      armAngle    = lerp(0.20, 0.10, k);
      stickAngle  = lerp(0.20, 0.10, k);
      bucketAngle = -0.45;
      turretAngle = 0;
      rockVisible = true;
    } else if (t < 0.58) {
      const k = (t - 0.40) / 0.18;
      const ease = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
      boomAngle   = 0.28;
      armAngle    = 0.10;
      stickAngle  = 0.10;
      bucketAngle = -0.45;
      turretAngle = dumpA * ease;
      rockVisible = true;
    } else if (t < 0.68) {
      const k = (t - 0.58) / 0.10;
      boomAngle   = 0.28;
      armAngle    = 0.10;
      stickAngle  = 0.10;
      bucketAngle = lerp(-0.45, -1.30, k);
      turretAngle = dumpA;
      rockVisible = k < 0.5;
    } else if (t < 0.88) {
      const k = (t - 0.68) / 0.20;
      const ease = k < 0.5 ? 2*k*k : 1 - Math.pow(-2*k + 2, 2) / 2;
      boomAngle   = 0.28;
      armAngle    = 0.10;
      stickAngle  = 0.10;
      bucketAngle = lerp(-1.30, 0, Math.min(1, k * 1.5));
      turretAngle = dumpA * (1 - ease);
    } else {
      const k = (t - 0.88) / 0.12;
      boomAngle   = lerp(0.28, 0.05, k);
      armAngle    = lerp(0.10, 0.10, k);
      stickAngle  = lerp(0.10, 0.05, k);
      bucketAngle = 0;
      turretAngle = 0;
    }

    boomGroup.rotation.z   = boomAngle;
    armGroup.rotation.z    = armAngle;
    stickGroup.rotation.z  = stickAngle;
    bucketGroup.rotation.z = bucketAngle;
    turretGroup.rotation.y = turretAngle;

    if (bucketRock) bucketRock.visible = rockVisible;

    const prevT = ((e.timer - dt) % cycle) / cycle;
    if (prevT < 0.58 && t >= 0.58 && e.excPileGroup) {
      _mountainsAddRockToPile(e.excPileGroup, ctx);
    }
  }

  function _mountainsUpdateAnim(state, dt, now) {
    if (state.pickaxeWorker)     _mountainsUpdatePickaxe(state.pickaxeWorker, dt, now, state.ctx);
    if (state.wheelbarrowWorker) _mountainsUpdateWheelbarrow(state.wheelbarrowWorker, dt, now, state.ctx);
    if (state.excavator)         _mountainsUpdateExcavator(state.excavator, dt, now, state.ctx);
  }

  // ==================== ЭКСПОРТ ====================
  window.HexMountains = {
    create: function(cx, cy, cz, ctx) {
      const decorResult = _buildMountainsDecor(cx, cy, cz, ctx);
      return {
        decor: decorResult.objs,
        anim: _mountainsCreateAnim(cx, cy, cz, ctx, decorResult)
      };
    },
    update: function(state, dt, now) {
      _mountainsUpdateAnim(state.anim, dt, now);
    },
    destroy: function(state) {
      if (state.decor) {
        state.decor.forEach(function(o) {
          if (o.parent) o.parent.remove(o);
          if (o.geometry && o.geometry !== _unitRockGeo && o.geometry !== _unitMoundGeo) {
            o.geometry.dispose();
          }
        });
      }
      const anim = state.anim;
      if (anim) {
        if (anim.pickaxeWorker && anim.pickaxeWorker.mesh.parent)
          anim.pickaxeWorker.mesh.parent.remove(anim.pickaxeWorker.mesh);
        if (anim.wheelbarrowWorker && anim.wheelbarrowWorker.mesh.parent)
          anim.wheelbarrowWorker.mesh.parent.remove(anim.wheelbarrowWorker.mesh);
        if (anim.excavator && anim.excavator.mesh.parent)
          anim.excavator.mesh.parent.remove(anim.excavator.mesh);
        if (anim.pileGroup) {
          anim.pileGroup.traverse(function(o) {
            if (o.geometry && o.geometry !== _unitRockGeo) o.geometry.dispose();
          });
          if (anim.pileGroup.parent) anim.pileGroup.parent.remove(anim.pileGroup);
        }
      }
    }
  };

  console.log('[HexMountains] OK — instanced rocks, детерминированный экскаватор, IIFE');
})();