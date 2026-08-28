// Тесты РЕАЛЬНО импортированной applyApproach (заход 59, Стадия 2:
// перенесена на уровень модуля, 4/10). THREE — настоящий пакет. Мокаются
// только DOM-объекты (canvas для текстуры пульса, div для колец/волн).
//
// Тесты привязаны к конкретным, задокументированным в коде решениям:
// «заход 28» — target может отсутствовать (исчезнуть через elide) в любой
// момент, approach не должен обрываться; «заход 15» (retreat:false) —
// мувер остаётся у цели, а не возвращается домой; «заход 29» (midDistance)
// — двухотрезочный путь с явной паузой, реакция происходит ИМЕННО в ней;
// «заход 33/41» (holdPulse) — непрерывная текстурная пульсация на
// триггере вместо разовых вспышек, выключается ровно один раз при выходе
// из паузы; пик-пульс на цели срабатывает РОВНО один раз (op._pulsed);
// дрожь цели обрывается РЕЗКО в момент отскока, не спадает плавно.
//
// ВАЖНО: позиция мувера считается движком через slotX(slot) — НЕ через
// исходный mesh.position.x (в makeCube он ставится в сырой номер слота,
// только для узнаваемости в отладке). Ожидаемые координаты в тестах ниже
// поэтому всегда явно через slotX(), не через прочитанный до вызова
// cube.mesh.position.x — иначе сравнение сравнивает не то с не тем.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyApproach, SLOT, slotX } from '../docs/app/lib/slot-engine.js';

function makeCube(slot, tr = 'k') {
  const mesh = new THREE.Object3D();
  mesh.position.set(slotX(slot), 0, 0);
  const matsMain = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5'];
  mesh.material = matsMain;
  return { tr, mesh, matsMain };
}

function makeCtx(cubes, wordGroupsList = []) {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  return {
    cubes,
    wordGroupsList,
    camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild() {} },
  };
}

test('applyApproach: несуществующие movers — тихо ничего не делает, не падает', () => {
  const ctx = makeCtx({});
  assert.doesNotThrow(() => applyApproach({ type: 'approach', mover: 9, target: 1, start: 0 }, 100, ctx));
});

test('applyApproach: заход 28 — цель может отсутствовать в любой момент, движение mover\'а не обрывается', () => {
  const cubes = { 3: makeCube(3) }; // target(5) отсутствует с самого начала
  const ctx = makeCtx(cubes);
  const op = { type: 'approach', mover: 3, target: 5, start: 0, approachDur: 1000, holdDur: 500, retreatDur: 800, distance: 0.5 };
  const baseX = slotX(3);

  assert.doesNotThrow(() => applyApproach(op, 500, ctx));
  assert.notEqual(cubes[3].mesh.position.x, baseX, 'мувер должен двигаться, даже когда target не существует');

  assert.doesNotThrow(() => applyApproach(op, 1200, ctx)); // фаза пика — target && ... ветка должна безопасно пропуститься
  assert.doesNotThrow(() => applyApproach(op, 2500, ctx)); // после retreatEnd
});

test('applyApproach: retreat:false (заход 15) — мувер остаётся у цели, не возвращается домой', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const baseX = slotX(1);
  const dir = Math.sign(slotX(3) - baseX);
  const op = { type: 'approach', mover: 1, target: 3, start: 0, approachDur: 500, holdDur: 300, retreat: false, distance: 1.0 };
  const shift = SLOT * 1.0 * dir;
  const retreatEnd = 500 + 300; // retreatDur=0 при retreat:false

  applyApproach(op, retreatEnd + 50, ctx);
  assert.ok(Math.abs(cubes[1].mesh.position.x - (baseX + shift)) < 1e-9, 'после окончания — мувер держится у цели (shift), не 0');
});

test('applyApproach: обычный retreat (по умолчанию) — по истечении полного цикла мувер возвращается домой', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const baseX = slotX(1);
  const op = { type: 'approach', mover: 1, target: 3, start: 0, approachDur: 500, holdDur: 300, retreatDur: 400, distance: 0.6 };
  const retreatEnd = 500 + 300 + 400;

  applyApproach(op, retreatEnd + 10, ctx);
  assert.ok(Math.abs(cubes[1].mesh.position.x - baseX) < 1e-9, 'мувер возвращается ровно в исходную позицию');
});

test('applyApproach: пик-пульс на цели срабатывает РОВНО один раз (op._pulsed), не при каждом кадре фазы пика', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'approach', mover: 1, target: 3, start: 0, approachDur: 500, holdDur: 300, retreatDur: 400, distance: 0.6 };

  applyApproach(op, 501, ctx); // первый кадр СТРОГО внутри фазы пика (peakStart=500 сам ещё в фазе approach)
  assert.equal(op._pulsed, true, 'пульс должен выставиться сразу на входе в фазу пика');

  applyApproach(op, 700, ctx); // ещё в фазе пика
  assert.equal(op._pulsed, true, 'флаг остаётся true, повторного срабатывания быть не должно');
});

test('applyApproach: дрожь цели ОБРЫВАЕТСЯ резко в момент выхода из фазы пика, не спадает плавно', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'approach', mover: 1, target: 3, start: 0, approachDur: 500, holdDur: 300, retreatDur: 400, distance: 0.6, jitterAmp: 0.2 };
  const peakEnd = 500 + 300;

  applyApproach(op, peakEnd, ctx);
  applyApproach(op, peakEnd + 1, ctx);
  assert.equal(cubes[3].mesh.rotation.z, 0, 'ровно за пределами фазы пика — обрыв в 0, не постепенный спад');
});

test('applyApproach: midDistance (заход 29) — прогресс достигает midDistance к концу первого отрезка, остаётся на паузе', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const baseX = slotX(1);
  const dir = Math.sign(slotX(3) - baseX);
  const op = {
    type: 'approach', mover: 1, target: 3, start: 0,
    midDistance: 0.3, midHoldDur: 600, leg2Dur: 700, approachDur: 500, distance: 0.6,
  };

  applyApproach(op, 500, ctx); // ровно конец первого отрезка (leg1End)
  const expectedMid = baseX + SLOT * 0.3 * dir;
  assert.ok(Math.abs(cubes[1].mesh.position.x - expectedMid) < 1e-6, 'к концу leg1 — ровно midDistance');

  applyApproach(op, 900, ctx); // где-то в середине паузы
  assert.ok(Math.abs(cubes[1].mesh.position.x - expectedMid) < 1e-9, 'во время паузы позиция держится на midDistance, не ползёт дальше');
});

test('applyApproach: midDistance — второй отрезок доводит РОВНО до distance к leg2End, дальше не уезжает', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const baseX = slotX(1);
  const dir = Math.sign(slotX(3) - baseX);
  const op = {
    type: 'approach', mover: 1, target: 3, start: 0,
    midDistance: 0.3, midHoldDur: 600, leg2Dur: 700, approachDur: 500, distance: 0.6,
  };
  const leg2End = 500 + 600 + 700;
  const expectedFull = baseX + SLOT * 0.6 * dir;

  applyApproach(op, leg2End, ctx);
  assert.ok(Math.abs(cubes[1].mesh.position.x - expectedFull) < 1e-6, 'к концу leg2 — ровно полное distance');

  applyApproach(op, leg2End + 1000, ctx); // долго после
  assert.ok(Math.abs(cubes[1].mesh.position.x - expectedFull) < 1e-9, 'после leg2End прогресс держится на distance, не продолжает расти');
});

test('applyApproach: holdPulse (заход 33/41) — непрерывная текстурная пульсация на триггере во время паузы, выключается ровно один раз по выходе', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = {
    type: 'approach', mover: 1, target: 3, start: 0,
    midDistance: 0.3, midHoldDur: 600, leg2Dur: 700, approachDur: 500, distance: 0.6,
    holdPulse: true, holdPulsePeriod: 1000, holdWaveGap: 300, holdWaveTravel: 200,
  };

  applyApproach(op, 800, ctx); // внутри паузы (500..1100)
  assert.equal(cubes[1].mesh.material, cubes[1]._pulsingMats, 'во время паузы — пульсирующий материал на триггере');

  applyApproach(op, 1101, ctx); // первый кадр СТРОГО после выхода из паузы (holdEnd=1100 сам ещё внутри паузы)
  assert.equal(op._pulseOff, true, 'пульсация выключается ровно в момент выхода из паузы');
  assert.equal(cubes[1].mesh.material, cubes[1].matsMain, 'материал возвращается к истинному matsMain');
});
