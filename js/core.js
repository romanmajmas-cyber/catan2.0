// ==================== КОНСТАНТЫ ====================
const HEX_R = 1.0;
const SQRT3 = Math.sqrt(3);
const ROW_LAYOUT = [3, 4, 5, 4, 3];
const BASE_H = 0.34, TOP_H = 0.08;
const BASE_Y = BASE_H / 2;
const TOP_Y = BASE_H + TOP_H / 2;
const TERRAIN_Y = BASE_H + TOP_H;
const SAFE_RADIUS = 0.42;
const WATER_Y = -0.1;
const WORKER_ZONE = { min: 0.55, max: 0.72 };

const TERRAIN = {
  forest:    { color: 0x2d6e3f, resource: 'wood' },
  hills:     { color: 0xa85a1a, resource: 'brick' },
  pasture:   { color: 0x7cb342, resource: 'sheep' },
  fields:    { color: 0xd4a520, resource: 'wheat' },
  mountains: { color: 0x6a6a70, resource: 'ore' },
  desert:    { color: 0xd4b896, resource: null }
};

const RES_NAMES = {
  wood: { name: 'Древесина', icon: '🌲' },
  brick: { name: 'Глина', icon: '🧱' },
  sheep: { name: 'Шерсть', icon: '🐑' },
  wheat: { name: 'Зерно', icon: '🌾' },
  ore: { name: 'Руда', icon: '⛏️' }
};

const BUILD_COSTS = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
  devCard: { sheep: 1, wheat: 1, ore: 1 }
};

const DEV_TYPES = {
  knight: { name: 'Рыцарь', icon: '⚔️' },
  roadBuilding: { name: 'Дороги', icon: '🛣️' },
  invention: { name: 'Изобретение', icon: '💡' },
  monopoly: { name: 'Монополия', icon: '💰' },
  victoryPoint: { name: 'ПО', icon: '🏆' }
};

const HEX_POOL = [
  'forest','forest','forest','forest','hills','hills','hills',
  'pasture','pasture','pasture','pasture','fields','fields','fields','fields',
  'mountains','mountains','mountains','desert'
];
const NUMBER_TOKENS = [2,3,3,4,4,5,5,6,6,8,8,9,9,10,10,11,11,12];

const HEX_VERT_OFFSETS = [
  { dx: 0, dz: HEX_R },
  { dx: SQRT3/2*HEX_R, dz: HEX_R/2 },
  { dx: SQRT3/2*HEX_R, dz: -HEX_R/2 },
  { dx: 0, dz: -HEX_R },
  { dx: -SQRT3/2*HEX_R, dz: -HEX_R/2 },
  { dx: -SQRT3/2*HEX_R, dz: HEX_R/2 }
];

// ==================== RNG ====================
let rng = Math.random;
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function sShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ==================== УТИЛИТЫ ====================
function makeHexGeo(r, h) { return new THREE.CylinderGeometry(r, r, h, 6); }
function inSafeZone(x, z, cx, cz) { return Math.hypot(x - cx, z - cz) < SAFE_RADIUS; }
function lerpAngle(cur, tgt, t) {
  let d = tgt - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * t;
}
function clampToHex(x, z, cx, cz, maxDist) {
  const dx = x - cx, dz = z - cz;
  const d = Math.hypot(dx, dz);
  if (d <= maxDist) return { x: x, z: z };
  return { x: cx + dx * (maxDist / d), z: cz + dz * (maxDist / d) };
}

// ==================== МАТЕРИАЛЫ ====================
const M = function(c, r) { if (r === undefined) r = 1; return new THREE.MeshStandardMaterial({ color: c, roughness: r, flatShading: true }); };

const MAT = {
  darkBase: M(0x0a1220, 0.95), trunk: M(0x4a2a10), pineLeaf: M(0x1a5a2a), pineLeaf2: M(0x0f4520),
  birchTrunk: M(0xd8d4c8), birchLeaf: M(0x6aa840), grass: M(0x4a8a2a),
  sheepWool: M(0xf2efe4), sheepSkin: M(0x2a2a2a),
  flowerR: M(0xe74c3c, 0.9), flowerY: M(0xf1c40f, 0.9), flowerW: M(0xffffff, 0.9),
  wheatStalk: M(0xb8860b), wheatHead: M(0xffe066, 0.85), wheatDark: M(0x8a6210),
  clay1: M(0x8a4510), clay2: M(0x6a3508), clay3: M(0xa0561a),
  rock1: M(0x555558), rock2: M(0x6a6a6e), rock3: M(0x48484c), snow: M(0xffffff, 0.7),
  sand: M(0xbfa37a), sandLight: M(0xd8be98), sandDark: M(0x9c8258),
  armor: M(0xc0c0c8, 0.3), armorGold: M(0xd4a020, 0.32), plume: M(0xd02020, 0.9),
  horseBrown: M(0x3a1e0a, 0.95), leather: M(0x5a3818, 0.95),
  wood: M(0x7a4a20, 0.95), woodLight: M(0xa06a30, 0.9), woodDark: M(0x4a2a10),
  robber: M(0x1a1a2a, 0.85), cardEdge: M(0x2a1a0a, 0.8),
  workerHead: new THREE.MeshStandardMaterial({ color: 0xf0d0a0, roughness: 0.85 })
};

const playerMatsCache = {};
function getPlayerMats(colorIdx, setup) {
  if (!playerMatsCache[colorIdx]) {
    const c = PLAYER_COLORS[colorIdx];
    playerMatsCache[colorIdx] = {
      base: new THREE.MeshStandardMaterial({ color: c.hex, roughness: 0.55, metalness: 0.15 }),
      dark: new THREE.MeshStandardMaterial({ color: c.dark, roughness: 0.6, metalness: 0.15 }),
      roof: new THREE.MeshStandardMaterial({ color: c.roof, roughness: 0.85, flatShading: true }),
      setup: new THREE.MeshStandardMaterial({ color: c.hex, emissive: c.hex, emissiveIntensity: 0.4, roughness: 0.5 })
    };
  }
  const m = playerMatsCache[colorIdx];
  return { base: setup ? m.setup : m.base, dark: m.dark, roof: m.roof, setup: m.setup };
}

// ==================== СОСТОЯНИЕ ====================
let hexList = [];
let vertices = [];
let edges = [];
let gamePhase = 'setup_settlement';
let lastPlacedSettlement = null;
let currentPlayer = 0;
let myPlayerIndex = 0;
let allPorts = [];
let robberHexIdx = -1;
let robberMesh = null;
let devDeck = [];
let discardDeck = [];
let players = [];
let turnState = { hasRolled: false, buildMode: null, robberMoveMode: null, playedDevCard: false, roadBuildingLeft: 0 };
let gameActive = false;

let scene = null, camera = null, renderer = null, controls = null;
let boardGroup = null, pieceGroup = null, markerGroup = null;
let deckGroup = null, robberGroup = null;
let waves = null;
let lastFrameTime = 0;
let camAnim = null;

// ==================== ХЕЛПЕРЫ ====================
function P() { return players[currentPlayer]; }
function isMyTurn() { return gameActive && currentPlayer === myPlayerIndex; }
function totalRes(p) { return p.wood + p.brick + p.sheep + p.wheat + p.ore; }
function getVP(pi) {
  const p = players[pi];
  return p.settlements.length + p.cities.length * 2 + p.vpCards
       + (p.hasLongestRoad ? 2 : 0) + (p.hasLargestArmy ? 2 : 0);
}
function clearGroup(g) {
  while (g.children.length > 0) {
    const c = g.children[0];
    g.remove(c);
    if (c.traverse) c.traverse(function(o) { if (o.geometry) o.geometry.dispose(); });
  }
}

console.log('[core] OK');