// Вынесено из sanskrit-sandhi-app.html — левая панель (список правил) и
// центральная зона (текст правила, примеры, зона монтирования 3D-анимации,
// упражнения): выбор карточки слева полностью управляет тем, что показано
// по центру, поэтому это один модуль, не два. Делает собственные
// document.getElementById() (те же id, что и в основном скрипте) — элементы
// уже есть в статической разметке к моменту выполнения любого модуля.
// Наружу ничего не нужно — вводный экран (то, что осталось в основном
// скрипте) не пересекается с этим модулем по состоянию.
import { SECTIONS, EXAMPLES, EXERCISES } from './data.js';
import { hideTooltip } from './alpha-panel.js';
import { renderRoleDemo, renderRoleDemoSynced, clearRoleDemo } from './role-demo.js';

/* ═══════════════════ ОБЩЕЕ ═══════════════════ */
const CARD = 40;
const GAP  = 2;
const PER_ROW = 8;

let pinnedCardS = null;

function playFlip() {
  /* звук временно отключён — заглушка, изменим позже */
}

/* ═══════════════════ ЦЕНТР ═══════════════════ */
const rdEmpty    = document.getElementById('rd-empty');
const rdNum      = document.getElementById('rd-num');
const rdText     = document.getElementById('rd-text');
const rdTextWrap  = document.getElementById('rd-text-wrap');
const stubLabel   = document.getElementById('stub-label');
const stubSub     = document.getElementById('stub-sub');

const lpPicker   = document.getElementById('letter-picker');
const ezLabel    = document.getElementById('ez-label');
const ezChips    = document.getElementById('ez-chips');

/* ═══════════════════ ЗОНА АНИМАЦИИ: mount()/unmount() модулей-примеров ═══════════════════ */
const animEmpty   = document.getElementById('anim-empty');
const animWrap    = document.getElementById('anim-wrap');
const animTiles   = document.getElementById('anim-tiles');

let currentAnim = null; // { controller, modulePath } — то, что сейчас смонтировано

function unmountCurrentAnim() {
  if (currentAnim) {
    currentAnim.controller.unmount();
    currentAnim = null;
  }
  animWrap.style.display  = 'none';
  animEmpty.style.display = 'block';
  clearRoleDemo();
}

// currentAnim выставляется только ПОСЛЕ того, как долетел await import() —
// если бы он выставлялся раньше, клик по примеру ДВАЖДЫ до того, как
// первый импорт успел долететь, обошёл бы guard выше (currentAnim &&
// modulePath===...): currentAnim ещё null, оба монтажа стартовали бы
// параллельно, оба читая ОДИН И ТОТ ЖЕ модульный data.ops (см. также фикс
// в slot-engine.js — та часть проблемы устранена там; здесь устраняется
// сама возможность гонки, не только её последствия). Токен: у каждого
// вызова свой номер, актуальным считается только ПОСЛЕДНИЙ — устаревшее
// разрешение import() просто ничего не монтирует.
let mountToken = 0;

async function mountAnimExample(modulePath) {
  // повторный клик по уже смонтированному примеру — просто перезапуск, без пересборки сцены
  if (currentAnim && currentAnim.modulePath === modulePath) {
    currentAnim.controller.replay();
    return;
  }
  const myToken = ++mountToken;
  unmountCurrentAnim();
  animEmpty.style.display = 'none';
  animWrap.style.display  = 'flex';
  animTiles.innerHTML = '';
  try {
    const mod = await import(modulePath);
    if (myToken !== mountToken) return; // устарело — за время загрузки уже выбрали другой пример
    const controller = mod.mount(animTiles);
    currentAnim = { controller, modulePath };
  } catch (err) {
    if (myToken !== mountToken) return;
    console.error('Не удалось загрузить анимацию:', modulePath, err);
    animTiles.innerHTML = '<div style="font-size:10px;color:#c88;text-align:center;padding:20px;">Ошибка загрузки анимации — см. консоль</div>';
  }
}

/* ═══════════════════ ПАРСИНГ ПРАВИЛ ═══════════════════ */
function parseEmeno(emeno) {
  const sep = emeno.indexOf('Например:');
  if (sep === -1) return { rule: emeno.trim(), examples: [] };
  const ruleText = emeno.slice(0, sep).trim();
  const exText   = emeno.slice(sep + 'Например:'.length).trim();
  const wMatch = ruleText.match(/\([^)]*[WP]\d[^)]*\)/g) || [];
  const wRefs  = wMatch.map(w => w.replace(/^\(|\)$/g,'')).join('; ');
  const ruleClean = ruleText.replace(/\s*\([^)]*[WP]\d[^)]*\)/g, '').trim();
  const examples = exText ? exText.split(/;\s+/).map(e => e.trim()).filter(Boolean) : [];
  return { rule: ruleClean, wRefs, examples };
}

/* ═══════════════════ ЦЕНТРАЛЬНЫЕ ПАНЕЛИ ═══════════════════ */
function showCenter(cd) {
  const parsed = parseEmeno(cd.emeno);

  unmountCurrentAnim(); // при смене правила предыдущая анимация больше не актуальна

  rdEmpty.style.display    = 'none';
  rdNum.style.display      = 'block';
  rdNum.textContent        = 'ПРАВИЛО ' + cd.n + '  ·  ' + getRuleType(cd.n).toUpperCase();
  rdTextWrap.className     = 'rd-bg-' + cd.g;
  rdTextWrap.style.display = 'block';
  rdText.style.display     = 'block';
  rdText.textContent       = parsed.rule;

  updateStub(cd, parsed.wRefs);

  lpPicker.innerHTML = '';
  const exData = EXAMPLES[cd.n] || [];
  if (exData.length === 0 && parsed.examples.length === 0) {
    const ph = document.createElement('span');
    ph.style.cssText = 'font-size:10px;color:rgba(200,195,185,.28);letter-spacing:.06em;text-transform:uppercase;';
    ph.textContent = '— примеры не добавлены —';
    lpPicker.appendChild(ph);
  } else {
    exData.forEach(ex => {
      const chip = document.createElement('span');
      chip.className = 'eg-chip ' + cd.g;
      chip.textContent = ex.desc;
      chip.addEventListener('click', () => {
        lpPicker.querySelectorAll('.eg-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (ex.module) mountAnimExample(ex.module);
        else unmountCurrentAnim();
        // Пример с 3D-модулем — синхронизированная версия (без кнопочной
        // ленты, переключается событием slotstep от самой анимации); без
        // модуля — обычное поведение, для остальных правил без 3D.
        if (ex.roleDemo && ex.module) renderRoleDemoSynced(ex.roleDemo);
        else if (ex.roleDemo) renderRoleDemo(ex.roleDemo);
        else clearRoleDemo();
      });
      lpPicker.appendChild(chip);
    });
    parsed.examples.forEach(txt => {
      const cleanTxt = txt.replace(/\.$/, '').trim();
      const alreadyCovered = exData.some(e => e.desc && cleanTxt.includes(e.desc.split('→')[0].trim()));
      if (!alreadyCovered) {
        const chip = document.createElement('span');
        chip.className = 'eg-chip ' + cd.g;
        chip.textContent = cleanTxt;
        lpPicker.appendChild(chip);
      }
    });
  }

  ezLabel.textContent = 'Упражнения · Правило ' + cd.n;
  ezChips.innerHTML = '';
  const exList = EXERCISES[cd.n] || [];
  if (exList.length === 0) {
    const ph = document.createElement('span');
    ph.id = 'ez-empty';
    ph.textContent = '— упражнения не добавлены —';
    ezChips.appendChild(ph);
  } else {
    exList.forEach(ex => {
      const chip = document.createElement('span');
      chip.className = 'ex-chip ' + cd.g;
      chip.textContent = 'Упр. ' + ex;
      chip.title = 'Упражнение ' + ex + ' · ' + getRuleType(cd.n);
      chip.addEventListener('click', e => { e.stopPropagation(); });
      ezChips.appendChild(chip);
    });
  }
}

function hideCenter() {
  unmountCurrentAnim();
  rdEmpty.style.display    = 'block';
  rdNum.style.display      = 'none';
  rdText.style.display     = 'none';
  rdTextWrap.style.display = 'none';
  updateStub(null);
  lpPicker.innerHTML = '<span style="font-size:10px;color:rgba(200,195,185,.28);letter-spacing:.06em;text-transform:uppercase;">← выберите правило</span>';
  ezLabel.textContent = 'Упражнения';
  ezChips.innerHTML   = '<span id="ez-empty">← выберите правило</span>';
}

function getRuleType(n) {
  if (n <= 7)  return 'Внутренние сандхи · Гласные';
  if (n <= 40) return 'Внутренние сандхи · Согласные';
  if (n <= 49) return 'Внешние сандхи · Гласные';
  if (n <= 59) return 'Висарга сандхи';
  if (n <= 65) return 'Внешние сандхи · Носовые';
  return 'Внешние сандхи · Взрывные';
}

/* ═══ Заглушка левой панели ═══ */
function updateStub(cd, wRefs) {
  const stub = document.getElementById('group-stub');
  if (!cd) {
    stubLabel.textContent = '';
    stubSub.style.display = 'none';
    stub.className = '';
    return;
  }
  /* Цветной фон по классу правила */
  stub.className = 'stub-' + cd.g;
  const n = cd.n;
  const typeLabel = getRuleType(n);
  /* Основная подпись: тип сандхи + Whitney */
  const wText = wRefs ? '  ·  Whitney ' + wRefs : '';
  stubLabel.textContent = typeLabel + wText;

  if (n >= 17 && n <= 29) {
    stubSub.textContent  = 'Правила 17–29 применяются перед нулём и перед всеми согласными, кроме полугласных и назальных.';
    stubSub.style.display = 'block';
  } else {
    stubSub.style.display = 'none';
  }
}

/* ═══ Реестр карточек + подсветка групп ═══ */
const CARD_ELS = {};

// Подготовлено для правил 20–26 («семья kṣ», см. CLAUDE.md) — реальная
// лингвистическая группа, но визуальная подсветка карточек пока нигде не
// вызывается (не решено, по какому триггеру её включать). Не удалять и не
// вызывать вслепую — оставлено как есть до отдельного решения.
// eslint-disable-next-line no-unused-vars
function applyGroupHighlight(cd) {
  if (cd.n >= 20 && cd.n <= 26) {
    for (let i = 20; i <= 26; i++)
      if (CARD_ELS[i]) CARD_ELS[i].classList.add('primary-active');
    if (CARD_ELS[21]) CARD_ELS[21].classList.add('card-21-primary');
  }
}
// eslint-disable-next-line no-unused-vars
function clearGroupHighlight() {
  for (let i = 20; i <= 26; i++)
    if (CARD_ELS[i]) CARD_ELS[i].classList.remove('primary-active','card-21-primary');
}

const body = document.getElementById('sandhi-body');

SECTIONS.forEach((sec, si) => {
  if (si > 0) {
    const div = document.createElement('div');
    div.className = 's-divider';
    body.appendChild(div);
  }

  const lbl = document.createElement('div');
  lbl.className = 's-label';
  const dots = sec.id === 'internal'
    ? `<span style="background:#AFBFD4"></span><span style="background:#869EC1"></span><span class="last-dot" style="background:#5B7EAE"></span>`
    : `<span style="background:#C7BAA8"></span><span class="last-dot" style="background:#AE987A"></span>`;
  lbl.innerHTML = `${dots}${sec.label}`;
  body.appendChild(lbl);

  const section = document.createElement('div');
  section.className = 's-section';

  const ROW_W = PER_ROW * CARD + (PER_ROW-1) * GAP;
  let rowBuf = [];

  function buildCard(cd, colPos) {
    const card = document.createElement('div');
    card.className = `card ${cd.g}`;
    CARD_ELS[cd.n] = card;
    card.style.left   = (colPos * (CARD + GAP)) + 'px';
    card.style.zIndex = colPos + 1;
    const numEl = document.createElement('span');
    numEl.className = 'card-num';
    numEl.textContent = cd.n;
    card.appendChild(numEl);
    card.addEventListener('mouseenter', () => {
      if (pinnedCardS && pinnedCardS !== card) return;
      card.classList.add('hovered');
      playFlip();
    });
    card.addEventListener('mouseleave', () => {
      if (card === pinnedCardS) return;
      card.classList.remove('hovered');
      hideTooltip();
    });
    card.addEventListener('click', e => {
      e.stopPropagation();
      // Повторный клик на уже выбранную карточку снимает выбор и
      // возвращает центральную панель к исходному состоянию («выберите
      // правило») — тем же путём, что и сброс при клике по пустому месту.
      if (pinnedCardS === card) {
        card.classList.remove('pinned', 'hovered');
        pinnedCardS = null;
        hideTooltip();
        hideCenter();
        return;
      }
      if (pinnedCardS) pinnedCardS.classList.remove('pinned','hovered');
      card.classList.remove('hovered');
      card.classList.add('pinned');
      pinnedCardS = card;
      showCenter(cd);
    });
    return card;
  }

  function flushRow() {
    if (!rowBuf.length) return;
    const rowEl = document.createElement('div');
    rowEl.className = 'card-row';
    rowEl.style.width  = ROW_W + 'px';
    rowEl.style.height = CARD + 'px';
    rowBuf.forEach((cd, i) => rowEl.appendChild(buildCard(cd, i)));
    section.appendChild(rowEl);
    rowBuf = [];
  }

  sec.cards.forEach(cd => {
    rowBuf.push(cd);
    if (rowBuf.length === PER_ROW) flushRow();
  });
  flushRow();

  body.appendChild(section);
});
