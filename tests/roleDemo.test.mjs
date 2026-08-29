// Тесты role-demo.js — 2D-подсветка источник/триггер/результат на алфавите,
// синхронизация с 3D-анимацией через событие slotstep. Раньше проверялась
// только вручную в браузере (см. tests/README.md). Импортирует
// alpha-panel.js ПЕРВЫМ (динамически, после стаба) — role-demo.js ищет
// клетки алфавита `ac-*` по id, их строит alpha-panel.js; в реальном
// приложении оба модуля загружаются в основной документ, порядок не
// важен, но здесь порядок первого исполнения задаём явно.
//
// Известное ограничение (не путать с багом): jsdom не считает раскладку —
// getBoundingClientRect() всегда возвращает нули для любого элемента.
// svgRoleLine() поэтому всегда попадает в ветку ROLE_LINE_SKIP_DIST (дистанция
// «соседей по сетке») и НИКОГДА не рисует линию под jsdom — это проверяется
// только вручную в браузере. Здесь проверяется то, что не зависит от
// раскладки: классы ролей на клетках, текст шага, лента кнопок,
// синхронизация с slotstep, badge (svgBadge не гейтится дистанцией).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDomStub } from './helpers/domStub.mjs';

installDomStub();

await import('../docs/app/alpha-panel.js');
const { renderRoleDemo, renderRoleDemoSynced, clearRoleDemo } = await import('../docs/app/role-demo.js');

const wrap = document.getElementById('alpha-wrap');
const roleSteps = document.getElementById('role-steps');
const roleStepsRibbon = document.getElementById('role-steps-ribbon');
const roleStepsText = document.getElementById('role-steps-text');
const grammarExplain = document.getElementById('grammar-explain');
const animTiles = document.getElementById('anim-tiles');

function flushMicrotasks() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

test('#role-svg вставлен внутрь #alpha-wrap с маркером-стрелкой в defs', () => {
  const svg = wrap.querySelector('#role-svg');
  assert.ok(svg);
  assert.ok(svg.querySelector('marker#role-arrow'));
});

test('clearRoleDemo() безопасен без предварительного renderRoleDemo — прячет панель, не бросает', () => {
  assert.doesNotThrow(() => clearRoleDemo());
  assert.equal(grammarExplain.style.display, 'none');
  assert.equal(roleSteps.style.display, 'none');
  assert.equal(roleStepsRibbon.innerHTML, '');
});

test('renderRoleDemo: один шаг без type — только текст, лента кнопок не строится', () => {
  renderRoleDemo({ steps: [{ tag: 'грам.', text: 'структурный шаг, звук не меняется' }] });
  assert.equal(grammarExplain.style.display, 'flex');
  assert.equal(roleSteps.style.display, 'none');
  assert.equal(roleStepsText.textContent, 'структурный шаг, звук не меняется');
});

test('renderRoleDemo: elide-шаг подсвечивает источник и рисует значок ∅ (не гейтится дистанцией)', () => {
  renderRoleDemo({ steps: [{ type: 'elide', source: 'a', text: 'a исчезает' }] });
  const src = document.getElementById('ac-a');
  assert.ok(src.classList.contains('role-source'));
  assert.ok(!src.classList.contains('role-dim'));
  const badgeText = wrap.querySelector('#role-svg text.role-badge-text');
  assert.equal(badgeText.textContent, '∅');
});

test('renderRoleDemo: многошаговый пример строит ленту кнопок с правильными подписями и переключает шаг по клику', () => {
  renderRoleDemo({ steps: [
    { tag: 'грам.', text: 'первый шаг' },
    { tag: '3', text: 'второй шаг' },
  ] });
  assert.equal(roleSteps.style.display, 'block');
  const buttons = roleStepsRibbon.querySelectorAll('.role-step-btn');
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].textContent, 'Шаг 1. Грамматика');
  assert.equal(buttons[1].textContent, 'Шаг 2. Правило 3');
  assert.ok(buttons[0].classList.contains('active'));
  assert.equal(roleStepsText.textContent, 'первый шаг');

  buttons[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(!buttons[0].classList.contains('active'));
  assert.ok(buttons[1].classList.contains('active'));
  assert.equal(roleStepsText.textContent, 'второй шаг');
});

test('renderRoleDemoSynced: без ленты кнопок, переключается событием slotstep от 3D-анимации', () => {
  renderRoleDemoSynced({ steps: [
    { text: 'шаг 0' },
    { text: 'шаг 1' },
  ] });
  assert.equal(roleSteps.style.display, 'none', 'кнопки не нужны при синхронизации с 3D');
  assert.equal(roleStepsText.textContent, 'шаг 0');

  animTiles.dispatchEvent(new window.CustomEvent('slotstep', { detail: { index: 1 } }));
  assert.equal(roleStepsText.textContent, 'шаг 1');
});

test('clearRoleDemo() снимает слушатель slotstep предыдущего примера — событие после сброса больше не действует', () => {
  renderRoleDemoSynced({ steps: [{ text: 'A' }, { text: 'B' }] });
  clearRoleDemo();
  assert.equal(roleStepsText.textContent, '', 'clearRoleDemo очищает текст');

  animTiles.dispatchEvent(new window.CustomEvent('slotstep', { detail: { index: 1 } }));
  assert.equal(roleStepsText.textContent, '', 'старый слушатель снят — событие ничего не меняет');
});

test('gunaCells: клетки таблицы получают gv-active, а MutationObserver подсвечивает весь столбец', async () => {
  renderRoleDemo({ steps: [{ text: 'гунация', gunaCells: ['gc-weak-i', 'gc-guna-i'] }] });
  assert.ok(document.getElementById('gc-weak-i').classList.contains('gv-active'));
  assert.ok(document.getElementById('gc-guna-i').classList.contains('gv-active'));

  await flushMicrotasks();

  // весь столбец «i» (все ступени: вридд-rev, гуна-rev, слаб, гуна, вридд) подсвечен целиком
  assert.ok(document.getElementById('gc-vriddhi-rev-i').classList.contains('gv-col-active'));
  assert.ok(document.getElementById('gc-guna-rev-i').classList.contains('gv-col-active'));
  assert.ok(document.getElementById('gc-weak-i').classList.contains('gv-col-active'));
  assert.ok(document.getElementById('gc-vriddhi-i').classList.contains('gv-col-active'));
  // соседний столбец «u» не должен зацепить
  assert.ok(!document.getElementById('gc-weak-u').classList.contains('gv-col-active'));
});
