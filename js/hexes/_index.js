// ==================== РЕЕСТР ГЕКСОВ ====================
const HEX_REGISTRY = {
  forest:    function() { return window.HexForest; },
  pasture:   function() { return window.HexPasture; },
  fields:    function() { return window.HexFields; },
  hills:     function() { return window.HexHills; },
  mountains: function() { return window.HexMountains; },
  desert:    function() { return window.HexDesert; }
};

const activeHexInstances = [];

function registerHexInstance(terrainType, cx, cy, cz, ctx) {
  const factory = HEX_REGISTRY[terrainType];
  if (!factory) return null;
  const mod = factory();
  if (!mod) return null;
  const state = mod.create(cx, cy, cz, ctx);
  const instance = { type: terrainType, module: mod, state: state };
  activeHexInstances.push(instance);
  return instance;
}

function updateAllHexInstances(dt, now) {
  for (let i = 0; i < activeHexInstances.length; i++) {
    const inst = activeHexInstances[i];
    if (inst.module.update) inst.module.update(inst.state, dt, now);
  }
}

function destroyAllHexInstances() {
  for (let i = 0; i < activeHexInstances.length; i++) {
    const inst = activeHexInstances[i];
    if (inst.module.destroy) inst.module.destroy(inst.state);
  }
  activeHexInstances.length = 0;
}

console.log('[Registry] OK');