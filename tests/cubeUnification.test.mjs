// Тесты РЕАЛЬНО импортированных makeCube/regenMats/isSharedResource (заход
// 64) — унификация кубика по прямому запросу пользователя: (А) форма
// кубика/тени общая на все кубики, не пересчитывается заново под каждый;
// (Б) варианты внешности (matsBlank/matsReady/matsSignal) строятся ТОЛЬКО
// при первом реальном обращении, не заранее «про запас» все четыре сразу.
//
// Тесты привязаны к конкретным, реально найденным при этой правке
// проблемам: (1) unmount() уничтожал ОБЩИЙ ресурс (геометрию/текстуру
// тени), из-за чего следующий mount() получал бы уже уничтоженный объект
// — теперь isSharedResource защищает от этого; (2) regenMats раньше
// просто перезаписывал поля новыми массивами материалов, оставляя старые
// текстуры висеть в памяти без единой ссылки — реальная утечка на КАЖДОЕ
// превращение буквы, не гипотетическая.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installCanvasStub } from './helpers/canvasStub.mjs';

installCanvasStub();

import { makeCube, regenMats, isSharedResource } from '../docs/app/lib/slot-engine-cube.js';

test('makeCube: matsMain строится сразу (эагерно) — кубик виден с первого кадра', () => {
  const cube = makeCube('k', 100);
  assert.ok(Array.isArray(cube.matsMain), 'matsMain — реальный массив материалов сразу после создания');
  assert.equal(cube.matsMain.length, 6, '6 граней BoxGeometry');
});

test('makeCube: matsBlank/matsReady/matsSignal НЕ строятся, пока не понадобились (Задача Б)', () => {
  const cube = makeCube('k', 100);
  assert.equal(cube._matsBlank, undefined, 'matsBlank не построен заранее');
  assert.equal(cube._matsReady, undefined, 'matsReady не построен заранее');
  assert.equal(cube._matsSignal, undefined, 'matsSignal не построен заранее');
});

test('makeCube: обращение к matsSignal строит его лениво РОВНО при первом чтении, дальше отдаёт тот же объект', () => {
  const cube = makeCube('k', 100);
  const first = cube.matsSignal;
  assert.ok(Array.isArray(first), 'первое чтение вернуло реальный массив материалов');
  assert.equal(cube.matsSignal, first, 'второе чтение — та же ссылка, не пересобирается заново');
});

test('makeCube: matsBlankSignal — отдельный от matsBlank набор (найденный баг — rule11: буква не была видна во время сигнальной фазы assimToNeighbor)', () => {
  const cube = makeCube('k', 100);
  assert.equal(cube._matsBlankSignal, undefined, 'matsBlankSignal тоже ленивый, не построен заранее');
  const blankSignal = cube.matsBlankSignal;
  const blank = cube.matsBlank;
  assert.ok(Array.isArray(blankSignal), 'лениво построен как реальный массив материалов');
  assert.notEqual(blankSignal, blank, 'matsBlankSignal (с буквой) — ОТДЕЛЬНЫЙ набор от matsBlank (всегда без буквы), не тот же объект');
  assert.equal(cube.matsBlankSignal, blankSignal, 'повторное чтение — та же ссылка');
});

test('makeCube: matsBlankSignal рисует букву ТОЛЬКО на idx4 (фасад), НЕ на idx5 (найденный баг — живая проверка: «n видна дважды», регрессия к поведению buildChalkMaterials)', () => {
  // Инструментируем document.createElement('canvas') на время теста —
  // считаем fillText по каждому холсту в порядке создания (0..5, тот же
  // порядок, что faces.map в chalk-module.js). Сохраняем/восстанавливаем
  // оригинал, чтобы не задеть остальные тесты этого файла.
  const originalCreateElement = globalThis.document.createElement;
  const created = [];
  globalThis.document.createElement = function (tag) {
    if (tag !== 'canvas') return originalCreateElement.call(this, tag);
    const real = originalCreateElement.call(this, tag);
    const rec = { idx: created.length, fillTextCalls: 0 };
    created.push(rec);
    const realCtx = real.getContext();
    const originalFillText = realCtx.fillText.bind(realCtx);
    realCtx.fillText = (...args) => { rec.fillTextCalls++; return originalFillText(...args); };
    return real;
  };
  try {
    const cube = makeCube('m', 42); // matsMain строится эагерно — уже создаёт 6 холстов, не относящихся к этой проверке
    created.length = 0;
    void cube.matsBlankSignal; // ленивая постройка — ровно 6 холстов, по одному на грань
    assert.equal(created.length, 6, 'по одному холсту на каждую из 6 граней BoxGeometry');
    assert.ok(created[4].fillTextCalls > 0, 'idx4 (фасад) несёт букву');
    assert.equal(created[5].fillTextCalls, 0, 'idx5 (противолежащая) — БЕЗ буквы, иначе видна дважды во время своего окна поворота');
  } finally {
    globalThis.document.createElement = originalCreateElement;
  }
});

test('makeCube: два разных кубика используют ОДНУ И ТУ ЖЕ геометрию (Задача А — общая форма)', () => {
  const cubeA = makeCube('k', 100);
  const cubeB = makeCube('a', 999); // другой глиф, другой seed
  assert.equal(cubeA.mesh.geometry, cubeB.mesh.geometry, 'геометрия кубика общая, не пересоздаётся под каждый');
  assert.equal(cubeA.shadow.geometry, cubeB.shadow.geometry, 'геометрия тени тоже общая');
});

test('isSharedResource: геометрия кубика/тени распознаётся как общий ресурс, случайный посторонний объект — нет', () => {
  const cube = makeCube('k', 100);
  assert.equal(isSharedResource(cube.mesh.geometry), true);
  assert.equal(isSharedResource(cube.shadow.geometry), true);
  assert.equal(isSharedResource({}), false, 'случайный объект не должен ложно опознаваться как общий');
  assert.equal(isSharedResource(cube.matsMain[0]), false, 'материал кубика — НЕ общий ресурс (уникален для кубика)');
});

test('regenMats: старый matsMain РЕАЛЬНО уничтожается при пересборке (заход 64, найденная утечка)', () => {
  const cube = makeCube('k', 100);
  const oldMain = cube.matsMain;
  let disposedCount = 0;
  oldMain.forEach(m => { const orig = m.dispose.bind(m); m.dispose = () => { disposedCount++; orig(); }; });

  regenMats(cube, 'g', 0x123456);

  assert.equal(disposedCount, 6, 'все 6 старых материалов matsMain должны быть уничтожены при замене');
  assert.notEqual(cube.matsMain, oldMain, 'matsMain теперь — новый массив, не тот же самый');
});

test('regenMats: старый (уже лениво построенный) matsSignal уничтожается при пересборке', () => {
  const cube = makeCube('k', 100);
  const oldSignal = cube.matsSignal; // строим лениво ДО regenMats
  let disposedCount = 0;
  oldSignal.forEach(m => { const orig = m.dispose.bind(m); m.dispose = () => { disposedCount++; orig(); }; });

  regenMats(cube, 'g', 0x123456);

  assert.equal(disposedCount, 6, 'старый matsSignal (уже был построен) должен быть уничтожен при regenMats');
});

test('regenMats: НЕ построенный (ни разу не запрошенный) matsBlank не пытается уничтожиться — не падает', () => {
  const cube = makeCube('k', 100);
  // matsBlank ни разу не читали — cube._matsBlank === undefined
  assert.doesNotThrow(() => regenMats(cube, 'g', 0x123456));
});

test('regenMats: после пересборки лениво построенный вариант отражает НОВУЮ букву, не старую', () => {
  const cube = makeCube('k', 100);
  void cube.matsSignal; // строим для старой буквы 'k', чтобы проверить, что кеш реально сбрасывается
  regenMats(cube, 'g', 0x123456);
  assert.equal(cube.tr, 'g', 'cube.tr обновлён');
  assert.equal(cube._matsSignal, undefined, 'кеш сброшен — следующее чтение пересоберёт заново');
  assert.ok(Array.isArray(cube.matsSignal), 'повторное чтение снова лениво строит (уже для новой буквы)');
});

test('regenMats: старый (уже лениво построенный) matsBlankSignal тоже сбрасывается — новое чтение строит его под НОВУЮ букву', () => {
  const cube = makeCube('k', 100);
  const oldBlankSignal = cube.matsBlankSignal; // строим лениво ДО regenMats, для старой буквы
  let disposedCount = 0;
  oldBlankSignal.forEach(m => { const orig = m.dispose.bind(m); m.dispose = () => { disposedCount++; orig(); }; });

  regenMats(cube, 'g', 0x123456);

  assert.equal(disposedCount, 6, 'старый matsBlankSignal должен быть уничтожен при regenMats, как и matsSignal/matsGold');
  assert.equal(cube._matsBlankSignal, undefined, 'кеш сброшен');
  assert.notEqual(cube.matsBlankSignal, oldBlankSignal, 'следующее чтение строит новый набор, не старую ссылку');
});
