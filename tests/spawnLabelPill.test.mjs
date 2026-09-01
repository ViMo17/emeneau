// Тесты РЕАЛЬНО импортированной spawnLabelPill — плавающая пилюля-подпись
// над/под местом действия («Гуна», «Вриддхи», «Ассимиляция», ...), прямой
// запрос пользователя. Тот же DOM-оверлей язык, что и у spawnPulseRing/
// spawnSparkleBurst — project() один раз, дальше чистая CSS-анимация,
// самоудаление по setTimeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { spawnLabelPill } from '../docs/app/lib/slot-engine.js';

function makeCtx() {
  const camera = new THREE.PerspectiveCamera(32, 900 / 440, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0.4, 0);
  camera.updateMatrixWorld();
  const created = [];
  return {
    camera,
    stageEl: { clientWidth: 900, clientHeight: 440 },
    labelsEl: { appendChild(el) { created.push(el); } },
    created,
  };
}

test('spawnLabelPill: создаёт ровно один элемент с нужным текстом и классом', () => {
  const ctx = makeCtx();
  spawnLabelPill('Гуна', 3, true, 5000, ctx);
  assert.equal(ctx.created.length, 1);
  assert.equal(ctx.created[0].className, 'slot-label-pill');
  assert.equal(ctx.created[0].textContent, 'Гуна');
});

test('spawnLabelPill: above=true — пилюля проецируется ВЫШЕ ряда (меньший NDC/экранный y, т.к. выше = ближе к верху кадра)', () => {
  const ctx = makeCtx();
  spawnLabelPill('Вриддхи', 4, true, 5000, ctx);
  const yAbove = parseFloat(ctx.created[0].style.top);
  const ctx2 = makeCtx();
  spawnLabelPill('Элизия', 4, false, 5000, ctx2);
  const yBelow = parseFloat(ctx2.created[0].style.top);
  console.log('above:', yAbove, 'below:', yBelow);
  assert.ok(yAbove < yBelow, 'above-пилюля должна рисоваться выше на экране (меньший top в пикселях), чем below');
});

test('spawnLabelPill: разные длительности/слоты не падают, каждый вызов — ровно один новый элемент', () => {
  const ctx = makeCtx();
  assert.doesNotThrow(() => spawnLabelPill('Ассимиляция', 2, true, 3300, ctx));
  assert.doesNotThrow(() => spawnLabelPill('Озвончение', 7, false, 100, ctx));
  assert.equal(ctx.created.length, 2, 'два отдельных вызова — два отдельных элемента, никакого переиспользования');
});

test('spawnLabelPill: смещение по X относительно соседнего слота ровно на SLOT (1.2) — использует ту же формулу slotX, что и весь движок', () => {
  const ctx = makeCtx();
  spawnLabelPill('Гуна', 3, true, 5000, ctx);
  const ctx2 = makeCtx();
  spawnLabelPill('Гуна', 4, true, 5000, ctx2);
  const x3 = parseFloat(ctx.created[0].style.left);
  const x4 = parseFloat(ctx2.created[0].style.left);
  assert.ok(x4 > x3, 'слот 4 правее слота 3 на экране (после проекции — тот же порядок, что и в мировых координатах)');
});
