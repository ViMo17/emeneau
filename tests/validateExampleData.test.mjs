// Тесты validateExampleData (заход 61, Стадия 4 профессионализации).
// Системная граница: data приходит из ruleN-*.js, написанного вручную —
// эти тесты проверяют, что валидатор реально ловит классы ошибок,
// которые иначе дают тихий NaN/undefined где-то в кадровом цикле (поля
// без `??`-дефолта в apply*-функциях), а не false-positive на валидных
// данных, которые движок уже принимает без нареканий (см. отдельную
// проверку против всех 5 реальных examples/*.js — там 0 проблем).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateExampleData, N_SLOTS } from '../docs/app/lib/slot-engine.js';

function baseData(overrides = {}) {
  return {
    initial: [{ slot: 1, tr: 'a' }, { slot: 2, tr: 'b' }],
    ...overrides,
  };
}

test('validateExampleData: минимально валидные данные (только initial) — без проблем', () => {
  assert.deepEqual(validateExampleData(baseData()), []);
});

test('validateExampleData: data не объект — одна понятная проблема, не падает', () => {
  assert.deepEqual(validateExampleData(null), ['data должен быть объектом']);
  assert.deepEqual(validateExampleData('x'), ['data должен быть объектом']);
});

test('validateExampleData: initial отсутствует/пуст/не массив', () => {
  assert.equal(validateExampleData({}).length, 1);
  assert.equal(validateExampleData({ initial: [] }).length, 1);
  assert.equal(validateExampleData({ initial: 'x' }).length, 1);
});

test('validateExampleData: slot вне диапазона 0..N_SLOTS-1 — поймано', () => {
  const problems = validateExampleData(baseData({ initial: [{ slot: N_SLOTS, tr: 'a' }] }));
  assert.ok(problems.some(p => p.includes('slot')), problems.join('\n'));
});

test('validateExampleData: дублирующийся slot в initial — поймано', () => {
  const problems = validateExampleData({ initial: [{ slot: 1, tr: 'a' }, { slot: 1, tr: 'b' }] });
  assert.ok(problems.some(p => p.includes('дважды')), problems.join('\n'));
});

test('validateExampleData: пустой tr — поймано', () => {
  const problems = validateExampleData({ initial: [{ slot: 1, tr: '' }] });
  assert.ok(problems.some(p => p.includes('.tr')), problems.join('\n'));
});

test('validateExampleData: неизвестный op.type — поймано, не падает на дальнейшей проверке', () => {
  const problems = validateExampleData(baseData({ ops: [{ type: 'teleport', start: 0 }] }));
  assert.ok(problems.some(p => p.includes('неизвестный type')), problems.join('\n'));
});

test('validateExampleData: op без start — поймано', () => {
  const problems = validateExampleData(baseData({ ops: [{ type: 'elide', at: 1 }] }));
  assert.ok(problems.some(p => p.includes('.start')), problems.join('\n'));
});

test('validateExampleData: transform без toGlyph — поймано (используется без дефолта в regenMats)', () => {
  const problems = validateExampleData(baseData({ ops: [{ type: 'transform', at: 1, start: 0 }] }));
  assert.ok(problems.some(p => p.includes('toGlyph')), problems.join('\n'));
});

test('validateExampleData: merge без toGlyph/from/at — все три поймано', () => {
  const problems = validateExampleData(baseData({ ops: [{ type: 'merge', start: 0 }] }));
  assert.ok(problems.some(p => p.includes('from должен')), problems.join('\n'));
  assert.ok(problems.some(p => p.includes('at должен')), problems.join('\n'));
  assert.ok(problems.some(p => p.includes('toGlyph')), problems.join('\n'));
});

test('validateExampleData: split.arrivals без delay/dur — поймано (NaN без дефолта в реальном коде)', () => {
  const problems = validateExampleData(baseData({
    ops: [{ type: 'split', at: 1, start: 0, arrivals: [{ into: 'a', newSlot: 2, from: { x: 0, y: 0, z: 0 } }] }],
  }));
  assert.ok(problems.some(p => p.includes('.delay')), problems.join('\n'));
  assert.ok(problems.some(p => p.includes('.dur')), problems.join('\n'));
});

test('validateExampleData: split.arrivals с полными валидными полями — без проблем', () => {
  const problems = validateExampleData(baseData({
    ops: [{
      type: 'split', at: 1, start: 0,
      arrivals: [{ into: 'a', newSlot: 2, from: { x: 0, y: 1, z: 0 }, delay: 0, dur: 400 }],
    }],
  }));
  assert.deepEqual(problems, []);
});

test('validateExampleData: influence.from принимает число, {word}, массив — все три валидны', () => {
  assert.deepEqual(validateExampleData(baseData({ ops: [{ type: 'influence', from: 1, to: 2, start: 0 }] })), []);
  assert.deepEqual(validateExampleData(baseData({ ops: [{ type: 'influence', from: { word: 1 }, to: 2, start: 0 }] })), []);
  assert.deepEqual(validateExampleData(baseData({ ops: [{ type: 'influence', from: [1, 2], to: 2, start: 0 }] })), []);
});

test('validateExampleData: approach принимает movers ИЛИ mover (не оба обязательны)', () => {
  assert.deepEqual(validateExampleData(baseData({ ops: [{ type: 'approach', mover: 1, target: 2, start: 0 }] })), []);
  assert.deepEqual(validateExampleData(baseData({ ops: [{ type: 'approach', movers: [1], target: 2, start: 0 }] })), []);
});

test('validateExampleData: dim без end — поймано (используется без дефолта)', () => {
  const problems = validateExampleData(baseData({ ops: [{ type: 'dim', slots: [1], start: 0 }] }));
  assert.ok(problems.some(p => p.includes('end должен')), problems.join('\n'));
});

test('validateExampleData: steps — kind не grammar/rule, activeSlots некорректен', () => {
  const problems = validateExampleData(baseData({
    steps: [{ kind: 'weird', start: 0, end: 100, activeSlots: 'weird' }],
  }));
  assert.ok(problems.some(p => p.includes('.kind')), problems.join('\n'));
  assert.ok(problems.some(p => p.includes('activeSlots')), problems.join('\n'));
});

test('validateExampleData: steps — end<=start поймано', () => {
  const problems = validateExampleData(baseData({
    steps: [{ kind: 'grammar', start: 100, end: 100, activeSlots: 'ALL' }],
  }));
  assert.ok(problems.some(p => p.includes('end') && p.includes('start')), problems.join('\n'));
});

test('validateExampleData: steps — пересекающиеся соседние шаги пойманы', () => {
  const problems = validateExampleData(baseData({
    steps: [
      { kind: 'grammar', start: 0, end: 500, activeSlots: 'ALL' },
      { kind: 'rule', ruleNum: 1, start: 300, end: 800, activeSlots: 'ALL' },
    ],
  }));
  assert.ok(problems.some(p => p.includes('пересекаться')), problems.join('\n'));
});

test('validateExampleData: соседние НЕ пересекающиеся шаги (с зазором или впритык) — без проблем', () => {
  const problems = validateExampleData(baseData({
    steps: [
      { kind: 'grammar', start: 0, end: 500, activeSlots: 'ALL' },
      { kind: 'rule', ruleNum: 1, start: 500, end: 800, activeSlots: 'ALL' },
    ],
  }));
  assert.deepEqual(problems, []);
});
