// Тесты РЕАЛЬНО импортированной applyArrive (заход 60, Стадия 2: перенесена
// на уровень модуля, 6/10) — тихий прилёт буквы без слияния (āsīt, окончание
// -īt). Использует ту же flyArcPosition/makeCube-инфраструктуру, что и
// applySplit.arrivals — canvasStub уже расширен под неё.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyArrive, slotX } from '../docs/app/lib/slot-engine.js';

function makeCtx(cubes) {
  const added = [];
  return { cubes, scene: { add(obj) { added.push(obj); }, _added: added } };
}

test('applyArrive: до наступления delay — элемент ещё не материализуется', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  const op = { type: 'arrive', start: 0, items: [{ into: 'i', newSlot: 2, from: { x: -3, y: 3, z: 0 }, delay: 500, dur: 400 }] };

  applyArrive(op, 100, ctx);
  assert.equal(cubes[2], undefined, 'до delay элемент не должен появляться в cubes вообще');
});

test('applyArrive: элемент прилетает по дуге и садится ровно в slotX(newSlot) к моменту delay+dur', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  const op = { type: 'arrive', start: 0, items: [{ into: 'i', newSlot: 2, from: { x: -3, y: 3, z: 0 }, delay: 100, dur: 400, arcHeight: 1 }] };

  applyArrive(op, 300, ctx); // в процессе полёта
  assert.ok(cubes[2], 'элемент появился в карте cubes под своим newSlot');
  assert.equal(cubes[2].mesh.visible, true);

  applyArrive(op, 500, ctx); // ровно delay+dur
  assert.ok(Math.abs(cubes[2].mesh.position.x - slotX(2)) < 1e-6, 'к моменту delay+dur — точно в целевом слоте');
});

test('applyArrive: mesh добавлен на сцену РОВНО один раз, не при каждом кадре (кеш через op._made)', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  const op = { type: 'arrive', start: 0, items: [{ into: 'i', newSlot: 2, from: { x: -3, y: 3, z: 0 }, delay: 0, dur: 300 }] };

  applyArrive(op, 50, ctx);
  applyArrive(op, 100, ctx);
  applyArrive(op, 150, ctx);
  applyArrive(op, 300, ctx);

  const mesh = cubes[2].mesh;
  assert.equal(ctx.scene._added.filter(o => o === mesh).length, 1, 'mesh добавлен на сцену один раз за все кадры');
  assert.equal(ctx.scene._added.filter(o => o === cubes[2].shadow).length, 1, 'тень тоже добавлена один раз');
});

test('applyArrive: несколько элементов с разными delay — независимы друг от друга', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  const op = {
    type: 'arrive', start: 0,
    items: [
      { into: 'i', newSlot: 2, from: { x: -3, y: 3, z: 0 }, delay: 0, dur: 200 },
      { into: 't', newSlot: 3, from: { x: -3, y: 3, z: 0 }, delay: 400, dur: 200 },
    ],
  };

  applyArrive(op, 100, ctx);
  assert.ok(cubes[2], 'первый элемент уже материализовался');
  assert.equal(cubes[3], undefined, 'второй элемент — ещё нет, его delay не наступил');

  applyArrive(op, 500, ctx);
  assert.ok(cubes[3], 'второй элемент материализовался после своего delay');
});
