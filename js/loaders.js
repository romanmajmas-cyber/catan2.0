// js/loaders.js — НЕ модуль, обычный скрипт
window.MODELS = {};

window.loadAllModels = function() {
  return new Promise(function(resolve) {
    // Модели из .glb больше не используем (овцы генерируются кодом в pasture.js)
    console.log('[Models] Нет внешних моделей для загрузки. Стартуем!');
    resolve({ loaded: 0, failed: 0 });
  });
};