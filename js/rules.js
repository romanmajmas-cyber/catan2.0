// окно с правилами
(function () {
  'use strict';

  const RULES_SECTIONS = [
    {
      title: '🎯 Цель игры',
      html: `
        <p>Набрать <b>10 победных очков</b> первым. Очки дают:</p>
        <ul>
          <li>Поселение — <b>1</b> очко</li>
          <li>Город — <b>2</b> очка</li>
          <li>Карта «Победное очко» — <b>1</b> очко</li>
          <li>Самая длинная дорога (5+ дорог) — <b>2</b> очка</li>
          <li>Самая большая армия (3+ рыцаря) — <b>2</b> очка</li>
        </ul>
      `
    },
    {
      title: '🧱 Подготовка',
      html: `
        <p>Поле собирается из 19 гексов:</p>
        <ul>
          <li><b>4 леса</b> — дерево</li>
          <li><b>4 пастбища</b> — шерсть</li>
          <li><b>4 поля</b> — зерно</li>
          <li><b>3 холма</b> — кирпич</li>
          <li><b>3 горы</b> — руда</li>
          <li><b>1 пустыня</b> — разбойник</li>
        </ul>
        <p>Жетоны с цифрами от <b>2</b> до <b>12</b> (кроме 7) раскладываются случайно. Красные цифры — <b>6</b> и <b>8</b> — самые вероятные.</p>
      `
    },
    {
      title: '🎲 Ход игрока',
      html: `
        <ol>
          <li><b>Бросок кубиков</b> — все игроки получают ресурсы с гексов, где стоят их поселения/города и выпало соответствующее число.</li>
          <li><b>Обмен</b> — можно меняться ресурсами с другими игроками или с банком (4:1 или по портам).</li>
          <li><b>Строительство</b> — дорога, поселение, город или карта развития.</li>
        </ol>
        <p>Если выпала <b>7</b> — никто ресурсов не получает, а игроки с 8+ картами сбрасывают половину.</p>
      `
    },
    {
      title: '💰 Стоимость',
      html: `
        <ul>
          <li>🛤️ <b>Дорога</b> — 1 дерево + 1 кирпич</li>
          <li>🏠 <b>Поселение</b> — 1 дерево + 1 кирпич + 1 шерсть + 1 зерно</li>
          <li>🏰 <b>Город</b> — 2 зерна + 3 руды (замена поселения)</li>
          <li>🃏 <b>Карта развития</b> — 1 шерсть + 1 зерно + 1 руда</li>
        </ul>
      `
    },
    {
      title: '🃏 Карты развития',
      html: `
        <ul>
          <li>⚔️ <b>Рыцарь</b> — передвинуть разбойника и украсть ресурс.</li>
          <li>🛤️ <b>Строительство дорог</b> — 2 бесплатные дороги.</li>
          <li>🌾 <b>Изобилие</b> — 2 любых ресурса из банка.</li>
          <li>💰 <b>Монополия</b> — все игроки отдают один тип ресурса.</li>
          <li>🏆 <b>Победное очко</b> — +1 очко (держится в тайне).</li>
        </ul>
        <p><b>Правило</b>: купленную карту нельзя сыграть в тот же ход (кроме победного очка).</p>
      `
    },
    {
      title: '🏆 Самая длинная дорога / армия',
      html: `
        <p><b>Дорога</b>: непрерывная цепочка из 5+ дорог. Даёт 2 очка. Если у другого игрока дорога длиннее — карта переходит к нему.</p>
        <p><b>Армия</b>: 3+ сыгранных рыцаря. Даёт 2 очка. Аналогично — переходит к тому, у кого рыцарей больше.</p>
      `
    },
    {
      title: '🤝 Обмен',
      html: `
        <ul>
          <li><b>С банком</b>: 4 одинаковых ресурса = 1 любой.</li>
          <li><b>С портом 3:1</b>: 3 одинаковых = 1 любой.</li>
          <li><b>С портом 2:1</b>: 2 конкретных = 1 любой.</li>
          <li><b>С игроками</b>: любые договорённости, но без обмана насчёт уже переданных карт.</li>
        </ul>
      `
    },
    {
      title: '🧭 Управление',
      html: `
        <ul>
          <li><b>ЛКМ + движение</b> — вращение камеры</li>
          <li><b>ПКМ + движение</b> — панорама</li>
          <li><b>Колесо мыши</b> — приближение/отдаление</li>
          <li><b>Клик по полю</b> — поставить фигуру в режиме строительства</li>
          <li><b>Кнопки сверху</b> — виды камеры (изометрия, сверху, крупно, колоды)</li>
        </ul>
      `
    }
  ];

  let _modal = null;

  function _ensureModal() {
    if (_modal) return _modal;

    _modal = document.createElement('div');
    _modal.id = 'rulesModal';
    _modal.className = 'modal';
    _modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-window rules-window">
        <div class="modal-header">
          <span>📖 Правила игры</span>
          <button class="modal-close" aria-label="Закрыть">×</button>
        </div>
        <div class="modal-body rules-body">
          <div class="rules-nav"></div>
          <div class="rules-content"></div>
        </div>
        <div class="modal-footer">Нажмите на раздел слева, чтобы прочитать</div>
      </div>
    `;
    document.body.appendChild(_modal);

    _modal.querySelector('.modal-close').onclick = () => _modal.classList.remove('visible');
    _modal.querySelector('.modal-backdrop').onclick = () => _modal.classList.remove('visible');

    // Кнопки-разделы
    const nav = _modal.querySelector('.rules-nav');
    const content = _modal.querySelector('.rules-content');

    RULES_SECTIONS.forEach((sec, i) => {
      const btn = document.createElement('button');
      btn.className = 'rules-nav-btn' + (i === 0 ? ' active' : '');
      btn.textContent = sec.title;
      btn.onclick = () => {
        nav.querySelectorAll('.rules-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        content.innerHTML = `<h3>${sec.title}</h3>${sec.html}`;
        content.scrollTop = 0;
      };
      nav.appendChild(btn);
    });

    // Первый раздел — сразу
    content.innerHTML = `<h3>${RULES_SECTIONS[0].title}</h3>${RULES_SECTIONS[0].html}`;

    return _modal;
  }

  window.showRules = function () {
    _ensureModal().classList.add('visible');
  };

  console.log('[rules] OK — правила доступны через showRules()');
})();