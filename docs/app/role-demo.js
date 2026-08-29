// Подсистема 2D-подсветки ролей (источник/триггер/результат) на алфавитной
// панели, вынесенная из основного скрипта приложения. Делает собственные
// document.getElementById() (те же id, что и в основном скрипте) — элементы
// уже есть в статической разметке к моменту выполнения любого модуля, порядок
// импорта не имеет значения. Наружу нужны только три функции: остальное —
// внутренние детали рендера.

/* ═══════════════════ РОЛИ НА АЛФАВИТЕ: рендер (источник/триггер/результат) ═══════════════════ */
const wrap = document.getElementById('alpha-wrap');
const animTiles = document.getElementById('anim-tiles');

const roleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
roleSvg.setAttribute('id', 'role-svg');
roleSvg.innerHTML = `
  <defs>
    <marker id="role-arrow" viewBox="0 0 10 10" refX="10" refY="5"
            markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="rgba(255,244,220,.9)"></path>
    </marker>
  </defs>`;
wrap.appendChild(roleSvg);

/* ═══════════════════ ГУНА-ТАБЛИЦА: подсветка всего столбца по активной клетке ═══════════════════ */
/* Не трогает rule3-agnayas.js / rule71-vak-asti.js — они как ставили .gv-active на
   конкретные клетки, так и ставят; здесь только досчитываем, весь ли столбец подсветить. */
(function () {
  const gunaTable = document.querySelector('.guna-table');
  if (!gunaTable) return;
  function refreshGunaColumns() {
    const rows = Array.from(gunaTable.querySelectorAll('tr'));
    const ncols = Math.max(...rows.map(r => r.children.length));
    for (let c = 0; c < ncols; c++) {
      const cellsInCol = rows.map(r => r.children[c]).filter(Boolean);
      const active = cellsInCol.some(td => td.classList.contains('gv-active'));
      cellsInCol.forEach(td => td.classList.toggle('gv-col-active', active));
    }
  }
  const gunaObserver = new MutationObserver(refreshGunaColumns);
  gunaTable.querySelectorAll('td').forEach(td =>
    gunaObserver.observe(td, { attributes: true, attributeFilter: ['class'] }));
  refreshGunaColumns();
})();

const roleStepsWrap   = document.getElementById('role-steps');
const grammarExplain  = document.getElementById('grammar-explain');
const roleStepsRibbon = document.getElementById('role-steps-ribbon');
const roleStepsText   = document.getElementById('role-steps-text');
let currentSlotStepListener = null; // слушатель события slotstep текущего 3D-примера (см. clearRoleDemo)

function cellEl(tr) { return document.getElementById('ac-' + tr); }

function cellCenter(el) {
  const r = el.getBoundingClientRect();
  const w = wrap.getBoundingClientRect();
  return { x: r.left - w.left + r.width / 2, y: r.top - w.top + r.height / 2 };
}

const ROLE_LINE_TRIM = 20; // px от центра клетки = половина --card (40px) — линия строго до края плашки, не заходит на неё
const ROLE_LINE_SKIP_DIST = 60; // если клетки и так соседи по сетке (шаг ~42px) — после обрезки остался бы бессмысленный огрызок; не рисуем вообще, соседство и так видно по подсветке

function svgRoleLine(a, b, { dashed = false, label = null } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  if (dist < ROLE_LINE_SKIP_DIST) return; // соседи по сетке — связь и так очевидна, линия не нужна
  const ux = dx / dist, uy = dy / dist;
  // обрезаем оба конца ровно до края клетки — линия никогда не лежит на плашке
  const x1 = a.x + ux * ROLE_LINE_TRIM, y1 = a.y + uy * ROLE_LINE_TRIM;
  const x2 = b.x - ux * ROLE_LINE_TRIM, y2 = b.y - uy * ROLE_LINE_TRIM;

  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', x1); line.setAttribute('y1', y1);
  line.setAttribute('x2', x2); line.setAttribute('y2', y2);
  line.setAttribute('class', 'role-line' + (dashed ? ' dashed' : ''));
  line.setAttribute('marker-end', 'url(#role-arrow)'); // остриё всегда указывает на результат
  roleSvg.appendChild(line);
  if (label) {
    // подпись — ровно на середине линии (линия визуально ныряет под неё), всегда горизонтальная:
    // повёрнутый вертикальный/диагональный текст плохо читается на короткой дистанции
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('transform', `translate(${mx},${my})`);
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'role-label');
    text.textContent = label;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'role-label-bg');
    rect.setAttribute('rx', 3);
    g.appendChild(rect);
    g.appendChild(text);
    roleSvg.appendChild(g);
    // getBBox доступен только у элемента, реально прикреплённого к отрисовываемому документу
    // (в jsdom-тестах его нет — тогда считаем ширину по числу символов, запасной вариант)
    let bw, bh;
    try {
      const bbox = text.getBBox();
      bw = bbox.width + 10; bh = bbox.height + 6;
    } catch {
      bw = label.length * 5.4 + 10; bh = 13;
    }
    rect.setAttribute('x', -bw / 2); rect.setAttribute('y', -bh / 2);
    rect.setAttribute('width', bw); rect.setAttribute('height', bh);
  }
}

/* Маленький значок у клетки, без линии — для эффектов, у которых нет отдельной клетки-результата
   на алфавите (буква пропадает совсем, или результат — та же самая буква, только удвоенная). */
function svgBadge(center, text, { dx = 15, dy = -15 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const x = center.x + dx, y = center.y + dy;
  const g = document.createElementNS(ns, 'g');
  const circle = document.createElementNS(ns, 'circle');
  circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', 10);
  circle.setAttribute('class', 'role-badge-bg');
  const t = document.createElementNS(ns, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('class', 'role-badge-text');
  t.textContent = text;
  g.appendChild(circle); g.appendChild(t);
  roleSvg.appendChild(g);
}

function clearRoleDemo() {
  wrap.querySelectorAll('.lc').forEach(el =>
    el.classList.remove('role-dim', 'role-source', 'role-trigger', 'role-result'));
  roleSvg.querySelectorAll('line, g').forEach(el => el.remove()); // <defs> с маркером-стрелкой не трогаем
  roleStepsWrap.style.display = 'none';
  roleStepsRibbon.innerHTML = '';
  roleStepsText.textContent = '';
  grammarExplain.style.display = 'none'; // блок гуны/вриддхи виден только при активном примере
  document.querySelectorAll('.guna-table td.gv-active').forEach(el => el.classList.remove('gv-active'));
  // Снимаем слушатель slotstep предыдущего примера — иначе при каждой смене
  // 3D-примера слушатели копятся на animTiles (элемент переиспользуется,
  // innerHTML очищается, но addEventListener на самом animTiles — нет, он
  // не привязан к содержимому).
  if (currentSlotStepListener) {
    animTiles.removeEventListener('slotstep', currentSlotStepListener);
    currentSlotStepListener = null;
  }
}

function activateRoleCell(tr, role) {
  const el = cellEl(tr);
  if (!el) { console.warn('Роль: буква не найдена на алфавите —', tr); return null; }
  el.classList.remove('role-dim');
  el.classList.add('role-' + role);
  return el;
}

/* То же самое, но роль может занимать НЕСКОЛЬКО клеток сразу (составной источник/результат —
   например kṣ как источник в семье правил 20–26, или au→ā+v как составной результат). Принимает
   строку (одна клетка) или массив строк (несколько), всегда возвращает массив — не подставляет
   вымышленную «одну» клетку туда, где реально их несколько, и не сужает несколько до одной. */
function activateRoleCells(trOrArr, role) {
  const ids = Array.isArray(trOrArr) ? trOrArr : [trOrArr];
  return ids.map(tr => activateRoleCell(tr, role)).filter(Boolean);
}

/* Рисует ОДИН шаг цепочки на алфавите (подсветка + линии) — не трогает ленту кнопок/текст,
   вызывается и при первом открытии примера, и при клике на любую кнопку шага.
   step.gunaCells — необязательный список id клеток таблицы «Гуна · Вриддхи» (см. gc-<ступень>-<столбец>
   в разметке таблицы), которые нужно подсветить для этого шага — например ['gc-weak-i','gc-guna-i']
   для перехода i→e. Столбец целиком подсветится сам — это уже общий MutationObserver, не здесь. */
function renderRoleStep(step) {
  wrap.querySelectorAll('.lc').forEach(el =>
    el.classList.remove('role-dim', 'role-source', 'role-trigger', 'role-result'));
  roleSvg.querySelectorAll('line, g').forEach(el => el.remove());
  wrap.querySelectorAll('.lc').forEach(el => el.classList.add('role-dim'));
  document.querySelectorAll('.guna-table td.gv-active').forEach(el => el.classList.remove('gv-active'));
  // Подсветка ячеек таблицы гуна/вриддхи слева (gunaCells) — независимо от
  // текста в правой панели (общий текст живёт под самой таблицей, не
  // привязан к шагу); эта подсветка по-прежнему про КОНКРЕТНЫЙ шаг.
  (step.gunaCells || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('gv-active');
    else console.warn('Роль: клетка гуна-таблицы не найдена —', id);
  });

  if (step.type === 'place') {
    const src = activateRoleCell(step.source, 'source');
    const trg = activateRoleCell(step.trigger, 'trigger');
    const res = activateRoleCell(step.result, 'result');
    if (src && res) svgRoleLine(cellCenter(src), cellCenter(res), { label: 'ряд' });
    if (trg && res) svgRoleLine(cellCenter(trg), cellCenter(res), { dashed: true, label: 'столбец' });
  } else if (step.type === 'voicing') {
    const src = activateRoleCell(step.source, 'source');
    const trg = activateRoleCell(step.trigger, 'trigger');
    const res = activateRoleCell(step.result, 'result');
    if (src && res) svgRoleLine(cellCenter(src), cellCenter(res), { label: 'столбец' });
    if (trg && res) svgRoleLine(cellCenter(trg), cellCenter(res), { dashed: true, label: 'только звонкость' });
  } else if (step.type === 'grade') {
    const src = activateRoleCell(step.source, 'source');
    activateRoleCell(step.trigger, 'trigger'); // катализатор: подсвечен, но без координат — линия к нему не идёт
    const res = activateRoleCell(step.result, 'result');
    if (src && res) svgRoleLine(cellCenter(src), cellCenter(res), {});
  } else if (step.type === 'lexical') {
    // позиционно-лексическое правило: триггера нет вообще (не катализатор — его просто нет)
    const src = activateRoleCell(step.source, 'source');
    const res = activateRoleCell(step.result, 'result');
    if (src && res) svgRoleLine(cellCenter(src), cellCenter(res), {});
  } else if (step.type === 'wholevarga') {
    step.pairs.forEach(([s, r]) => {
      const src = activateRoleCell(s, 'source');
      const res = activateRoleCell(r, 'result');
      if (src && res) svgRoleLine(cellCenter(src), cellCenter(res), {});
    });
  } else if (step.type === 'elide') {
    // буква пропадает без следа — нет клетки-результата на алфавите, только значок «∅» у источника
    const src = activateRoleCell(step.source, 'source');
    if (src) svgBadge(cellCenter(src), '∅');
  } else if (step.type === 'double') {
    // результат — та же самая буква, что источник, только удвоенная — значок «×2», не вторая клетка
    const src = activateRoleCell(step.source, 'source');
    if (src) svgBadge(cellCenter(src), '×2');
  } else if (step.type === 'compound') {
    // составной источник и/или результат — несколько клеток на одну роль
    // (kṣ как источник, или au→ā+v как составной результат). Роли, которых нет
    // (например, триггера), просто не обозначаем — не выдумываем недостающее.
    const srcArr = step.source ? activateRoleCells(step.source, 'source') : [];
    const trgArr = step.trigger ? activateRoleCells(step.trigger, 'trigger') : [];
    const resArr = step.result ? activateRoleCells(step.result, 'result') : [];
    srcArr.forEach(src => resArr.forEach(res => svgRoleLine(cellCenter(src), cellCenter(res), {})));
    trgArr.forEach(trg => resArr.forEach(res => svgRoleLine(cellCenter(trg), cellCenter(res), { dashed: true })));
  }

  roleStepsText.textContent = step.text || '';
}

/* Для примеров С 3D-анимацией (ex.module задан) кнопочная лента не нужна
   вообще — переключение шагов делает сама анимация, у неё уже есть
   собственные чипы под кубиками (см. slot-engine.js). Эта функция
   показывает первый шаг сразу (как обычно) и слушает событие slotstep на
   animTiles — 3D-модуль дошёл до нового шага → 2D-подсветка алфавита
   переключается следом, без отдельного клика и без своей ленты. */
function renderRoleDemoSynced(demo) {
  clearRoleDemo();
  if (!demo || !demo.steps || !demo.steps.length) return;
  grammarExplain.style.display = 'flex'; // виден только когда есть реальный активный пример
  roleStepsWrap.style.display = 'none'; // кнопки не нужны — синхронизация делает их лишними
  renderRoleStep(demo.steps[0]);
  currentSlotStepListener = e => {
    const step = demo.steps[e.detail.index];
    if (step) renderRoleStep(step);
  };
  animTiles.addEventListener('slotstep', currentSlotStepListener);
}

/* Открывает пример целиком: строит ленту кнопок-шагов (даже если шаг один — единый вид
   для всех примеров, не только для цепочек) и показывает первый шаг. */
function renderRoleDemo(demo) {
  clearRoleDemo();
  if (!demo || !demo.steps || !demo.steps.length) return;
  grammarExplain.style.display = 'flex'; // виден только когда есть реальный активный пример

  if (demo.steps.length === 1) {
    // один шаг — переключать нечего, лента не нужна, сразу показываем объяснение
    roleStepsWrap.style.display = 'none';
    renderRoleStep(demo.steps[0]);
    return;
  }

  roleStepsWrap.style.display = 'block';
  demo.steps.forEach((step, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'role-step-btn' + (i === 0 ? ' active' : '');
    // Формат подписи единый с чипами слот-движка под 3D-анимацией:
    // «Шаг N. Грамматика» / «Шаг N. Правило X» — не «Шаг N · прав. X»,
    // один и тот же вид в обоих местах экрана, не два разных.
    const tag = step.tag === 'грам.' ? 'Грамматика' : ('Правило ' + step.tag);
    btn.textContent = 'Шаг ' + (i + 1) + '. ' + tag;
    btn.addEventListener('click', () => {
      roleStepsRibbon.querySelectorAll('.role-step-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderRoleStep(step);
    });
    roleStepsRibbon.appendChild(btn);
  });
  renderRoleStep(demo.steps[0]);
}

export { renderRoleDemo, renderRoleDemoSynced, clearRoleDemo };
