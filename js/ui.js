// ==================== ЛОГ, СТАТУС ====================
function addLog(msg) {
  const el = document.getElementById('log');
  const p = document.createElement('p');
  p.textContent = msg;
  el.prepend(p);
  while (el.children.length > 40) el.lastChild.remove();
}
function setStatus(msg, cls) {
  const el = document.getElementById('statusMsg');
  el.textContent = msg; el.className = '';
  if (cls) el.classList.add(cls);
}
function setPhaseBadge(t, cls) {
  const el = document.getElementById('phaseBadge');
  el.textContent = t; el.className = '';
  if (cls) el.classList.add(cls);
}

// ==================== ОБЩИЕ ДАННЫЕ ====================
const RES_ORDER  = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const RES_LABELS = {
  wood:  'Дерево',
  brick: 'Кирпич',
  sheep: 'Шерсть',
  wheat: 'Зерно',
  ore:   'Руда'
};

// ==================== ОСНОВНОЙ UI ====================
function updateUI() {
  if (!players.length) return;
  const p = players[myPlayerIndex];

  // --- Панель игроков ---
  const playersRow = document.getElementById('playersRow');
  playersRow.innerHTML = players.map(function(pl, i) {
    const tags = [];
    if (pl.hasLongestRoad) tags.push('🛣️');
    if (pl.hasLargestArmy) tags.push('⚔️');
    const tagHtml = tags.length ? '<span class="badge-tag">' + tags.join(' ') + '</span>' : '';
    const color = PLAYER_COLORS[pl.colorIdx];
    return '<div class="player-card ' + (i === currentPlayer ? 'active' : '') + ' ' + (i === myPlayerIndex ? 'me' : '') + '">' +
      '<div class="name"><span class="color-dot" style="background:' + color.css + '"></span>' + pl.name + '</div>' +
      '<div class="stats">VP: <strong>' + getVP(i) + '</strong> · 🏠' + pl.settlements.length + ' · 🏙️' + pl.cities.length + ' · 🛣️' + pl.roads.length + '<br>' +
      '⚔️' + pl.knightsPlayed + ' · 🃏' + (pl.devCards.length + pl.newDevCards.length) + '</div>' + tagHtml + '</div>';
  }).join('');

  document.getElementById('vpBadge').textContent = Math.max.apply(null, players.map(function(_, i) { return getVP(i); })) + ' / 10';
  document.getElementById('resTitle').textContent = '📦 Ресурсы: ' + p.name;

  // --- Крупные карты ресурсов ---
  const resRow = document.getElementById('resRow');
  resRow.innerHTML = RES_ORDER.map(function(r) {
    const count = p[r] || 0;
    const label = RES_LABELS[r] || r;
    const icon  = (RES_NAMES[r] && RES_NAMES[r].icon) || '?';
    const cls   = 'res-card' + (count === 0 ? ' res-card--empty' : '');
    return '<div class="' + cls + '" data-res="' + r + '" title="' + label + '">' +
      '<div class="res-card__icon">' + icon + '</div>' +
      '<div class="res-card__count">' + count + '</div>' +
      '<div class="res-card__label">' + label + '</div>' +
    '</div>';
  }).join('');

  // --- Карты развития ---
  const devRow = document.getElementById('devRow');
  let devHtml = '';
  if (p.vpCards > 0) {
    devHtml += '<div class="dev-card vp-card disabled"><span class="ico">🏆</span><span class="cnt">' + p.vpCards + '</span></div>';
  }
  const counts    = { knight: 0, roadBuilding: 0, invention: 0, monopoly: 0 };
  const newCounts = { knight: 0, roadBuilding: 0, invention: 0, monopoly: 0 };
  p.devCards.forEach(function(c) { counts[c.type]++; });
  p.newDevCards.forEach(function(c) { newCounts[c.type]++; });
  ['knight', 'roadBuilding', 'invention', 'monopoly'].forEach(function(type) {
    const total = counts[type] + newCounts[type];
    if (total === 0) return;
    const canPlay = counts[type] > 0 && !turnState.playedDevCard && !turnState.robberMoveMode && isMyTurn();
    const cls = 'dev-card' + (canPlay ? '' : ' disabled');
    devHtml += '<div class="' + cls + '" data-devtype="' + type + '">' +
      '<span class="ico">' + DEV_TYPES[type].icon + '</span>' +
      '<span class="cnt">' + counts[type] +
        (newCounts[type] > 0 ? '<span class="new-badge">+' + newCounts[type] + '🆕</span>' : '') +
      '</span></div>';
  });
  if (!devHtml) devHtml = '<div class="dev-empty">Нет карт</div>';
  devRow.innerHTML = devHtml;
  devRow.querySelectorAll('.dev-card[data-devtype]').forEach(function(el) {
    el.onclick = function() {
      const type = el.dataset.devtype;
      const idx = p.devCards.findIndex(function(c) { return c.type === type; });
      if (idx < 0) { showToast('Эта карта ещё не доступна в этот ход'); return; }
      if (!isMyTurn()) { showToast('Не ваш ход'); return; }
      if (turnState.playedDevCard) { showToast('Уже разыграли карту в этот ход'); return; }
      playDevCardLocal(idx);
    };
  });

  // --- Обмен ---
  const inSetup = gamePhase.indexOf('setup_') === 0;
  const canTrade = turnState.hasRolled && !inSetup && gamePhase !== 'won' && !turnState.robberMoveMode && isMyTurn();
  document.getElementById('tradeGrid').innerHTML =
    '<button id="openTradeBtn" ' + (!canTrade ? 'disabled' : '') + ' style="grid-column:1/-1">🔄 Открыть обмен<span class="cost">4:1 · 3:1 · 2:1</span></button>';
  document.getElementById('openTradeBtn').onclick = openTradeModal;

  // --- Постройки ---
  const canRoad = hasRes(p, BUILD_COSTS.road);
  const canSet  = hasRes(p, BUILD_COSTS.settlement);
  const canCity = hasRes(p, BUILD_COSTS.city);
  const isActive = turnState.buildMode;
  const dis = !turnState.hasRolled || inSetup || gamePhase === 'won' || turnState.robberMoveMode || !isMyTurn();
  function costStr(c) {
    return Object.keys(c).map(function(r) { return RES_NAMES[r].icon + c[r]; }).join(' ');
  }

  // Кнопка «Купить карту» — НЕ отключается при нехватке ресурсов.
  // Клик покажет уведомление «не хватает …».
  document.getElementById('buildGrid').innerHTML =
    '<button data-build="road" class="' + (isActive === 'road' ? 'active' : '') + '" ' + (!canRoad || dis ? 'disabled' : '') + '>🛣️ Дорога<span class="cost">' + costStr(BUILD_COSTS.road) + '</span></button>' +
    '<button data-build="settlement" class="' + (isActive === 'settlement' ? 'active' : '') + '" ' + (!canSet || dis ? 'disabled' : '') + '>🏠 Поселение<span class="cost">' + costStr(BUILD_COSTS.settlement) + '</span></button>' +
    '<button data-build="city" class="' + (isActive === 'city' ? 'active' : '') + '" ' + (!canCity || dis ? 'disabled' : '') + '>🏙️ Город<span class="cost">' + costStr(BUILD_COSTS.city) + '</span></button>' +
    '<button data-build="cancel" class="' + (!isActive ? 'active' : '') + '" ' + (dis || isActive === 'roadBuilding' ? 'disabled' : '') + '>⛔ Отмена</button>' +
    '<button id="buyDevBtn" ' + (dis ? 'disabled' : '') + ' style="grid-column:1/-1">🃏 Купить карту<span class="cost">' + costStr(BUILD_COSTS.devCard) + '</span></button>';

  document.getElementById('buildGrid').querySelectorAll('button[data-build]').forEach(function(btn) {
    btn.onclick = function() {
      if (inSetup || gamePhase === 'won' || turnState.robberMoveMode || !isMyTurn()) return;
      const mode = btn.dataset.build;
      if (mode === 'cancel') turnState.buildMode = null;
      else turnState.buildMode = turnState.buildMode === mode ? null : mode;
      showMarkers();
      updateUI();
    };
  });
  document.getElementById('buyDevBtn').onclick = buyDevCardLocal;

  document.getElementById('rollBtn').disabled = turnState.hasRolled || inSetup || gamePhase === 'won' || !!turnState.robberMoveMode || !isMyTurn();
  document.getElementById('endTurnBtn').disabled = !turnState.hasRolled || inSetup || gamePhase === 'won' || !!turnState.robberMoveMode || !isMyTurn() || (turnState.buildMode === 'roadBuilding' && turnState.roadBuildingLeft > 0);
  document.getElementById('endTurnBtn').textContent = isMyTurn() ? '⏭️ Завершить ход' : ('⏳ Ход ' + players[currentPlayer].name);

  // --- Оверлей хода ---
  const overlay = document.getElementById('turnOverlay');
  overlay.classList.remove('active', 'my-turn', 'other-turn');
  if (gameActive && gamePhase !== 'won') {
    if (isMyTurn()) { overlay.textContent = '▶ ВАШ ХОД'; overlay.classList.add('active', 'my-turn'); }
    else { overlay.textContent = 'Ход: ' + players[currentPlayer].name; overlay.classList.add('active', 'other-turn'); }
  }

  if (gamePhase === 'won') setPhaseBadge('ИГРА ОКОНЧЕНА');
  else if (inSetup) setPhaseBadge('РАССТАНОВКА: ' + players[currentPlayer].name.toUpperCase(), 'setup');
  else if (turnState.robberMoveMode) setPhaseBadge('РАЗБОЙНИК', 'robber');
  else setPhaseBadge('ХОД: ' + players[currentPlayer].name.toUpperCase(), isMyTurn() ? '' : 'turn-wait');
}

// ==================== МОДАЛКИ ====================
function closeModal(id) { document.getElementById(id).classList.remove('visible'); }

let inventionSel = { r1: null, r2: null };
function openInventionModal() {
  inventionSel = { r1: null, r2: null };
  renderInventionModal();
  document.getElementById('inventionModal').classList.add('visible');
}
function renderInventionModal() {
  const row = document.getElementById('inventionRow');
  row.innerHTML = '';
  RES_ORDER.forEach(function(r) {
    const slot = document.createElement('div');
    const isSel = inventionSel.r1 === r || inventionSel.r2 === r;
    slot.className = 'trade-slot' + (isSel ? ' filled' : '');
    slot.innerHTML = '<div class="ico-big">' + RES_NAMES[r].icon + '</div>';
    slot.onclick = function() {
      if (inventionSel.r1 === r) { inventionSel.r1 = inventionSel.r2; inventionSel.r2 = null; }
      else if (inventionSel.r2 === r) inventionSel.r2 = null;
      else if (!inventionSel.r1) inventionSel.r1 = r;
      else if (!inventionSel.r2) inventionSel.r2 = r;
      renderInventionModal();
    };
    row.appendChild(slot);
  });
  const cnt = (inventionSel.r1 ? 1 : 0) + (inventionSel.r2 ? 1 : 0);
  document.getElementById('inventionInfo').textContent = 'Выбрано: ' + cnt + ' / 2';
}

function openMonopolyModal() {
  const row = document.getElementById('monopolyRow');
  row.innerHTML = '';
  RES_ORDER.forEach(function(r) {
    const slot = document.createElement('div');
    slot.className = 'trade-slot';
    slot.style.cursor = 'pointer';
    slot.innerHTML = '<div class="ico-big">' + RES_NAMES[r].icon + '</div>';
    slot.onclick = function() {
      broadcastAction({ kind: 'play_dev', cardType: 'monopoly', resource: r, player: currentPlayer });
      closeModal('monopolyModal');
    };
    row.appendChild(slot);
  });
  document.getElementById('monopolyModal').classList.add('visible');
}

function openStealModal(victims) {
  const row = document.getElementById('stealVictimsRow');
  row.innerHTML = '';
  victims.forEach(function(v) {
    const btn = document.createElement('button');
    btn.className = 'victim-btn';
    btn.textContent = players[v].name;
    btn.onclick = function() {
      const target = players[v];
      const avail = RES_ORDER.filter(function(r) { return target[r] > 0; });
      if (avail.length === 0) { closeModal('stealModal'); return; }
      const stolen = avail[Math.floor(rng() * avail.length)];
      broadcastAction({ kind: 'steal', targetPi: v, resource: stolen });
      closeModal('stealModal');
    };
    row.appendChild(btn);
  });
  document.getElementById('stealModal').classList.add('visible');
}

let tradeSel = { give: null, take: null, amount: 4 };
function openTradeModal() {
  if (!isMyTurn() || !turnState.hasRolled) return;
  tradeSel = { give: null, take: null, amount: 4 };
  renderTradeModal();
  document.getElementById('tradeModal').classList.add('visible');
}
function renderTradeModal() {
  const p = P();
  const giveRow = document.getElementById('tradeGiveRow');
  giveRow.innerHTML = '';
  RES_ORDER.forEach(function(r) {
    const rate = bestRate(currentPlayer, r);
    const can = p[r] >= rate.rate;
    const slot = document.createElement('div');
    slot.className = 'trade-slot' + (tradeSel.give === r ? ' filled' : '');
    slot.style.opacity = can ? '1' : '0.4';
    slot.innerHTML = '<div class="ico-big">' + RES_NAMES[r].icon + '</div>' +
                     '<div class="cnt">' + p[r] + '</div>' +
                     '<div class="rate">' + rate.rate + ':1</div>';
    if (can) slot.onclick = function() { tradeSel.give = r; tradeSel.amount = rate.rate; renderTradeModal(); };
    giveRow.appendChild(slot);
  });

  const takeRow = document.getElementById('tradeTakeRow');
  takeRow.innerHTML = '';
  RES_ORDER.forEach(function(r) {
    const same = tradeSel.give === r;
    const slot = document.createElement('div');
    slot.className = 'trade-slot' + (tradeSel.take === r ? ' filled' : '');
    slot.style.opacity = same ? '0.4' : '1';
    slot.innerHTML = '<div class="ico-big">' + RES_NAMES[r].icon + '</div>';
    if (!same) slot.onclick = function() { tradeSel.take = r; renderTradeModal(); };
    takeRow.appendChild(slot);
  });

  const info = document.getElementById('tradeRateInfo');
  if (tradeSel.give && tradeSel.take) {
    const rate = bestRate(currentPlayer, tradeSel.give);
    info.innerHTML = 'Обмен: <strong>' + rate.rate + '× ' + RES_NAMES[tradeSel.give].icon + '</strong> → <strong>1× ' + RES_NAMES[tradeSel.take].icon + '</strong>';
  } else {
    info.textContent = 'Выберите ресурсы';
  }
}

// ==================== ОБРАБОТЧИКИ UI ====================
document.getElementById('rollBtn').onclick = rollDiceLocal;
document.getElementById('endTurnBtn').onclick = endTurnLocal;
document.getElementById('tradeConfirm').onclick = function() {
  if (!tradeSel.give || !tradeSel.take) return;
  const rate = bestRate(currentPlayer, tradeSel.give);
  if (P()[tradeSel.give] < rate.rate) return;
  broadcastAction({ kind: 'trade', give: tradeSel.give, take: tradeSel.take, amount: rate.rate });
  closeModal('tradeModal');
};
document.getElementById('tradeCancel').onclick     = function() { closeModal('tradeModal'); };
document.getElementById('monopolyCancel').onclick  = function() { closeModal('monopolyModal'); };
document.getElementById('inventionConfirm').onclick = function() {
  if (!inventionSel.r1 || !inventionSel.r2) return;
  broadcastAction({ kind: 'play_dev', cardType: 'invention', r1: inventionSel.r1, r2: inventionSel.r2, player: currentPlayer });
  closeModal('inventionModal');
};
document.getElementById('inventionCancel').onclick = function() { closeModal('inventionModal'); };
document.getElementById('stealCancel').onclick     = function() { closeModal('stealModal'); };

console.log('[ui] OK');