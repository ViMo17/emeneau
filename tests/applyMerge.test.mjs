// Тесты РЕАЛЬНО импортированной applyMerge (заход 60, Стадия 2: перенесена
// на уровень модуля, 7/10). target проходит через настоящий regenMats (не
// замокан) — материалы РЕАЛЬНЫЕ THREE.MeshStandardMaterial (canvasStub уже
// покрывает всё, что нужно chalk-module.js), поэтому emissive/opacity —
// живые GPU-совместимые поля, не заглушки.
//
// Тесты привязаны к трём РЕАЛЬНО пойманным за сессию регрессиям одного и
// того же класса «финализация под своим guard'ом, спад — без guard'а»:
// заход 18 (mover ищется только внутри `if(!op._done)`, не должен обрывать
// ВСЮ функцию после своего удаления из cubes) и заход 15 (спад пика
// масштаба/свечения продолжается на кадрах ПОСЛЕ op._done, не застревает).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyMerge, slotX } from '../docs/app/lib/slot-engine.js';

function makeMover(slot) {
  const mesh = new THREE.Object3D();
  mesh.position.set(slotX(slot), 0, 0);
  const shadow = new THREE.Object3D();
  return { mesh, shadow };
}

function makeTarget(slot, tr = 'a') {
  const mesh = new THREE.Object3D();
  mesh.position.set(slotX(slot), 0, 0);
  mesh.visible = true;
  return { tr, seed: 7, mesh }; // seed нужен regenMats; matsMain и т.п. он создаст сам заново
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

test('applyMerge: несуществующая цель — тихо ничего не делает, не падает', () => {
  const ctx = makeCtx({});
  assert.doesNotThrow(() => applyMerge({ type: 'merge', from: 1, at: 9, toGlyph: 'x', start: 0 }, 100, ctx));
});

test('applyMerge: заход 18 — источник может отсутствовать (ещё не создан) ДО завершения, не роняет функцию', () => {
  const cubes = { 3: makeTarget(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 500 };
  assert.doesNotThrow(() => applyMerge(op, 100, ctx));
  assert.equal(op._done, undefined, 'без mover-а слияние не может завершиться');
});

test('applyMerge: полный цикл — мувер доезжает до цели, слот источника удаляется, цель получает новую букву и вспышку', () => {
  const cubes = { 1: makeMover(1), 3: makeTarget(3, 'a') };
  const ctx = makeCtx(cubes);
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 500 };
  const targetX = cubes[3].mesh.position.x;

  applyMerge(op, 250, ctx); // середина полёта
  assert.ok(cubes[1], 'мувер ещё существует в середине полёта');
  assert.notEqual(cubes[1].mesh.position.x, slotX(1), 'мувер уже сдвинулся от исходной позиции');

  applyMerge(op, 500, ctx); // момент слияния
  assert.equal(op._done, true);
  assert.equal(cubes[1], undefined, 'источник удалён из cubes — слились в одно');
  assert.equal(cubes[3].tr, 'ā', 'цель приняла новую букву (regenMats)');
  assert.equal(cubes[3].mesh.material, cubes[3].matsMain, 'материал цели — новый matsMain (пересобранный regenMats)');
  assert.ok(Math.abs(cubes[3].mesh.position.x - targetX) < 1e-9, 'цель не сдвинулась со своего места');
  assert.equal(cubes[3].mesh.scale.x, 1.35, 'пик вспышки масштабом ровно в момент слияния');
});

test('applyMerge: заход 18 (главный сценарий регрессии) — после слияния и удаления mover-а из cubes функция НЕ обрывается на следующих кадрах', () => {
  const cubes = { 1: makeMover(1), 3: makeTarget(3, 'a') };
  const ctx = makeCtx(cubes);
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 500 };

  applyMerge(op, 500, ctx); // слияние произошло, mover удалён
  assert.equal(cubes[1], undefined);

  // РЕГРЕССИЯ БЫЛА БЫ ЗДЕСЬ: старый guard `if (!mover) return` стоял НАД
  // всей функцией — на этом кадре он оборвал бы спад пика масштаба, даже
  // не начав его. Сейчас mover ищется только внутри `if(!op._done)`.
  assert.doesNotThrow(() => applyMerge(op, 600, ctx));
  assert.ok(cubes[3].mesh.scale.x < 1.35, 'спад пика реально продолжился на кадре после исчезновения mover-а, не завис на 1.35');
});

test('applyMerge: заход 15 — спад пика масштаба/свечения идёт КАЖДЫЙ кадр после op._done, не блокируется тем же guard\'ом', () => {
  const cubes = { 1: makeMover(1), 3: makeTarget(3, 'a') };
  const ctx = makeCtx(cubes);
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 500 };

  applyMerge(op, 500, ctx); // момент слияния — пик 1.35, emissiveIntensity 0.9
  assert.equal(cubes[3].mesh.scale.x, 1.35);
  assert.equal(cubes[3].mesh.material[0].emissiveIntensity, 0.9);

  applyMerge(op, 500 + 300, ctx); // середина спада (600мс)
  assert.ok(cubes[3].mesh.scale.x > 1 && cubes[3].mesh.scale.x < 1.35, 'масштаб где-то в процессе спада, не застрял на пике');

  applyMerge(op, 500 + 600, ctx); // ровно конец спада
  assert.ok(Math.abs(cubes[3].mesh.scale.x - 1) < 1e-9, 'масштаб полностью вернулся к 1');
  assert.ok(Math.abs(cubes[3].mesh.material[0].emissiveIntensity - 0) < 1e-9, 'свечение полностью погасло');
});

test('applyMerge: op.label — пилюля-подпись появляется РОВНО один раз, на первом кадре полёта мувера', () => {
  const cubes = { 1: makeMover(1), 3: makeTarget(3, 'a') };
  const labelsCalls = [];
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5); camera.lookAt(0, 0.4, 0); camera.updateMatrixWorld();
  const ctx = {
    cubes, camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { labelsCalls.push(el); } },
  };
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 500, label: 'Слияние' };

  applyMerge(op, 0, ctx);
  const pills = labelsCalls.filter(el => el.className === 'slot-label-pill');
  assert.equal(pills.length, 1, 'ровно одна пилюля на первом кадре');
  assert.equal(pills[0].textContent, 'Слияние');

  applyMerge(op, 250, ctx);
  applyMerge(op, 500, ctx);
  assert.equal(labelsCalls.filter(el => el.className === 'slot-label-pill').length, 1, 'повторные кадры не плодят новые пилюли');
});

test('applyMerge: РЕАЛЬНЫЙ НАЙДЕННЫЙ БАГ (rule1, merge с последующим transform на том же кубике) — спад пика перестаёт трогать material после того, как сам полностью завершился, не лезет туда НАВСЕГДА', () => {
  const cubes = { 1: makeMover(1), 3: makeTarget(3, 'a') };
  const ctx = makeCtx(cubes);
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 500 };

  applyMerge(op, 500, ctx); // слияние — спад начинается (op._pulsedAt=500)
  applyMerge(op, 500 + 600, ctx); // ровно конец спада (600мс) — _decayDone должен выставиться

  // Имитация того, что происходит в rule1: следующая операция (transform)
  // на ТОМ ЖЕ кубике переприсваивает material на что-то, у чего нет
  // forEach (например, временный blank-набор, а затем целиком снятая
  // ссылка). Без `_decayDone` applyMerge на СЛЕДУЮЩЕМ кадре упал бы здесь
  // — этот тест ловит именно эту регрессию, не гипотетическую.
  cubes[3].mesh.material = undefined;
  assert.doesNotThrow(() => applyMerge(op, 500 + 600 + 1000, ctx), 'спад больше не трогает material спустя много кадров после своего завершения');
});

test('applyMerge: op.blankAtProgress — буква мувера исчезает РОВНО один раз на заданной доле полёта, не раньше', () => {
  const cubes = { 1: makeMover(1), 3: makeTarget(3, 'a') };
  cubes[1].matsBlank = 'matsBlank';
  const ctx = makeCtx(cubes);
  const op = { type: 'merge', from: 1, at: 3, toGlyph: 'ā', start: 0, dur: 1000, blankAtProgress: 0.5 };

  applyMerge(op, 499, ctx);
  assert.notEqual(cubes[1].mesh.material, cubes[1].matsBlank, 'за 1мс до половины полёта — буква ещё видна');

  applyMerge(op, 500, ctx);
  assert.equal(cubes[1].mesh.material, cubes[1].matsBlank, 'ровно на половине полёта — буква уже исчезла');

  applyMerge(op, 900, ctx);
  assert.equal(cubes[1].mesh.material, cubes[1].matsBlank, 'остаётся пустой до самого слияния, не мигает обратно');
});
