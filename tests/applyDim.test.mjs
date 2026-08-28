// Тесты РЕАЛЬНО импортированной applyDim (заход 60, Стадия 2: перенесена
// на уровень модуля, 9/10) — ручное притенение по явному списку слотов и
// окну времени (форма для точечных случаев, не связанных с data.steps).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { applyDim } from '../docs/app/lib/slot-engine.js';

function makeCube() {
  const mesh = new THREE.Object3D();
  mesh.material = [{ opacity: 1 }];
  return { mesh };
}

function makeCtx(cubes) {
  return { cubes };
}

test('applyDim: вне окна [start,end] — вообще не трогает кубики', () => {
  const cubes = { 1: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'dim', slots: [1], start: 500, end: 1000 };

  applyDim(op, 100, ctx); // до start
  assert.equal(cubes[1].mesh.material[0].opacity, 1, 'до start — opacity не тронута');

  applyDim(op, 1500, ctx); // после end
  assert.equal(cubes[1].mesh.material[0].opacity, 1, 'после end — функция вообще не заходит внутрь, opacity не тронута');
});

test('applyDim: несуществующий слот в списке — пропускается, не падает', () => {
  const ctx = makeCtx({ 1: makeCube() });
  const op = { type: 'dim', slots: [1, 9], start: 0, end: 1000 };
  assert.doesNotThrow(() => applyDim(op, 100, ctx));
});

test('applyDim: ramp-in в начале окна — opacity плавно идёт от 1 к dimOpacity', () => {
  const cubes = { 1: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'dim', slots: [1], start: 0, end: 2000, dimOpacity: 0.3, ramp: 400 };

  applyDim(op, 0, ctx);
  assert.equal(cubes[1].mesh.material[0].opacity, 1, 'в самый момент start — ещё 1 (t=0 рампы)');

  applyDim(op, 400, ctx);
  assert.ok(Math.abs(cubes[1].mesh.material[0].opacity - 0.3) < 1e-9, 'к концу ramp-in — ровно dimOpacity');
});

test('applyDim: плоская середина окна держит dimOpacity без изменений', () => {
  const cubes = { 1: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'dim', slots: [1], start: 0, end: 2000, dimOpacity: 0.3, ramp: 400 };

  applyDim(op, 1000, ctx);
  assert.ok(Math.abs(cubes[1].mesh.material[0].opacity - 0.3) < 1e-9, 'в середине окна — ровно dimOpacity, плато');
});

test('applyDim: ramp-out в конце окна — opacity плавно возвращается к 1', () => {
  const cubes = { 1: makeCube() };
  const ctx = makeCtx(cubes);
  const op = { type: 'dim', slots: [1], start: 0, end: 2000, dimOpacity: 0.3, ramp: 400 };

  applyDim(op, 2000 - 400, ctx); // начало ramp-out
  assert.ok(Math.abs(cubes[1].mesh.material[0].opacity - 0.3) < 1e-9, 'на старте ramp-out — ещё dimOpacity');

  applyDim(op, 2000, ctx); // ровно end
  assert.ok(Math.abs(cubes[1].mesh.material[0].opacity - 1) < 1e-9, 'к моменту end — полностью восстановлено до 1');
});
