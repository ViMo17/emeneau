// Тесты applyResist — новая операция движка (правило 8/suhārt): попытка
// elide блокируется правилом-исключением, кубик начинает уходить вниз, не
// долетает, коротко задерживается и пружинисто отскакивает обратно. Не
// исчезает, не меняет глиф — показывает саму попытку и её провал, не
// собственное сандхи-событие.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyResist } from '../docs/app/lib/slot-engine.js';

function makeCube(slot, tr = 'd') {
  const mesh = new THREE.Object3D();
  mesh.position.set(slot, 0, 0);
  return { tr, mesh };
}

function makeCtx(cubes) {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  const appended = [];
  return {
    cubes,
    camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { appended.push(el); }, _appended: appended },
    wordGroupsList: [],
  };
}

test('applyResist: вспышка в момент начала попытки (op.start), скачок масштаба спадает за 350мс — тот же язык, что elide/merge (регрессия того же класса бага)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'resist', at: 5, start: 1000 };

  applyResist(op, 1000, ctx);
  assert.equal(cubes[5].mesh.scale.x, 1.2, 'скачок масштаба ровно в момент начала попытки (мягче, чем у elide/merge — это лишь ПОПЫТКА, не полноценное событие)');

  applyResist(op, 1000 + 175, ctx);
  assert.ok(cubes[5].mesh.scale.x > 1 && cubes[5].mesh.scale.x < 1.2, 'масштаб на полпути между пиком и нормой');

  applyResist(op, 1000 + 350, ctx);
  assert.equal(cubes[5].mesh.scale.x, 1, 'масштаб должен вернуться к 1, не застрять на 1.2');
});

test('applyResist: дип-и-пружина — уходит вниз (y<0) на дефолтный dipOffset, держится на пике, затем возвращается РОВНО к y=0 (не застревает на середине, не переезжает дальше своей глубины)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'resist', at: 5, start: 0 };
  // Дефолты: dipOffset=-0.6, dipDur=700, holdDur=300, retreatDur=700.
  const dipEnd = 700, holdEnd = 1000, retreatEnd = 1700;

  applyResist(op, 0, ctx);
  assert.ok(Math.abs(cubes[5].mesh.position.y) < 1e-9, 'на самом старте ещё не сдвинулся (значение может быть -0 из-за dipOffset*0 — это не регрессия)');

  applyResist(op, dipEnd, ctx);
  assert.ok(Math.abs(cubes[5].mesh.position.y - (-0.6)) < 1e-9, 'на конце дипа — ровно на дефолтном dipOffset');

  applyResist(op, holdEnd - 1, ctx);
  assert.equal(cubes[5].mesh.position.y, -0.6, 'на паузе-удержании остаётся на пике попытки');

  applyResist(op, retreatEnd + 1, ctx);
  assert.equal(cubes[5].mesh.position.y, 0, 'РЕГРЕССИЯ БЫ БЫЛА ЗДЕСЬ: должен вернуться точно домой (y=0), не застрять в дипе и не переехать дальше');
});

test('applyResist: op._done выставляется РОВНО на retreatEnd, не раньше (пока попытка ещё не завершена — не done)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'resist', at: 5, start: 0 };

  applyResist(op, 1699, ctx);
  assert.equal(op._done, undefined, 'ещё не завершилась - _done не выставлен');

  applyResist(op, 1701, ctx);
  assert.equal(op._done, true, 'после retreatEnd (1700) — завершена');
});

test('applyResist: кубик остаётся ТЕМ ЖЕ (глиф не меняется, не удаляется) — показывает провал попытки, не собственное сандхи-событие', () => {
  const cubes = { 5: makeCube(5, 'd') };
  const ctx = makeCtx(cubes);
  const op = { type: 'resist', at: 5, start: 0 };

  for (let e = 0; e <= 1800; e += 100) applyResist(op, e, ctx);

  assert.equal(cubes[5].tr, 'd', 'глиф не менялся — resist не производит звукового перехода');
  assert.ok(cubes[5], 'кубик не удалён из cubes');
});

test('applyResist: groupSlots рисует нейтральную рамку (updateGroupFrame) под ВСЕЙ защищающей группой на время попытки, убирает её после', () => {
  const cubes = {
    2: makeCube(2, 'h'), 3: makeCube(3, 'ā'), 4: makeCube(4, 'r'), 5: makeCube(5, 'd'),
  };
  const ctx = makeCtx(cubes);
  const op = { type: 'resist', at: 5, start: 0, groupSlots: [2, 3, 4, 5] };

  applyResist(op, 500, ctx); // в разгар попытки
  assert.ok(
    ctx.labelsEl._appended.some(el => el.className === 'slot-group-frame'),
    'рамка группы реально добавлена в labelsEl во время попытки'
  );

  applyResist(op, 1750, ctx); // уже после retreatEnd (1700)
  assert.equal(op._frameEl, null, 'рамка убрана (_frameEl обнулён) после завершения попытки');
});

test('applyResist: label — пилюля-подпись спавнится один раз, если задана (необязательное поле, по умолчанию нет пилюли — правило 8 не имеет собственного санскритского термина)', () => {
  const cubes = { 5: makeCube(5) };
  const ctx = makeCtx(cubes);
  const op = { type: 'resist', at: 5, start: 0, label: 'тест' };

  applyResist(op, 100, ctx);
  assert.equal(op._labelSpawned, true, 'пилюля спавнится, если label задан');

  const withoutLabel = { type: 'resist', at: 5, start: 0 };
  const cubes2 = { 5: makeCube(5) };
  const ctx2 = makeCtx(cubes2);
  applyResist(withoutLabel, 100, ctx2);
  assert.equal(withoutLabel._labelSpawned, undefined, 'без label — пилюля не спавнится вовсе (дефолт для правила 8, у которого нет своего термина)');
});
