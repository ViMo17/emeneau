// Тесты РЕАЛЬНО импортированной applySettle (заход 60, Стадия 2: перенесена
// на уровень модуля, 8/10) — финальная волна READY_COLOR слева направо,
// двойной прыжок (взлёт + меньший довдох), цвет меняется ровно на вершине.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { applySettle } from '../docs/app/lib/slot-engine.js';

function makeCube() {
  const mesh = new THREE.Object3D();
  return { mesh, matsReady: { name: 'ready' } };
}

function makeCtx(cubes) {
  return { cubes };
}

test('applySettle: несуществующий слот в списке — пропускается, не падает', () => {
  const ctx = makeCtx({ 1: makeCube() });
  const op = { type: 'settle', slots: [1, 9], start: 0 };
  assert.doesNotThrow(() => applySettle(op, 100, ctx));
});

test('applySettle: до начала своего окна (start + i*stepDelay) — кубик не трогается', () => {
  const cubes = { 1: makeCube(), 2: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'settle', slots: [1, 2], start: 0, stepDelay: 300 };

  applySettle(op, 50, ctx); // слот 2 стартует в 300 — сейчас ещё рано
  assert.equal(cubes[2].mesh.position.y, 0, 'второй слот в очереди ещё не должен двигаться');
});

test('applySettle: материал меняется на matsReady РОВНО на вершине волны (t=0.5), не раньше', () => {
  const cubes = { 1: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'settle', slots: [1], start: 0, bounceDur: 600 };

  applySettle(op, 600 * 0.4, ctx); // t=0.4 — ещё до вершины
  assert.notEqual(cubes[1].mesh.material, cubes[1].matsReady, 'до t=0.5 материал ещё не должен смениться');

  applySettle(op, 600 * 0.5, ctx); // t=0.5 — ровно вершина
  assert.equal(cubes[1].mesh.material, cubes[1].matsReady, 'на t=0.5 материал сменился на matsReady');
});

test('applySettle: двойной прыжок — основной взлёт (0..0.6) выше довдоха (0.6..1.0)', () => {
  const cubes = { 1: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'settle', slots: [1], start: 0, bounceDur: 600, bounceH: 0.32 };

  // пик основного взлёта — t=0.3 (середина фазы 0..0.6, sin достигает 1)
  applySettle(op, 600 * 0.3, ctx);
  const mainPeak = cubes[1].mesh.position.y;
  assert.ok(Math.abs(mainPeak - 0.32) < 1e-6, `пик основного взлёта должен быть ровно bounceH: ${mainPeak}`);

  // пик довдоха — t=0.8 (середина фазы 0.6..1.0)
  applySettle(op, 600 * 0.8, ctx);
  const echoPeak = cubes[1].mesh.position.y;
  assert.ok(Math.abs(echoPeak - 0.32 * 0.3) < 1e-6, `пик довдоха должен быть ровно 0.3×bounceH: ${echoPeak}`);
  assert.ok(echoPeak < mainPeak, 'довдох заметно ниже основного взлёта');
});

test('applySettle: несколько слотов — стартуют со сдвигом stepDelay друг за другом (слева направо)', () => {
  const cubes = { 1: makeCube(), 2: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'settle', slots: [1, 2], start: 0, stepDelay: 200, bounceDur: 400 };

  applySettle(op, 100, ctx); // слот 1 уже в процессе (start=0), слот 2 ещё не начал (start=200)
  assert.notEqual(cubes[1].mesh.position.y, 0, 'первый слот уже подпрыгивает');
  assert.equal(cubes[2].mesh.position.y, 0, 'второй слот ещё ждёт своей очереди');

  applySettle(op, 300, ctx); // слот 2 стартовал в 200, сейчас t=(300-200)/400=0.25 — уже должен двигаться
  assert.notEqual(cubes[2].mesh.position.y, 0, 'второй слот подключился по своему сдвигу');
});
