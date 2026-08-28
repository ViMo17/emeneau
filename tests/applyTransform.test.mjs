// Первый тест НАСТОЯЩЕЙ apply-функции — не скопированной вручную (как все
// проверки в истории сессии), а РЕАЛЬНО импортированной из slot-engine.js
// (заход 56, Стадия 2: applyTransform перенесена на уровень модуля).
// THREE — настоящий пакет (см. package.json), не мок: Vector3/Quaternion
// арифметика реальная. Мокаются только объекты сцены, которых требует САМ
// THREE.Mesh (geometry/material), не логика движка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub(); // до импорта slot-engine.js не обязательно — regenMats вызывается лениво, только при реальном прогоне applyTransform

import { applyTransform, TRANSFORM_KIND, MS_PER_360 } from '../docs/app/lib/slot-engine.js';

function makeCube(slot) {
  const mesh = new THREE.Object3D(); // достаточно для position/rotation/quaternion — не нужен настоящий Mesh с геометрией
  mesh.position.set(slot, 0, 0);
  return {
    tr: 'k',
    seed: slot * 100, // regenMats использует cube.seed — без него NaN, не крашится, но нечестно
    mesh,
    matsMain: 'matsMain',
    matsBlank: 'matsBlank',
    matsSignal: 'matsSignal',
  };
}

test('applyTransform: категория vargaPair (k→g) — 180°, нейтральная грань, глиф меняется на 15% пути', () => {
  const cubes = { 3: makeCube(3) };
  const ctx = { cubes };
  const op = { type: 'transform', at: 3, toGlyph: 'g', start: 1000, ...TRANSFORM_KIND.vargaPair };
  const dur = 0.5 * MS_PER_360; // 700мс

  applyTransform(op, 1000, ctx); // самый первый кадр, до regenMats (t=0.15 ещё не достигнут)
  assert.equal(cubes[3].mesh.material, cubes[3].matsBlank, 'на старте — нейтральная грань (signal:blank), не серебро');
  assert.equal(cubes[3].tr, 'k', 'глиф ещё не менялся на самом первом кадре');

  applyTransform(op, 1000 + dur * 0.5, ctx); // середина — глиф уже сменился (порог 15%)
  assert.equal(cubes[3].tr, 'g', 'глиф внутри cube.tr должен смениться через regenMats к середине пути');
  assert.equal(cubes[3].mesh.material, cubes[3].matsBlank, 'материал остаётся нейтральным (не matsMain) до самого конца — переход цветом ещё не завершён');

  applyTransform(op, 1000 + dur, ctx); // точно в конце
  assert.equal(op._done, true, 'финализация должна произойти РОВНО на кадре завершения (регрессия захода 11)');
  assert.equal(cubes[3].mesh.material, cubes[3].matsMain, 'по завершении — истинный цвет (ссылка на актуальный matsMain), не сигнальный');
  assert.equal(cubes[3].mesh.rotation.y, 0, 'поворот сброшен в 0 по завершении');
});

test('applyTransform: категория assimToNeighbor (h→dh) — 360°, ровно вдвое дольше vargaPair', () => {
  const cubes = { 4: makeCube(4) };
  const ctx = { cubes };
  const op = { type: 'transform', at: 4, toGlyph: 'dh', start: 0, ...TRANSFORM_KIND.assimToNeighbor };
  const dur = 1 * MS_PER_360; // 1400мс

  applyTransform(op, dur - 1, ctx);
  assert.equal(op._done, undefined, 'на 1мс раньше конца — ещё не завершено');

  applyTransform(op, dur, ctx);
  assert.equal(op._done, true, 'ровно в момент dur — завершено');
});

test('applyTransform: несуществующий слот — тихо ничего не делает, не падает', () => {
  const cubes = {};
  const ctx = { cubes };
  const op = { type: 'transform', at: 99, toGlyph: 'x', start: 0, spinTurns: 1 };
  assert.doesNotThrow(() => applyTransform(op, 500, ctx));
});

test('applyTransform: до op.start — ничего не меняется (ранний выход)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = { cubes };
  const op = { type: 'transform', at: 5, toGlyph: 'x', start: 1000, spinTurns: 1 };
  applyTransform(op, 500, ctx);
  assert.equal(cubes[5].mesh.rotation.y, 0);
  assert.equal(op._began, undefined);
});
