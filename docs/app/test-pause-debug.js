// Диагностический инструмент ТОЛЬКО для тестовых полигонов
// (test-slot-engine-ruleN.html) — расследование CLAUDE.md, Часть 6, п.0
// (асимметричная/непоследовательная прозрачность притенённых кубиков) и
// смежного дефекта («тень просвечивает через прозрачный кубик», найден на
// rule71). Не часть движка и не импортируется приложением — общий модуль,
// чтобы не повторять один и тот же код паузы/дампа в трёх HTML-файлах.
//
// Использование: после mount() вызвать attachPauseDebug(handle) — сам
// добавляет кнопки паузы/шага и текстовую панель дампа поверх страницы.
export function attachPauseDebug(handle) {
  injectStyles();

  // Баннер ошибки — ES-модули кешируются браузером как обычные файлы; при
  // повторных пушах во время расследования старая версия slot-engine-*.js
  // может остаться закешированной, пока страница уже новая (реальный
  // случай: handle.pause/getElapsed оказались not a function, хотя код на
  // GitHub уже содержал эти методы). Без этого баннера такая ошибка видна
  // только в консоли DevTools — теперь видна сразу на экране, со ссылкой
  // на решение (жёсткий рефреш).
  const errBanner = document.createElement('div');
  errBanner.id = 'pd-error';
  errBanner.hidden = true;
  document.body.appendChild(errBanner);
  window.addEventListener('error', e => {
    errBanner.hidden = false;
    errBanner.textContent = 'JS-ошибка: ' + e.message + ' — попробуйте жёсткий '
      + 'рефреш (Ctrl+Shift+R): вероятно, в кеше браузера старая версия '
      + 'одного из lib/slot-engine-*.js.';
  });

  const bar = document.createElement('div');
  bar.id = 'pause-bar';
  bar.innerHTML = `
    <button id="pd-pause">⏸ Пауза</button>
    <button id="pd-back200" disabled>«« -200мс</button>
    <button id="pd-back50" disabled>« -50мс</button>
    <button id="pd-fwd50" disabled>+50мс »</button>
    <button id="pd-fwd200" disabled>+200мс »»</button>
  `;
  document.body.appendChild(bar);
  const dumpEl = document.createElement('pre');
  dumpEl.id = 'pd-dump';
  document.body.appendChild(dumpEl);

  const btnPause = bar.querySelector('#pd-pause');
  const stepBtns = [
    [bar.querySelector('#pd-back200'), -200],
    [bar.querySelector('#pd-back50'), -50],
    [bar.querySelector('#pd-fwd50'), 50],
    [bar.querySelector('#pd-fwd200'), 200],
  ];

  function matsLabel(cube) {
    const m = cube.mesh.material;
    if (m === cube.matsMain) return 'matsMain';
    if (m === cube._pulsingMats) return '_pulsingMats (копия matsMain, грань 4 подменена)';
    if (m === cube.matsBlank) return 'matsBlank';
    if (m === cube.matsReady) return 'matsReady';
    if (m === cube.matsSignal) return 'matsSignal';
    return '(неизвестный набор)';
  }

  function renderDump() {
    const ctx = window.__slotDebug;
    if (!ctx) { dumpEl.textContent = '(нет window.__slotDebug — движок ещё не смонтирован)'; return; }
    const elapsed = handle.getElapsed();
    const lines = [`elapsed = ${elapsed.toFixed(0)} мс   (${handle.paused ? 'ПАУЗА' : 'идёт'})`, ''];
    const slots = Object.keys(ctx.cubes).map(Number).sort((a, b) => a - b);
    for (const slot of slots) {
      const cube = ctx.cubes[slot];
      const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
      const opac = mats.map(m => m.opacity.toFixed(2));
      const trans = mats.map(m => (m.transparent ? '1' : '0'));
      const sh = cube.shadow;
      lines.push(
        `слот ${String(slot).padStart(2)}  "${cube.tr}"  материал: ${matsLabel(cube)}  x=${cube.mesh.position.x.toFixed(2)}`,
        `          opacity по граням [0..5]: ${opac.join(', ')}`,
        `          transparent по граням:    ${trans.join(', ')}`,
        `          тень: opacity=${sh.material.opacity.toFixed(2)}  visible=${sh.visible}`,
      );
    }
    dumpEl.textContent = lines.join('\n');
  }

  btnPause.addEventListener('click', () => {
    if (handle.paused) { handle.resume(); btnPause.textContent = '⏸ Пауза'; }
    else { handle.pause(); btnPause.textContent = '▶ Продолжить'; }
    stepBtns.forEach(([btn]) => { btn.disabled = !handle.paused; });
    renderDump();
  });
  stepBtns.forEach(([btn, delta]) => {
    btn.addEventListener('click', () => { handle.stepBy(delta); renderDump(); });
  });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); btnPause.click(); }
  });
  setInterval(renderDump, 200); // живой дамп и во время проигрыша, не только на паузе
  renderDump();
}

let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    #pause-bar { position:fixed; top:10px; right:10px; z-index:10; display:flex;
      gap:6px; flex-wrap:wrap; max-width:320px; justify-content:flex-end; }
    #pause-bar button { font-family:'Helvetica Neue',sans-serif; font-size:12px;
      padding:6px 10px; border-radius:6px; border:1px solid rgba(255,255,255,.25);
      background:rgba(0,0,0,.45); color:#E6E1D2; cursor:pointer; }
    #pause-bar button:hover { background:rgba(0,0,0,.65); }
    #pause-bar button:disabled { opacity:.35; cursor:default; }
    #pd-dump { position:fixed; bottom:10px; left:10px; right:10px; z-index:10;
      font-family:'SFMono-Regular',Consolas,monospace; font-size:11px; line-height:1.5;
      color:#E6E1D2; background:rgba(0,0,0,.55); padding:8px 12px; border-radius:6px;
      max-height:38vh; overflow:auto; white-space:pre; }
    #pd-error { position:fixed; top:10px; left:50%; transform:translateX(-50%);
      z-index:20; max-width:80vw; font-family:'Helvetica Neue',sans-serif;
      font-size:13px; color:#2A0E0E; background:#E8A0A0; padding:8px 14px;
      border-radius:6px; box-shadow:0 2px 10px rgba(0,0,0,.4); }
  `;
  document.head.appendChild(style);
}
