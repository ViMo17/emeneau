// Тесты РЕАЛЬНО импортированной applySplit (заход 59, Стадия 2: перенесена
// на уровень модуля, 5/10) вместе с flyArcPosition. THREE — настоящий
// пакет; arrivals создаются через РЕАЛЬНУЮ модульную фабрику makeCube
// (геометрия+материалы chalk-module.js) — canvasStub расширен под
// createRadialGradient (makeShadowBlobTexture), иначе тень не строится.
//
// Тесты привязаны к конкретным задокументированным решениям: пауза-
// осознание БЕЗ смены цвета, с двумя разнесёнными кольцами-пульсами (заход
// 10/11); источник держится под отдельным временным ключом, чтобы прилёт
// результата с тем же номером слота не затирал ещё висящий источник;
// момент угасания источника — max(конец подъёма, конец ПОСЛЕДНЕГО прилёта)
// + holdDur, не просто «после подъёма» (заход 10, «ненужная пауза»).
//
// ВАЖНО: applySplit переносит исходный кубик из cubes[op.at] под временный
// ключ cubes[op._srcKey] на самом ПЕРВОМ успешном кадре (elapsed>=op.start)
// — после этого cubes[op.at] пуст. Тесты держат ссылку на сам объект
// кубика (srcCube), а не перечитывают cubes[op.at] после первого вызова.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applySplit, flyArcPosition, slotX } from '../docs/app/lib/slot-engine.js';

function makeFakeCube(slot) {
  const mesh = new THREE.Object3D();
  mesh.position.set(slotX(slot), 0, 0);
  // Материалы — объекты (как настоящие THREE.Material), не строки: setOpacity
  // присваивает im.opacity — на примитивной строке это падает.
  const matsMain = [{ name: 'm0' }, { name: 'm1' }, { name: 'm2' }, { name: 'm3' }, { name: 'm4' }, { name: 'm5' }];
  mesh.material = { name: 'placeholder' };
  return { tr: 'e', mesh, matsMain };
}

function makeCtx(cubes) {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  const added = [];
  return {
    cubes,
    camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild() {} },
    scene: { add(obj) { added.push(obj); }, _added: added },
  };
}

test('flyArcPosition: чистая арифметика — на t=0 в исходной точке, на t=1 в целевой, дуга по высоте на середине', () => {
  const from = { x: 0, y: 0, z: 0 };
  const p0 = flyArcPosition(from, 10, 0, 0, 0, 2);
  const p1 = flyArcPosition(from, 10, 0, 0, 1, 2);
  const pMid = flyArcPosition(from, 10, 0, 0, 0.5, 2);
  assert.ok(Math.abs(p0.x - 0) < 1e-9 && Math.abs(p1.x - 10) < 1e-6, 'x идёт от from до to');
  assert.ok(pMid.y > p0.y && pMid.y > p1.y, 'на середине пути высота выше обеих концевых точек (дуга)');
});

test('applySplit: несуществующий исходный слот — тихо ничего не делает, не падает', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  assert.doesNotThrow(() => applySplit({ type: 'split', at: 4, start: 0 }, 100, ctx));
});

test('applySplit: пауза-осознание — пульс масштабом БЕЗ смены материала, два кольца на 15% и 60% паузы', () => {
  const cubes = { 4: makeFakeCube(4) };
  const srcCube = cubes[4];
  const ctx = makeCtx(cubes);
  const op = { type: 'split', at: 4, start: 0, anticipateDur: 900 };
  const originalMaterial = srcCube.mesh.material;

  applySplit(op, 0, ctx);
  assert.equal(srcCube.mesh.material, originalMaterial, 'материал не тронут на самом первом кадре паузы');

  applySplit(op, 900 * 0.2, ctx); // за порогом 0.15 — первое кольцо должно сработать
  assert.equal(op._pulse0, true, 'первое кольцо на ~15% паузы');
  assert.equal(op._pulse1, undefined, 'второе кольцо ещё не должно было сработать');
  assert.equal(srcCube.mesh.material, originalMaterial, 'материал всё ещё не тронут во время паузы');

  applySplit(op, 900 * 0.65, ctx); // за порогом 0.6
  assert.equal(op._pulse1, true, 'второе кольцо на ~60% паузы');
});

test('applySplit: по завершении паузы — материал возвращается на matsMain, начинается подъём в отстойник', () => {
  const cubes = { 4: makeFakeCube(4) };
  const srcCube = cubes[4];
  const ctx = makeCtx(cubes);
  const op = { type: 'split', at: 4, start: 0, anticipateDur: 900, riseDur: 1000, holdOffset: { x: -1, y: 2, z: 0.3 } };
  const baseX = slotX(4);

  applySplit(op, 900, ctx); // ровно момент выхода из паузы
  assert.equal(srcCube.mesh.material, srcCube.matsMain, 'материал возвращён на matsMain при выходе из паузы');

  applySplit(op, 900 + 500, ctx); // середина подъёма
  assert.notEqual(srcCube.mesh.position.x, baseX, 'к середине подъёма позиция уже сдвинулась от исходной');
});

test('applySplit: arrivals прилетают по дуге и садятся ровно в slotX(newSlot) к моменту delay+dur', () => {
  const cubes = { 4: makeFakeCube(4) };
  const ctx = makeCtx(cubes);
  const op = {
    type: 'split', at: 4, start: 0, anticipateDur: 0, riseDur: 500, holdDur: 200, fadeDur: 300,
    arrivals: [
      { into: 'a', newSlot: 5, from: { x: -3, y: 3, z: 0 }, delay: 0, dur: 400, arcHeight: 1 },
    ],
  };

  applySplit(op, 200, ctx); // arrival в процессе полёта
  assert.ok(cubes[5], 'кубик прилёта появляется в карте cubes под своим newSlot');
  assert.equal(cubes[5].mesh.visible, true);

  applySplit(op, 400, ctx); // ровно момент посадки (delay+dur)
  assert.ok(Math.abs(cubes[5].mesh.position.x - slotX(5)) < 1e-6, 'к моменту delay+dur — точно в целевом слоте');

  assert.equal(ctx.scene._added.filter(o => o === cubes[5].mesh).length, 1, 'mesh прилёта добавлен на сцену РОВНО один раз, не при каждом кадре');
});

test('applySplit: угасание источника стартует по max(конец подъёма, конец ПОСЛЕДНЕГО прилёта) + holdDur (заход 10)', () => {
  // Здесь прилёт заканчивается ПОЗЖЕ подъёма (riseEnd=500, прилёт длится до 900) —
  // угасание должно стартовать от прилёта, не от подъёма.
  const cubes = { 4: makeFakeCube(4) };
  const srcCube = cubes[4];
  const ctx = makeCtx(cubes);
  const op = {
    type: 'split', at: 4, start: 0, anticipateDur: 0, riseDur: 500, holdOpacity: 0.5, holdDur: 100, fadeDur: 200,
    arrivals: [{ into: 'a', newSlot: 5, from: { x: -3, y: 3, z: 0 }, delay: 0, dur: 900, arcHeight: 1 }],
  };
  const fadeStart = 900 + 100; // activeStart(0) + lastArrivalEnd(900) + holdDur(100), НЕ riseEnd(500)+holdDur

  applySplit(op, fadeStart - 1, ctx);
  assert.notEqual(srcCube.mesh.visible, false, 'за 1мс до расчётного fadeStart источник ещё должен быть виден (не начал гаснуть до конца)');

  applySplit(op, fadeStart + 200, ctx); // fadeStart + fadeDur — полностью погасло
  assert.equal(srcCube.mesh.visible, false, 'после fadeStart+fadeDur источник исчезает');
  assert.equal(cubes[op._srcKey], undefined, 'временный ключ источника удалён из карты cubes');
});
