// Тесты panel alpha-panel.js — панель алфавита (тултип, аудио-заглушка,
// пин буквы, рендер ALPHA_ROWS). До этого файла модуль не тестировался
// вообще — только вручную в браузере (см. tests/README.md, «Известное
// ограничение»). alpha-panel.js делает document.getElementById() НА
// УРОВНЕ МОДУЛЯ (при импорте, не при вызове функции) — стаб ОБЯЗАН
// установиться ДО того, как модуль загрузится. Статический import
// хостится и выполнился бы раньше любого кода в этом файле независимо от
// того, где текстуально стоит installDomStub() — поэтому импорт модуля
// здесь динамический (await import), не статический.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDomStub } from './helpers/domStub.mjs';

installDomStub();

const { hideTooltip } = await import('../docs/app/alpha-panel.js');
const { ALPHA_ROWS } = await import('../docs/app/data.js');

const wrap = document.getElementById('alpha-wrap');
const tooltip = document.getElementById('tooltip');

function expectedCellCount() {
  let n = 0;
  for (const row of ALPHA_ROWS) {
    if (row.gap || row.header) continue;
    n += row.cells.filter(Boolean).length;
  }
  return n;
}

function firstRealCell() {
  for (const row of ALPHA_ROWS) {
    if (row.gap || row.header) continue;
    const cell = row.cells.find(Boolean);
    if (cell) return cell;
  }
  throw new Error('в ALPHA_ROWS не нашлось ни одной настоящей клетки');
}

test('рендер ALPHA_ROWS: число построенных .lc клеток совпадает с данными', () => {
  const built = wrap.querySelectorAll('.lc').length;
  assert.equal(built, expectedCellCount());
});

test('аудио-панель вставлена в #alpha-desc, изначально без класса visible', () => {
  const audioPanel = document.getElementById('audio-panel');
  assert.ok(audioPanel, 'audio-panel существует');
  assert.equal(audioPanel.parentElement.id, 'alpha-desc');
  assert.ok(!audioPanel.classList.contains('visible'));
});

test('клик по букве: пин + тултип с текстом hint + аудио-панель с dv/tr этой клетки', () => {
  const cell = firstRealCell();
  const card = document.getElementById('ac-' + cell.tr);
  assert.ok(card, `карточка ac-${cell.tr} должна существовать`);

  card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.ok(card.classList.contains('pinned'));
  assert.equal(tooltip.textContent, cell.hint);
  assert.ok(tooltip.classList.contains('show'));
  assert.equal(document.getElementById('audio-label').textContent, cell.dv);
  assert.equal(document.getElementById('audio-trans').textContent, cell.tr);
  assert.ok(document.getElementById('audio-panel').classList.contains('visible'));

  // повторный клик по той же — снимает пин и прячет тултип/аудио
  card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(!card.classList.contains('pinned'));
  assert.ok(!tooltip.classList.contains('show'));
  assert.ok(!document.getElementById('audio-panel').classList.contains('visible'));
});

test('клик по фону снимает пин с ранее выбранной буквы (document click listener)', () => {
  const cell = firstRealCell();
  const card = document.getElementById('ac-' + cell.tr);
  card.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(card.classList.contains('pinned'), 'пин должен быть установлен перед проверкой снятия');

  document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.ok(!card.classList.contains('pinned'));
  assert.ok(!tooltip.classList.contains('show'));
});

test('hideTooltip() (экспорт, используется rule-panel.js) снимает класс show', () => {
  tooltip.classList.add('show');
  hideTooltip();
  assert.ok(!tooltip.classList.contains('show'));
});
