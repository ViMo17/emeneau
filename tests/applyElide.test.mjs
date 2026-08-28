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

import { applyElide } from '../docs/app/lib/slot-engine.js';

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
