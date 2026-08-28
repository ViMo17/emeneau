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
