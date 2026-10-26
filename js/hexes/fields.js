// ==================== ПОЛЯ: ДЕКОР ====================

function _mergeGeomsWithColors(items) {
  const nonIndexed = [];
  items.forEach(function(it) {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo;
    nonIndexed.push({ geo: g, color: it.color });
  });
  let totalVerts = 0;
  nonIndexed.forEach(function(it) { totalVerts += it.geo.attributes.position.count; });
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 3);
  let offset = 0;
  nonIndexed.forEach(function(it) {
    const count = it.geo.attributes.position.count;
    const pos = it.geo.attributes.position.array;
    const nor = it.geo.attributes.normal.array;
    const uv = it.geo.attributes.uv ? it.geo.attributes.uv.array : new Float32Array(count * 2);
    const c = new THREE.Color(it.color);
    positions.set(pos, offset * 3);
    normals.set(nor, offset * 3);
    uvs.set(uv, offset * 2);
    for (let i = 0; i < count; i++) {
      colors[(offset + i) * 3] = c.r;
      colors[(offset + i) * 3 + 1] = c.g;
      colors[(offset + i) * 3 + 2] = c.b;
    }
    offset += count;
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return merged;
}

let _wheatClumpVariants = null;
let _wheatVertexMat = null;

function _getWheatVariants() {
  if (_wheatClumpVariants) return _wheatClumpVariants;
  _wheatVertexMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, flatShading: true
  });
  const stalkColor = 0xb8860b;
  const headColor = 0xffe066;
  const awnColor = 0xe8d070;
  _wheatClumpVariants = [];
  for (let v = 0; v < 3; v++) {
    const items = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + v * 0.4;
      const r = v * 0.0025;
      const ox = Math.cos(a) * r;
      const oz = Math.sin(a) * r;
      const h = 0.036 + v * 0.004;
      const tiltZ = Math.cos(a) * 0.30;
      const tiltX = Math.sin(a) * 0.30;
      const stalkGeo = new THREE.CylinderGeometry(0.0008, 0.0013, h, 3);
      stalkGeo.rotateZ(tiltZ);
      stalkGeo.rotateX(tiltX);
      stalkGeo.translate(ox, h / 2, oz);
      items.push({ geo: stalkGeo, color: stalkColor });
      const headGeo = new THREE.SphereGeometry(0.0048, 4, 3);
      headGeo.scale(0.70, 2.1, 0.70);
      headGeo.rotateZ(tiltZ * 0.7);
      headGeo.rotateX(tiltX * 0.7);
      const topX = ox + Math.sin(tiltZ) * h;
      const topZ = oz - Math.sin(tiltX) * h;
      headGeo.translate(topX, h + 0.002, topZ);
      items.push({ geo: headGeo, color: headColor });
      for (let k = 0; k < 2; k++) {
        const ang = (k / 2) * Math.PI * 2 + v * 0.5;
        const awnGeo = new THREE.CylinderGeometry(0.0003, 0.0004, 0.007, 3);
        awnGeo.translate(topX + Math.cos(ang) * 0.0015, h + 0.007, topZ + Math.sin(ang) * 0.0015);
        items.push({ geo: awnGeo, color: awnColor });
      }
    }
    _wheatClumpVariants.push(_mergeGeomsWithColors(items));
  }
  return _wheatClumpVariants;
}

const _wheatMat4 = new THREE.Matrix4();
const _wheatPosVec = new THREE.Vector3();
const _wheatQuat = new THREE.Quaternion();
const _wheatScaleVec = new THREE.Vector3();
const _wheatAxisY = new THREE.Vector3(0, 1, 0);

function _updateWheatInstance(clump) {
  if (!clump.instancedMesh) return;
  _wheatPosVec.set(clump.x, TERRAIN_Y, clump.z);
  _wheatQuat.setFromAxisAngle(_wheatAxisY, clump.rotationY);
  _wheatScaleVec.set(1, clump.currentScale, 1);
  _wheatMat4.compose(_wheatPosVec, _wheatQuat, _wheatScaleVec);
  clump.instancedMesh.setMatrixAt(clump.instanceIdx, _wheatMat4);
}

// ==================== ЗИГЗАГ С ОБХОДОМ ЦИФРЫ И ПУСТОГО СЕКТОРА ====================
function _hexHalfWidth(relZ, R) {
  const az = Math.abs(relZ);
  if (az <= R / 2) return SQRT3 / 2 * R;
  if (az < R) return SQRT3 * (R - az);
  return 0;
}

// ★ Зигзаг проходит только там, где растёт пшено:
//    - обходит цифру по дуге радиуса safeR
//    - пропускает ряды, попадающие в пустой (незасеянный) сектор
//    - замыкается в петлю (конец == начало), чтобы цикл был без телепорта
function _createZigzagPath(cx, cz, R, rowSpacing, margin, safeR, emptyDir, halfEmpty) {
  const path = [];
  const halfH = R * 0.90;
  const detourR = safeR;

  function isInEmptyZone(dx, dz) {
    const a = Math.atan2(dz, dx);
    let diff = a - emptyDir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < halfEmpty;
  }

  let currentSide = 'left';

  for (let relZ = halfH - margin; relZ >= -halfH + margin; relZ -= rowSpacing) {
    const z = cz + relZ;
    const halfW = _hexHalfWidth(relZ, R) - margin;
    if (halfW <= 0.06) continue;

    const leftX  = cx - halfW;
    const rightX = cx + halfW;
    const absZ   = Math.abs(relZ);

    // ★ Ряд целиком попадает в незасеянный сектор? Пропускаем весь ряд.
    // currentSide НЕ переключаем — иначе будет длинная диагональ через пустырь.
    let rowInEmpty = false;
    const samples = 14;
    for (let s = 0; s <= samples; s++) {
      const sx = leftX + (rightX - leftX) * (s / samples);
      if (isInEmptyZone(sx - cx, relZ)) { rowInEmpty = true; break; }
    }
    if (rowInEmpty) continue;

    let pts;

    if (absZ >= detourR - 0.005) {
      // Ряд не задевает цифру — прямой
      if (currentSide === 'left') {
        pts = [{ x: leftX, z: z }, { x: rightX, z: z }];
      } else {
        pts = [{ x: rightX, z: z }, { x: leftX, z: z }];
      }
    } else {
      // ★ Ряд задевает цифру — обходим по дуге
      const halfSafeW = Math.sqrt(detourR * detourR - relZ * relZ);
      const detourSign = relZ >= 0 ? 1 : -1;
      const angleIn  = Math.atan2(relZ, -halfSafeW);
      const angleOut = Math.atan2(relZ,  halfSafeW);
      const detourPoints = [];

      let a1 = angleIn;
      let a3 = angleOut;
      if (detourSign > 0) {
        if (a1 < Math.PI / 2) a1 += Math.PI * 2;
        if (a3 > Math.PI / 2) a3 -= Math.PI * 2;
      } else {
        if (a1 > -Math.PI / 2) a1 -= Math.PI * 2;
        if (a3 < -Math.PI / 2) a3 += Math.PI * 2;
      }

      const steps = 6;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const a = a1 + (a3 - a1) * t;
        detourPoints.push({
          x: cx + Math.cos(a) * detourR,
          z: cz + Math.sin(a) * detourR
        });
      }

      if (currentSide === 'left') {
        pts = [
          { x: leftX, z: z },
          { x: cx - halfSafeW, z: z }
        ];
        detourPoints.forEach(p => pts.push(p));
        pts.push({ x: cx + halfSafeW, z: z });
        pts.push({ x: rightX, z: z });
      } else {
        pts = [
          { x: rightX, z: z },
          { x: cx + halfSafeW, z: z }
        ];
        for (let s = detourPoints.length - 1; s >= 0; s--) {
          pts.push(detourPoints[s]);
        }
        pts.push({ x: cx - halfSafeW, z: z });
        pts.push({ x: leftX, z: z });
      }
    }

    pts.forEach(p => path.push(p));
    currentSide = (currentSide === 'left') ? 'right' : 'left';
  }

  // ★ Замыкаем путь в петлю: конец совпадает с началом.
  // Техника никогда не выйдет за поле и не будет телепортироваться.
  const origLen = path.length;
  if (origLen >= 2) {
    for (let i = origLen - 2; i >= 1; i--) {
      path.push({ x: path[i].x, z: path[i].z });
    }
    path.push({ x: path[0].x, z: path[0].z });
  }

  return path;
}

// ==================== ЛОШАДЬ ====================
function _createHorseMesh(ctx) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95, flatShading: true });
  const maneMat = new THREE.MeshStandardMaterial({ color: 0x0a0505, roughness: 1, flatShading: true });
  const hoofMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
  const eyeMat  = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.3 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), bodyMat);
  body.scale.set(2.0, 1.0, 1.0);
  body.position.y = 0.10;
  body.castShadow = true;
  g.add(body);

  const rump = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), bodyMat);
  rump.position.set(-0.075, 0.10, 0);
  rump.castShadow = true;
  g.add(rump);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.050, 10, 8), bodyMat);
  chest.position.set(0.070, 0.11, 0);
  chest.castShadow = true;
  g.add(chest);

  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.095, 0.10, 0);
  g.add(neckGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.040, 0.10, 8), bodyMat);
  neck.position.set(0.010, 0.055, 0);
  neck.rotation.z = -0.55;
  neck.castShadow = true;
  neckGroup.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), bodyMat);
  head.scale.set(1.5, 1.0, 0.85);
  head.position.set(0.060, 0.115, 0);
  head.castShadow = true;
  neckGroup.add(head);

  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.045, 8), bodyMat);
  muzzle.rotation.z = Math.PI / 2;
  muzzle.position.set(0.095, 0.105, 0);
  neckGroup.add(muzzle);

  [-0.014, 0.014].forEach(function(dz) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.005, 5, 4), eyeMat);
    eye.position.set(0.055, 0.125, dz);
    neckGroup.add(eye);
  });

  [-0.012, 0.012].forEach(function(dz) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.022, 5), bodyMat);
    ear.position.set(0.040, 0.145, dz);
    ear.rotation.z = -0.2;
    neckGroup.add(ear);
  });

  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const mane = new THREE.Mesh(new THREE.ConeGeometry(0.010 - t * 0.003, 0.030 - t * 0.008, 5), maneMat);
    mane.position.set(0.000 + t * 0.075, 0.095 + t * 0.045 - t * t * 0.03, 0);
    mane.rotation.z = -1.0 + t * 0.3;
    neckGroup.add(mane);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.020, 0.10, 6), maneMat);
  tail.position.set(-0.115, 0.12, 0);
  tail.rotation.z = 0.9;
  tail.castShadow = true;
  g.add(tail);

  const legData = [
    { x:  0.065, z:  0.030, phase: Math.PI, isFront: true  },
    { x:  0.065, z: -0.030, phase: 0,       isFront: true  },
    { x: -0.065, z:  0.030, phase: 0,       isFront: false },
    { x: -0.065, z: -0.030, phase: Math.PI, isFront: false }
  ];

  const legs = [];
  legData.forEach(function(lp) {
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.020, 0.014, 0.065, 6), bodyMat);
    upper.position.set(lp.x, 0.065, lp.z);
    upper.castShadow = true;
    g.add(upper);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.020, 6), hoofMat);
    hoof.position.set(lp.x, 0.010, lp.z);
    hoof.castShadow = true;
    g.add(hoof);
    legs.push({
      upper: upper, hoof: hoof,
      baseX: lp.x, baseY: 0.010, baseZ: lp.z,
      phase: lp.phase, isFront: lp.isFront
    });
  });

  g.userData.legs = legs;
  g.userData.neckGroup = neckGroup;
  g.userData.tail = tail;
  g.userData.body = body;
  return g;
}

function _createPlowMesh(ctx) {
  const g = new THREE.Group();
  const woodMat  = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.95, flatShading: true });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xa0a0a8, roughness: 0.4, metalness: 0.75, flatShading: true });

  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.014), woodMat);
  beam.position.set(-0.07, 0.045, 0);
  beam.castShadow = true; g.add(beam);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.11), woodMat);
  frame.position.set(0, 0.040, 0);
  frame.castShadow = true; g.add(frame);

  [-0.045, 0.045].forEach(function(dz) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.10, 5), woodMat);
    post.position.set(0.025, 0.075, dz);
    post.castShadow = true; g.add(post);
  });

  [-0.045, 0.045].forEach(function(dz) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.10, 5), woodMat);
    handle.position.set(0.080, 0.120, dz);
    handle.rotation.z = Math.PI / 2 - 0.3;
    handle.castShadow = true; g.add(handle);
  });

  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.075, 4), metalMat);
  blade.position.set(0.005, 0.022, 0);
  blade.rotation.x = Math.PI / 2;
  blade.rotation.z = -0.35;
  blade.castShadow = true; g.add(blade);

  const moldboard = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.030, 0.055), metalMat);
  moldboard.position.set(-0.025, 0.035, 0.020);
  moldboard.rotation.z = 0.25;
  moldboard.castShadow = true; g.add(moldboard);

  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.008, 0.12), woodMat);
  crossBeam.position.set(0.035, 0.048, 0);
  crossBeam.castShadow = true; g.add(crossBeam);

  return g;
}

// ==================== КОМБАЙН CLAAS ====================
function _createCombineMesh(ctx) {
  const g = new THREE.Group();

  const whiteMat     = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.5,  metalness: 0.1,  flatShading: true });
  const greenMat     = new THREE.MeshStandardMaterial({ color: 0x8ac820, roughness: 0.5,  metalness: 0.15, flatShading: true });
  const greenDarkMat = new THREE.MeshStandardMaterial({ color: 0x6aa018, roughness: 0.55, metalness: 0.15, flatShading: true });
  const tireMat      = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 1,    flatShading: true });
  const rimMat       = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5,  metalness: 0.3,  flatShading: true });
  const metalMat     = new THREE.MeshStandardMaterial({ color: 0xb0b0b8, roughness: 0.35, metalness: 0.8,  flatShading: true });
  const glassMat     = new THREE.MeshStandardMaterial({ color: 0x4a7a9a, roughness: 0.1,  metalness: 0.5,  transparent: true, opacity: 0.65 });
  const exhaustMat   = new THREE.MeshStandardMaterial({ color: 0x707078, roughness: 0.5,  metalness: 0.7,  flatShading: true });
  const redMat       = new THREE.MeshStandardMaterial({ color: 0xc81818, roughness: 0.6,  flatShading: true });

  const L = 0.18, W = 0.115, H = 0.085;

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(L, H * 0.55, W), greenMat);
  chassis.position.set(0, H * 0.275 + 0.02, 0);
  chassis.castShadow = true;
  g.add(chassis);

  const upperBody = new THREE.Mesh(new THREE.BoxGeometry(L * 0.95, H * 0.5, W * 0.95), whiteMat);
  upperBody.position.set(-0.005, H * 0.55 + H * 0.25 + 0.02, 0);
  upperBody.castShadow = true;
  g.add(upperBody);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.055, W * 0.95), whiteMat);
  tank.position.set(-0.06, H * 0.55 + H * 0.25 + 0.06, 0);
  tank.castShadow = true;
  g.add(tank);

  for (let i = 0; i < 4; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.006, 0.008), greenDarkMat);
    rib.position.set(-0.06, H * 0.55 + H * 0.25 + 0.04 + i * 0.014, W * 0.48 - i * 0.002);
    g.add(rib);
    const rib2 = rib.clone();
    rib2.position.z = -rib.position.z;
    g.add(rib2);
  }

  const feeder = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.08), greenMat);
  feeder.position.set(0.105, 0.095, 0);
  feeder.rotation.z = -0.22;
  feeder.castShadow = true;
  g.add(feeder);

  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.075, 0.095), greenMat);
  cab.position.set(0.038, 0.185, 0);
  cab.castShadow = true;
  g.add(cab);

  const cabRoof = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.008, 0.105), whiteMat);
  cabRoof.position.set(0.038, 0.226, 0);
  cabRoof.castShadow = true;
  g.add(cabRoof);

  const winFront = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.055, 0.085), glassMat);
  winFront.position.set(0.072, 0.19, 0);
  g.add(winFront);

  const winL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.055, 0.005), glassMat);
  winL.position.set(0.038, 0.19, 0.049);
  g.add(winL);
  const winR = winL.clone();
  winR.position.z = -0.049;
  g.add(winR);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.006, 0.006), redMat);
  stripe.position.set(0.038, 0.155, 0.048);
  g.add(stripe);
  const stripe2 = stripe.clone();
  stripe2.position.z = -0.048;
  g.add(stripe2);

  const roofRack = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.08), whiteMat);
  roofRack.position.set(-0.03, 0.226, 0);
  g.add(roofRack);

  for (const zside of [-0.04, 0.04]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.006, 0.005), greenMat);
    rail.position.set(-0.03, 0.234, zside);
    g.add(rail);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.22), greenMat);
  header.position.set(0.195, 0.085, 0);
  header.castShadow = true;
  g.add(header);

  const headerStripe = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.008, 0.221), whiteMat);
  headerStripe.position.set(0.195, 0.062, 0);
  g.add(headerStripe);

  const cutterBar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.006, 0.23), metalMat);
  cutterBar.position.set(0.218, 0.058, 0);
  cutterBar.castShadow = true;
  g.add(cutterBar);

  for (let i = 0; i < 14; i++) {
    const tz = (i / 13 - 0.5) * 0.21;
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.0035, 0.010, 4), metalMat);
    tooth.position.set(0.230, 0.058, tz);
    tooth.rotation.z = -Math.PI / 2;
    g.add(tooth);
  }

  const auger = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.20, 10), metalMat);
  auger.rotation.x = Math.PI / 2;
  auger.position.set(0.198, 0.085, 0);
  g.add(auger);

  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0018, 4, 12), metalMat);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(0.198, 0.085, (i / 6 - 0.5) * 0.19);
    g.add(ring);
  }

  const reelGroup = new THREE.Group();
  reelGroup.position.set(0.198, 0.135, 0);

  const reelAxle = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.21, 8), greenDarkMat);
  reelAxle.rotation.x = Math.PI / 2;
  reelGroup.add(reelAxle);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const rodX = Math.cos(a) * 0.030;
    const rodY = Math.sin(a) * 0.030;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.20, 5), greenDarkMat);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(rodX, rodY, 0);
    reelGroup.add(rod);
    for (let k = 0; k < 8; k++) {
      const tz = (k / 7 - 0.5) * 0.18;
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.003, 0.010, 4), metalMat);
      tooth.position.set(rodX, rodY, tz);
      tooth.rotation.z = a;
      reelGroup.add(tooth);
    }
  }

  for (const side of [-1, 1]) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.005, 12), greenMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(0, 0, side * 0.10);
    reelGroup.add(disc);
  }

  g.add(reelGroup);
  g.userData.reel = reelGroup;

  const wheels = [];

  for (const side of [-1, 1]) {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.030, 16), tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.032, 12), rimMat);
    rim.rotation.x = Math.PI / 2;
    wg.add(rim);
    for (let s = 0; s < 6; s++) {
      const a = (s / 6) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.052, 0.003), rimMat);
      spoke.position.set(Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0);
      spoke.rotation.z = a;
      wg.add(spoke);
    }
    wg.position.set(0.085, 0.045, side * 0.062);
    g.add(wg);
    wheels.push(wg);
  }

  for (const side of [-1, 1]) {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.022, 12), tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.castShadow = true;
    wg.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.024, 10), rimMat);
    rim.rotation.x = Math.PI / 2;
    wg.add(rim);
    wg.position.set(-0.085, 0.026, side * 0.062);
    g.add(wg);
    wheels.push(wg);
  }

  g.userData.wheels = wheels;

  const exhaustPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.095, 8), exhaustMat);
  exhaustPipe.position.set(-0.02, 0.245, 0.05);
  exhaustPipe.castShadow = true;
  g.add(exhaustPipe);
  const exhaustTop = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.007, 0.010, 8), exhaustMat);
  exhaustTop.position.set(-0.02, 0.30, 0.05);
  g.add(exhaustTop);

  const unloadTube = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.13, 8), whiteMat);
  unloadTube.rotation.z = Math.PI / 2 + 0.25;
  unloadTube.position.set(-0.10, 0.21, -0.045);
  unloadTube.castShadow = true;
  g.add(unloadTube);

  const unloadTip = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.025, 8), whiteMat);
  unloadTip.rotation.z = Math.PI / 2 + 0.25;
  unloadTip.position.set(-0.165, 0.245, -0.045);
  g.add(unloadTip);

  for (const side of [-1, 1]) {
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.007, 6, 5),
      new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0xffffaa, emissiveIntensity: 0.5 })
    );
    lamp.position.set(0.085, 0.085, side * 0.040);
    g.add(lamp);
  }

  for (const side of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.BoxGeometry(0.030, 0.010, 0.002), redMat);
    logo.position.set(-0.02, 0.16, side * (W * 0.5 + 0.001));
    g.add(logo);
  }

  return g;
}

// ==================== РУЛОНЫ ====================
function _fieldsRoundBale(x, z, angle, ctx) {
  const m = _fieldsGetMats();
  const g = new THREE.Group();
  const length = 0.20 + ctx.rng() * 0.04;
  const radius = 0.075 + ctx.rng() * 0.02;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xb8821a, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 20, 3), bodyMat);
  body.rotation.z = Math.PI / 2;
  body.castShadow = true; g.add(body);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const cctx = canvas.getContext('2d');
  cctx.fillStyle = '#b8821a'; cctx.fillRect(0, 0, 128, 128);
  cctx.strokeStyle = '#7a5008';
  for (let r = 4; r < 64; r += 4) { cctx.lineWidth = 1.2; cctx.beginPath(); cctx.arc(64, 64, r, 0, Math.PI * 2); cctx.stroke(); }
  cctx.strokeStyle = '#d4a020'; cctx.lineWidth = 0.8;
  for (let a = 0; a < 40; a++) {
    const ang = (a / 40) * Math.PI * 2;
    cctx.beginPath(); cctx.moveTo(64, 64); cctx.lineTo(64 + Math.cos(ang) * 64, 64 + Math.sin(ang) * 64); cctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = 8;
  const endMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });

  const endL = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), endMat);
  endL.position.x = -length / 2 - 0.001; endL.rotation.y = -Math.PI / 2; g.add(endL);
  const endR = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), endMat);
  endR.position.x = length / 2 + 0.001; endR.rotation.y = Math.PI / 2; g.add(endR);

  for (let i = 0; i < 20; i++) {
    const a = ctx.rng() * Math.PI * 2;
    const t = (ctx.rng() - 0.5) * length * 0.9;
    const len = 0.010 + ctx.rng() * 0.020;
    const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0010, len, 3), m.bundleStalk);
    const r = radius * (0.9 + ctx.rng() * 0.1);
    strand.position.set(t, Math.cos(a) * r, Math.sin(a) * r);
    strand.rotation.z = Math.PI / 2 + (ctx.rng() - 0.5) * 0.7;
    strand.rotation.x = (ctx.rng() - 0.5) * 0.7;
    strand.rotation.y = a;
    g.add(strand);
  }
  for (let i = 0; i < 2; i++) {
    const wrapX = -length * 0.25 + i * length * 0.5;
    const wrap = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.0015, 0.0020, 4, 20), m.bundleTie);
    wrap.rotation.y = Math.PI / 2; wrap.position.x = wrapX; g.add(wrap);
  }

  g.position.set(x, TERRAIN_Y + radius, z);
  g.rotation.y = angle;
  return g;
}

// ==================== РАБОЧИЕ ====================
const _fieldsMats = {};
const _shirtWhite = new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.85 });
const _pantsColors = [0x3a2010, 0x2a2a2a, 0x4a2818, 0x1a1a2a, 0x3a3a20, 0x2a1a08];
const _vestColors  = [0x8a4020, 0x5a6040, 0x6a3050, 0x3a4a60, 0x7a5030, 0x506038];

function _fieldsGetMats() {
  if (_fieldsMats.head) return _fieldsMats;
  _fieldsMats.head         = new THREE.MeshStandardMaterial({ color: 0xf0d0a0, roughness: 0.85 });
  _fieldsMats.hat          = M(0xd4a020, 0.9);
  _fieldsMats.bundleStalk  = M(0xb8860b, 1);
  _fieldsMats.bundleTie    = M(0x5a3818, 0.95);
  return _fieldsMats;
}

function _fieldsWorkerMesh(seed) {
  const m = _fieldsGetMats();
  const g = new THREE.Group();
  const pantsMat = new THREE.MeshStandardMaterial({ color: _pantsColors[seed % _pantsColors.length], roughness: 0.95, flatShading: true });
  const vestMat  = new THREE.MeshStandardMaterial({ color: _vestColors[(seed * 3 + 1) % _vestColors.length], roughness: 0.9, flatShading: true });

  [-0.008, 0.008].forEach(function(dx) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0075, 0.022, 6), pantsMat);
    leg.position.set(dx, 0.011, 0); leg.castShadow = true; g.add(leg);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.010, 0.006, 0.016),
      new THREE.MeshStandardMaterial({ color: 0x1a0e05, roughness: 1, flatShading: true })
    );
    shoe.position.set(dx, 0.003, 0.002); g.add(shoe);
  });

  const bodyGroup = new THREE.Group();
  bodyGroup.position.y = 0.020; g.add(bodyGroup);

  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.020, 0.035, 8), _shirtWhite);
  shirt.position.y = 0.018; shirt.castShadow = true; bodyGroup.add(shirt);

  const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.0178, 0.0215, 0.030, 8), vestMat);
  vest.position.y = 0.026; vest.castShadow = true; bodyGroup.add(vest);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0028, 4, 10), _shirtWhite);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.042; bodyGroup.add(collar);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), m.head);
  head.position.y = 0.058; head.castShadow = true; bodyGroup.add(head);

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.003, 12), m.hat);
  hatBrim.position.y = 0.0705; bodyGroup.add(hatBrim);
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.008, 10), m.hat);
  hatTop.position.y = 0.076; bodyGroup.add(hatTop);

  const armGroup = new THREE.Group();
  armGroup.position.set(0.019, 0.040, 0.005); bodyGroup.add(armGroup);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.022, 6), _shirtWhite);
  arm.position.y = -0.011; armGroup.add(arm);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 6, 5), m.head);
  hand.position.y = -0.024; armGroup.add(hand);

  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.019, 0.040, 0.005);
  leftArmGroup.rotation.z = 0.25; bodyGroup.add(leftArmGroup);
  const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.028, 6), _shirtWhite);
  leftArm.position.y = -0.014; leftArmGroup.add(leftArm);
  const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 5), m.head);
  leftHand.position.y = -0.030; leftArmGroup.add(leftHand);

  g.userData.bodyGroup = bodyGroup;
  g.userData.armGroup = armGroup;
  g.userData.leftArmGroup = leftArmGroup;
  return g;
}

// ==================== ГЛАВНАЯ ФУНКЦИЯ ====================
function _buildFieldsDecor(cx, cy, cz, ctx) {
  const objs = [];
  const allClumps = [];

  const R_FIELD = 0.88;
  const SQRT3_2 = SQRT3 / 2;
  const LIMIT = SQRT3_2 * R_FIELD;

  const emptyDir = ctx.rng() * Math.PI * 2;
  const halfEmpty = Math.PI * 100 / 360;

  function isInEmptyZone(dx, dz) {
    const a = Math.atan2(dz, dx);
    let diff = a - emptyDir;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < halfEmpty;
  }

  const pileDist = 0.55;
  const pileBaseX = cx + Math.cos(emptyDir) * pileDist;
  const pileBaseZ = cz + Math.sin(emptyDir) * pileDist;
  const perpDir = emptyDir + Math.PI / 2;
  const pilePositions = [
    { x: pileBaseX + Math.cos(perpDir) * 0.09, z: pileBaseZ + Math.sin(perpDir) * 0.09 },
    { x: pileBaseX - Math.cos(perpDir) * 0.09, z: pileBaseZ - Math.sin(perpDir) * 0.09 }
  ];

  const bales = [];
  const baleCount = 3 + Math.floor(ctx.rng() * 4);
  for (let i = 0; i < baleCount; i++) {
    let placed = false, attempts = 0;
    while (!placed && attempts < 25) {
      attempts++;
      const a = emptyDir + (ctx.rng() - 0.5) * (Math.PI * 0.75);
      const d = 0.14 + ctx.rng() * 0.28;
      const bx = pileBaseX + Math.cos(a) * d;
      const bz = pileBaseZ + Math.sin(a) * d;
      const rx = bx - cx, rz = bz - cz;
      if (Math.abs(rx) > LIMIT * 0.88) continue;
      if (Math.abs(0.5 * rx + SQRT3_2 * rz) > LIMIT * 0.88) continue;
      if (Math.abs(0.5 * rx - SQRT3_2 * rz) > LIMIT * 0.88) continue;
      let bad = false;
      for (let j = 0; j < bales.length; j++) if (Math.hypot(bx - bales[j].x, bz - bales[j].z) < 0.20) { bad = true; break; }
      if (bad) continue;
      for (let p = 0; p < pilePositions.length; p++) if (Math.hypot(bx - pilePositions[p].x, bz - pilePositions[p].z) < 0.13) { bad = true; break; }
      if (bad) continue;
      const bale = _fieldsRoundBale(bx, bz, ctx.rng() * Math.PI * 2, ctx);
      ctx.boardGroup.add(bale); objs.push(bale);
      bales.push({ x: bx, z: bz });
      placed = true;
    }
  }

  const rowSpacing = 0.062;
  const inRowSpacing = 0.018;
  const furrowWidth = 0.028;

  const furrowMat = new THREE.MeshStandardMaterial({ color: 0x4a2a08, roughness: 1, flatShading: true });
  const soilMat   = new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: 1, flatShading: true });

  const numRows = Math.ceil(2 * R_FIELD / rowSpacing) + 1;
  const startZ = -R_FIELD;

  for (let r = 0; r < numRows - 1; r++) {
    const rowZ = startZ + r * rowSpacing;
    const nextZ = rowZ + rowSpacing;
    if (rowZ < -R_FIELD || nextZ > R_FIELD) continue;
    const midZ = (rowZ + nextZ) / 2;
    const numInRow = Math.ceil(2 * R_FIELD / inRowSpacing) + 1;
    const startX = -R_FIELD;
    const segments = [];
    let segStart = null;

    for (let c = 0; c < numInRow; c++) {
      const colX = startX + c * inRowSpacing;
      let bad = false;
      if (colX < -R_FIELD || colX > R_FIELD) bad = true;
      else if (Math.abs(colX) > LIMIT * 0.98) bad = true;
      else if (Math.abs(0.5 * colX + SQRT3_2 * midZ) > LIMIT * 0.98) bad = true;
      else if (Math.abs(0.5 * colX - SQRT3_2 * midZ) > LIMIT * 0.98) bad = true;
      else if (isInEmptyZone(colX, midZ)) bad = true;

      if (bad) { if (segStart !== null) { segments.push([segStart, colX - inRowSpacing]); segStart = null; } continue; }
      if (segStart === null) segStart = colX;
    }
    if (segStart !== null) segments.push([segStart, R_FIELD]);

    segments.forEach(function(seg) {
      const midX = (seg[0] + seg[1]) / 2;
      const len = seg[1] - seg[0];
      if (len < 0.05) return;
      const soil = new THREE.Mesh(new THREE.BoxGeometry(len, 0.006, rowSpacing * 0.75), soilMat);
      soil.position.set(cx + midX, cy + 0.003, cz + midZ);
      soil.receiveShadow = true;
      ctx.boardGroup.add(soil); objs.push(soil);

      const furrow = new THREE.Mesh(new THREE.BoxGeometry(len, 0.008, furrowWidth), furrowMat);
      furrow.position.set(cx + midX, cy + 0.005, cz + midZ);
      furrow.receiveShadow = true;
      ctx.boardGroup.add(furrow); objs.push(furrow);
    });
  }

  const clumpData = [];
  for (let r = 0; r < numRows; r++) {
    const rowZ = startZ + r * rowSpacing;
    if (rowZ < -R_FIELD || rowZ > R_FIELD) continue;
    const numInRow = Math.ceil(2 * R_FIELD / inRowSpacing) + 1;
    const startX = -R_FIELD;

    for (let c = 0; c < numInRow; c++) {
      const colX = startX + c * inRowSpacing;
      if (colX < -R_FIELD || colX > R_FIELD) continue;
      if (Math.abs(colX) > LIMIT) continue;
      if (Math.abs(0.5 * colX + SQRT3_2 * rowZ) > LIMIT) continue;
      if (Math.abs(0.5 * colX - SQRT3_2 * rowZ) > LIMIT) continue;
      if (Math.hypot(colX, rowZ) < 0.26) continue;
      if (isInEmptyZone(colX, rowZ)) continue;

      const wx = cx + colX + (ctx.rng() - 0.5) * 0.008;
      const wz = cz + rowZ + (ctx.rng() - 0.5) * 0.005;

      let skip = false;
      for (let p = 0; p < pilePositions.length; p++) if (Math.hypot(wx - pilePositions[p].x, wz - pilePositions[p].z) < 0.09) { skip = true; break; }
      if (!skip) for (let b = 0; b < bales.length; b++) if (Math.hypot(wx - bales[b].x, wz - bales[b].z) < 0.11) { skip = true; break; }
      if (skip) continue;

      clumpData.push({
        x: wx, z: wz,
        variant: Math.floor(ctx.rng() * 3),
        rotationY: ctx.rng() * Math.PI * 2,
        cut: false,
        growTimer: 0,
        currentScale: 1.0,
        targetScale: 1.0,
        instancedMesh: null,
        instanceIdx: -1
      });
    }
  }

  const variants = _getWheatVariants();
  const counts = [0, 0, 0];
  clumpData.forEach(function(c) { counts[c.variant]++; });

  const instancedMeshes = [];
  for (let v = 0; v < 3; v++) {
    if (counts[v] === 0) { instancedMeshes.push(null); continue; }
    const im = new THREE.InstancedMesh(variants[v], _wheatVertexMat, counts[v]);
    im.castShadow = false;
    im.receiveShadow = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    ctx.boardGroup.add(im); objs.push(im);
    instancedMeshes.push(im);
  }

  const variantCounters = [0, 0, 0];
  clumpData.forEach(function(c) {
    c.instancedMesh = instancedMeshes[c.variant];
    if (!c.instancedMesh) return;
    c.instanceIdx = variantCounters[c.variant]++;
    _wheatPosVec.set(c.x, TERRAIN_Y, c.z);
    _wheatQuat.setFromAxisAngle(_wheatAxisY, c.rotationY);
    _wheatScaleVec.set(1, 1, 1);
    _wheatMat4.compose(_wheatPosVec, _wheatQuat, _wheatScaleVec);
    c.instancedMesh.setMatrixAt(c.instanceIdx, _wheatMat4);
  });

  instancedMeshes.forEach(function(im) {
    if (im) im.instanceMatrix.needsUpdate = true;
  });

  allClumps.push.apply(allClumps, clumpData);

  if (!window.__fieldsHexCounter) window.__fieldsHexCounter = 0;
  window.__fieldsHexCounter++;
  const hexNumber = window.__fieldsHexCounter;
  const mod = hexNumber % 4;
  const useHorse = (mod === 1 || mod === 2);

  const harness = new THREE.Group();
  let horse = null, rider = null, combine = null;

  if (useHorse) {
    horse = _createHorseMesh(ctx);
    horse.position.set(0.10, 0, 0);
    harness.add(horse);

    const plow = _createPlowMesh(ctx);
    plow.position.set(-0.01, 0, 0);
    harness.add(plow);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.10, 5),
      new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.95, flatShading: true })
    );
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(0.045, 0.045, 0);
    shaft.castShadow = true;
    harness.add(shaft);

    rider = _fieldsWorkerMesh(99);
    rider.scale.setScalar(0.85);
    rider.position.set(0.12, 0.13, 0);
    rider.rotation.y = 0;
    harness.add(rider);
    if (rider.userData.bodyGroup) rider.userData.bodyGroup.rotation.z = -0.08;
    if (rider.userData.armGroup) rider.userData.armGroup.rotation.x = -0.7;
    if (rider.userData.leftArmGroup) {
      rider.userData.leftArmGroup.rotation.x = -0.7;
      rider.userData.leftArmGroup.rotation.z = 0.15;
    }
  } else {
    combine = _createCombineMesh(ctx);
    combine.position.set(0, 0, 0);
    harness.add(combine);
  }

  harness.scale.setScalar(0.45);
  ctx.boardGroup.add(harness);
  objs.push(harness);

  return {
    objs: objs,
    pilePositions: pilePositions,
    pileBaseX: pileBaseX,
    pileBaseZ: pileBaseZ,
    emptyDir: emptyDir,
    halfEmpty: halfEmpty,
    harness: harness,
    horse: horse,
    rider: rider,
    combine: combine,
    isHorse: useHorse,
    allClumps: allClumps
  };
}

// ==================== АНИМАЦИЯ ====================
function _fieldsCreateAnim(cx, cy, cz, ctx, decorResult) {
  const collector = _fieldsWorkerMesh(5);
  collector.scale.setScalar(1.15);
  collector.position.set(cx + 0.4, TERRAIN_Y, cz + 0.4);
  ctx.boardGroup.add(collector);

  // ★ Зигзаг — плотный, с обходом цифры и незасеянного сектора.
  const R_PATH = 0.88;
  const detourRadius = 0.30;
  const path = _createZigzagPath(
    cx, cz, R_PATH, 0.075, 0.05, detourRadius,
    decorResult.emptyDir,
    decorResult.halfEmpty
  );

  let startPos = { x: cx, z: cz };
  let startAngle = 0;
  if (path.length > 0) {
    startPos = path[0];
    if (path.length > 1) {
      const dx = path[1].x - path[0].x;
      const dz = path[1].z - path[0].z;
      startAngle = Math.atan2(-dz, dx);
    }
  }
  decorResult.harness.position.set(startPos.x, TERRAIN_Y, startPos.z);
  decorResult.harness.rotation.y = startAngle;

  const harnessState = {
    harness: decorResult.harness,
    horse: decorResult.horse,
    rider: decorResult.rider,
    combine: decorResult.combine,
    isHorse: decorResult.isHorse,
    cx: cx, cz: cz,
    pileBaseX: decorResult.pileBaseX,
    pileBaseZ: decorResult.pileBaseZ,
    path: path,
    pathIdx: 1,
    progress: 0,
    speed: 0.30,
    legPhase: Math.random() * 10,
    wheelPhase: 0,
    reelPhase: 0,
    allClumps: decorResult.allClumps,
    cutRadius: 0.04,
    paused: false,
    pauseTimer: 0,
    pausedThisCycle: false
  };

  const collectorState = {
    mesh: collector,
    cx: cx, cz: cz,
    state: 'idle',
    timer: 0.5 + Math.random(),
    targetX: collector.position.x,
    targetZ: collector.position.z,
    phase: Math.random() * Math.PI * 2,
    idleTimer: 0.5 + Math.random() * 0.8,
    speed: 0.10 + Math.random() * 0.05
  };

  return { workers: [], collector: collectorState, cx: cx, cz: cz, ctx: ctx, harness: harnessState };
}

function _animateHorseWalk(h, dt) {
  const legs = h.horse.userData.legs;
  const neckGroup = h.horse.userData.neckGroup;
  const tail = h.horse.userData.tail;
  const body = h.horse.userData.body;
  if (!legs) return;

  h.legPhase += dt * 4.5;

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const phase = h.legPhase + leg.phase;
    const amplitude = leg.isFront ? 0.55 : 0.45;
    leg.upper.rotation.z = Math.sin(phase) * amplitude;
    leg.upper.rotation.x = Math.cos(phase) * 0.08;
    leg.upper.rotation.y = Math.cos(phase) * 0.04;
    leg.hoof.position.z = leg.baseZ + Math.sin(phase) * 0.012 * (leg.isFront ? 1 : -1);
    const liftPhase = leg.isFront ? phase : phase + Math.PI;
    leg.hoof.position.y = leg.baseY + Math.max(0, Math.sin(liftPhase)) * 0.012;
  }

  const bodyBob = Math.abs(Math.sin(h.legPhase)) * 0.004;
  h.harness.position.y = TERRAIN_Y + bodyBob;

  if (body) body.rotation.z = Math.sin(h.legPhase) * 0.015;
  if (neckGroup) {
    neckGroup.rotation.z = Math.sin(h.legPhase + 0.5) * 0.04;
    neckGroup.position.y = 0.10 + Math.sin(h.legPhase) * 0.003;
  }
  if (tail) {
    tail.rotation.z = 0.9 + Math.sin(h.legPhase * 0.7) * 0.15;
    tail.rotation.x = Math.sin(h.legPhase * 0.5) * 0.08;
  }
}

function _animateHorseIdle(h, dt, now) {
  const legs = h.horse.userData.legs;
  const neckGroup = h.horse.userData.neckGroup;
  const tail = h.horse.userData.tail;
  const body = h.horse.userData.body;

  if (legs) {
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      leg.upper.rotation.z *= 0.9;
      leg.upper.rotation.x *= 0.9;
      leg.upper.rotation.y *= 0.9;
      leg.hoof.position.z += (leg.baseZ - leg.hoof.position.z) * 0.1;
      leg.hoof.position.y += (leg.baseY - leg.hoof.position.y) * 0.1;
    }
  }
  if (body) body.rotation.z *= 0.9;
  if (neckGroup) {
    neckGroup.rotation.z += (-0.08 - neckGroup.rotation.z) * 0.05;
    neckGroup.position.y = 0.10 + Math.sin(now * 0.0015) * 0.002;
  }
  if (tail) {
    tail.rotation.z = 0.9 + Math.sin(now * 0.001) * 0.06;
    tail.rotation.x = Math.sin(now * 0.0007) * 0.04;
  }
}

function _animateCombineWalk(h, dt) {
  const combine = h.combine;
  if (!combine) return;
  const wheels = combine.userData.wheels;
  const reel = combine.userData.reel;

  if (wheels) {
    for (let i = 0; i < wheels.length; i++) {
      wheels[i].rotation.z -= dt * 10;
    }
  }
  if (reel) {
    reel.rotation.z -= dt * 5;
  }

  const bodyBob = Math.abs(Math.sin(h.wheelPhase)) * 0.002;
  h.wheelPhase += dt * 10;
  h.harness.position.y = TERRAIN_Y + bodyBob;
}

function _animateCombineIdle(h, dt) {
  if (h.combine && h.combine.userData.reel) {
    h.combine.userData.reel.rotation.z -= dt * 0.5;
  }
  h.harness.position.y = TERRAIN_Y;
}

// ★ Плавное движение без пауз на разворотах.
// На крутых поворотах слегка замедляемся, чтобы успеть довернуть нос.
function _updateHarness(h, dt, now) {
  if (h.paused) {
    h.pauseTimer -= dt;
    if (h.pauseTimer <= 0) h.paused = false;
    if (h.isHorse) _animateHorseIdle(h, dt, now);
    else _animateCombineIdle(h, dt);
    _growWheat(h, dt);
    return;
  }

  if (!h.path || h.path.length < 2) return;

  const prev = h.path[h.pathIdx - 1];
  const next = h.path[h.pathIdx];
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const segLen = Math.hypot(dx, dz);

  if (segLen < 0.001) {
    h.pathIdx++;
    if (h.pathIdx >= h.path.length) {
      h.pathIdx = 1;
      h.pausedThisCycle = false;
    }
    return;
  }

  // Плавный доворот: lerpAngle каждый кадр, никаких «пауз-разворотов».
  const targetAngle = Math.atan2(-dz, dx);
  let angleDiff = targetAngle - h.harness.rotation.y;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
  const absDiff = Math.abs(angleDiff);

  const rotK = Math.min(1, dt * 5);
  h.harness.rotation.y = lerpAngle(h.harness.rotation.y, targetAngle, rotK);

  // На крутых разворотах — замедление до 25% скорости.
  const speedFactor = Math.max(0.25, 1 - absDiff / Math.PI * 0.9);
  const step = h.speed * dt * speedFactor;
  h.progress += step / segLen;

  if (h.progress >= 1) {
    h.harness.position.x = next.x;
    h.harness.position.z = next.z;
    h.progress = 0;                       // фикс накопления прогресса
    h.pathIdx++;
    if (h.pathIdx >= h.path.length) {
      h.pathIdx = 1;
      h.pausedThisCycle = false;
    }
  } else {
    const t = h.progress;
    h.harness.position.x = prev.x + dx * t;
    h.harness.position.z = prev.z + dz * t;
  }

  // Пауза у стога (сработает только если путь когда-нибудь пройдёт рядом).
  if (!h.pausedThisCycle) {
    const dSheaf = Math.hypot(
      h.harness.position.x - h.pileBaseX,
      h.harness.position.z - h.pileBaseZ
    );
    if (dSheaf < 0.16) {
      h.paused = true;
      h.pauseTimer = 3 + Math.random() * 1.5;
      h.pausedThisCycle = true;
      if (h.isHorse) _animateHorseIdle(h, dt, now);
      else _animateCombineIdle(h, dt);
      return;
    }
  }

  if (h.isHorse) _animateHorseWalk(h, dt);
  else _animateCombineWalk(h, dt);

  const angle = h.harness.rotation.y;
  const cosA = Math.cos(angle);
  const sinA = -Math.sin(angle);

  const cutOffsetX = h.isHorse ? -0.02 : 0.20;
  const cutX = h.harness.position.x + cutOffsetX * cosA;
  const cutZ = h.harness.position.z + cutOffsetX * sinA;

  for (let i = 0; i < h.allClumps.length; i++) {
    const clump = h.allClumps[i];
    if (clump.cut) continue;
    if (Math.hypot(clump.x - cutX, clump.z - cutZ) < h.cutRadius) {
      clump.cut = true;
      clump.targetScale = 0.0;
      clump.growTimer = 10 + Math.random() * 5;
    }
  }

  _growWheat(h, dt);
}

function _growWheat(h, dt) {
  let needsMatrixUpdate = false;
  for (let i = 0; i < h.allClumps.length; i++) {
    const clump = h.allClumps[i];
    if (clump.cut) {
      clump.growTimer -= dt;
      if (clump.growTimer <= 0) { clump.cut = false; clump.targetScale = 1.0; }
    }
    const prevScale = clump.currentScale;
    const k = Math.min(1, dt * 3.5);
    clump.currentScale += (clump.targetScale - clump.currentScale) * k;
    if (Math.abs(clump.currentScale - clump.targetScale) < 0.005) {
      clump.currentScale = clump.targetScale;
    }
    if (Math.abs(prevScale - clump.currentScale) > 0.001) {
      _updateWheatInstance(clump);
      needsMatrixUpdate = true;
    }
  }
  if (needsMatrixUpdate) {
    const updated = new Set();
    for (let i = 0; i < h.allClumps.length; i++) {
      const im = h.allClumps[i].instancedMesh;
      if (im && !updated.has(im)) {
        im.instanceMatrix.needsUpdate = true;
        updated.add(im);
      }
    }
  }
}

function _updateCollector(c, dt, now, hexLim) {
  const m = c.mesh;
  c.timer -= dt;
  const walkPhase = now * 0.008 + c.phase;

  if (c.state === 'idle') {
    m.position.y = TERRAIN_Y + Math.sin(now * 0.003 + c.phase) * 0.002;
    if (m.userData.bodyGroup) m.userData.bodyGroup.rotation.x *= 0.9;
    if (c.timer <= 0) {
      let placed = false, attempts = 0;
      while (!placed && attempts < 30) {
        attempts++;
        const a = Math.random() * Math.PI * 2;
        const d = SAFE_RADIUS + 0.10 + Math.random() * 0.30;
        const tx = c.cx + Math.cos(a) * d;
        const tz = c.cz + Math.sin(a) * d;
        const rx = tx - c.cx, rz = tz - c.cz;
        if (Math.abs(rx) > hexLim * 0.85) continue;
        if (Math.abs(0.5 * rx + SQRT3 / 2 * rz) > hexLim * 0.85) continue;
        if (Math.abs(0.5 * rx - SQRT3 / 2 * rz) > hexLim * 0.85) continue;
        if (Math.hypot(rx, rz) < SAFE_RADIUS + 0.08) continue;
        c.targetX = tx; c.targetZ = tz;
        placed = true;
      }
      if (placed) c.state = 'walking';
    }
  } else if (c.state === 'walking') {
    const dx = c.targetX - m.position.x;
    const dz = c.targetZ - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.02) {
      c.state = 'collecting';
      c.timer = 1.2 + Math.random() * 1.0;
    } else {
      const ease = Math.min(1, d / 0.15);
      const step = c.speed * dt * (0.4 + ease * 0.6);
      let nx = m.position.x + (dx / d) * step;
      let nz = m.position.z + (dz / d) * step;

      const rnx = nx - c.cx, rnz = nz - c.cz;
      const maxLim = hexLim * 0.85;
      let outOfBounds = false;
      if (Math.abs(rnx) > maxLim) outOfBounds = true;
      if (Math.abs(0.5 * rnx + SQRT3 / 2 * rnz) > maxLim) outOfBounds = true;
      if (Math.abs(0.5 * rnx - SQRT3 / 2 * rnz) > maxLim) outOfBounds = true;

      if (outOfBounds) { c.state = 'idle'; c.timer = 0.5; return; }

      m.position.x = nx;
      m.position.z = nz;
      m.rotation.y = lerpAngle(m.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 6));
      m.position.y = TERRAIN_Y + Math.abs(Math.sin(walkPhase)) * 0.005;
    }
  } else if (c.state === 'collecting') {
    m.position.y = TERRAIN_Y;
    if (m.userData.bodyGroup) {
      const bendPhase = Math.sin(now * 0.008 + c.phase);
      m.userData.bodyGroup.rotation.x = Math.max(0, bendPhase) * 0.45;
    }
    if (c.timer <= 0) {
      c.state = 'idle';
      c.timer = 0.6 + Math.random() * 1.2;
    }
  }
}

function _fieldsUpdateAnim(state, dt, now) {
  if (state.harness) _updateHarness(state.harness, dt, now);
  if (state.collector) _updateCollector(state.collector, dt, now, 0.88);
}

// ==================== ЭКСПОРТ ====================
window.HexFields = {
  create: function(cx, cy, cz, ctx) {
    const decorResult = _buildFieldsDecor(cx, cy, cz, ctx);
    return {
      decor: decorResult.objs,
      anim: _fieldsCreateAnim(cx, cy, cz, ctx, decorResult)
    };
  },
  update: function(state, dt, now) {
    _fieldsUpdateAnim(state.anim, dt, now);
  },
  destroy: function(state) {
    if (state.decor) {
      state.decor.forEach(function(o) {
        if (o.parent) o.parent.remove(o);
        if (o.dispose) o.dispose();
      });
    }
    if (state.anim && state.anim.collector) {
      const m = state.anim.collector.mesh;
      if (m.parent) m.parent.remove(m);
    }
  }
};

console.log('[HexFields] OK — зигзаг обходит цифру и пустой сектор, движение плавное');