// Тесты РЕАЛЬНО импортированной applyBud — новая операция («отпочкование»),
// первый реальный тест гэпа DOUBLE (геминация, rule61: n→nn). Зеркало
// applyMerge: источник остаётся на месте и вспыхивает В МОМЕНТ ПОЯВЛЕНИЯ
// клона (не в момент контакта, как у merge), клон появляется РОВНО на
// позиции источника и едет по прямой (easeOutBack) в свой слот. Клон
// строится через РЕАЛЬНУЮ makeCube (canvasStub покрывает то, что нужно
// chalk-module.js) — источник же, как и в тестах applyMerge/applySplit,
// минимальный фейковый объект с массивом материалов (нужен для
// .material.forEach — вспышка/спад на источнике).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { applyBud, slotX } from '../docs/app/lib/slot-engine.js';

function makeFakeMaterial() {
  return { emissive: { setHex() {} }, emissiveIntensity: 0 };
}
function makeSourceCube(slot, tr = 'n') {
  const mesh = new THREE.Object3D();
  mesh.position.set(slotX(slot), 0, 0);
  mesh.material = Array.from({ length: 6 }, makeFakeMaterial);
  const shadow = new THREE.Object3D();
  return { tr, mesh, shadow };
}

function makeCtx(cubes) {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  const added = [];
  const created = [];
  return {
    cubes,
    camera,
    scene: { add(o) { added.push(o); } },
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { created.push(el); } },
    added, created,
  };
}

test('applyBud: несуществующий источник — тихо ничего не делает, не падает', () => {
  const ctx = makeCtx({});
  assert.doesNotThrow(() => applyBud({ type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 0 }, 100, ctx));
});

test('applyBud: клон появляется РОВНО на позиции источника в момент старта — визуально ещё не отделился', () => {
  const cubes = { 2: makeSourceCube(2) };
  const ctx = makeCtx(cubes);
  applyBud({ type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000 }, 1000, ctx);
  assert.ok(cubes[3], 'клон зарегистрирован в cubes по целевому слоту');
  // easeOutBackProgress(0) — не строго 0 из-за арифметики с плавающей
  // точкой (Math.pow), сравнение с допуском, не строгое equal.
  assert.ok(Math.abs(cubes[3].mesh.position.x - slotX(2)) < 1e-9, 'x клона в момент появления совпадает с источником, не с целевым слотом');
});

test('applyBud: источник вспыхивает (scale+emissive) РОВНО в момент появления клона', () => {
  const cubes = { 2: makeSourceCube(2) };
  const ctx = makeCtx(cubes);
  applyBud({ type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000 }, 1000, ctx);
  assert.equal(cubes[2].mesh.scale.x, 1.35, 'масштаб источника скачком на пике сразу при появлении клона');
  assert.equal(cubes[2].mesh.material[0].emissiveIntensity, 0.9, 'свечение источника на пике сразу при появлении клона');
});

test('applyBud: вспышка источника плавно спадает независимо от прогресса полёта клона', () => {
  const cubes = { 2: makeSourceCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000, dur: 1200, flashDecay: 600 };
  applyBud(op, 1000, ctx); // момент появления
  applyBud(op, 1300, ctx); // на середине спада вспышки, клон ещё летит
  assert.ok(cubes[2].mesh.scale.x > 1 && cubes[2].mesh.scale.x < 1.35, 'масштаб источника где-то между пиком и покоем');
  assert.ok(cubes[2].mesh.material[0].emissiveIntensity > 0 && cubes[2].mesh.material[0].emissiveIntensity < 0.9);
  applyBud(op, 1700, ctx); // после flashDecay
  assert.equal(cubes[2].mesh.scale.x, 1, 'масштаб источника вернулся к 1 по завершении спада');
  assert.equal(cubes[2].mesh.material[0].emissiveIntensity, 0, 'свечение источника погасло по завершении спада');
});

test('applyBud: клон долетает ровно до целевого слота, op._done выставляется', () => {
  const cubes = { 2: makeSourceCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000, dur: 1200 };
  applyBud(op, 1000, ctx);
  applyBud(op, 1000 + 1200, ctx); // точно момент прибытия
  assert.ok(Math.abs(cubes[3].mesh.position.x - slotX(3)) < 1e-9, 'x клона точно на целевом слоте (easeOutBackProgress(1)===1)');
  assert.equal(op._done, true);
});

test('applyBud: клон получает ТОТ ЖЕ глиф, что источник (настоящая геминация) — движок не делает ничего особого для одинаковых toGlyph', () => {
  const cubes = { 2: makeSourceCube(2, 'n') };
  const ctx = makeCtx(cubes);
  applyBud({ type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000 }, 1000, ctx);
  assert.equal(cubes[3].tr, 'n');
  assert.equal(cubes[2].tr, 'n', 'источник не тронут — тот же звук, что и был');
});

test('applyBud: label — пилюля создаётся один раз, длительность dur+flashDecay, positioning передан (labelY/labelX)', () => {
  const cubes = { 2: makeSourceCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000, dur: 1200, flashDecay: 600, label: 'геминация', labelY: 2.7, labelX: -0.2 };
  applyBud(op, 1000, ctx);
  applyBud(op, 1050, ctx); // ещё один кадр — пилюля не должна создаться повторно
  // ctx.created держит ВСЁ, что уходит через labelsEl.appendChild — на том
  // же кадре spawnPulseRing тоже кладёт туда кольцо, фильтруем по классу.
  const pills = ctx.created.filter(el => el.className === 'slot-label-pill');
  assert.equal(pills.length, 1, 'ровно одна пилюля, не по одной на кадр');
  assert.equal(pills[0].style['--label-dur'], '1800ms', 'dur(1200)+flashDecay(600)=1800');
});

test('applyBud: source не двигается по x — только клон', () => {
  const cubes = { 2: makeSourceCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'bud', from: 2, to: 3, toGlyph: 'n', start: 1000, dur: 1200 };
  applyBud(op, 1000, ctx);
  applyBud(op, 1600, ctx);
  assert.equal(cubes[2].mesh.position.x, slotX(2), 'источник остаётся на своём месте весь путь');
});
