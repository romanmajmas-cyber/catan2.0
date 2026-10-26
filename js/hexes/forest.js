// ============================================================================
//  forest.js — гекс «лес»: деревья, кусты, рабочие, анимации.
//  ВСЕ НАСТРОЙКИ — в объекте FOREST_PARAMS ниже. Меняй только их.
//  Обёрнуто в IIFE, исправлены Math.random() на ctx.rng().
// ============================================================================
(function () {
  'use strict';

  const FOREST_PARAMS = {
    WORKER_SCALE: 0.45,
    CUTTER_SPEED: 0.22,
    HAULER_SPEED: 0.20,
    WALK_ANIM_SPEED: 9,
    CUT_DURATION: 7,
    FALL_DURATION: 2.0,
    CLEAN_BRANCH_TIME: 0.55,
    BEND_TIME: 0.7,
    PICK_TIME: 0.5,
    REGROW_DURATION: 1.5,
    REGROW_DELAY_MS: 10000,      // Исправлено на 10 секунд (было 400)
    PILE_STACK_HEIGHT: 0.028,
    MAX_PILE_LEVELS: 3,
    SAFE_RADIUS: 0.30,
    TREE_RING_MIN: 0.45,
    TREE_RING_MAX: 0.60,
    PILE_OFFSET_X: 0.42,
    PILE_OFFSET_Z: 0.42,
    FALL_ANGLE_JITTER: 1.2,
    TREE_COUNT: 14,
    BUSH_COUNT: 14,
    GRASS_COUNT: 40,
    MUSHROOM_COUNT: 6,
    ROCK_COUNT: 5
  };

  const _TMP_VEC = new THREE.Vector3();

  // ============ ВЕГЕТАЦИЯ ============

  function _forestPine(x, y, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016*s, 0.032*s, 0.16*s, 8), MAT.trunk
    );
    trunk.position.y = 0.08*s; trunk.castShadow = true; g.add(trunk);

    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002*s, 0.005*s, 0.05*s, 4), MAT.trunk
      );
      const a = (i / 4) * Math.PI * 2 + 0.3;
      b.position.set(Math.cos(a)*0.025*s, 0.04*s + i*0.022*s, Math.sin(a)*0.025*s);
      b.rotation.z = Math.PI/2 - 0.5; b.rotation.y = a;
      b.castShadow = true; g.add(b);
    }

    [{ r: 0.20, h: 0.22, y: 0.20 }, { r: 0.17, h: 0.20, y: 0.31 },
     { r: 0.13, h: 0.17, y: 0.41 }, { r: 0.08, h: 0.13, y: 0.50 },
     { r: 0.04, h: 0.08, y: 0.57 }].forEach(function(t, i) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(t.r*s, t.h*s, 9),
        i % 2 === 0 ? MAT.pineLeaf : MAT.pineLeaf2
      );
      cone.position.y = t.y*s; cone.castShadow = true; g.add(cone);
    });

    g.position.set(x, y, z);
    return g;
  }

  function _forestBirch(x, y, z, s, ctx) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018*s, 0.028*s, 0.34*s, 8), MAT.birchTrunk
    );
    trunk.position.y = 0.17*s; trunk.castShadow = true; g.add(trunk);

    const darkMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    for (let i = 0; i < 5; i++) {
      const spot = new THREE.Mesh(
        new THREE.BoxGeometry(0.012*s, 0.006*s, 0.002*s), darkMat
      );
      const a = ctx.rng() * Math.PI * 2;
      spot.position.set(Math.cos(a)*0.024*s, (0.05 + i*0.06)*s, Math.sin(a)*0.024*s);
      spot.rotation.y = a; g.add(spot);
    }
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.002*s, 0.004*s, 0.04*s, 4), MAT.birchTrunk
      );
      const a = (i / 3) * Math.PI * 2;
      b.position.set(Math.cos(a)*0.02*s, 0.20*s + i*0.04*s, Math.sin(a)*0.02*s);
      b.rotation.z = Math.PI/2 - 0.4; b.rotation.y = a; g.add(b);
    }

    [{ dx: 0,     dy: 0.42, dz: 0,     r: 0.10 },
     { dx: 0.06,  dy: 0.38, dz: 0.03,  r: 0.07 },
     { dx: -0.05, dy: 0.40, dz: -0.04, r: 0.075 },
     { dx: 0.03,  dy: 0.47, dz: -0.03, r: 0.06 },
     { dx: -0.03, dy: 0.45, dz: 0.05,  r: 0.055 }].forEach(function(f) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(f.r*s, 9, 7), MAT.birchLeaf
      );
      ball.position.set(f.dx*s, f.dy*s, f.dz*s);
      ball.castShadow = true; g.add(ball);
    });

    g.position.set(x, y, z);
    return g;
  }

  function _createBush(x, y, z, s, ctx) {
    const g = new THREE.Group();
    const mats = [MAT.pineLeaf, MAT.pineLeaf2, MAT.birchLeaf];
    const n = 3 + Math.floor(ctx.rng() * 3);
    for (let i = 0; i < n; i++) {
      const r = (0.05 + ctx.rng() * 0.03) * s;
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(r, 7, 5), mats[i % mats.length]
      );
      ball.position.set(
        (ctx.rng() - 0.5) * 0.06 * s,
        r * 0.6 + ctx.rng() * 0.01 * s,
        (ctx.rng() - 0.5) * 0.06 * s
      );
      ball.castShadow = true; g.add(ball);
    }
    g.position.set(x, y, z);
    return g;
  }

  function _createMushroom(x, y, z, s) {
    const g = new THREE.Group();
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004*s, 0.005*s, 0.018*s, 6),
      new THREE.MeshLambertMaterial({ color: 0xf0e6d2 })
    );
    stem.position.y = 0.009*s; g.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.012*s, 8, 5, 0, Math.PI*2, 0, Math.PI/2),
      new THREE.MeshLambertMaterial({ color: 0xcc3333 })
    );
    cap.position.y = 0.018*s; g.add(cap);
    g.position.set(x, y, z);
    return g;
  }

  function _createRock(x, y, z, s, ctx) {
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.03*s, 0),
      new THREE.MeshLambertMaterial({ color: 0x777777 })
    );
    rock.position.set(x, y + 0.015*s, z);
    rock.rotation.set(ctx.rng(), ctx.rng(), ctx.rng());
    rock.scale.y = 0.6; rock.castShadow = true;
    return rock;
  }

  function _createGrassTuft(x, y, z, s, ctx) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x557733 });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.004*s, 0.03*s, 3), mat
      );
      const a = (i / 4) * Math.PI * 2 + ctx.rng() * 0.5;
      blade.position.set(Math.cos(a)*0.008*s, 0.015*s, Math.sin(a)*0.008*s);
      blade.rotation.z = (ctx.rng() - 0.5) * 0.3;
      g.add(blade);
    }
    g.position.set(x, y, z);
    return g;
  }

  // ============ УПАВШЕЕ ДЕРЕВО ============

  function _createFallenTree(x, y, z, s, dir) {
    const g = new THREE.Group();

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024*s, 0.028*s, 0.45*s, 8), MAT.trunk
    );
    trunk.rotation.z = Math.PI / 2;
    trunk.position.y = 0.026*s;
    trunk.castShadow = true; g.add(trunk);

    const branches = [];
    const branchData = [
      { t: -0.14, a:  0.9, tilt:  0.35 },
      { t: -0.02, a: -1.2, tilt: -0.25 },
      { t:  0.10, a:  2.1, tilt:  0.45 },
      { t:  0.16, a: -2.5, tilt: -0.30 }
    ];
    branchData.forEach(function(b) {
      const br = new THREE.Mesh(
        new THREE.CylinderGeometry(0.003*s, 0.005*s, 0.055*s, 4), MAT.trunk
      );
      br.position.set(b.t * s, 0.03*s, 0);
      br.rotation.z = Math.PI/2 + b.tilt;
      br.rotation.y = b.a;
      br.castShadow = true;
      g.add(br);
      branches.push(br);
    });

    g.position.set(x, y, z);
    g.rotation.y = dir;
    g.userData.branches = branches;
    return g;
  }

  // ============ РАБОЧИЕ ============

  const WORKER_MAT = {
    skin:       new THREE.MeshLambertMaterial({ color: 0xffd9b3 }),
    pants:      new THREE.MeshLambertMaterial({ color: 0x2a2a2a }),
    boots:      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
    helmet:     new THREE.MeshLambertMaterial({ color: 0xffcc00 }),
    sawBlade:   new THREE.MeshLambertMaterial({ color: 0xc8c8c8 }),
    sawHandle:  new THREE.MeshLambertMaterial({ color: 0x8B4513 }),
    knifeBlade: new THREE.MeshLambertMaterial({ color: 0xdddddd }),
    knifeHandle:new THREE.MeshLambertMaterial({ color: 0x4a2a1a })
  };

  function _createSaw() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.0025, 0.016), WORKER_MAT.sawBlade
    );
    blade.position.x = 0.045; g.add(blade);

    for (let i = 0; i < 8; i++) {
      const tooth = new THREE.Mesh(
        new THREE.ConeGeometry(0.0018, 0.004, 3), WORKER_MAT.sawBlade
      );
      tooth.position.set(0.014 + i * 0.0085, -0.0032, 0);
      tooth.rotation.z = Math.PI; g.add(tooth);
    }

    const handle = new THREE.Mesh(
      new THREE.TorusGeometry(0.011, 0.0038, 6, 14, Math.PI * 1.6),
      WORKER_MAT.sawHandle
    );
    handle.rotation.y = Math.PI / 2;
    handle.rotation.z = -Math.PI / 4;
    handle.position.set(0, 0.002, 0);
    g.add(handle);

    return g;
  }

  function _createKnife() {
    const g = new THREE.Group();
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.0015, 0.008), WORKER_MAT.knifeBlade
    );
    blade.position.x = 0.028; g.add(blade);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.005, 0.012, 4), WORKER_MAT.knifeBlade
    );
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 0.055; g.add(tip);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6), WORKER_MAT.knifeHandle
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.x = -0.005; g.add(handle);

    return g;
  }

  function _createWorker(shirtColor) {
    const g = new THREE.Group();
    g.scale.setScalar(FOREST_PARAMS.WORKER_SCALE);

    const parts = {};
    const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });

    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.026, 0.030, 0.075, 10), shirtMat
    );
    torso.position.y = 0.115; torso.castShadow = true; g.add(torso);
    parts.torso = torso;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 12, 10), WORKER_MAT.skin
    );
    head.position.y = 0.175; head.castShadow = true; g.add(head);
    parts.head = head;

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 14, 8, 0, Math.PI*2, 0, Math.PI/2),
      WORKER_MAT.helmet
    );
    helmet.position.y = 0.180; helmet.castShadow = true; g.add(helmet);
    parts.helmet = helmet;

    const brim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.034, 0.034, 0.004, 16), WORKER_MAT.helmet
    );
    brim.position.y = 0.178; g.add(brim);
    parts.brim = brim;

    function makeArm(side) {
      const armGroup = new THREE.Group();
      armGroup.position.set(side * 0.030, 0.145, 0);

      const upper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.040, 8), shirtMat
      );
      upper.position.y = -0.020; upper.castShadow = true; armGroup.add(upper);

      const lower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.007, 0.040, 8), WORKER_MAT.skin
      );
      lower.position.y = -0.060; lower.castShadow = true; armGroup.add(lower);

      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.010, 8, 6), WORKER_MAT.skin
      );
      hand.position.y = -0.085; armGroup.add(hand);

      g.add(armGroup);
      return { group: armGroup, upper, lower, hand };
    }
    parts.armL = makeArm(-1);
    parts.armR = makeArm(1);

    function makeLeg(side) {
      const legGroup = new THREE.Group();
      legGroup.position.set(side * 0.012, 0.078, 0);

      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.009, 0.009, 0.070, 8), WORKER_MAT.pants
      );
      leg.position.y = -0.035; leg.castShadow = true; legGroup.add(leg);

      const boot = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.012, 0.030), WORKER_MAT.boots
      );
      boot.position.set(0, -0.074, 0.006); boot.castShadow = true;
      legGroup.add(boot);

      g.add(legGroup);
      return { group: legGroup, leg, boot };
    }
    parts.legL = makeLeg(-1);
    parts.legR = makeLeg(1);

    return { group: g, parts };
  }

  // ============ УТИЛИТЫ ============

  function _easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
  function _easeInQuad(t) { return t * t; }

  function _keepOutOfCenter(obj, cx, cz, minR) {
    const dx = obj.position.x - cx;
    const dz = obj.position.z - cz;
    const d2 = dx*dx + dz*dz;
    const minR2 = minR * minR;
    if (d2 < minR2 && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      obj.position.x = cx + (dx / d) * minR;
      obj.position.z = cz + (dz / d) * minR;
    }
  }

  function _moveTowards(obj, target, speed, dt, cx, cz, minR) {
    const dx = target.x - obj.position.x;
    const dz = target.z - obj.position.z;
    const dist = Math.sqrt(dx*dx + dz*dz);

    if (dist < 0.02) return true;

    const move = Math.min(speed * dt, dist);
    obj.position.x += (dx / dist) * move;
    obj.position.z += (dz / dist) * move;

    const targetRot = Math.atan2(dx, dz);
    let diff = targetRot - obj.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    obj.rotation.y += diff * Math.min(1, dt * 8);

    _keepOutOfCenter(obj, cx, cz, minR);
    return false;
  }

  // ============ РАЗМЕЩЕНИЕ ============

  function _buildForestDecor(cx, cy, cz, ctx) {
    const out = { trees: [], bushes: [], grass: [], mushrooms: [], rocks: [] };
    const P = FOREST_PARAMS;

    for (let i = 0; i < P.TREE_COUNT; i++) {
      const a = (i / P.TREE_COUNT) * Math.PI * 2 + (ctx.rng() - 0.5) * 0.3;
      const r = P.TREE_RING_MIN + ctx.rng() * (P.TREE_RING_MAX - P.TREE_RING_MIN);
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      if (inSafeZone(px, pz, cx, cz)) continue;

      const isPine = ctx.rng() < 0.6;
      const s = 0.55 + ctx.rng() * 0.20;
      const mesh = isPine ? _forestPine(px, cy, pz, s) : _forestBirch(px, cy, pz, s, ctx);
      mesh.rotation.y = ctx.rng() * Math.PI * 2;

      const baseQuat = mesh.quaternion.clone();
      ctx.boardGroup.add(mesh);

      const bx = px - cx, bz = pz - cz;
      const br = Math.sqrt(bx*bx + bz*bz) || 1e-6;
      const inward = Math.atan2(-bx / br, -bz / br);
      const fallDir = inward + (ctx.rng() - 0.5) * P.FALL_ANGLE_JITTER;

      out.trees.push({
        mesh, isPine, scale: s,
        baseQuat,
        basePos: new THREE.Vector3(px, cy, pz),
        pos: new THREE.Vector3(px, cy, pz),
        state: 'standing',
        fallT: 0,
        fallDir,
        fallenMesh: null,
        branches: null,
        cleanedCount: 0,
        regrowAt: 0,
        growT: 0
      });
    }

    for (let i = 0; i < P.BUSH_COUNT; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 0.15 + ctx.rng() * 0.55;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      if (inSafeZone(px, pz, cx, cz)) continue;
      const bush = _createBush(px, cy, pz, 0.7 + ctx.rng() * 0.6, ctx);
      ctx.boardGroup.add(bush);
      out.bushes.push(bush);
    }

    for (let i = 0; i < P.GRASS_COUNT; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = ctx.rng() * 0.68;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      if (inSafeZone(px, pz, cx, cz)) continue;
      const grass = _createGrassTuft(px, cy, pz, 0.8 + ctx.rng() * 0.5, ctx);
      ctx.boardGroup.add(grass);
      out.grass.push(grass);
    }

    for (let i = 0; i < P.MUSHROOM_COUNT; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 0.2 + ctx.rng() * 0.5;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      if (inSafeZone(px, pz, cx, cz)) continue;
      const mush = _createMushroom(px, cy, pz, 1.0 + ctx.rng() * 0.4);
      ctx.boardGroup.add(mush);
      out.mushrooms.push(mush);
    }

    for (let i = 0; i < P.ROCK_COUNT; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 0.3 + ctx.rng() * 0.4;
      const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
      if (inSafeZone(px, pz, cx, cz)) continue;
      const rock = _createRock(px, cy, pz, 0.9 + ctx.rng() * 0.8, ctx);
      ctx.boardGroup.add(rock);
      out.rocks.push(rock);
    }

    return out;
  }

  // ============ АНИМАЦИЯ ============

  function _createForestAnim(cx, cy, cz, ctx, decor) {
    const state = {
      cx, cy, cz, ctx,
      trees: decor.trees,
      workers: [],
      pilePos: new THREE.Vector3(cx + FOREST_PARAMS.PILE_OFFSET_X, cy,
                                  cz + FOREST_PARAMS.PILE_OFFSET_Z),
      pileCount: 0,
      safeR: FOREST_PARAMS.SAFE_RADIUS
    };

    const cutterObj = _createWorker(0x3366cc);
    const saw = _createSaw();
    saw.rotation.y = -Math.PI / 2;
    cutterObj.parts.armR.hand.add(saw);
    cutterObj.group.position.set(cx - 0.40, cy, cz - 0.40);
    cutterObj.group.rotation.y = Math.PI / 4;
    ctx.boardGroup.add(cutterObj.group);

    const haulerObj = _createWorker(0x8b5a2b);
    const knife = _createKnife();
    knife.rotation.y = -Math.PI / 2;
    knife.visible = false;
    haulerObj.parts.armR.hand.add(knife);
    haulerObj.group.position.set(cx + 0.42, cy, cz + 0.42);
    ctx.boardGroup.add(haulerObj.group);

    state.workers.push({
      type: 'cutter', obj: cutterObj, saw,
      state: 'idle', target: null, timer: 0, walkPhase: 0
    });
    state.workers.push({
      type: 'hauler', obj: haulerObj, knife,
      state: 'idle', target: null, log: null,
      timer: 0, walkPhase: 0
    });

    return state;
  }

  function _updateCutter(w, state, dt, now) {
    const g = w.obj.group, p = w.obj.parts;
    const { cx, cz, safeR } = state;

    function walkAnim() {
      w.walkPhase += dt * FOREST_PARAMS.WALK_ANIM_SPEED;
      const sw = Math.sin(w.walkPhase) * 0.55;
      p.legL.group.rotation.x =  sw;
      p.legR.group.rotation.x = -sw;
      p.armL.group.rotation.x = -sw * 0.5;
      p.armR.group.rotation.x =  sw * 0.5;
    }
    function idleAnim() {
      p.legL.group.rotation.x *= 0.85;
      p.legR.group.rotation.x *= 0.85;
      p.armL.group.rotation.x *= 0.85;
      p.armR.group.rotation.x *= 0.85;
    }

    if (w.state === 'idle') {
      idleAnim();
      let best = null, bestDist = Infinity;
      for (const t of state.trees) {
        if (t.state !== 'standing') continue;
        const d = t.mesh.position.distanceTo(g.position);
        if (d < bestDist) { bestDist = d; best = t; }
      }
      if (best) { w.target = best; w.state = 'moving'; }

    } else if (w.state === 'moving') {
      walkAnim();
      if (_moveTowards(g, w.target.mesh.position, FOREST_PARAMS.CUTTER_SPEED,
                       dt, cx, cz, safeR)) {
        w.state = 'cutting';
        w.timer = 0;
      }

    } else if (w.state === 'cutting') {
      idleAnim();
      const dx = w.target.mesh.position.x - g.position.x;
      const dz = w.target.mesh.position.z - g.position.z;
      const targetRot = Math.atan2(dx, dz);
      let diff = targetRot - g.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      g.rotation.y += diff * Math.min(1, dt * 5);

      const swing = Math.sin(now * 0.012) * 0.35;
      p.armR.group.rotation.x = -Math.PI / 3 + swing;
      p.armL.group.rotation.x = -Math.PI / 3 - swing * 0.4;
      p.armR.group.rotation.z =  0.10;
      p.armL.group.rotation.z = -0.10;

      w.timer += dt;
      if (w.timer > FOREST_PARAMS.CUT_DURATION) {
        w.target.state = 'falling';
        w.target.fallT = 0;
        w.state = 'idle';
        w.target = null;
        p.armR.group.rotation.set(0,0,0);
        p.armL.group.rotation.set(0,0,0);
      }
    }

    for (const t of state.trees) {
      if (t.state !== 'falling') continue;

      t.fallT += dt / FOREST_PARAMS.FALL_DURATION;
      const pgt = Math.min(1, t.fallT);
      const e = _easeInQuad(pgt);
      const angle = e * Math.PI / 2;

      _TMP_VEC.set(Math.cos(t.fallDir), 0, -Math.sin(t.fallDir));
      const qTilt = new THREE.Quaternion().setFromAxisAngle(_TMP_VEC, angle);
      t.mesh.quaternion.copy(qTilt).multiply(t.baseQuat);

      if (pgt >= 1) {
        t.mesh.visible = false;
        t.state = 'fallen';
        _spawnFallenTree(t, state);
      }
    }

    for (const t of state.trees) {
      if (t.state === 'regrowing') {
        t.growT += dt;
        const e = Math.min(1, t.growT / FOREST_PARAMS.REGROW_DURATION);
        const s = _easeInOut(e);
        t.mesh.scale.setScalar(s);
        if (e >= 1) {
          t.mesh.scale.setScalar(1);
          t.state = 'standing';
        }
      }
      if (t.state === 'stacked' && now >= t.regrowAt) {
        t.state = 'regrowing';
        t.growT = 0;
        t.mesh.visible = true;
        t.mesh.quaternion.copy(t.baseQuat);
        t.mesh.position.copy(t.basePos);
        t.mesh.scale.setScalar(0.001);
      }
    }
  }

  function _spawnFallenTree(t, state) {
    const cy = state.cy;
    const logDir = t.fallDir + Math.PI / 2;
    const halfL = 0.225 * t.scale;
    const fx = t.basePos.x + Math.sin(t.fallDir) * halfL;
    const fz = t.basePos.z + Math.cos(t.fallDir) * halfL;
    const fallen = _createFallenTree(fx, cy, fz, t.scale, logDir);
    state.ctx.boardGroup.add(fallen);
    t.fallenMesh = fallen;
    t.branches = fallen.userData.branches.slice();
    t.cleanedCount = 0;
    t.pos.set(fx, cy, fz);
  }

  function _updateHauler(w, state, dt, now) {
    const g = w.obj.group, p = w.obj.parts;
    const { cx, cz, safeR } = state;

    function walkAnim() {
      w.walkPhase += dt * FOREST_PARAMS.WALK_ANIM_SPEED;
      const sw = Math.sin(w.walkPhase) * 0.55;
      p.legL.group.rotation.x =  sw;
      p.legR.group.rotation.x = -sw;
      p.armL.group.rotation.x = -sw * 0.4;
      p.armR.group.rotation.x =  sw * 0.4;
    }
    function idleAnim() {
      p.legL.group.rotation.x *= 0.85;
      p.legR.group.rotation.x *= 0.85;
      p.armL.group.rotation.x *= 0.85;
      p.armR.group.rotation.x *= 0.85;
    }

    if (w.state === 'idle') {
      idleAnim();
      w.knife.visible = false;
      let best = null, bestDist = Infinity;
      for (const t of state.trees) {
        if (t.state !== 'fallen') continue;
        const d = t.pos.distanceTo(g.position);
        if (d < bestDist) { bestDist = d; best = t; }
      }
      if (best) { w.target = best; w.state = 'to_fallen'; }

    } else if (w.state === 'to_fallen') {
      walkAnim();
      if (_moveTowards(g, w.target.pos, FOREST_PARAMS.HAULER_SPEED,
                       dt, cx, cz, safeR)) {
        w.state = 'cleaning';
        w.timer = 0;
        w.cleaned = 0;
        w.knife.visible = true;
        const dx = w.target.pos.x - g.position.x;
        const dz = w.target.pos.z - g.position.z;
        g.rotation.y = Math.atan2(dx, dz);
        w.target.state = 'cleaning';
      }

    } else if (w.state === 'cleaning') {
      idleAnim();
      const swing = Math.sin(now * 0.02) * 0.6;
      p.armR.group.rotation.x = -Math.PI / 2 + swing;
      p.armL.group.rotation.x = -Math.PI / 4;

      w.timer += dt;
      if (w.timer > FOREST_PARAMS.CLEAN_BRANCH_TIME &&
          w.cleaned < w.target.branches.length) {
        w.timer = 0;
        const br = w.target.branches[w.cleaned];
        if (br.parent) br.parent.remove(br);
        w.cleaned++;
      }
      if (w.cleaned >= w.target.branches.length &&
          w.timer > FOREST_PARAMS.CLEAN_BRANCH_TIME) {
        w.state = 'bend';
        w.timer = 0;
        w.knife.visible = false;
        p.armR.group.rotation.set(0,0,0);
        p.armL.group.rotation.set(0,0,0);
        w.target.state = 'cleaned';
      }

    } else if (w.state === 'bend') {
      w.timer += dt;
      const t = Math.min(1, w.timer / FOREST_PARAMS.BEND_TIME);
      const e = _easeInOut(t);
      p.torso.rotation.x = e * 0.8;
      p.head.rotation.x  = e * 0.4;
      p.armR.group.rotation.x = -e * 1.15;
      p.armL.group.rotation.x = -e * 1.15;

      if (t >= 1) {
        w.state = 'pick';
        w.timer = 0;
      }

    } else if (w.state === 'pick') {
      w.timer += dt;
      const t = Math.min(1, w.timer / FOREST_PARAMS.PICK_TIME);
      const e = 1 - _easeInOut(t);

      p.torso.rotation.x = e * 0.8;
      p.head.rotation.x  = e * 0.4;
      p.armR.group.rotation.x = -e * 1.15 - (1 - e) * 0.5;
      p.armL.group.rotation.x = -e * 1.15 - (1 - e) * 0.5;

      _followHand(w.target.fallenMesh, p.armR.hand, g);

      if (t >= 1) {
        w.target.state = 'carried';
        w.state = 'carry';
        w.timer = 0;
      }

    } else if (w.state === 'carry') {
      walkAnim();
      p.armR.group.rotation.x = -0.5;
      p.armL.group.rotation.x = -0.4;

      _followHand(w.target.fallenMesh, p.armR.hand, g);

      if (_moveTowards(g, state.pilePos, FOREST_PARAMS.HAULER_SPEED,
                       dt, cx, cz, safeR)) {
        w.state = 'drop';
        w.timer = 0;
      }

    } else if (w.state === 'drop') {
      w.timer += dt;
      p.armR.group.rotation.x = -0.5 + w.timer * 1.5;
      p.armL.group.rotation.x = -0.4 + w.timer * 1.2;

      if (w.timer > 0.3) {
        const log = w.target.fallenMesh;
        state.pileCount++;

        const level = state.pileCount % FOREST_PARAMS.MAX_PILE_LEVELS;
        const col = Math.floor(state.pileCount / FOREST_PARAMS.MAX_PILE_LEVELS);
        const ang = col * 0.9;
        const rad = 0.05 * (col % 3);

        log.position.set(
          state.pilePos.x + Math.cos(ang) * rad,
          state.cy + 0.028 + level * FOREST_PARAMS.PILE_STACK_HEIGHT,
          state.pilePos.z + Math.sin(ang) * rad
        );
        // ИСПОЛЬЗУЕМ ctx.rng() ВМЕСТО Math.random()
        log.rotation.set(0, state.ctx.rng() * Math.PI, 0);

        w.target.state = 'stacked';
        w.target.regrowAt = now + FOREST_PARAMS.REGROW_DELAY_MS;
        w.target = null;

        w.state = 'idle';
        w.timer = 0;
        p.torso.rotation.x = 0; p.head.rotation.x = 0;
        p.armR.group.rotation.set(0,0,0);
        p.armL.group.rotation.set(0,0,0);
      }
    }
  }

  function _followHand(log, hand, workerGroup) {
    if (!log) return;
    hand.getWorldPosition(_TMP_VEC);
    log.position.copy(_TMP_VEC);
    log.rotation.set(0, workerGroup.rotation.y - Math.PI / 2, 0);
  }

  function _updateForestAnim(state, dt, now) {
    if (!state || !state.workers) return;
    for (const w of state.workers) {
      if (w.type === 'cutter') _updateCutter(w, state, dt, now);
      else if (w.type === 'hauler') _updateHauler(w, state, dt, now);
    }
  }

  // ============ ПУБЛИЧНЫЙ API ============

  window.HexForest = {
    create(cx, cy, cz, ctx) {
      const decor = _buildForestDecor(cx, cy, cz, ctx);
      const anim  = _createForestAnim(cx, cy, cz, ctx, decor);
      return { decor, anim };
    },
    update(state, dt, now) {
      _updateForestAnim(state.anim, dt, now);
    },
    destroy(state) {
      if (state.anim) {
        for (const w of state.anim.workers) {
          if (w.obj?.group?.parent) w.obj.group.parent.remove(w.obj.group);
        }
        for (const t of state.anim.trees) {
          if (t.mesh?.parent) t.mesh.parent.remove(t.mesh);
          if (t.fallenMesh?.parent) t.fallenMesh.parent.remove(t.fallenMesh);
        }
      }
    }
  };

  console.log('[HexForest] OK — полная синхронизация rng');
})();