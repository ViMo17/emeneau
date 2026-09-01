// Тесты РЕАЛЬНО импортированной applyElide (заход 58, Стадия 2) — не
// скопированной вручную. Покрывает самый дорогой найденный класс бага
// сессии: одноразовый guard (`op._done`), блокирующий продолжающийся
// хвост анимации (спад масштаба после вспышки-удара) — чинили трижды
// (applyTransform заход 11, applyMerge заходы 15/18, здесь — заход 39,
// сразу вынесено ВНЕ веток rise/hold/fade).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyElide, ringColorFrom, colorFor } from '../docs/app/lib/slot-engine.js';

function makeCube(slot) {
  const mesh = new THREE.Object3D();
  mesh.position.set(slot, 0, 0);
  mesh.material = [{ opacity: 1 }]; // setOpacity читает mesh.material напрямую, не matsMain
  return {
    tr: 's',
    mesh,
    shadow: { visible: true },
    matsMain: mesh.material,
  };
}

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

test('applyElide: вспышка в момент удара (op.start), скачок масштаба спадает за 350мс — НЕ застревает (регрессия заходов 11/15/18/39)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'elide', at: 5, start: 1000 };

  applyElide(op, 1000, ctx); // момент удара
  assert.equal(cubes[5].mesh.scale.x, 1.25, 'скачок масштаба ровно в момент удара');

  applyElide(op, 1000 + 175, ctx); // середина спада (350мс)
  assert.ok(cubes[5].mesh.scale.x > 1 && cubes[5].mesh.scale.x < 1.25, 'масштаб на полпути между пиком и нормой');

  applyElide(op, 1000 + 350, ctx); // конец спада
  assert.equal(cubes[5].mesh.scale.x, 1, 'РЕГРЕССИЯ БЫ БЫЛА ЗДЕСЬ: масштаб должен вернуться к 1, не застрять на 1.25');
});

test('applyElide: погружение вниз (не вверх) — y уходит в отрицательную сторону, полностью исчезает по истечении riseDur+holdDur+fadeDur', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'elide', at: 5, start: 0 };
  const totalDur = 1300 + 800 + 1100; // дефолты riseDur+holdDur+fadeDur

  applyElide(op, 100, ctx);
  assert.ok(cubes[5].mesh.position.y < 0, 'направление вниз (не вверх, как у split) — значение y отрицательное');

  applyElide(op, totalDur - 1, ctx);
  assert.equal(cubes[5].mesh.visible, true, 'ещё видим за 1мс до конца (visible не переключился в false)');
  assert.notEqual(cubes[5], undefined, 'кубик ещё существует в cubes');
  const cubeRef = cubes[5]; // сохраняю ссылку — сам объект удаляется из cubes ПОСЛЕДНИМ кадром, но остаётся валиден как объект

  applyElide(op, totalDur, ctx);
  assert.equal(cubeRef.mesh.visible, false, 'полностью скрыт по завершении');
  assert.equal(cubeRef.mesh.material[0].opacity, 0, 'прозрачность дошла до нуля');
  assert.equal(op._done, true);
  assert.equal(cubes[5], undefined, 'кубик удалён из cubes целиком — элизия, не просто невидимость');
});

test('applyElide: несуществующий слот — тихо ничего не делает, не падает', () => {
  const cubes = {};
  const ctx = makeCtx(cubes);
  const op = { type: 'elide', at: 99, start: 0 };
  assert.doesNotThrow(() => applyElide(op, 500, ctx));
});

test('applyElide: до op.start — ничего не меняется (ранний выход)', () => {
  const cubes = { 6: makeCube(6) };
  const ctx = makeCtx(cubes);
  const op = { type: 'elide', at: 6, start: 1000 };
  applyElide(op, 500, ctx);
  assert.equal(cubes[6].mesh.position.y, 0);
  assert.equal(op._impactAt, undefined);
});

test('applyElide: прозрачность держится ПОЛНОЙ на всём rise+hold — тает только в fade (прямой запрос пользователя: буква не должна таять по дороге вниз)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'elide', at: 5, start: 0 };
  const riseEnd = 1300, fadeStart = riseEnd + 800;

  applyElide(op, 50, ctx);
  assert.equal(cubes[5].mesh.material[0].opacity, 1, 'в начале rise ещё полная непрозрачность');
  applyElide(op, riseEnd, ctx);
  assert.equal(cubes[5].mesh.material[0].opacity, 1, 'на границе rise→hold всё ещё полная');
  applyElide(op, fadeStart - 1, ctx);
  assert.equal(cubes[5].mesh.material[0].opacity, 1, 'на всём hold остаётся полной');
  applyElide(op, fadeStart + 550, ctx); // середина fade
  const mid = cubes[5].mesh.material[0].opacity;
  assert.ok(mid > 0 && mid < 1, 'только в fade прозрачность реально снижается: ' + mid);
});

test('applyElide: кубик визуально пропадает (прозрачность И масштаб) НАМНОГО быстрее полного fadeDur — синхронно с недолгими искрами, не растянуто до самого конца (прямая формулировка: «стреляет из точки, потом исчезает» — было ДВА разъединённых события)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'elide', at: 5, start: 0 };
  const fadeStart = 1300 + 800, fadeDur = 1100; // дефолты
  const visualGoneAt = fadeStart + fadeDur / 1.8; // ×1.8 ускорение визуальной кривой

  applyElide(op, visualGoneAt - 50, ctx);
  const beforeOpacity = cubes[5].mesh.material[0].opacity;
  const beforeScale = cubes[5].mesh.scale.x;
  assert.ok(beforeOpacity > 0.02, 'ещё чуть видна прямо перед визуальным исчезновением: ' + beforeOpacity);

  applyElide(op, visualGoneAt + 5, ctx);
  assert.ok(cubes[5].mesh.material[0].opacity < 0.02, 'прозрачность уже практически 0 задолго до конца fadeDur(1100)');
  assert.ok(cubes[5].mesh.scale.x < 0.2, 'масштаб уже сжался почти до нуля — кубик визуально распался, не просто тает целым');
  assert.ok(cubes[5].mesh.scale.x < beforeScale, 'масштаб реально уменьшается вместе с прозрачностью, не остаётся на 1');

  // Кубик остаётся невидимым (0/почти-0) до самого конца fadeDur — не
  // "оживает" обратно между визуальным исчезновением и фактическим удалением.
  applyElide(op, fadeStart + fadeDur - 1, ctx);
  assert.ok(cubes[5].mesh.material[0].opacity < 0.02, 'остаётся невидимым вплоть до фактического удаления');
});

test('applyElide: россыпь искр (spawnSparkleBurst) запускается РОВНО один раз, на первом кадре fade — не раньше и не повторно', () => {
  const cubes = { 5: makeCube(5) };
  const labelsCalls = [];
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5); camera.lookAt(0, 0.4, 0); camera.updateMatrixWorld();
  const ctx = {
    cubes, camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { labelsCalls.push(el); } },
  };
  const op = { type: 'elide', at: 5, start: 0 };
  const fadeStart = 1300 + 800;

  applyElide(op, fadeStart - 1, ctx);
  assert.equal(op._fadeStartedAt, undefined, 'до начала fade искры не запускались');
  assert.equal(labelsCalls.filter(el => el.className === 'slot-sparkle').length, 0, 'ни одной искры ещё не добавлено (импакт-кольцо в момент старта — отдельный элемент, не искра)');

  applyElide(op, fadeStart + 1, ctx);
  assert.equal(op._fadeStartedAt, fadeStart + 1, 'флаг выставлен на первом кадре fade');
  const sparkleCount = labelsCalls.filter(el => el.className === 'slot-sparkle').length;
  assert.equal(sparkleCount, 200, 'ровно 200 искр (дефолт spawnSparkleBurst) добавлено в DOM за один запуск');

  applyElide(op, fadeStart + 200, ctx);
  const sparkleCountAfter = labelsCalls.filter(el => el.className === 'slot-sparkle').length;
  assert.equal(sparkleCountAfter, 200, 'повторный вызов на следующем кадре НЕ добавляет искры снова — guard сработал');
});

test('applyElide: цвет искр — СОБСТВЕННЫЙ цвет буквы (ringColorFrom+colorFor), не нейтральный GROUP_RGB (прямой запрос: «как будто кубик рассыпается на части»)', () => {
  const cubes = { 5: makeCube(5) }; // tr:'s' — согласная, свой фонетический цвет
  const labelsCalls = [];
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5); camera.lookAt(0, 0.4, 0); camera.updateMatrixWorld();
  const ctx = {
    cubes, camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { labelsCalls.push(el); } },
  };
  const op = { type: 'elide', at: 5, start: 0 };
  const fadeStart = 1300 + 800;

  applyElide(op, fadeStart + 1, ctx);
  const expectedColor = ringColorFrom(colorFor('s'));
  const sparkles = labelsCalls.filter(el => el.className === 'slot-sparkle');
  assert.ok(sparkles.length > 0, 'искры реально созданы');
  assert.ok(sparkles.every(el => el.style.background === `rgba(${expectedColor},.95)`), 'цвет фона каждой искры — собственный цвет буквы, не GROUP_RGB');
});

test('applyElide: op.quiet:true — без искр и без ускоренного сжатия (побочное исчезновение внутри чужого главного события, критерий из CLAUDE.md Часть 4)', () => {
  const cubes = { 5: makeCube(5) };
  const labelsCalls = [];
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5); camera.lookAt(0, 0.4, 0); camera.updateMatrixWorld();
  const ctx = {
    cubes, camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { labelsCalls.push(el); } },
  };
  const op = { type: 'elide', at: 5, start: 0, quiet: true };
  const riseEnd = 1300, fadeStart = riseEnd + 800, fadeDur = 1100, fadeEnd = fadeStart + fadeDur;

  applyElide(op, fadeStart + 1, ctx);
  assert.equal(labelsCalls.filter(el => el.className === 'slot-sparkle').length, 0, 'quiet — искр нет вообще');
  assert.equal(labelsCalls.filter(el => el.className === 'slot-pulse-ring').length, 1, 'вспышка-удар В НАЧАЛЕ реакции (op.start) остаётся — это отдельный обязательный сигнал, не «эффект»');

  // Без ускорения (×1.8) — угасание линейно на ВЕСЬ fadeDur, не быстрее.
  applyElide(op, fadeStart + fadeDur / 2, ctx); // ровно середина fadeDur
  const midOpacity = cubes[5].mesh.material[0].opacity;
  assert.ok(Math.abs(midOpacity - 0.5) < 0.05, `в середине fadeDur прозрачность около 0.5 (линейно, не ускоренно): ${midOpacity}`);
  assert.equal(cubes[5].mesh.scale.x, 1, 'quiet — масштаб НЕ сжимается, остаётся 1 (полноценный «эффект» только в драматичном варианте)');

  applyElide(op, fadeEnd, ctx);
  assert.equal(cubes[5], undefined, 'кубик всё равно полностью исчезает к концу fadeDur — только БЕЗ эффектов по пути');
});

test('applyElide: финального кольца-вспышки ПОСЛЕ угасания больше нет (убрано по прямой обратной связи — было лишним повтором сигнала после россыпи искр)', () => {
  const cubes = { 5: makeCube(5) };
  const labelsCalls = [];
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5); camera.lookAt(0, 0.4, 0); camera.updateMatrixWorld();
  const ctx = {
    cubes, camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { labelsCalls.push(el); } },
  };
  const op = { type: 'elide', at: 5, start: 0 };
  const totalDur = 1300 + 800 + 1100;

  applyElide(op, totalDur, ctx); // полное завершение — кубик удаляется
  assert.equal(op._done, true);
  const ringsAfterCompletion = labelsCalls.filter(el => el.className === 'slot-pulse-ring').length;
  assert.equal(ringsAfterCompletion, 1, 'только ОДНО кольцо за весь прогон — импакт в момент начала реакции (op.start), финального кольца после угасания больше нет');
});
