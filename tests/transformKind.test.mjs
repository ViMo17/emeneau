// Тесты TRANSFORM_KIND — покрывает РЕГРЕССИЮ захода 46: spinTurns для
// парной замены внутри варги (k↔g) был по ошибке оставлен как у гунации
// (1, то есть 360°) вместо верных 0.5 (180°, противолежащая грань). С
// именованными пресетами (заход 54) такая ошибка структурно невозможна —
// но тест фиксирует ТОЧНЫЕ значения, чтобы будущая правка пресета была
// осознанной, не случайной.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRANSFORM_KIND, MS_PER_360 } from '../docs/app/lib/slot-engine.js';

test('TRANSFORM_KIND.vargaPair — 180° (0.5 оборота), нейтральная грань', () => {
  assert.equal(TRANSFORM_KIND.vargaPair.spinTurns, 0.5);
  assert.equal(TRANSFORM_KIND.vargaPair.signal, 'blank');
});

test('TRANSFORM_KIND.assimToNeighbor — 360° (1 оборот), нейтральная грань', () => {
  assert.equal(TRANSFORM_KIND.assimToNeighbor.spinTurns, 1);
  assert.equal(TRANSFORM_KIND.assimToNeighbor.signal, 'blank');
});

test('TRANSFORM_KIND: vargaPair и assimToNeighbor различаются РОВНО углом поворота, не случайно', () => {
  // Геометрический смысл: vargaPair — противолежащая грань (пара
  // буквально на другой стороне кубика), assimToNeighbor — полный оборот
  // (нет "противолежащей" буквы, целое место образования меняется).
  assert.notEqual(TRANSFORM_KIND.vargaPair.spinTurns, TRANSFORM_KIND.assimToNeighbor.spinTurns);
  assert.equal(TRANSFORM_KIND.vargaPair.spinTurns * 2, TRANSFORM_KIND.assimToNeighbor.spinTurns);
});

test('TRANSFORM_KIND: гунация НЕ включена намеренно (дефолты движка уже ею являются)', () => {
  assert.equal('guna' in TRANSFORM_KIND, false);
});

test('TRANSFORM_KIND: вриддхи НЕ включена намеренно (открытый вопрос про signal:gold)', () => {
  assert.equal('vrddhi' in TRANSFORM_KIND, false);
});

test('MS_PER_360 — базовая единица длительности поворота, положительное число', () => {
  assert.equal(typeof MS_PER_360, 'number');
  assert.ok(MS_PER_360 > 0);
});

test('spread-синтаксис пресета не портит другие поля объекта transform-операции', () => {
  const op = { type: 'transform', at: 3, toGlyph: 'g', start: 5800, ...TRANSFORM_KIND.vargaPair };
  assert.equal(op.type, 'transform');
  assert.equal(op.at, 3);
  assert.equal(op.toGlyph, 'g');
  assert.equal(op.start, 5800);
  assert.equal(op.spinTurns, 0.5);
  assert.equal(op.signal, 'blank');
});
