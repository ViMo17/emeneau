// Тесты РЕАЛЬНО импортированной applyInfluence (заход 59, Стадия 2:
// перенесена на уровень модуля, 3/10) — вместе с ней перенесены и её прямые
// зависимости (spawnWave, updateGroupFrame, setFacePulse/buildPulseFace/
// redrawPulseFace). THREE — настоящий пакет, арифметика Vector3/Quaternion/
// PerspectiveCamera реальная. Мокаются только DOM-объекты (canvas для
// текстур пульса, div для рамки группы и волн) — не логика движка.
//
// Тесты привязаны к конкретным, задокументированным в коде решениям
// (не абстрактные): «правка по обратной связи» — цель НЕ меняет материал
// (заход 8/10, «оранжевый больше не допустим»); «заход 9» — рамка группы
// только при >=2 источниках; «заход 43» — непрерывная текстурная пульсация
// вместо разовых вспышек, с выключением по истечении ringHoldDur; «заход 10»
// — пульс цели по её ПРИХОДУ волны (не отправке), растущий от волны к волне;
// сброс масштаба по истечении общего окна dur (не остаётся «застрявшим»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyInfluence } from '../docs/app/lib/slot-engine.js';

function makeCube(slot, tr = 'k') {
  const mesh = new THREE.Object3D();
  mesh.position.set(slot, 0, 0);
  const matsMain = ['m0', 'm1', 'm2', 'm3', 'm4', 'm5']; // реальный массив — setFacePulse спреды его через [...matsMain]
  mesh.material = matsMain;
  return { tr, mesh, matsMain };
}

// Полный ctx: camera реальная (THREE.PerspectiveCamera), stageEl — только
// размеры (нужны project()), labelsEl — записывающий стаб appendChild
// (не безмолвная заглушка — нужно проверять, ЧТО в него положили).
function makeCtx(cubes, wordGroupsList = []) {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  const appended = [];
  return {
    cubes,
    wordGroupsList,
    camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { appended.push(el); }, _appended: appended },
  };
}

test('applyInfluence: несуществующая цель/пустые источники — тихо ничего не делает, не падает', () => {
  const cubes = { 1: makeCube(1) };
  const ctx = makeCtx(cubes);
  assert.doesNotThrow(() => applyInfluence({ type: 'influence', from: 1, to: 9, start: 0 }, 100, ctx));
  assert.doesNotThrow(() => applyInfluence({ type: 'influence', from: 9, to: 1, start: 0 }, 100, ctx));
});

test('applyInfluence: цель НИКОГДА не меняет material (регрессия «оранжевый больше не допустим») — только пульс масштабом', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 2, waveGap: 2000, waveTravel: 500 };
  const targetMat = cubes[2].mesh.material;

  for (const t of [0, 130, 500, 660, 2000, 2130, 2500, 3000]) {
    applyInfluence(op, t, ctx);
    assert.equal(cubes[2].mesh.material, targetMat, `t=${t}: материал цели не должен подменяться`);
  }
});

test('applyInfluence: пульс ИСТОЧНИКА по моменту ОТПРАВКИ волны (амплитуда 0.06, не зависит от индекса волны)', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 2, waveGap: 2000, waveTravel: 500 };

  applyInfluence(op, 130, ctx); // пик пульса первой волны (отправлена в t=0, пик через 130мс)
  assert.ok(Math.abs(cubes[1].mesh.scale.x - 1.06) < 1e-9, `пик первой волны: ${cubes[1].mesh.scale.x}`);

  applyInfluence(op, 2130, ctx); // пик пульса второй волны (отправлена в t=2000)
  assert.ok(Math.abs(cubes[1].mesh.scale.x - 1.06) < 1e-9, `пик второй волны: ${cubes[1].mesh.scale.x}`);
});

test('applyInfluence: пульс ЦЕЛИ по моменту ПРИХОДА волны, растёт от волны к волне (0.045 + i*0.02)', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 2, waveGap: 2000, waveTravel: 500 };

  applyInfluence(op, 500, ctx); // ровно момент прихода волны (arriveAt=500), pt=0 — огибающая ещё в нуле
  assert.equal(cubes[2].mesh.scale.x, 1, 'ровно в момент прихода — начало огибающей, ещё 0');

  applyInfluence(op, 660, ctx); // пик реакции на ПЕРВУЮ волну (приход в 500, пик через 160мс)
  assert.ok(Math.abs(cubes[2].mesh.scale.x - 1.045) < 1e-9, `пик реакции на волну 0: ${cubes[2].mesh.scale.x}`);
});

test('applyInfluence: op._waveN — флаг выставляется РОВНО один раз, не раньше момента отправки', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 2, waveGap: 2000, waveTravel: 500 };

  applyInfluence(op, 0, ctx);
  assert.equal(op._wave0, true, 'первая волна уходит сразу в момент op.start');
  assert.equal(op._wave1, undefined, 'вторая волна ещё не должна была уйти');

  applyInfluence(op, 1999, ctx);
  assert.equal(op._wave1, undefined, 'за 1мс до момента второй волны — всё ещё не ушла');

  applyInfluence(op, 2000, ctx);
  assert.equal(op._wave1, true, 'ровно в момент второй волны — ушла');
});

test('applyInfluence: по истечении общего окна (dur) масштаб источника и цели сбрасывается к 1, не остаётся «застрявшим»', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 2, waveGap: 2000, waveTravel: 500 };
  const dur = 2500; // (2-1)*2000 + 500

  applyInfluence(op, 660, ctx); // цель на пике пульса
  assert.notEqual(cubes[2].mesh.scale.x, 1);

  applyInfluence(op, dur + 1, ctx);
  assert.equal(cubes[1].mesh.scale.x, 1, 'источник сброшен после dur');
  assert.equal(cubes[2].mesh.scale.x, 1, 'цель сброшена после dur');
});

test('applyInfluence: группа источников (>=2) — рамка создаётся (заход 9, «объединить АС»)', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: [1, 2], to: 3, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000 };

  applyInfluence(op, 500, ctx);
  assert.ok(op._frameEl, 'группа из двух источников должна получить рамку');
  assert.ok(
    ctx.labelsEl._appended.some(el => el.className === 'slot-group-frame'),
    'рамка реально добавлена в labelsEl'
  );
});

test('applyInfluence: одиночный источник — рамка НЕ создаётся (нечего объединять)', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000 };

  applyInfluence(op, 500, ctx);
  assert.equal(op._frameEl, undefined, 'один источник — рамки быть не должно');
});

test('applyInfluence: frameSignal:gold — рамка создаётся ДАЖЕ у одиночного источника (часть слова, требующая вриддхи, подчёркивается всегда)', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000, frameSignal: 'gold' };

  applyInfluence(op, 500, ctx);
  assert.ok(op._frameEl, 'frameSignal форсирует рамку даже при одном источнике');
  assert.match(op._frameEl.style.background, /232,200,96/, 'цвет рамки — GOLD_RGB, не нейтральный GROUP_RGB');
});

test('applyInfluence: frameSignal:silver — та же логика форсирования, серебряный цвет рамки', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 2, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000, frameSignal: 'silver' };

  applyInfluence(op, 500, ctx);
  assert.ok(op._frameEl, 'frameSignal форсирует рамку даже при одном источнике');
  assert.match(op._frameEl.style.background, /205,211,217/, 'цвет рамки — SILVER_RGB');
});

test('applyInfluence: без frameSignal — цвет рамки нейтральный GROUP_RGB, поведение групп не изменилось', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: [1, 2], to: 3, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000 };

  applyInfluence(op, 500, ctx);
  assert.match(op._frameEl.style.background, /226,217,190/, 'без frameSignal — прежний нейтральный GROUP_RGB');
});

test('applyInfluence: непрерывная текстурная пульсация (заход 43) — материал источника подменяется на время ringHoldDur, возвращается к matsMain после', () => {
  const cubes = { 1: makeCube(1), 2: makeCube(2), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: [1, 2], to: 3, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000, ringPulsePeriod: 1000 };

  applyInfluence(op, 500, ctx);
  assert.equal(cubes[1].mesh.material, cubes[1]._pulsingMats, 'во время ringHoldDur источник держит пульсирующий материал');
  assert.notEqual(cubes[1]._pulsingMats, cubes[1].matsMain, 'пульсирующий материал — КОПИЯ, не сам matsMain');
  assert.equal(cubes[1]._pulsingMats[0], 'm0', 'остальные грани копии не тронуты');

  applyInfluence(op, 2100, ctx); // за пределами ringHoldDur
  assert.equal(cubes[1].mesh.material, cubes[1].matsMain, 'по истечении ringHoldDur — возврат к истинному matsMain (та же ссылка)');
});

test('applyInfluence: op.ringRgb — переопределяет цвет кольца на грани источника (rule1/rule2: общий тон на обе стороны взаимной пары, не свой фонетический цвет у каждой)', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 3, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000, ringRgb: '160,160,160' };

  applyInfluence(op, 500, ctx);
  const strokeStyle = cubes[1]._pulseFace.canvas.getContext('2d').strokeStyle;
  assert.match(strokeStyle, /160,160,160/, 'кольцо рисуется явно переданным ringRgb, не собственным фонетическим цветом источника');
});

test('applyInfluence: без op.ringRgb — прежнее поведение (собственный фонетический цвет единственного источника), ни один существующий пример не сломан', () => {
  const cubes = { 1: makeCube(1), 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'influence', from: 1, to: 3, start: 0, waveCount: 1, waveTravel: 50, ringHoldDur: 2000 };

  applyInfluence(op, 500, ctx);
  const strokeStyle = cubes[1]._pulseFace.canvas.getContext('2d').strokeStyle;
  assert.doesNotMatch(strokeStyle, /160,160,160/, 'без переопределения ringRgb остаётся собственным (не тем магическим тестовым значением)');
});
