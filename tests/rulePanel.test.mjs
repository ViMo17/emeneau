// Тесты rule-panel.js — карточки правил слева + вся центральная зона.
// Раньше проверялось только вручную в браузере (см. tests/README.md).
// rule-panel.js импортирует alpha-panel.js и role-demo.js сам — здесь
// достаточно установить DOM-стаб и импортировать динамически только его.
//
// Осознанно НЕ тестируется клик по примеру с 3D-модулем (agnayas/āsīt/
// śādhi — EXAMPLES[3]/[7]/[15]) — mountAnimExample() делает реальный
// await import() слот-движка, который создаёт THREE.js сцену и просит
// у canvas WebGL-контекст; jsdom его не даёт (это уже область ручной
// визуальной проверки, см. CLAUDE.md, Часть 1 п.6). Правило 39 ниже
// выбрано специально: есть 2D roleDemo, но НЕТ module — весь путь
// showCenter → клик по чипу → renderRoleDemo проверяется без 3D.
//
// pinnedCardS — состояние модуля, живёт между тестами одного файла (не
// пересоздаётся на каждый test()). selectRule() ниже приводит к пину
// нужной карточки независимо от того, что было выбрано раньше, вместо
// того чтобы каждый тест предполагал конкретное стартовое состояние.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDomStub } from './helpers/domStub.mjs';

installDomStub();

await import('../docs/app/rule-panel.js');
const { SECTIONS, EXAMPLES, EXERCISES } = await import('../docs/app/data.js');

const body = document.getElementById('sandhi-body');
const rdEmpty = document.getElementById('rd-empty');
const rdNum = document.getElementById('rd-num');
const rdText = document.getElementById('rd-text');
const stubLabel = document.getElementById('stub-label');
const stubSub = document.getElementById('stub-sub');
const letterPicker = document.getElementById('letter-picker');
const ezChips = document.getElementById('ez-chips');
const grammarExplain = document.getElementById('grammar-explain');
const roleStepsText = document.getElementById('role-steps-text');

function totalRuleCount() {
  return SECTIONS.reduce((sum, sec) => sum + sec.cards.length, 0);
}

function findCard(n) {
  const numEl = [...body.querySelectorAll('.card-num')].find(el => el.textContent === String(n));
  assert.ok(numEl, `карточка правила ${n} должна существовать`);
  return numEl.parentElement;
}

function click(el) {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

// Гарантирует, что карточка n выбрана (пин + showCenter), независимо от
// того, что было выбрано раньше в этом же тестовом файле.
function selectRule(n) {
  const card = findCard(n);
  if (!card.classList.contains('pinned')) click(card);
  assert.ok(card.classList.contains('pinned'));
  return card;
}

test('рендер карточек: одна .card на каждое правило из SECTIONS, с классом группы (c1..c5)', () => {
  const cards = body.querySelectorAll('.card');
  assert.equal(cards.length, totalRuleCount());
  const card39 = findCard(39);
  assert.ok(card39.classList.contains('c2'));
});

test('выбор правила 39 (пример без 3D-модуля): текст правила, чип примера, упражнения', () => {
  selectRule(39);

  assert.equal(rdEmpty.style.display, 'none');
  assert.equal(rdNum.style.display, 'block');
  assert.ok(rdNum.textContent.includes('ПРАВИЛО 39'));
  assert.ok(rdText.textContent.length > 0, 'текст правила не пустой');
  assert.ok(!rdText.textContent.includes('Например:'), 'часть с примерами отрезана парсером');
  assert.ok(stubLabel.textContent.includes('W212'), 'ссылка Whitney попадает в заглушку');

  // emeno правила 39 содержит ДВА примера через «;» (yuñjmas и yuṅgdhi) —
  // первый дословно совпадает с EXAMPLES[39][0].desc (интерактивный чип),
  // второй не покрыт ни одним EXAMPLES[39] и законно остаётся отдельным
  // нередактируемым чипом (та же механика, что у agnayas/nāvā).
  const chips = letterPicker.querySelectorAll('.eg-chip');
  assert.equal(chips.length, 2);
  assert.equal(chips[0].textContent, EXAMPLES[39][0].desc);
  assert.ok(chips[1].textContent.includes('yuṅgdhi'));

  const exChips = [...ezChips.querySelectorAll('.ex-chip')].map(c => c.textContent);
  assert.deepEqual(exChips, EXERCISES[39].map(n => 'Упр. ' + n));
});

test('клик по чипу примера правила 39 включает 2D roleDemo (без module — clearRoleDemo/renderRoleDemo напрямую)', () => {
  selectRule(39);
  const chip = letterPicker.querySelector('.eg-chip');
  click(chip);

  assert.ok(chip.classList.contains('active'));
  assert.equal(grammarExplain.style.display, 'flex');
  assert.equal(roleStepsText.textContent, EXAMPLES[39][0].roleDemo.steps[0].text);
});

test('правило 17–29 (правило 27, без примеров и упражнений): плейсхолдеры + видна подсказка про диапазон 17–29', () => {
  selectRule(27);

  assert.equal(letterPicker.querySelector('.eg-chip'), null);
  assert.ok(letterPicker.textContent.includes('примеры не добавлены'));
  assert.equal(ezChips.querySelector('.ex-chip'), null);
  assert.ok(ezChips.textContent.includes('упражнения не добавлены'));
  assert.equal(stubSub.style.display, 'block');
  assert.ok(stubSub.textContent.includes('17–29'));
});

test('правило вне диапазона 17–29 (правило 39): подсказка про диапазон скрыта', () => {
  selectRule(39);
  assert.equal(stubSub.style.display, 'none');
});

test('повторный клик по уже выбранной карточке снимает пин и возвращает панель в исходное состояние', () => {
  const card39 = selectRule(39);
  click(card39); // сейчас уже выбрана — второй клик снимает выбор

  assert.ok(!card39.classList.contains('pinned'));
  assert.equal(rdEmpty.style.display, 'block');
  assert.equal(rdNum.style.display, 'none');
  assert.ok(letterPicker.textContent.includes('выберите правило'));
});

test('клик по другой карточке переключает пин с предыдущей на новую', () => {
  const card39 = selectRule(39);
  const card27 = findCard(27);
  click(card27);

  assert.ok(!card39.classList.contains('pinned'));
  assert.ok(card27.classList.contains('pinned'));
});
