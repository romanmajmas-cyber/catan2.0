// правила
function hasRes(p, cost) { for (const r in cost) { if ((p[r] || 0) < cost[r]) return false; } return true; }
function payRes(p, cost) { for (const r in cost) p[r] -= cost[r]; }

function missingResString(p, cost) {
  const parts = [];
  for (const r in cost) {
    const have = p[r] || 0;
    if (have < cost[r]) {
      const need = cost[r] - have;
      const icon = (typeof RES_NAMES !== 'undefined' && RES_NAMES[r] && RES_NAMES[r].icon) || r;
      parts.push(icon + '×' + need);
    }
  }
  return parts.join(', ');
}

function canSetupSettlement(vIdx) {
  const v = vertices[vIdx];
  if (v.building) return false;
  const nbrs = Array.from(v.adjacentVertices);
  for (let i = 0; i < nbrs.length; i++) if (vertices[nbrs[i]].building) return false;
  return true;
}
function canSetupRoad(eIdx, fromV) {
  if (edges[eIdx].road) return false;
  const e = edges[eIdx];
  return e.v1 === fromV || e.v2 === fromV;
}
function canPlaceRoad(eIdx, pi) {
  const e = edges[eIdx];
  if (e.road) return false;
  if (!hasRes(players[pi], BUILD_COSTS.road)) return false;
  const v1 = vertices[e.v1], v2 = vertices[e.v2];
  if ((v1.building && v1.building.player === pi) || (v2.building && v2.building.player === pi)) return true;
  return Array.from(v1.edgeIndices).some(function(i) { return i !== eIdx && edges[i].road && edges[i].road.player === pi; }) ||
         Array.from(v2.edgeIndices).some(function(i) { return i !== eIdx && edges[i].road && edges[i].road.player === pi; });
}
function canPlaceSettlement(vIdx, pi) {
  const v = vertices[vIdx];
  if (v.building) return false;
  const nbrs = Array.from(v.adjacentVertices);
  for (let i = 0; i < nbrs.length; i++) if (vertices[nbrs[i]].building) return false;
  if (!hasRes(players[pi], BUILD_COSTS.settlement)) return false;
  return Array.from(v.edgeIndices).some(function(i) { return edges[i].road && edges[i].road.player === pi; });
}
function canPlaceCity(vIdx, pi) {
  const v = vertices[vIdx];
  return v.building && v.building.type === 'settlement' && v.building.player === pi && hasRes(players[pi], BUILD_COSTS.city);
}
function updatePlayerPorts(pi) {
  const p = players[pi];
  p.ports = { generic31: false, wood21: false, brick21: false, sheep21: false, wheat21: false, ore21: false };
  allPorts.forEach(function(port) {
    const hasIt = port.vertexIdxs.some(function(vi) { return vertices[vi].building && vertices[vi].building.player === pi; });
    if (hasIt) {
      if (port.ratio === '3:1') p.ports.generic31 = true;
      else if (port.ratio === '2:1' && port.resource) p.ports[port.resource + '21'] = true;
    }
  });
}
function bestRate(pi, res) {
  const p = players[pi];
  if (p.ports[res + '21']) return { rate: 2, source: '2:1 порт' };
  if (p.ports.generic31) return { rate: 3, source: '3:1 порт' };
  return { rate: 4, source: 'банк' };
}
function computeLongestRoad(pi) {
  const p = players[pi];
  if (p.roads.length === 0) return 0;
  const adj = new Map();
  p.roads.forEach(function(eIdx) {
    const e = edges[eIdx];
    if (!adj.has(e.v1)) adj.set(e.v1, []);
    if (!adj.has(e.v2)) adj.set(e.v2, []);
    adj.get(e.v1).push({ v: e.v2, e: eIdx });
    adj.get(e.v2).push({ v: e.v1, e: eIdx });
  });
  const blocked = new Set();
  vertices.forEach(function(v, i) { if (v.building && v.building.player !== pi) blocked.add(i); });
  let best = 0;
  for (const start of adj.keys()) {
    if (blocked.has(start)) continue;
    const visitedV = new Set([start]), visitedE = new Set();
    function dfs(v, length) {
      if (length > best) best = length;
      const nbrs = adj.get(v) || [];
      for (let i = 0; i < nbrs.length; i++) {
        const nb = nbrs[i];
        if (visitedE.has(nb.e) || blocked.has(nb.v) || visitedV.has(nb.v)) continue;
        visitedV.add(nb.v); visitedE.add(nb.e);
        dfs(nb.v, length + 1);
        visitedV.delete(nb.v); visitedE.delete(nb.e);
      }
    }
    dfs(start, 0);
  }
  return best;
}
function updateLongestRoad() {
  const lengths = players.map(function(_, i) { return computeLongestRoad(i); });
  const maxLen = Math.max.apply(null, lengths);
  if (maxLen < 5) { players.forEach(function(p) { p.hasLongestRoad = false; }); return; }
  const leaders = lengths.map(function(l, i) { return l === maxLen ? i : -1; }).filter(function(i) { return i >= 0; });
  if (leaders.length === 1) {
    const w = leaders[0];
    if (!players[w].hasLongestRoad) {
      players.forEach(function(p) { p.hasLongestRoad = false; });
      players[w].hasLongestRoad = true;
      addLog('🛣️ ' + players[w].name + ' получает «Самый длинный тракт»');
    }
  } else {
    const owner = players.findIndex(function(p) { return p.hasLongestRoad; });
    if (!(owner >= 0 && leaders.indexOf(owner) >= 0)) players.forEach(function(p) { p.hasLongestRoad = false; });
  }
}
function updateLargestArmy() {
  const maxK = Math.max.apply(null, players.map(function(p) { return p.knightsPlayed; }));
  if (maxK < 3) { players.forEach(function(p) { p.hasLargestArmy = false; }); return; }
  const leaders = players.map(function(p, i) { return p.knightsPlayed === maxK ? i : -1; }).filter(function(i) { return i >= 0; });
  if (leaders.length === 1) {
    const w = leaders[0];
    if (!players[w].hasLargestArmy) {
      players.forEach(function(p) { p.hasLargestArmy = false; });
      players[w].hasLargestArmy = true;
      addLog('⚔️ ' + players[w].name + ' получает «Самое большое войско»');
    }
  } else {
    const owner = players.findIndex(function(p) { return p.hasLargestArmy; });
    if (!(owner >= 0 && leaders.indexOf(owner) >= 0)) players.forEach(function(p) { p.hasLargestArmy = false; });
  }
}

// дев дек
function initDevDeck() {
  devDeck = [];
  for (let i = 0; i < 14; i++) devDeck.push({ type: 'knight' });
  for (let i = 0; i < 2; i++) devDeck.push({ type: 'roadBuilding' });
  for (let i = 0; i < 2; i++) devDeck.push({ type: 'invention' });
  for (let i = 0; i < 2; i++) devDeck.push({ type: 'monopoly' });
  for (let i = 0; i < 5; i++) devDeck.push({ type: 'victoryPoint' });
  devDeck = sShuffle(devDeck);
}
function drawDevCard() {
  if (devDeck.length === 0) {
    if (discardDeck.length === 0) return null;
    devDeck = sShuffle(discardDeck);
    discardDeck = [];
  }
  return devDeck.pop();
}

//действия
function broadcastAction(action) {
  action.player = currentPlayer;
  
  
  if (currentRoom && typeof socket !== 'undefined' && socket) {
    socket.emit('game_action', { code: currentRoom.code, action: action });
  }
  

  applyAction(action, true);
}
window.applyRemoteAction = function(action) { applyAction(action, false); };

function applyAction(action, isLocal) {
  const pi = action.player;
  const p = players[pi];

  if (action.kind === 'setup_settlement') {
    placeSettlement(action.vIdx, pi, true);
    lastPlacedSettlement = action.vIdx;
    if (gamePhase === 'setup_settlement') gamePhase = 'setup_road';
    else {
      const v = vertices[action.vIdx];
      const gains = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      v.hexes.forEach(function(hi) { const h = hexList[hi]; if (h.terrain !== 'desert') gains[TERRAIN[h.terrain].resource]++; });
      for (const r in gains) if (gains[r] > 0) p[r] += gains[r];
      gamePhase = 'setup_road_2';
    }
    addLog('🏠 ' + p.name + ': поселение');
  }
  else if (action.kind === 'setup_road') {
    placeRoad(action.eIdx, pi, true);
    addLog('🛣️ ' + p.name + ': дорога');
    if (gamePhase === 'setup_road') {
      currentPlayer = (currentPlayer + 1) % players.length;
      gamePhase = 'setup_settlement_2';
    } else {
      gamePhase = 'playing';
      currentPlayer = 0;
      turnState.hasRolled = false;
      addLog('🎬 Игра началась!');
    }
  }
  else if (action.kind === 'roll_dice') {
    // ★ Анимация кубиков вместо мгновенной подстановки
    if (typeof animateDiceRoll === 'function') {
      animateDiceRoll(action.d1, action.d2);
    } else {
      document.getElementById('die1').textContent = action.d1;
      document.getElementById('die2').textContent = action.d2;
    }

    const sum = action.d1 + action.d2;
    addLog('🎲 ' + p.name + ': ' + action.d1 + '+' + action.d2 + '=' + sum);
    if (sum === 7) {
      addLog('🦹 Выпало 7!');
      players.forEach(function(pl) {
        const t = totalRes(pl);
        if (t > 7) {
          const d = Math.floor(t / 2); let disc = 0;
          while (disc < d) {
            const av = ['wood', 'brick', 'sheep', 'wheat', 'ore'].filter(function(r) { return pl[r] > 0; });
            if (av.length === 0) break;
            pl[av[Math.floor(rng() * av.length)]]--; disc++;
          }
          addLog('📤 ' + pl.name + ' сбрасывает ' + d);
        }
      });
      turnState.robberMoveMode = 'seven';
    } else {
      const gains = players.map(function() { return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 }; });
      players.forEach(function(pl, ppi) {
        function collect(vIdx, amt) {
          const v = vertices[vIdx];
          v.hexes.forEach(function(hi) {
            const h = hexList[hi];
            if (h.number === sum && h.terrain !== 'desert' && hi !== robberHexIdx) gains[ppi][TERRAIN[h.terrain].resource] += amt;
          });
        }
        pl.settlements.forEach(function(i) { collect(i, 1); });
        pl.cities.forEach(function(i) { collect(i, 2); });
      });
      players.forEach(function(pl, ppi) {
        const parts = [];
        for (const r in gains[ppi]) if (gains[ppi][r] > 0) { pl[r] += gains[ppi][r]; parts.push(RES_NAMES[r].icon + '+' + gains[ppi][r]); }
        if (parts.length) addLog('✅ ' + pl.name + ': ' + parts.join(', '));
      });
    }
    turnState.hasRolled = true;
  }
  else if (action.kind === 'move_robber') {
    placeRobber(action.hexIdx);
    turnState.robberMoveMode = null;
    const victimsSet = new Set();
    vertices.forEach(function(v) {
      if (v.building && v.building.player !== pi && v.hexes.indexOf(action.hexIdx) >= 0) victimsSet.add(v.building.player);
    });
    const victims = Array.from(victimsSet);
    if (victims.length === 1) {
      const target = players[victims[0]];
      const avail = ['wood', 'brick', 'sheep', 'wheat', 'ore'].filter(function(r) { return target[r] > 0; });
      if (avail.length > 0) {
        const stolen = avail[Math.floor(rng() * avail.length)];
        target[stolen]--; p[stolen]++;
        addLog('🦹 ' + p.name + ' украл ' + RES_NAMES[stolen].icon);
      }
    } else if (victims.length > 1 && isLocal) openStealModal(victims);
  }
  else if (action.kind === 'steal') {
    const target = players[action.targetPi];
    target[action.resource]--; p[action.resource]++;
    addLog('🦹 ' + p.name + ' украл ' + RES_NAMES[action.resource].icon);
  }
  else if (action.kind === 'build_settlement') { payRes(p, BUILD_COSTS.settlement); placeSettlement(action.vIdx, pi); addLog('🏠 ' + p.name); }
  else if (action.kind === 'build_city')       { payRes(p, BUILD_COSTS.city); placeCity(action.vIdx, pi); addLog('🏙️ ' + p.name); }
  else if (action.kind === 'build_road') {
    if (!action.free) payRes(p, BUILD_COSTS.road);
    placeRoad(action.eIdx, pi);
    addLog('🛣️ ' + p.name);
    if (action.free) { turnState.roadBuildingLeft--; if (turnState.roadBuildingLeft <= 0) turnState.buildMode = null; }
  }
  else if (action.kind === 'buy_dev') {
    payRes(p, BUILD_COSTS.devCard);
    if (action.cardType === 'victoryPoint') { p.vpCards += 1; addLog('🃏 ' + p.name + ' — 🏆 ПО!'); }
    else { p.newDevCards.push({ type: action.cardType }); addLog('🃏 ' + p.name + ' — карта'); }
  }
  else if (action.kind === 'play_dev') {
    const type = action.cardType;
    if (type === 'knight') { p.knightsPlayed += 1; turnState.robberMoveMode = 'knight'; updateLargestArmy(); }
    else if (type === 'roadBuilding') { turnState.roadBuildingLeft = 2; turnState.buildMode = 'roadBuilding'; }
    else if (type === 'invention') { p[action.r1]++; p[action.r2]++; }
    else if (type === 'monopoly') {
      let total = 0;
      players.forEach(function(pl, i) { if (i === pi) return; total += pl[action.resource]; pl[action.resource] = 0; });
      p[action.resource] += total;
    }
    turnState.playedDevCard = true;
    addLog('🎴 ' + p.name + ' разыграл ' + type);
  }
  else if (action.kind === 'trade') { p[action.give] -= action.amount; p[action.take] += 1; addLog('🔄 ' + p.name + ': обмен'); }
  else if (action.kind === 'end_turn') {
    const pl = players[pi];
    pl.devCards.push.apply(pl.devCards, pl.newDevCards);
    pl.newDevCards = [];
    turnState = { hasRolled: false, buildMode: null, robberMoveMode: null, playedDevCard: false, roadBuildingLeft: 0 };
    document.getElementById('die1').textContent = '?';
    document.getElementById('die2').textContent = '?';
    currentPlayer = (currentPlayer + 1) % players.length;
    addLog('⏭️ Ход: ' + players[currentPlayer].name);
  }

  players.forEach(function(pl, i) { if (getVP(i) >= 10 && gamePhase !== 'won') endGame(i); });
  updateUI();
  if (gameActive) showMarkers();
}

// ==================== LOCAL ACTIONS ====================
function playDevCardLocal(idx) {
  const p = P();
  const card = p.devCards[idx];
  if (!card) return;
  const type = card.type;
  p.devCards.splice(idx, 1);
  discardDeck.push(card);
  if (type === 'invention') { openInventionModal(); return; }
  if (type === 'monopoly')  { openMonopolyModal();  return; }
  broadcastAction({ kind: 'play_dev', cardType: type, player: currentPlayer });
}

function buyDevCardLocal() {
  if (!isMyTurn()) { showToast('⏳ Сейчас не ваш ход'); return; }
  if (!turnState.hasRolled) { showToast('🎲 Сначала бросьте кубики'); return; }
  if (turnState.playedDevCard) { showToast('🃏 В этот ход карта уже разыграна'); return; }

  const p = P();
  if (!hasRes(p, BUILD_COSTS.devCard)) {
    showToast('❌ Не хватает ресурсов: ' + missingResString(p, BUILD_COSTS.devCard), 2800);
    return;
  }

  const card = drawDevCard();
  if (!card) { showToast('🃏 Колода пуста'); return; }

  broadcastAction({ kind: 'buy_dev', cardType: card.type });
  showToast('🃏 Куплена карта развития', 1800);
}

// ==================== ИСТИННО СЛУЧАЙНЫЕ КУБИКИ ====================
function trueD6() {
  if (window.crypto && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / 6) * 6;
    let v;
    do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
    return (v % 6) + 1;
  }
  return Math.floor(Math.random() * 6) + 1;
}

function rollDiceLocal() {
  if (!isMyTurn() || turnState.hasRolled) return;
  const d1 = trueD6();
  const d2 = trueD6();
  broadcastAction({ kind: 'roll_dice', d1: d1, d2: d2 });
}
function endTurnLocal() {
  if (!isMyTurn() || turnState.robberMoveMode) return;
  if (turnState.buildMode === 'roadBuilding' && turnState.roadBuildingLeft > 0) return;
  broadcastAction({ kind: 'end_turn' });
}
function endGame(pi) {
  gamePhase = 'won';
  document.getElementById('victoryText').textContent = players[pi].name + ' победил!';
  document.getElementById('victoryModal').classList.add('visible');
  setStatus('🎉 ' + players[pi].name + ' побеждает!');
  addLog('🎉 ' + players[pi].name + ' побеждает!');
}

// ==================== АНИМАЦИЯ КУБИКОВ ====================
let _diceAnimRAF = null;

function animateDiceRoll(d1, d2) {
  const el1 = document.getElementById('die1');
  const el2 = document.getElementById('die2');
  if (!el1 || !el2) return;

  if (_diceAnimRAF) cancelAnimationFrame(_diceAnimRAF);

  el1.classList.add('rolling');
  el2.classList.add('rolling');

  const start = performance.now();
  const totalDuration = 800;
  let nextChange = 0;

  function frame(now) {
    const t = now - start;

    if (t >= totalDuration) {
      el1.textContent = d1;
      el2.textContent = d2;
      el1.classList.remove('rolling');
      el2.classList.remove('rolling');
      _diceAnimRAF = null;
      return;
    }

    const progress = t / totalDuration;
    const interval = 40 + progress * progress * 240;

    if (t >= nextChange) {
      nextChange = t + interval;
      el1.textContent = 1 + Math.floor(Math.random() * 6);
      el2.textContent = 1 + Math.floor(Math.random() * 6);
    }
    _diceAnimRAF = requestAnimationFrame(frame);
  }
  _diceAnimRAF = requestAnimationFrame(frame);
}
window.animateDiceRoll = animateDiceRoll;

// ==================== КЛИКИ ====================
function findClickTarget(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouseVec, camera);
  const hits = raycaster.intersectObjects(markerGroup.children, true);
  if (hits.length === 0) return null;
  let t = hits[0].object;
  while (t && !t.userData.type) t = t.parent;
  return t && t.userData.type ? t.userData : null;
}
function handleClick(event) {
  if (!isMyTurn()) { showToast('Не ваш ход'); return; }
  const data = findClickTarget(event);
  if (!data) return;

  if ((gamePhase === 'setup_settlement' || gamePhase === 'setup_settlement_2') && data.type === 'vertex') {
    if (!canSetupSettlement(data.idx)) return;
    broadcastAction({ kind: 'setup_settlement', vIdx: data.idx, player: currentPlayer });
    return;
  }
  if ((gamePhase === 'setup_road' || gamePhase === 'setup_road_2') && data.type === 'edge') {
    if (!canSetupRoad(data.idx, lastPlacedSettlement)) return;
    broadcastAction({ kind: 'setup_road', eIdx: data.idx, player: currentPlayer });
    return;
  }
  if (turnState.robberMoveMode && data.type === 'hex') {
    broadcastAction({ kind: 'move_robber', hexIdx: data.idx });
    return;
  }
  if (gamePhase === 'playing' && turnState.buildMode) {
    if (data.type === 'vertex') {
      if (turnState.buildMode === 'settlement' && canPlaceSettlement(data.idx, currentPlayer)) {
        broadcastAction({ kind: 'build_settlement', vIdx: data.idx });
      } else if (turnState.buildMode === 'city' && canPlaceCity(data.idx, currentPlayer)) {
        broadcastAction({ kind: 'build_city', vIdx: data.idx });
      }
    } else if (data.type === 'edge') {
      if (turnState.buildMode === 'road' && canPlaceRoad(data.idx, currentPlayer)) {
        broadcastAction({ kind: 'build_road', eIdx: data.idx, free: false });
      } else if (turnState.buildMode === 'roadBuilding') {
        if (edges[data.idx].road) return;
        broadcastAction({ kind: 'build_road', eIdx: data.idx, free: true });
      }
    }
  }
}

console.log('[game] OK');