// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — фабрика кубика: геометрия, материалы, тень.
// Часть модульного разбиения slot-engine.js (Стадия 5) — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from './chalk-module.js';
import { CUBE_SIZE, READY_COLOR, SILVER_COLOR, colorFor } from './slot-engine-core.js';

const FLOOR_Y = -CUBE_SIZE / 2; // уровень пола — там, где нижняя грань кубика касается земли в покое
let _shadowTex = null; // общая на все кубики, создаётся один раз при первом использовании

/* ═══════════════════ КУБИК ═══════════════════
   Каждый кубик хранит НЕСКОЛЬКО готовых наборов материалов (не перерисовывает
   текстуру на лету) — тот же приём, что в rule3-agnayas.js: заранее собранный
   «пустой» вариант (без буквы, для момента вращения) и «ready»-вариант
   (READY_COLOR, для финальной волны), плюс «сигнальный» (SIGNAL_COLOR, для
   влияния/подхода). Все четыре набора ПЕРЕСОБИРАЮТСЯ заново в момент, когда
   кубик реально меняет букву (см. applyTransform) — иначе они держат глиф,
   с которым кубик родился, даже после того как он стал другой буквой. */
function makeShadow() {
  if (!_shadowTex) _shadowTex = makeShadowBlobTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(CUBE_SIZE * 1.6, CUBE_SIZE * 1.6),
    new THREE.MeshBasicMaterial({ map: _shadowTex, transparent: true, depthWrite: false, fog: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, FLOOR_Y + 0.01, 0.05);
  return shadow;
}

function buildMatSet(tr, color, seed) {
  const matsMain   = buildChalkMaterials(color, seed, tr);
  const matsBlank  = buildChalkMaterials(color, seed + 1, null);
  const matsReady  = buildChalkMaterials(READY_COLOR, seed + 2, tr);
  const matsSignal = buildChalkMaterials(SILVER_COLOR, seed + 3, tr);
  [matsMain, matsBlank, matsReady, matsSignal].forEach(mats => mats.forEach(m => { m.transparent = true; }));
  return { matsMain, matsBlank, matsReady, matsSignal };
}

export function makeCube(tr, seed) {
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const color = colorFor(tr);
  const { matsMain, matsBlank, matsReady, matsSignal } = buildMatSet(tr, color, seed);
  const mesh = new THREE.Mesh(geo, matsMain);
  const shadow = makeShadow();
  return { tr, mesh, shadow, seed, matsMain, matsBlank, matsReady, matsSignal, _settled: false };
}

/* Пересобрать все наборы материалов кубика под НОВУЮ букву/цвет — вызывать
   в момент, когда кубик реально становится другой буквой (transform), чтобы
   matsSignal/matsReady/matsBlank не оставались с исходным, уже неактуальным
   глифом. Общая утилита, не частность конкретной операции. */
export function regenMats(cube, newTr, newColor) {
  const color = newColor ?? colorFor(newTr);
  const { matsMain, matsBlank, matsReady, matsSignal } = buildMatSet(newTr, color, cube.seed + 10);
  cube.matsMain = matsMain;
  cube.matsBlank = matsBlank;
  cube.matsReady = matsReady;
  cube.matsSignal = matsSignal;
  cube.tr = newTr;
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
