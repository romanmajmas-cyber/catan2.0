/* ============================================================
   knight_piece.js — рыцарь как игровая фишка (замена разбойника)
   Экспорт: window.KnightPiece.create(scale) → THREE.Group
   ============================================================ */
(function () {
  'use strict';

  // ============ МАТЕРИАЛЫ ============
  const _steelMat    = new THREE.MeshStandardMaterial({ color: 0xC8CCD2, roughness: 0.28, metalness: 0.85 });
  const _plateMat    = new THREE.MeshStandardMaterial({ color: 0xA8AEB8, roughness: 0.42, metalness: 0.7  });
  const _chainMat    = new THREE.MeshStandardMaterial({ color: 0x4A4E55, roughness: 0.75, metalness: 0.55 });
  const _goldMat     = new THREE.MeshStandardMaterial({ color: 0xD4A72B, roughness: 0.35, metalness: 0.85 });
  const _leatherMat  = new THREE.MeshStandardMaterial({ color: 0x5A3A1E, roughness: 0.85 });
  const _darkLeather = new THREE.MeshStandardMaterial({ color: 0x2E1A0E, roughness: 0.9  });
  const _tabardMat   = new THREE.MeshStandardMaterial({ color: 0xB01E1E, roughness: 0.85 });
  const _plumeMat    = new THREE.MeshStandardMaterial({ color: 0xE03030, roughness: 0.7  });
  const _darkMat     = new THREE.MeshStandardMaterial({ color: 0x0A0A0A, roughness: 0.5  });

  // ============ МЕЧ ============
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

  // ============ РЫЦАРЬ (без масштаба, чистый) ============
  function _createKnight() {
    const g = new THREE.Group();

    function makeLeg(side) {
      const leg = new THREE.Group();

      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.026, 0.13, 7), _chainMat);
      thigh.position.y = -0.065; thigh.castShadow = true; leg.add(thigh);

      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.10, 7), _plateMat);
      shin.position.y = -0.175; shin.castShadow = true; leg.add(shin);

      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), _plateMat);
      knee.position.y = -0.115; knee.scale.set(1, 0.8, 1); leg.add(knee);

      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.028, 0.085), _darkLeather);
      boot.position.set(0, -0.235, 0.018); boot.castShadow = true; leg.add(boot);

      const bootTip = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), _darkLeather);
      bootTip.position.set(0, -0.240, 0.055);
      bootTip.scale.set(1, 0.7, 1.1);
      leg.add(bootTip);

      leg.position.set(side * 0.048, 0.24, 0);
      return leg;
    }
    g.add(makeLeg(-1));
    g.add(makeLeg(1));

    // Торс
    const torsoGroup = new THREE.Group();

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.072, 0.20, 10), _chainMat);
    torso.position.y = 0.34; torso.castShadow = true; torsoGroup.add(torso);

    const tabardFront = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.20, 0.008), _tabardMat);
    tabardFront.position.set(0, 0.34, 0.072); torsoGroup.add(tabardFront);

    const tabardBack = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.20, 0.008), _tabardMat);
    tabardBack.position.set(0, 0.34, -0.072); torsoGroup.add(tabardBack);

    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.006), _goldMat);
    emblem.rotation.z = Math.PI / 4;
    emblem.position.set(0, 0.40, 0.077);
    torsoGroup.add(emblem);

    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.022, 10), _darkLeather);
    belt.position.y = 0.24; torsoGroup.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.02, 0.008), _goldMat);
    buckle.position.set(0, 0.24, 0.066); torsoGroup.add(buckle);

    // Наплечники
    function makePauldron(side) {
      const p = new THREE.Group();
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        _plateMat
      );
      shell.scale.set(1.05, 0.85, 1.05); shell.castShadow = true; p.add(shell);
      const trim = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.005, 4, 14), _goldMat);
      trim.rotation.x = Math.PI / 2; trim.position.y = -0.005; p.add(trim);
      p.position.set(side * 0.075, 0.44, 0);
      return p;
    }
    torsoGroup.add(makePauldron(-1));
    torsoGroup.add(makePauldron(1));
    g.add(torsoGroup);

    // Левая рука
    const armL = new THREE.Group();
    armL.position.set(-0.075, 0.42, 0);
    const upperArmL = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.017, 0.11, 7), _chainMat);
    upperArmL.position.y = -0.055; upperArmL.castShadow = true; armL.add(upperArmL);
    const vambraceL = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.016, 0.09, 7), _plateMat);
    vambraceL.position.y = -0.155; vambraceL.castShadow = true; armL.add(vambraceL);
    const gloveL = new THREE.Mesh(new THREE.SphereGeometry(0.023, 8, 6), _plateMat);
    gloveL.position.y = -0.215; gloveL.castShadow = true; armL.add(gloveL);
    armL.rotation.x = -Math.PI * 0.15;
    g.add(armL);

    // Правая рука с мечом
    const armR = new THREE.Group();
    armR.position.set(0.075, 0.42, 0);
    armR.add(upperArmL.clone());
    armR.add(vambraceL.clone());
    armR.add(gloveL.clone());

    const sword = _createSword();
    sword.rotation.x = Math.PI / 2;
    sword.position.set(0, -0.215, 0.012);
    armR.add(sword);
    // В стойке: меч вверх (рука согнута вверх)
    armR.rotation.x = -Math.PI / 2;
    g.add(armR);

    // Голова
    const headGroup = new THREE.Group();
    headGroup.position.y = 0.48;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.045, 7), _chainMat);
    neck.position.y = 0.02; headGroup.add(neck);

    const coif = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.045, 8), _chainMat);
    coif.position.y = 0.045; headGroup.add(coif);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.048, 12, 9, 0, Math.PI * 2, 0, Math.PI * 0.65),
      _plateMat
    );
    helmet.position.y = 0.10; helmet.castShadow = true; headGroup.add(helmet);

    const helmetLower = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.050, 0.055, 12), _plateMat);
    helmetLower.position.y = 0.075; helmetLower.castShadow = true; headGroup.add(helmetLower);

    const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.008, 0.004), _darkMat);
    visorSlit.position.set(0, 0.10, 0.048); headGroup.add(visorSlit);

    const nosePlate = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.055, 0.008), _plateMat);
    nosePlate.position.set(0, 0.085, 0.051); headGroup.add(nosePlate);

    const plumeBase = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), _goldMat);
    plumeBase.position.y = 0.148; headGroup.add(plumeBase);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.10, 6), _plumeMat);
    plume.position.set(0, 0.20, -0.008);
    plume.rotation.x = 0.25;
    headGroup.add(plume);

    g.add(headGroup);

    // Плащ
    const cape = new THREE.Mesh(
      new THREE.PlaneGeometry(0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: 0x8B1616, roughness: 0.9, side: THREE.DoubleSide })
    );
    cape.position.set(0, 0.34, -0.078);
    cape.rotation.x = -0.06;
    g.add(cape);

    return g;
  }

  // ============ ЭКСПОРТ ============
  window.KnightPiece = {
    create: function (scale) {
      const k = _createKnight();
      k.scale.setScalar(scale || 0.55);
      return k;
    }
  };

  console.log('[KnightPiece] OK — модель рыцаря готова');
})();