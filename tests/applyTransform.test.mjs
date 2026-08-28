// Тесты РЕАЛЬНО импортированной applyTransform (заход 56, Стадия 2:
// перенесена на уровень модуля) — не скопированной вручную, как все
// проверки раньше в истории сессии. THREE — настоящий пакет (см.
// package.json), не мок: Vector3/Quaternion/PerspectiveCamera арифметика
// реальная. Мокаются только DOM-объекты, которых требует САМ движок
// (canvas для текстур, div для DOM-колец spawnPulseRing) — не его логика.
//
// ОБНОВЛЕНО (заход 57, добавлены симметричные паузы anticipateDur/holdDur
// по прямому решению пользователя) — таймлайн теперь трёхфазный:
// пауза-осознание (пульс, без вращения) → активное вращение → пауза-
// фиксация (уже финализировано, но op._done ещё не выставлен).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

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

// Полный ctx — теперь нужен не только cubes: пауза-осознание вызывает
// spawnPulseRing, которой нужны camera/stageEl/labelsEl (DOM-проекция).
// camera — настоящий THREE.PerspectiveCamera (арифметика реальная, не мок);
// stageEl/labelsEl — минимальные DOM-заглушки (clientWidth/Height для
// проекции, appendChild для колец).
function makeCtx(cubes) {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  return {
    cubes,
    camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild() {} },
  };
}

test('applyTransform: пауза-осознание (anticipateDur) — пульс масштабом, БЕЗ смены материала, вращение ещё не началось', () => {
  const cubes = { 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 3, toGlyph: 'g', start: 1000, ...TRANSFORM_KIND.vargaPair };

  applyTransform(op, 1000, ctx); // самый первый кадр паузы
  assert.equal(cubes[3].mesh.rotation.y, 0, 'вращение не началось во время паузы-осознания');
  assert.notEqual(cubes[3].mesh.material, cubes[3].matsBlank, 'материал ещё НЕ переключён на сигнальный — это происходит только в активной фазе');

  applyTransform(op, 1000 + 900 * 0.25, ctx); // четверть паузы — пик первого "удара" по той же синусоидальной формуле, что у split
  assert.ok(cubes[3].mesh.scale.x > 1, 'масштаб пульсирует внутри паузы (пик первого удара)');

  applyTransform(op, 1000 + 900 - 1, ctx); // за 1мс до конца паузы (anticipateDur=900 по умолчанию)
  assert.equal(op._began, undefined, 'активная фаза ещё не началась');
});

test('applyTransform: категория vargaPair (k→g) — активная фаза начинается ровно после anticipateDur, 180°, нейтральная грань', () => {
  const cubes = { 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 3, toGlyph: 'g', start: 1000, ...TRANSFORM_KIND.vargaPair };
  const anticipateDur = 900; // дефолт
  const dur = 0.5 * MS_PER_360; // 700мс
  const activeStart = 1000 + anticipateDur;

  applyTransform(op, activeStart, ctx); // ровно момент конца паузы — старт активной фазы
  assert.equal(cubes[3].mesh.scale.x, 1, 'пульс масштабом снят к началу активной фазы');
  assert.equal(cubes[3].mesh.material, cubes[3].matsBlank, 'на старте активной фазы — нейтральная грань (signal:blank), не серебро');

  applyTransform(op, activeStart + dur * 0.5, ctx); // середина вращения — глиф уже сменился (порог 15%)
  assert.equal(cubes[3].tr, 'g', 'глиф внутри cube.tr должен смениться через regenMats к середине пути');
  assert.equal(cubes[3].mesh.material, cubes[3].matsBlank, 'материал остаётся нейтральным до самого конца — переход цветом ещё не завершён');

  applyTransform(op, activeStart + dur, ctx); // точно момент завершения вращения
  assert.equal(cubes[3].mesh.material, cubes[3].matsMain, 'по завершении вращения — истинный цвет (ссылка на актуальный matsMain)');
  assert.equal(cubes[3].mesh.rotation.y, 0, 'поворот сброшен в 0 по завершении');
  assert.equal(op._done, undefined, 'РЕГРЕССИЯ БЫ БЫЛА ЗДЕСЬ: _done не должен выставляться сразу по завершении вращения — есть ещё пауза-фиксация (holdDur)');
});

test('applyTransform: пауза-фиксация (holdDur) — _done выставляется РОВНО через holdDur после завершения вращения, не раньше', () => {
  const cubes = { 4: makeCube(4) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 4, toGlyph: 'dh', start: 0, ...TRANSFORM_KIND.assimToNeighbor };
  const anticipateDur = 900, dur = 1 * MS_PER_360, holdDur = 700; // все дефолты
  const rotationEnd = anticipateDur + dur;

  applyTransform(op, rotationEnd, ctx); // момент завершения вращения
  assert.equal(op._done, undefined, 'сразу по завершении вращения — ещё не done, идёт пауза-фиксация');

  applyTransform(op, rotationEnd + holdDur - 1, ctx); // за 1мс до конца паузы-фиксации
  assert.equal(op._done, undefined, 'за 1мс до конца паузы-фиксации — всё ещё не done');

  applyTransform(op, rotationEnd + holdDur, ctx); // ровно момент конца паузы
  assert.equal(op._done, true, 'ровно по истечении holdDur после завершения вращения — done');
});

test('applyTransform: несуществующий слот — тихо ничего не делает, не падает', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 99, toGlyph: 'x', start: 0, spinTurns: 1 };
  assert.doesNotThrow(() => applyTransform(op, 500, ctx));
});

test('applyTransform: до op.start — ничего не меняется (ранний выход)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 5, toGlyph: 'x', start: 1000, spinTurns: 1 };
  applyTransform(op, 500, ctx);
  assert.equal(cubes[5].mesh.rotation.y, 0);
  assert.equal(op._began, undefined);
});
