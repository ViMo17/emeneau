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
    color: 0xA8D878, // нужен buildOpposingFaceMaterials (landsOnOppositeFace) — реальный canvas через installCanvasStub
    seed: slot * 100, // regenMats использует cube.seed — без него NaN, не крашится, но нечестно
    mesh,
    matsMain: 'matsMain',
    matsBlank: 'matsBlank',
    matsSignal: 'matsSignal',
    matsGold: 'matsGold',
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

test('applyTransform: категория vargaPair (k→g) — обе буквы нанесены ДО начала вращения, 180° за 1800мс, без перерисовки на середине пути', () => {
  // ОБНОВЛЕНО: раньше (до фикса «противолежащая грань») кубик показывал
  // нейтральный matsBlank всё вращение, а глиф менялся через regenMats на
  // середине пути (t>=0.15) — по прямому наблюдению пользователя это
  // выглядело как «буква пропадает, потом внезапно появляется после
  // конца вращения», а не «видна сбоку, затем становится лицевой». Теперь
  // — buildOpposingFaceMaterials наносит ТЕКУЩУЮ букву на лицевую грань
  // (idx4) и БУДУЩУЮ на противолежащую (idx5) СРАЗУ, до первого кадра
  // вращения — regenMats(cube.tr) откладывается до самого приземления
  // (там уже неважно для картинки, нужно только для будущих операций на
  // этом же кубике). Длительность — 1800мс (не spinTurns×MS_PER_360=700),
  // сверено с эталоном (docs/effects/rule-assimilation-varga-t-d.html).
  const cubes = { 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 3, toGlyph: 'g', start: 1000, ...TRANSFORM_KIND.vargaPair };
  const anticipateDur = 900; // дефолт
  const dur = 1800; // дефолт для landsOnOppositeFace, НЕ spinTurns×MS_PER_360
  const activeStart = 1000 + anticipateDur;

  applyTransform(op, activeStart, ctx); // ровно момент конца паузы — старт активной фазы
  assert.equal(cubes[3].mesh.scale.x, 1, 'пульс масштабом снят к началу активной фазы');
  assert.notEqual(cubes[3].mesh.material, cubes[3].matsBlank, 'landsOnOppositeFace НЕ использует matsBlank вообще');
  assert.equal(cubes[3].mesh.material, cubes[3]._oppositeMats, 'на старте активной фазы — уже смонтирован набор с обеими буквами');
  assert.equal(cubes[3].tr, 'k', 'cube.tr ещё старый — regenMats откладывается до приземления');

  applyTransform(op, activeStart + dur * 0.5, ctx); // середина вращения (90°)
  assert.equal(cubes[3].mesh.material, cubes[3]._oppositeMats, 'материал не меняется в течение всего вращения — обе буквы уже на месте');
  assert.equal(cubes[3].tr, 'k', 'глиф внутри cube.tr МЕНЯЕТСЯ только при приземлении, не на середине пути (в отличие от целых оборотов)');
  assert.ok(Math.abs(cubes[3].mesh.rotation.y) > 0.5, 'на середине 180°-разворота угол заметно отличен от нуля');

  applyTransform(op, activeStart + dur, ctx); // точно момент завершения вращения
  assert.equal(cubes[3].tr, 'g', 'к моменту приземления regenMats уже применён');
  assert.equal(cubes[3].mesh.material, cubes[3].matsMain, 'по завершении вращения — истинный цвет (ссылка на актуальный matsMain)');
  assert.equal(cubes[3].mesh.rotation.y, 0, 'поворот сброшен в 0 по завершении');
  assert.equal(cubes[3]._oppositeMats, null, 'временный набор граней уничтожен после приземления — не висит без ссылок');
  assert.equal(op._done, undefined, 'РЕГРЕССИЯ БЫ БЫЛА ЗДЕСЬ: _done не должен выставляться сразу по завершении вращения — есть ещё пауза-фиксация (holdDur)');
});

test('applyTransform: категория vrddhi (u→au) — 720°, активная фаза переключает материал на matsGold, не matsSignal', () => {
  const cubes = { 2: makeCube(2) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 2, toGlyph: 'au', start: 1000, ...TRANSFORM_KIND.vrddhi };
  const anticipateDur = 900; // дефолт
  const activeStart = 1000 + anticipateDur;
  const dur = 2 * MS_PER_360; // spinTurns:2, обычная формула (не landsOnOppositeFace — целое число оборотов)

  applyTransform(op, activeStart, ctx);
  assert.equal(cubes[2].mesh.material, cubes[2].matsGold, 'signal:gold переключает материал на matsGold, не на matsSignal (серебро зарезервировано за гунацией)');

  applyTransform(op, activeStart + dur, ctx); // точно момент приземления
  assert.equal(cubes[2].tr, 'au', 'к моменту приземления regenMats уже применён');
  assert.equal(cubes[2].mesh.material, cubes[2].matsMain, 'по завершении вращения — истинный цвет, не золото навсегда');
});

test('applyTransform: РЕГРЕССИЯ — поворот не откатывается назад на кадрах ПОСЛЕ приземления (найдено численной симуляцией)', () => {
  // Реальный найденный баг: rotation.y пересчитывался БЕЗУСЛОВНО на каждом
  // кадре по формуле -1×easeOutCubic(t)×2π×spinTurns, где t зажат в 1
  // после окончания вращения — для 180° (spinTurns:0.5) это даёт -180°,
  // а не 0°, затирая явный сброс в блоке приземления уже на СЛЕДУЮЩЕМ
  // кадре после самого приземления. Для целых оборотов (360°/720°)
  // разница (-360°/-720° против 0°) визуально неотличима, поэтому баг
  // оставался незамеченным до категории «противолежащая грань».
  const cubes = { 3: makeCube(3) };
  const ctx = makeCtx(cubes);
  const op = { type: 'transform', at: 3, toGlyph: 'g', start: 1000, ...TRANSFORM_KIND.vargaPair };
  const rotationEnd = 1000 + 900 + 1800; // anticipateDur + dur(landsOnOppositeFace)

  applyTransform(op, rotationEnd, ctx); // момент приземления
  assert.equal(cubes[3].mesh.rotation.y, 0, 'поворот сброшен на самом кадре приземления');

  applyTransform(op, rotationEnd + 1, ctx); // СЛЕДУЮЩИЙ кадр — именно здесь была регрессия
  assert.equal(cubes[3].mesh.rotation.y, 0, 'поворот НЕ должен откатываться назад на следующем кадре');

  applyTransform(op, rotationEnd + 500, ctx); // где-то в середине паузы-фиксации
  assert.equal(cubes[3].mesh.rotation.y, 0, 'поворот остаётся нулевым на протяжении всей паузы-фиксации');
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
