/* ============================================================
   desert.js — пустыня: рыцарь-представление, конь, ветер, смерч
   Обёрнуто в IIFE, чтобы не конфликтовать с другими hex-модулями.
   ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // НАСТРОЙКИ
  // ============================================================
  const CFG = {
    HEX_RADIUS: 0.9,
    HEX_MARGIN: 0.22,
    SAFE_ZONE_RADIUS: 0.18,

    KNIGHT_SCALE: 0.55,
    HORSE_SCALE: 0.48,
    DUMMY_SCALE: 0.62,

    KNIGHT_POS:  { x:  0.12, z:  0.44 },
    DUMMY_POS:   { x:  0.32, z:  0.30 },
    HORSE_POS:   { x: -0.40, z: -0.28 },
    BANNER_POS:  { x: -0.32, z:  0.36 },
    TORNADO_POS: { x:  0.42, z: -0.35 },

    PERFORMANCE_TIME: 8.0,     // полный цикл выступления рыцаря (сек)
    HORSE_GRAZE_TIME: 8.0,
    TORNADO_PERIOD: 14.0,      // период появления смерча
    WIND_PUFFS: 6,
  };

  // ============================================================
  // МАТЕРИАЛЫ
  // ============================================================
  const _steelMat     = new THREE.MeshStandardMaterial({ color: 0xC8CCD2, roughness: 0.28, metalness: 0.85 });
  const _plateMat     = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.42, metalness: 0.7  });
  const _chainMat     = new THREE.MeshStandardMaterial({ color: 0x4A4E55, roughness: 0.75, metalness: 0.55 });
  const _goldMat      = new THREE.MeshStandardMaterial({ color: 0xD4A72B, roughness: 0.35, metalness: 0.85 });
  const _leatherMat   = new THREE.MeshStandardMaterial({ color: 0x5A3A1E, roughness: 0.85 });
  const _darkLeather  = new THREE.MeshStandardMaterial({ color: 0x2E1A0E, roughness: 0.9  });
  const _tabardMat    = new THREE.MeshStandardMaterial({ color: 0xB01E1E, roughness: 0.85 });
  const _plumeMat     = new THREE.MeshStandardMaterial({ color: 0xE03030, roughness: 0.7  });
  const _darkMat      = new THREE.MeshStandardMaterial({ color: 0x0A0A0A, roughness: 0.5  });
  const _eyeMat       = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4  });

  const _horseBodyMat = new THREE.MeshStandardMaterial({ color: 0x3B2418, roughness: 0.85 });
  const _horseManeMat = new THREE.MeshStandardMaterial({ color: 0x1A0F08, roughness: 0.9  });
  const _hoofMat      = new THREE.MeshStandardMaterial({ color: 0x1A1208, roughness: 0.6  });
  const _bardingMat   = new THREE.MeshStandardMaterial({ color: 0x8B1616, roughness: 0.8  });

  const _clothMat     = new THREE.MeshStandardMaterial({ color: 0xC0A57A, roughness: 0.95 });
  const _ropeMat      = new THREE.MeshStandardMaterial({ color: 0xA88860, roughness: 0.95 });
  const _woodMat      = new THREE.MeshStandardMaterial({ color: 0x6B4A26, roughness: 0.85 });
  const _woodDarkMat  = new THREE.MeshStandardMaterial({ color: 0x3E2A14, roughness: 0.9  });

  const _sandMat      = (typeof MAT !== 'undefined' && MAT.sand)      || new THREE.MeshStandardMaterial({ color: 0xD9B77A, roughness: 0.95 });
  const _sandLightMat = (typeof MAT !== 'undefined' && MAT.sandLight) || new THREE.MeshStandardMaterial({ color: 0xE8CF98, roughness: 0.95 });
  const _sandDarkMat  = (typeof MAT !== 'undefined' && MAT.sandDark)  || new THREE.MeshStandardMaterial({ color: 0xA88860, roughness: 0.95 });

  // ============================================================
  // ГЕОМЕТРИЯ ГЕКСА (pointy-top)
  // ============================================================
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

  // ============================================================
  // ГЛАДКАЯ ДЕФОРМАЦИЯ (для дюн)
  // ============================================================
  function _smoothDeform(geo, amp, freq, squashY) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + amp * (
        Math.sin(x * freq + y * freq * 0.6) * 0.5 +
        Math.cos(z * freq * 1.1 - y * freq * 0.4) * 0.5
      );
      pos.setX(i, x * n);
      pos.setY(i, y * n * (squashY || 1));
      pos.setZ(i, z * n);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  }

  // ============================================================
  // МЕЧ
  // ============================================================
  function _createSword() {
    const g = new THREE.Group();

    const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), _goldMat);
    pommel.position.y = -0.045;
    g.add(pommel);

    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), _leatherMat);
    grip.position.y = -0.005;
    g.add(grip);

    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.012, 0.018), _goldMat);
    guard.position.y = 0.030;
    g.add(guard);
    const gTipL = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 5), _goldMat);
    gTipL.position.set(-0.048, 0.030, 0);
    g.add(gTipL);
    const gTipR = gTipL.clone();
    gTipR.position.x = 0.048;
    g.add(gTipR);

    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.22, 0.008), _steelMat);
    blade.position.y = 0.150;
    blade.castShadow = true;
    g.add(blade);

    const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.20, 0.0095), _plateMat);
    fuller.position.y = 0.150;
    g.add(fuller);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.05, 4), _steelMat);
    tip.position.y = 0.285;
    tip.rotation.y = Math.PI / 4;
    g.add(tip);

    return g;
  }

  // ============================================================
  // РЫЦАРЬ
  // ============================================================
  function _createKnight() {
    const g = new THREE.Group();

    // НОГИ
    function makeLeg(side) {
      const leg = new THREE.Group();

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.13, 7), _chainMat);
      thigh.position.y = -0.065;
      thigh.castShadow = true;
      leg.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.10, 7), _plateMat);
      shin.position.y = -0.175;
      shin.castShadow = true;
      leg.add(shin);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), _plateMat);
      knee.position.y = -0.115;
      knee.scale.set(1, 0.8, 1);
      leg.add(knee);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.028, 0.085), _darkLeather);
      boot.position.set(0, -0.235, 0.018);
      boot.castShadow = true;
      leg.add(boot);
      const bootTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), _darkLeather);
      bootTip.position.set(0, -0.240, 0.055);
      bootTip.scale.set(1, 0.7, 1.1);
      leg.add(bootTip);

      leg.position.set(side * 0.048, 0.24, 0);
      return leg;
    }
    const legL = makeLeg(-1);
    const legR = makeLeg(1);
    g.add(legL);
    g.add(legR);
    g.userData.legL = legL;
    g.userData.legR = legR;

    // ТОРС
    const torsoGroup = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.072, 0.20, 10), _chainMat);
    torso.position.y = 0.34;
    torso.castShadow = true;
    torsoGroup.add(torso);

    const tabardFront = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.20, 0.008), _tabardMat);
    tabardFront.position.set(0, 0.34, 0.072);
    torsoGroup.add(tabardFront);
    const tabardBack = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.20, 0.008), _tabardMat);
    tabardBack.position.set(0, 0.34, -0.072);
    torsoGroup.add(tabardBack);

    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.006), _goldMat);
    emblem.rotation.z = Math.PI / 4;
    emblem.position.set(0, 0.40, 0.077);
    torsoGroup.add(emblem);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.022, 10), _darkLeather);
    belt.position.y = 0.24;
    torsoGroup.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.02, 0.008), _goldMat);
    buckle.position.set(0, 0.24, 0.066);
    torsoGroup.add(buckle);

    function makePauldron(side) {
      const p = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        _plateMat
      );
      shell.scale.set(1.05, 0.85, 1.05);
      shell.castShadow = true;
      p.add(shell);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.005, 4, 14), _goldMat);
      trim.rotation.x = Math.PI / 2;
      trim.position.y = -0.005;
      p.add(trim);
      p.position.set(side * 0.075, 0.44, 0);
      return p;
    }
    torsoGroup.add(makePauldron(-1));
    torsoGroup.add(makePauldron(1));

    g.add(torsoGroup);
    g.userData.torsoGroup = torsoGroup;

    // ЛЕВАЯ РУКА
    const armL = new THREE.Group();
    armL.position.set(-0.075, 0.42, 0);
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.11, 7), _chainMat);
    upperArmL.position.y = -0.055;
    upperArmL.castShadow = true;
    armL.add(upperArmL);
    const vambraceL = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.016, 0.09, 7), _plateMat);
    vambraceL.position.y = -0.155;
    vambraceL.castShadow = true;
    armL.add(vambraceL);
    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 6), _plateMat);
    gloveL.position.y = -0.215;
    gloveL.castShadow = true;
    armL.add(gloveL);
    g.add(armL);
    g.userData.armL = armL;

    // ПРАВАЯ РУКА С МЕЧОМ
    const armR = new THREE.Group();
    armR.position.set(0.075, 0.42, 0);

    const upperArmR = upperArmL.clone();
    armR.add(upperArmR);
    const vambraceR = vambraceL.clone();
    armR.add(vambraceR);
    const gloveR = gloveL.clone();
    armR.add(gloveR);

    const sword = _createSword();
    sword.rotation.x = Math.PI / 2;
    sword.position.set(0, -0.215, 0.012);
    armR.add(sword);
    g.userData.sword = sword;

    g.add(armR);
    g.userData.armR = armR;

    // ГОЛОВА
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.48;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.045, 7), _chainMat);
    neck.position.y = 0.02;
    headGroup.add(neck);

    const coif = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.045, 8), _chainMat);
    coif.position.y = 0.045;
    headGroup.add(coif);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.65),
      _plateMat
    );
    helmet.position.y = 0.10;
    helmet.castShadow = true;
    headGroup.add(helmet);

    const helmetLower = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.050, 0.055, 12), _plateMat);
    helmetLower.position.y = 0.075;
    helmetLower.castShadow = true;
    headGroup.add(helmetLower);

    const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.008, 0.004), _darkMat);
    visorSlit.position.set(0, 0.10, 0.048);
    headGroup.add(visorSlit);

    const nosePlate = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.055, 0.008), _plateMat);
    nosePlate.position.set(0, 0.085, 0.051);
    headGroup.add(nosePlate);

    for (let i = 0; i < 4; i++) {
      const hole = new THREE.Mesh(new THREE.SphereGeometry(0.003, 4, 3), _darkMat);
      hole.position.set(-0.012 + (i % 2) * 0.024, 0.060 - Math.floor(i / 2) * 0.008, 0.051);
      headGroup.add(hole);
    }

    const plumeBase = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), _goldMat);
    plumeBase.position.y = 0.148;
    headGroup.add(plumeBase);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.10, 6), _plumeMat);
    plume.position.set(0, 0.20, -0.008);
    plume.rotation.x = 0.25;
    headGroup.add(plume);

    g.add(headGroup);
    g.userData.headGroup = headGroup;

    // ПЛАЩ
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x8B1616, roughness: 0.9, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.34, -0.078);
    cape.rotation.x = -0.06;
    g.add(cape);

    g.scale.setScalar(CFG.KNIGHT_SCALE);
    return g;
  }

  // ============================================================
  // ТРЕНИРОВОЧНОЕ ЧУЧЕЛО
  // ============================================================
  function _createTrainingDummy() {
    const g = new THREE.Group();

    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), _sandDarkMat);
    mound.position.y = 0.005;
    mound.scale.set(1.2, 0.35, 1.2);
    mound.receiveShadow = true;
    g.add(mound);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.036, 0.42, 12), _woodMat);
    post.position.y = 0.22;
    post.castShadow = true;
    g.add(post);

    const postTop = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.02, 12), _woodDarkMat);
    postTop.position.y = 0.44;
    g.add(postTop);

    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.020, 0.32, 10), _woodMat);
    arms.rotation.z = Math.PI / 2;
    arms.position.y = 0.36;
    arms.castShadow = true;
    g.add(arms);

    const capGeo = new THREE.SphereGeometry(0.020, 7, 6);
    const capL = new THREE.Mesh(capGeo, _woodDarkMat);
    capL.position.set(-0.16, 0.36, 0);
    g.add(capL);
    const capR = new THREE.Mesh(capGeo, _woodDarkMat);
    capR.position.set(0.16, 0.36, 0);
    g.add(capR);

    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.17, 12), _clothMat);
    wrap.position.y = 0.31;
    wrap.castShadow = true;
    g.add(wrap);

    for (let i = 0; i < 3; i++) {
      const rope = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.005, 5, 14), _ropeMat);
      rope.rotation.x = Math.PI / 2;
      rope.position.y = 0.25 + i * 0.06;
      g.add(rope);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), _clothMat);
    head.position.y = 0.48;
    head.scale.set(1, 1.15, 1);
    head.castShadow = true;
    g.add(head);
    const headRope = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.004, 5, 14), _ropeMat);
    headRope.rotation.x = Math.PI / 2;
    headRope.position.y = 0.48;
    g.add(headRope);

    for (let i = 0; i < 6; i++) {
      const mark = new THREE.Mesh(new THREE.CircleGeometry(0.006 + Math.random() * 0.006, 6), _darkMat);
      const a = Math.random() * Math.PI * 2;
      const y = 0.24 + Math.random() * 0.16;
      mark.position.set(Math.cos(a) * 0.046, y, Math.sin(a) * 0.046);
      mark.lookAt(mark.position.clone().multiplyScalar(2));
      g.add(mark);
    }

    g.scale.setScalar(CFG.DUMMY_SCALE);
    return g;
  }

  // ============================================================
  // БОЕВОЙ КОНЬ
  // ============================================================
  function _createHorse() {
    const g = new THREE.Group();

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.32, 14), _horseBodyMat);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);

    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), _horseBodyMat);
    chest.position.set(0.15, 0.28, 0);
    chest.scale.set(0.9, 1, 1);
    chest.castShadow = true;
    g.add(chest);

    const rump = new THREE.Mesh(new THREE.SphereGeometry(0.10, 12, 10), _horseBodyMat);
    rump.position.set(-0.15, 0.28, 0);
    rump.scale.set(0.95, 1, 1);
    rump.castShadow = true;
    g.add(rump);

    const legs = [];
    const legPositions = [
      [ 0.13,  0.06], [ 0.13, -0.06],
      [-0.13,  0.06], [-0.13, -0.06],
    ];
    legPositions.forEach(function (p) {
      const leg = new THREE.Group();
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.019, 0.13, 7), _horseBodyMat);
      upper.position.y = -0.065;
      upper.castShadow = true;
      leg.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.12, 7), _horseBodyMat);
      lower.position.y = -0.185;
      lower.castShadow = true;
      leg.add(lower);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.02, 7), _hoofMat);
      hoof.position.y = -0.255;
      leg.add(hoof);
      leg.position.set(p[0], 0.28, p[1]);
      g.add(leg);
      legs.push(leg);
    });
    g.userData.legs = legs;

    const neckGroup = new THREE.Group();
    neckGroup.position.set(0.16, 0.33, 0);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.062, 0.22, 9), _horseBodyMat);
    neck.position.set(0.06, 0.10, 0);
    neck.rotation.z = -0.55;
    neck.castShadow = true;
    neckGroup.add(neck);

    for (let i = 0; i < 6; i++) {
      const mane = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.055, 5), _horseManeMat);
      mane.position.set(-0.015 + i * 0.028, 0.14 + i * 0.018, 0);
      mane.rotation.z = -1.3;
      neckGroup.add(mane);
    }

    const headGroup = new THREE.Group();
    headGroup.position.set(0.15, 0.20, 0);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.075, 0.060), _horseBodyMat);
    head.position.set(0.03, 0, 0);
    head.rotation.z = 0.22;
    head.castShadow = true;
    headGroup.add(head);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.048, 0.055), _horseBodyMat);
    muzzle.position.set(0.10, -0.022, 0);
    muzzle.castShadow = true;
    headGroup.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.013, 6, 5), _darkMat);
    nose.position.set(0.128, -0.032, 0);
    headGroup.add(nose);

    const eyeGeo = new THREE.SphereGeometry(0.009, 6, 5);
    const eyeL = new THREE.Mesh(eyeGeo, _eyeMat);
    eyeL.position.set(0.025, 0.020, 0.028);
    headGroup.add(eyeL);
    const eyeR = eyeL.clone();
    eyeR.position.z = -0.028;
    headGroup.add(eyeR);

    const earGeo = new THREE.ConeGeometry(0.013, 0.042, 5);
    const earL = new THREE.Mesh(earGeo, _horseBodyMat);
    earL.position.set(-0.02, 0.055, 0.022);
    headGroup.add(earL);
    const earR = earL.clone();
    earR.position.z = -0.022;
    headGroup.add(earR);

    const chamfron = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.065, 0.065), _plateMat);
    chamfron.position.set(0.025, 0.005, 0);
    chamfron.castShadow = true;
    headGroup.add(chamfron);

    const chamfronTrim = new THREE.Mesh(new THREE.BoxGeometry(0.118, 0.008, 0.068), _goldMat);
    chamfronTrim.position.set(0.025, 0.040, 0);
    headGroup.add(chamfronTrim);

    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.065, 6), _goldMat);
    spike.position.set(0.095, 0.040, 0);
    spike.rotation.z = -Math.PI / 3;
    headGroup.add(spike);

    const hPlume = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.08, 6), _plumeMat);
    hPlume.position.set(-0.02, 0.075, 0);
    hPlume.rotation.x = -0.3;
    headGroup.add(hPlume);

    const rein1 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.008, 0.008), _darkLeather);
    rein1.position.set(0.10, -0.010, 0.032);
    headGroup.add(rein1);
    const rein2 = rein1.clone();
    rein2.position.z = -0.032;
    headGroup.add(rein2);

    neckGroup.add(headGroup);
    neckGroup.userData.headGroup = headGroup;
    g.add(neckGroup);
    g.userData.neckGroup = neckGroup;

    const barding = new THREE.Mesh(
      new THREE.CylinderGeometry(0.115, 0.118, 0.30, 14, 1, true, Math.PI * 0.15, Math.PI * 1.7),
      _bardingMat
    );
    barding.rotation.z = Math.PI / 2;
    barding.position.y = 0.26;
    barding.material.side = THREE.DoubleSide;
    g.add(barding);

    const trimGeo = new THREE.TorusGeometry(0.115, 0.006, 5, 18, Math.PI * 1.7);
    const trim1 = new THREE.Mesh(trimGeo, _goldMat);
    trim1.rotation.y = Math.PI / 2;
    trim1.rotation.z = Math.PI * 0.15;
    trim1.position.set(0.15, 0.26, 0);
    g.add(trim1);
    const trim2 = new THREE.Mesh(trimGeo, _goldMat);
    trim2.rotation.y = Math.PI / 2;
    trim2.rotation.z = Math.PI * 0.15;
    trim2.position.set(-0.15, 0.26, 0);
    g.add(trim2);

    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.006), _goldMat);
    emblem.rotation.z = Math.PI / 4;
    emblem.position.set(0, 0.35, 0.115);
    g.add(emblem);
    const emblem2 = emblem.clone();
    emblem2.position.z = -0.115;
    g.add(emblem2);

    const tailBase = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 6), _horseBodyMat);
    tailBase.position.set(-0.20, 0.30, 0);
    g.add(tailBase);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.024, 0.16, 6), _horseManeMat);
    tail.position.set(-0.22, 0.22, 0);
    tail.rotation.z = 0.5;
    tail.castShadow = true;
    g.add(tail);
    g.userData.tail = tail;
    for (let i = 0; i < 3; i++) {
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.06, 4), _horseManeMat);
      strand.position.set(-0.25 - i * 0.005, 0.16 + i * 0.02, 0);
      strand.rotation.z = 0.3 - i * 0.15;
      g.add(strand);
    }

    g.scale.setScalar(CFG.HORSE_SCALE);
    return g;
  }

  // ============================================================
  // ЗНАМЯ, КАМНИ, СУХИЕ КУСТЫ
  // ============================================================
  function _createBanner() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 7), _woodMat);
    pole.position.y = 0.275;
    pole.castShadow = true;
    g.add(pole);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), _goldMat);
    tip.position.y = 0.575;
    g.add(tip);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(0.13, 0.10),
      new THREE.MeshStandardMaterial({ color: 0x8B1616, roughness: 0.9, side: THREE.DoubleSide })
    );
    flag.position.set(0.065, 0.50, 0);
    g.add(flag);
    g.userData.flag = flag;
    return g;
  }

  function _createRock(x, y, z, scale, ctx) {
    const geo = new THREE.SphereGeometry(0.06, 10, 8);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const n = 0.75 + ctx.rng() * 0.5;
      pos.setX(i, pos.getX(i) * n);
      pos.setY(i, pos.getY(i) * n);
      pos.setZ(i, pos.getZ(i) * n);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    const rock = new THREE.Mesh(geo, _sandDarkMat);
    rock.position.set(x, y, z);
    rock.scale.setScalar(scale);
    rock.rotation.set(ctx.rng() * Math.PI, ctx.rng() * Math.PI, ctx.rng() * Math.PI);
    rock.castShadow = true;
    rock.receiveShadow = true;
    return rock;
  }

  function _createDryBush(x, y, z, scale, ctx) {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8B6B3D, roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.002, 0.07, 4), mat);
      const a = ctx.rng() * Math.PI * 2;
      twig.position.set(Math.cos(a) * 0.01, 0.035, Math.sin(a) * 0.01);
      twig.rotation.z = (ctx.rng() - 0.5) * 0.8;
      twig.rotation.x = (ctx.rng() - 0.5) * 0.8;
      g.add(twig);
    }
    g.position.set(x, y, z);
    g.scale.setScalar(scale);
    return g;
  }

  // ============================================================
  // ВЕТЕР И СМЕРЧ
  // ============================================================
  function _createWindPuff() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xE8CF98, transparent: true, opacity: 0.30,
      roughness: 0.95, depthWrite: false,
    });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.008 + Math.random() * 0.006, 6, 5), mat);
      s.position.set((Math.random() - 0.5) * 0.025, (Math.random() - 0.5) * 0.012, (Math.random() - 0.5) * 0.025);
      g.add(s);
    }
    g.userData.phase = Math.random() * Math.PI * 2;
    g.userData.radius = 0.30 + Math.random() * 0.28;
    g.userData.height = 0.04 + Math.random() * 0.07;
    g.userData.speed = 0.25 + Math.random() * 0.35;
    g.userData.bob = Math.random() * Math.PI * 2;
    return g;
  }

  function _createTornado() {
    const g = new THREE.Group();
    const particles = [];
    const count = 32;

    const matLow = new THREE.MeshStandardMaterial({
      color: 0xA88860, transparent: true, opacity: 0.50, roughness: 0.9, depthWrite: false,
    });
    const matHigh = new THREE.MeshStandardMaterial({
      color: 0xD9B77A, transparent: true, opacity: 0.35, roughness: 0.9, depthWrite: false,
    });

    for (let i = 0; i < count; i++) {
      const level = i / count;
      const size = 0.006 + (1 - level) * 0.005;
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(size, 5, 4),
        level > 0.6 ? matHigh : matLow
      );
      s.position.y = level * 0.22;
      g.add(s);
      particles.push({ mesh: s, level: level, baseAngle: level * Math.PI * 4 });
    }

    // Воронка сверху
    const topCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.10, 10, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xD9B77A, transparent: true, opacity: 0.20,
        side: THREE.DoubleSide, roughness: 0.9, depthWrite: false,
      })
    );
    topCone.position.y = 0.24;
    topCone.rotation.x = Math.PI;
    g.add(topCone);
    g.userData.topCone = topCone;
    g.userData.particles = particles;

    return g;
  }

  // ============================================================
  // ПОСТРОЕНИЕ ГЕКСА
  // ============================================================
  function _buildDesertDecor(cx, cy, cz, ctx) {
    const objs = [];

    // === ДЮНЫ (плавные, ровные) ===
    const dunePositions = [
      { dx: -0.52, dz:  0.32, r: 0.30, h: 0.055 },
      { dx:  0.48, dz:  0.12, r: 0.26, h: 0.045 },
    ];
    dunePositions.forEach(function (d, i) {
      const geo = new THREE.SphereGeometry(d.r, 22, 16);
      _smoothDeform(geo, 0.05, 7, 1);
      const dune = new THREE.Mesh(geo, i % 2 === 0 ? _sandMat : _sandLightMat);
      dune.position.set(cx + d.dx, cy, cz + d.dz);
      dune.scale.set(1.35, d.h / d.r, 1.1);
      dune.castShadow = true;
      dune.receiveShadow = true;
      ctx.boardGroup.add(dune);
      objs.push(dune);
    });

    // === ПЕСЧАНЫЕ ПЯТНА ===
    for (let i = 0; i < 12; i++) {
      const rad = 0.09 + ctx.rng() * 0.10;
      const maxR = _safeRadiusFor(rad * 0.9);
      const a = ctx.rng() * Math.PI * 2;
      const r = Math.sqrt(ctx.rng()) * maxR;
      let px = cx + Math.cos(a) * r;
      let pz = cz + Math.sin(a) * r;
      if (_inSafeZone(px, pz, cx, cz, rad * 0.6)) continue;
      const cl = _clampToHex(px, pz, cx, cz, maxR);
      px = cl[0]; pz = cl[1];

      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(rad, 22),
        ctx.rng() < 0.5 ? _sandLightMat : _sandDarkMat
      );
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(px, cy + 0.006 + ctx.rng() * 0.004, pz);
      patch.receiveShadow = true;
      ctx.boardGroup.add(patch);
      objs.push(patch);
    }

    // === ПЕСЧИНКИ ===
    for (let i = 0; i < 36; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = Math.sqrt(ctx.rng()) * _safeRadiusFor(0.01);
      const px = cx + Math.cos(a) * d;
      const pz = cz + Math.sin(a) * d;
      if (_inSafeZone(px, pz, cx, cz, 0)) continue;
      const grain = new THREE.Mesh(
        new THREE.SphereGeometry(0.007, 5, 4),
        ctx.rng() < 0.5 ? _sandLightMat : _sandDarkMat
      );
      grain.position.set(px, cy + 0.012, pz);
      ctx.boardGroup.add(grain);
      objs.push(grain);
    }

    // === КАМНИ ===
    for (let i = 0; i < 5; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 0.28 + ctx.rng() * 0.30;
      const rx = cx + Math.cos(a) * r;
      const rz = cz + Math.sin(a) * r;
      if (_inSafeZone(rx, rz, cx, cz, 0.08)) continue;
      const clamped = _clampToHex(rx, rz, cx, cz, _safeRadiusFor(0.09));
      const rock = _createRock(clamped[0], cy + 0.02, clamped[1], 0.5 + ctx.rng() * 0.6, ctx);
      ctx.boardGroup.add(rock);
      objs.push(rock);
    }

    // === СУХИЕ КУСТИКИ ===
    for (let i = 0; i < 4; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const r = 0.32 + ctx.rng() * 0.30;
      const bx = cx + Math.cos(a) * r;
      const bz = cz + Math.sin(a) * r;
      if (_inSafeZone(bx, bz, cx, cz, 0.06)) continue;
      const clamped = _clampToHex(bx, bz, cx, cz, _safeRadiusFor(0.06));
      const bush = _createDryBush(clamped[0], cy, clamped[1], 0.7 + ctx.rng() * 0.6, ctx);
      ctx.boardGroup.add(bush);
      objs.push(bush);
    }

    // === ЗНАМЯ ===
    const bannerPos = { x: cx + CFG.BANNER_POS.x, z: cz + CFG.BANNER_POS.z };
    const bannerClamped = _clampToHex(bannerPos.x, bannerPos.z, cx, cz, _safeRadiusFor(0.10));
    const banner = _createBanner();
    banner.position.set(bannerClamped[0], cy, bannerClamped[1]);
    ctx.boardGroup.add(banner);
    objs.push(banner);

    // === ЧУЧЕЛО ===
    const dummyPos = { x: cx + CFG.DUMMY_POS.x, z: cz + CFG.DUMMY_POS.z };
    const dummyClamped = _clampToHex(dummyPos.x, dummyPos.z, cx, cz, _safeRadiusFor(0.15));
    const dummy = _createTrainingDummy();
    dummy.position.set(dummyClamped[0], cy, dummyClamped[1]);
    ctx.boardGroup.add(dummy);
    objs.push(dummy);

    // === РЫЦАРЬ ===
    const knightPos = { x: cx + CFG.KNIGHT_POS.x, z: cz + CFG.KNIGHT_POS.z };
    const knightClamped = _clampToHex(knightPos.x, knightPos.z, cx, cz, _safeRadiusFor(0.12));
    const knight = _createKnight();
    knight.position.set(knightClamped[0], cy, knightClamped[1]);

    const dxK = dummy.position.x - knight.position.x;
    const dzK = dummy.position.z - knight.position.z;
    const baseRotY = Math.atan2(dxK, dzK);
    knight.rotation.y = baseRotY;
    knight.userData.baseRotY = baseRotY;
    knight.userData.baseY = cy;

    ctx.boardGroup.add(knight);
    objs.push(knight);

    // === КОНЬ ===
    const horsePos = { x: cx + CFG.HORSE_POS.x, z: cz + CFG.HORSE_POS.z };
    const horseClamped = _clampToHex(horsePos.x, horsePos.z, cx, cz, _safeRadiusFor(0.22));
    const horse = _createHorse();
    horse.position.set(horseClamped[0], cy, horseClamped[1]);
    horse.rotation.y = Math.PI * 0.15;
    ctx.boardGroup.add(horse);
    objs.push(horse);

    // === ВЕТЕР ===
    const windPuffs = [];
    for (let i = 0; i < CFG.WIND_PUFFS; i++) {
      const puff = _createWindPuff();
      const a = puff.userData.phase;
      const r = puff.userData.radius;
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      const cl = _clampToHex(px, pz, cx, cz, _safeRadiusFor(0.05));
      puff.position.set(cl[0], cy + puff.userData.height, cl[1]);
      ctx.boardGroup.add(puff);
      objs.push(puff);
      windPuffs.push(puff);
    }

    // === СМЕРЧ ===
    const tornado = _createTornado();
    const tPos = { x: cx + CFG.TORNADO_POS.x, z: cz + CFG.TORNADO_POS.z };
    const tClamped = _clampToHex(tPos.x, tPos.z, cx, cz, _safeRadiusFor(0.10));
    tornado.position.set(tClamped[0], cy, tClamped[1]);
    tornado.scale.setScalar(0);
    tornado.userData.anchor = { x: tClamped[0], z: tClamped[1] };
    ctx.boardGroup.add(tornado);
    objs.push(tornado);

    return {
      objs: objs,
      knight: knight,
      dummy: dummy,
      horse: horse,
      banner: banner,
      windPuffs: windPuffs,
      tornado: tornado,
      cx: cx, cy: cy, cz: cz,
    };
  }

  // ============================================================
  // АНИМАЦИЯ
  // ============================================================
  function _createDesertAnim(cx, cy, cz, ctx) {
    return { cx: cx, cy: cy, cz: cz, time: 0 };
  }

  // Ключевые кадры: линейная интерполяция по фазе t∈[0,1]
  function _kf(t, keyframes) {
    for (let i = 0; i < keyframes.length - 1; i++) {
      const a = keyframes[i];
      const b = keyframes[i + 1];
      if (t >= a.t && t <= b.t) {
        const k = (t - a.t) / (b.t - a.t);
        const out = {};
        for (const key in a) {
          if (key === 't') continue;
          out[key] = a[key] + (b[key] - a[key]) * k;
        }
        return out;
      }
    }
    const last = keyframes[keyframes.length - 1];
    const out = {};
    for (const key in last) {
      if (key === 't') continue;
      out[key] = last[key];
    }
    return out;
  }

  // Полный цикл представления (доли от PERFORMANCE_TIME)
  const KNIGHT_CYCLE = [
    // Фаза 1: покой в стойке
    { t: 0.00, armR: -Math.PI/2, twistY: 0,     headX: 0,    jumpY: 0,    spin: 0,   legSwing: 0 },
    { t: 0.08, armR: -Math.PI/2, twistY: 0,     headX: 0,    jumpY: 0,    spin: 0,   legSwing: 0 },

    // Фаза 2: рубящий удар сверху
    { t: 0.20, armR: -Math.PI*1.15, twistY: -0.25, headX: -0.05, jumpY: 0, spin: 0, legSwing: 0 },
    { t: 0.26, armR:  Math.PI/2, twistY:  0.30, headX:  0.14, jumpY: 0, spin: 0, legSwing: 0.10 },
    { t: 0.30, armR:  Math.PI*0.6, twistY:  0.10, headX:  0.05, jumpY: 0, spin: 0, legSwing: 0.05 },
    { t: 0.36, armR: -Math.PI/2, twistY: 0,     headX: 0,    jumpY: 0,    spin: 0, legSwing: 0 },

    // Фаза 3: удар в прыжке
    { t: 0.44, armR: -Math.PI*0.9, twistY: 0,   headX: 0,    jumpY: -0.02, spin: 0, legSwing: 0 },
    { t: 0.50, armR: -Math.PI*1.25, twistY: -0.15, headX: 0, jumpY: 0.12, spin: 0, legSwing: 0 },
    { t: 0.55, armR: -Math.PI*0.7, twistY: -0.05, headX: 0,  jumpY: 0.13, spin: 0, legSwing: 0 },
    { t: 0.60, armR:  Math.PI*0.4, twistY:  0.20, headX: 0.10, jumpY: 0.02, spin: 0, legSwing: 0 },
    { t: 0.64, armR:  Math.PI/2, twistY:  0.30, headX: 0.18, jumpY: 0,    spin: 0, legSwing: 0.15 },
    { t: 0.68, armR:  Math.PI*0.55, twistY: 0.12, headX: 0.06, jumpY: -0.015, spin: 0, legSwing: 0.05 },
    { t: 0.72, armR: -Math.PI/2, twistY: 0,     headX: 0,    jumpY: 0,    spin: 0, legSwing: 0 },

    // Фаза 4: удар с разворота корпуса
    { t: 0.78, armR: -Math.PI/2, twistY: 0,    headX: 0, jumpY: 0, spin: 0,    legSwing: 0 },
    { t: 0.82, armR:  Math.PI/2, twistY: 0,    headX: 0, jumpY: 0, spin: 0.15, legSwing: 0 }, // меч вытянут горизонтально
    { t: 0.94, armR:  Math.PI/2, twistY: 0,    headX: 0, jumpY: 0, spin: 1.0,  legSwing: 0 }, // полный оборот 360°
    { t: 1.00, armR: -Math.PI/2, twistY: 0,    headX: 0, jumpY: 0, spin: 1.0,  legSwing: 0 },
  ];

  function _updateDesertAnim(state, dt, now) {
    if (!state) return;
    state.time += dt;
    const t = state.time;

    const decor = state._decor;
    if (!decor) return;

    const cx = decor.cx, cz = decor.cz, cy = decor.cy;

    // ============ РЫЦАРЬ ============
    const knight = decor.knight;
    if (knight) {
      const phase = (t % CFG.PERFORMANCE_TIME) / CFG.PERFORMANCE_TIME;
      const kf = _kf(phase, KNIGHT_CYCLE);

      if (knight.userData.armR) knight.userData.armR.rotation.x = kf.armR;

      // Левая рука — придерживает гарду, чуть меняется по фазам
      let leftX = -Math.PI * 0.15;
      if (kf.spin > 0.05) leftX = -Math.PI * 0.4;   // при развороте убираем в сторону
      if (knight.userData.armL) knight.userData.armL.rotation.x = leftX;

      if (knight.userData.torsoGroup) knight.userData.torsoGroup.rotation.y = kf.twistY;
      if (knight.userData.headGroup) {
        knight.userData.headGroup.rotation.x = kf.headX;
        knight.userData.headGroup.rotation.y = kf.twistY * 0.6;
      }

      // Прыжок
      knight.position.y = knight.userData.baseY + kf.jumpY;

      // Вращение корпуса (spin)
      knight.rotation.y = knight.userData.baseRotY + kf.spin * Math.PI * 2;

      // Лёгкое покачивание ног
      if (knight.userData.legL) knight.userData.legL.rotation.x =  kf.legSwing;
      if (knight.userData.legR) knight.userData.legR.rotation.x = -kf.legSwing;

      // Микро-покачивание корпуса
      knight.position.y += Math.sin(t * 2.4) * 0.002;
    }

    // ============ КОНЬ ============
    const horse = decor.horse;
    if (horse && horse.userData.neckGroup) {
      const gCycle = (t % CFG.HORSE_GRAZE_TIME) / CFG.HORSE_GRAZE_TIME;
      let neckAngle;
      if (gCycle < 0.55) neckAngle = -0.65;
      else if (gCycle < 0.70) {
        const k = (gCycle - 0.55) / 0.15;
        neckAngle = -0.65 + k * 0.85;
      } else if (gCycle < 0.88) neckAngle = 0.20;
      else {
        const k = (gCycle - 0.88) / 0.12;
        neckAngle = 0.20 - k * 0.85;
      }
      horse.userData.neckGroup.rotation.z = neckAngle;

      if (horse.userData.neckGroup.userData.headGroup) {
        const headSway = (gCycle < 0.55 ? Math.sin(t * 1.5) * 0.15 : 0);
        horse.userData.neckGroup.userData.headGroup.rotation.y = headSway;
      }

      if (horse.userData.tail) {
        horse.userData.tail.rotation.z = 0.5 + Math.sin(t * 1.2) * 0.08;
      }

      const legK = Math.sin(t * 0.5 + 1.2) * 0.05;
      if (horse.userData.legs && horse.userData.legs.length === 4) {
        horse.userData.legs[0].rotation.x = legK;
        horse.userData.legs[1].rotation.x = -legK * 0.6;
      }
    }

    // ============ ЗНАМЯ ============
    const banner = decor.banner;
    if (banner && banner.userData.flag) {
      banner.userData.flag.rotation.y = Math.sin(t * 1.2) * 0.18;
      banner.userData.flag.rotation.z = Math.sin(t * 1.7 + 0.5) * 0.05;
    }

    // ============ ВЕТЕР (лёгкие завихрения) ============
    if (decor.windPuffs) {
      decor.windPuffs.forEach(function (puff) {
        const a = puff.userData.phase + t * puff.userData.speed * 0.4;
        const r = puff.userData.radius + Math.sin(t * 0.7 + puff.userData.phase) * 0.03;
        const px = cx + Math.cos(a) * r;
        const pz = cz + Math.sin(a) * r;
        const cl = _clampToHex(px, pz, cx, cz, _safeRadiusFor(0.05));
        const bob = Math.sin(t * 1.5 + puff.userData.bob) * 0.008;
        puff.position.set(cl[0], cy + puff.userData.height + bob, cl[1]);
        puff.rotation.y += dt * 0.5;
      });
    }

    // ============ СМЕРЧ ============
    const tornado = decor.tornado;
    if (tornado) {
      const cycle = t % CFG.TORNADO_PERIOD;
      let scale = 0;
      if (cycle < 1.5) scale = cycle / 1.5;                       // зарождается
      else if (cycle < 9) scale = 1;                              // активен
      else if (cycle < 11) scale = 1 - (cycle - 9) / 2;           // рассеивается
      else scale = 0;                                             // пауза
      tornado.scale.setScalar(scale * 0.9);
      tornado.visible = scale > 0.02;

      if (scale > 0.02) {
        // Лёгкий дрейф вокруг anchor
        const driftA = t * 0.4;
        const dx = Math.cos(driftA) * 0.04;
        const dz = Math.sin(driftA * 0.7) * 0.04;
        const nx = tornado.userData.anchor.x + dx;
        const nz = tornado.userData.anchor.z + dz;
        const cl = _clampToHex(nx, nz, cx, cz, _safeRadiusFor(0.10));
        tornado.position.x = cl[0];
        tornado.position.z = cl[1];
        tornado.position.y = cy;

        // Вращение частиц по спирали
        const particles = tornado.userData.particles;
        if (particles) {
          for (let i = 0; i < particles.length; i++) {
            const p = particles[i];
            const spinSpeed = 3 + p.level * 4;
            const a = t * spinSpeed + p.baseAngle;
            const r = 0.015 + p.level * 0.055;
            p.mesh.position.x = Math.cos(a) * r;
            p.mesh.position.z = Math.sin(a) * r;
            // Легкий вертикальный "пульс"
            const yPulse = Math.sin(t * 6 + p.level * 5) * 0.003;
            p.mesh.position.y = p.level * 0.22 + yPulse;
          }
        }

        // Воронка сверху крутится
        if (tornado.userData.topCone) {
          tornado.userData.topCone.rotation.y = t * 3;
          tornado.userData.topCone.rotation.x = Math.PI + Math.sin(t * 2) * 0.05;
        }
      }
    }
  }

  // ============================================================
  // ЭКСПОРТ
  // ============================================================
  window.HexDesert = {
    create: function (cx, cy, cz, ctx) {
      const decorData = _buildDesertDecor(cx, cy, cz, ctx);
      const anim = _createDesertAnim(cx, cy, cz, ctx);
      anim._decor = decorData;
      anim._ctx = ctx;
      return { decor: decorData.objs, anim: anim };
    },
    update: function (state, dt, now) {
      if (state && state.anim) _updateDesertAnim(state.anim, dt, now);
    },
    destroy: function (state) {
      if (state && state.decor) {
        state.decor.forEach(function (o) { if (o.parent) o.parent.remove(o); });
      }
    }
  };

  console.log('[HexDesert] OK — рыцарь, конь, чучело, ветер и смерч');
})();