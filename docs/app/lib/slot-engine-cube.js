// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — фабрика кубика: геометрия, материалы, тень.
// Часть модульного разбиения slot-engine.js (Стадия 5) — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from './chalk-module.js';
import { CUBE_SIZE, READY_COLOR, SILVER_COLOR, SIGNAL_COLOR, colorFor } from './slot-engine-core.js';

/** @typedef {import('./slot-engine-types.js').Cube} Cube */

const FLOOR_Y = -CUBE_SIZE / 2; // уровень пола — там, где нижняя грань кубика касается земли в покое

// Форма кубика и форма плоскости тени ОДИНАКОВЫ у всех кубиков (размер
// фиксированный, CUBE_SIZE один на весь движок) — общая геометрия строится
// ЛЕНИВО один раз при первом обращении и переиспользуется всеми кубиками
// всех примеров, а не пересчитывается заново под каждый. Общие ресурсы —
// НЕ уничтожаются при unmount() отдельного примера (см. isSharedResource
// ниже, используется в slot-engine-mount.js), они принадлежат странице
// целиком, не одному показу.
let _cubeGeo = null;
let _shadowGeo = null;
let _shadowTex = null; // общая на все кубики, создаётся один раз при первом использовании

function getCubeGeo() {
  if (!_cubeGeo) _cubeGeo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  return _cubeGeo;
}
function getShadowGeo() {
  if (!_shadowGeo) _shadowGeo = new THREE.PlaneGeometry(CUBE_SIZE * 1.6, CUBE_SIZE * 1.6);
  return _shadowGeo;
}

// Проверка «это один из общих, разделяемых между ВСЕМИ показами ресурсов»
// — вызывающий код (unmount в slot-engine-mount.js) обходит сцену и
// уничтожает всё найденное, но общие геометрию/текстуру уничтожать нельзя:
// они нужны следующему показу примера, а модульный кеш (_cubeGeo и т.д.)
// не узнáет, что его содержимое стало нерабочим, и продолжит отдавать уже
// уничтоженный объект.
export function isSharedResource(obj) {
  return obj === _cubeGeo || obj === _shadowGeo || obj === _shadowTex;
}

function makeShadow() {
  if (!_shadowTex) _shadowTex = makeShadowBlobTexture();
  const shadow = new THREE.Mesh(
    getShadowGeo(),
    new THREE.MeshBasicMaterial({ map: _shadowTex, transparent: true, depthWrite: false, fog: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, FLOOR_Y + 0.01, 0.05);
  return shadow;
}

// Уничтожает один набор материалов (6 граней) — безопасно для чего угодно:
// пропускает элементы без настоящего .dispose (например заглушки в тестах,
// которые подсовывают простые строки/объекты вместо реальных материалов).
// Экспортирована — нужна ops.js для очистки временного набора
// buildOpposingFaceMaterials (см. applyTransform, landsOnOppositeFace).
export function disposeMatSet(mats) {
  if (!Array.isArray(mats)) return;
  mats.forEach(m => {
    if (m && typeof m.dispose === 'function') {
      if (m.map && typeof m.map.dispose === 'function') m.map.dispose();
      m.dispose();
    }
  });
}

function buildOneMatSet(color, seed, glyph) {
  const mats = buildChalkMaterials(color, seed, glyph);
  mats.forEach(m => { m.transparent = true; });
  return mats;
}

/* Свойство-«слот» набора материалов на кубике (matsMain/matsBlank/matsReady/
   matsSignal/matsGold) — геттер/сеттер, не голое поле:
     - ЧТЕНИЕ без lazyBuilder — просто возвращает уже сохранённое значение
       (matsMain, всегда собран заранее, лениво строить нечего).
     - ЧТЕНИЕ с lazyBuilder (matsBlank/matsReady/matsSignal/matsGold) — строит набор
       ТОЛЬКО при первом реальном обращении, не заранее «про запас». Кубик,
       который ни разу за пример не показывает этот вариант (не участвует
       в transform/settle), никогда не платит за его постройку.
     - ЗАПИСЬ — уничтожает предыдущий набор (текстуры+материалы) ПЕРЕД тем,
       как сохранить новый: раньше regenMats просто перезаписывал поля
       новыми массивами, оставляя старые текстуры висеть в памяти без
       единой ссылки на них при каждом превращении буквы — реальная утечка,
       не гипотетическая (найдена и исправлена в этом же заходе). */
function defineMatsSlot(cube, key, lazyBuilder) {
  const backing = '_' + key;
  Object.defineProperty(cube, key, {
    configurable: true,
    enumerable: true,
    get() {
      if (this[backing] === undefined && lazyBuilder) this[backing] = lazyBuilder(this);
      return this[backing];
    },
    set(value) {
      if (this[backing] !== undefined && this[backing] !== value) disposeMatSet(this[backing]);
      this[backing] = value;
    },
  });
}

/** @param {string} tr @param {number} seed @returns {Cube} */
export function makeCube(tr, seed) {
  const color = colorFor(tr);
  // Приведение типа, не рантайм-присваивание: mesh/shadow/matsMain
  // реально появляются на cube несколькими строками ниже (через прямое
  // присваивание и defineMatsSlot/Object.defineProperty) — здесь только
  // объявляем итоговую форму заранее, чтобы tsc проверял ЭТИ присваивания
  // на совместимость с Cube, не выводил тип из одного неполного литерала.
  /** @type {Cube} */
  const cube = /** @type {any} */ ({ tr, color, seed, _settled: false });
  defineMatsSlot(cube, 'matsMain', null); // всегда эагерно — нужен сразу, как только кубик падает
  defineMatsSlot(cube, 'matsReady', c => buildOneMatSet(READY_COLOR, c.seed + 2, c.tr));
  defineMatsSlot(cube, 'matsSignal', c => buildOneMatSet(SILVER_COLOR, c.seed + 3, c.tr));
  // Золото — вриддхи, тот же приём, что серебро/гунация (см. CLAUDE.md,
  // реестр зарезервированных значений). Пока плоская заливка, как и
  // серебро — металлический вариант (buildMetallicMaterials в
  // chalk-module.js) отложен: правильный envMap-подбор требует живой
  // визуальной обратной связи в реальном времени, не подходит для
  // пошагового скриншот-цикла. Переключить оба на металл будет ЛЕГКО
  // (одна замена buildOneMatSet → buildMetallicMaterials с renderer),
  // сама структура — уже готова, просто заливка временно плоская.
  defineMatsSlot(cube, 'matsGold', c => buildOneMatSet(SIGNAL_COLOR, c.seed + 4, c.tr));
  defineMatsSlot(cube, 'matsBlank', c => buildOneMatSet(c.color, c.seed + 1, null));
  cube.matsMain = buildOneMatSet(color, seed, tr);
  cube.mesh = new THREE.Mesh(getCubeGeo(), cube.matsMain);
  cube.shadow = makeShadow();
  return cube;
}

/* Кубик становится НОВОЙ буквой/цветом (transform/merge) — matsMain
   пересобирается сразу (нужен немедленно, буква уже видна на грани),
   matsBlank/matsReady/matsSignal/matsGold просто СБРАСЫВАЮТСЯ (через сеттер
   выше — старые при этом уничтожаются) и лениво пересоберутся под НОВУЮ
   букву при следующем реальном обращении, не раньше. */
/** @param {Cube} cube @param {string} newTr @param {number} [newColor] */
export function regenMats(cube, newTr, newColor) {
  const color = newColor ?? colorFor(newTr);
  cube.seed += 10;
  cube.tr = newTr;
  cube.color = color;
  cube.matsMain = buildOneMatSet(color, cube.seed, newTr);
  cube.matsBlank = undefined;
  cube.matsReady = undefined;
  cube.matsSignal = undefined;
  cube.matsGold = undefined;
}

/* Тень уменьшается и тускнеет с высотой кубика над полом (минимум 0.35 —
   никогда не исчезает совсем даже высоко в воздухе), плюс учитывает текущую
   прозрачность самого кубика (бледный кубик — бледная тень). Отдельно
   гаснет пропорционально глубине ПОД полом (кубик уходит вниз, elide) —
   heightAbove=Math.max(0,y-FLOOR_Y) сама по себе верна только для движения
   вверх: без отдельного belowK отрицательная разница обнулялась бы, и
   формула читала бы «глубоко под полом» как «ровно на полу» (heightK=1,
   тень оставалась бы в полный размер, зависшей на месте, пока кубик
   реально уходит вниз). Тень пропадает полностью ещё до того, как кубик
   успевает уйти далеко вниз. */
/** @param {Cube} cube */
export function updateShadow(cube) {
  cube.shadow.position.x = cube.mesh.position.x + 0.08;
  cube.shadow.position.z = cube.mesh.position.z + 0.05;
  const heightAbove = Math.max(0, cube.mesh.position.y - FLOOR_Y);
  const depthBelow = Math.max(0, FLOOR_Y - cube.mesh.position.y);
  const heightK = Math.max(0.35, 1 - heightAbove * 0.14);
  const belowK = Math.max(0, 1 - depthBelow * 1.6); // гаснет полностью к глубине ~0.6 под полом
  const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
  const matOpacity = mats[0].opacity ?? 1;
  cube.shadow.visible = cube.mesh.visible && belowK > 0;
  cube.shadow.scale.setScalar(heightK);
  cube.shadow.material.opacity = heightK * matOpacity * belowK;
}
