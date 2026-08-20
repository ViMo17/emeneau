// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — один движок + данные на правило, вместо файла на каждый пример.
// ═══════════════════════════════════════════════════════════════════════════
//
// ТРЕБОВАНИЕ К ВЫЗЫВАЮЩЕЙ СТРАНИЦЕ (движок сам вёрстку не задаёт, как и
// rule3-agnayas.js не задаёт CSS для #anim-wrap — это забота контейнера):
// у элемента-контейнера, переданного в mountSlotExample(), должен быть explicit
// canvas-селектор вида `#контейнер canvas { display:block; width:100%; height:100%; }`
// — без него канвас держится дефолтного браузерного размера (~300×150px),
// родительский div со своими width:100%/height:100% размер канвасу САМ не
// передаёт. Поймано на первом же локальном тесте — экран был пуст именно
// по этой причине, не из-за логики самого движка.
//
// Принцип (зафиксирован в чате и в second-examples-todo.md):
//  · Один кубик = один ЗВУК (сегмент), не деванагари-буква. Обоснование — в
//    предисловии приложения («Почему звук, а не буква деванагари»).
//  · Ряд — 10 слотов, фиксированная камера, без адаптации под длину примера
//    (дешевле всего по ресурсам — ноль дополнительного кода на переразмер).
//  · Правила 61, 62, 64, 65 — сознательно не переводятся в 3D, слишком длинные
//    даже в лучшей из двух версий примера, остаются только на 2D.
//  · Операции — конечный список алгоритмов, каждый берёт 1–4 соседних слота.
//    Пример = данные (какие слоты чем заняты + список операций), не код.
//
// Материал/геометрия кубика — не здесь, берутся из уже готового chalk-module.js.

import * as THREE from 'three';
import { buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from './chalk-module.js';

export const N_SLOTS = 10;
export const CUBE_SIZE = 1.1;
export const SLOT = 1.2;
export const MS_PER_360 = 3600; // та же эталонная скорость, что и у ассимиляции (t+dh)

/* ═══════════════════ ТОКЕНИЗАТОР ═══════════════════
   Один кубик = один звук. Придыхательные (kh,gh,ch,jh,ṭh,ḍh,th,dh,ph,bh) и
   дифтонги (ai,au) — двухбуквенные в IAST, но один звук, один кубик, не
   разбиваются. Согласный без гласной после него — голая буква на кубике.
   Гласная после согласного — всегда отдельный кубик, даже слитная на письме. */
const TWO_CHAR = new Set([
  'kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh', // придыхательные
  'ai','au'                                          // дифтонги
]);
const ONE_CHAR = new Set('āīūṛṝḷaeiou' + 'kgṅcjñṭḍṇtdnpbmyrlvśṣsh' + 'ṃḥ');

export function tokenize(word) {
  const clean = word.replace(/[-']/g, '');
  const cubes = [];
  let i = 0;
  while (i < clean.length) {
    const two = clean.slice(i, i + 2);
    if (TWO_CHAR.has(two)) { cubes.push(two); i += 2; continue; }
    const one = clean[i];
    if (ONE_CHAR.has(one)) cubes.push(one);
    i += 1;
  }
  return cubes;
}

/* ═══════════════════ ГЕОМЕТРИЯ РЯДА ═══════════════════
   Фиксированные 10 слотов, центр между слотами 4 и 5 (индексы 0..9).
   Контент каждого примера центрируется в данных (см. centerSlots ниже),
   не в рантайме — камера сама никогда не адаптируется, это и есть та
   самая экономия ресурсов, о которой договорились. */
export function slotX(i) { return (i - (N_SLOTS - 1) / 2) * SLOT; }

/* Утилита для автора данных примера — посчитать, с какого слота центрировать
   N букв в ряду из 10, ПЕРЕД тем как вручную прописывать initial (см. ниже).
   Не используется движком в рантайме — это калькулятор для этапа подготовки
   данных, не часть самого проигрывания. */
export function centerSlots(letters, startAt = null) {
  const n = letters.length;
  const start = startAt !== null ? startAt : Math.floor((N_SLOTS - n) / 2);
  return letters.map((tr, i) => ({ slot: start + i, tr }));
}

/* ═══════════════════ ЦВЕТА ПО МЕСТУ ОБРАЗОВАНИЯ ═══════════════════
   Та же палитра, что уже используется в 2D-алфавите приложения — не
   изобретаю новую, преемственность важнее оригинальности здесь. */
export const COL_VEL = 0xA8D878, COL_PAL = 0x7DCFCA, COL_RET = 0xC5B0D8,
             COL_DEN = 0xE8A8C0, COL_LAB = 0xF0BF88, COL_DIM = 0xEDE8D8;

function colorFor(tr) {
  const c = tr[0];
  if ('kgṅ'.includes(c) || tr === 'kh' || tr === 'gh') return COL_VEL;
  if ('cjñyśh'.includes(c) || tr === 'ch' || tr === 'jh' || tr === 'ai') return COL_PAL;
  if ('ṭḍṇr ṣ'.includes(c) || tr === 'ṭh' || tr === 'ḍh') return COL_RET;
  if ('tdnlsṃ'.includes(c) || tr === 'th' || tr === 'dh') return COL_DEN;
  if ('pbmv'.includes(c) || tr === 'ph' || tr === 'bh' || tr === 'au') return COL_LAB;
  return COL_DIM;
}

/* ═══════════════════ РЕНДЕР ОДНОГО КУБИКА ═══════════════════ */
function makeCube(tr, seed) {
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const mats = buildChalkMaterials(colorFor(tr), seed, tr);
  const mesh = new THREE.Mesh(geo, mats);
  return { tr, mesh, seed };
}

/* ═══════════════════ ДВИЖОК: mount/unmount по данным примера ═══════════════════
   data = {
     letters: ['a','g','n','i','a','s'],   // из tokenize(), до всех операций
     startAt: null,                        // либо число — где начинается слово в ряду
     ops: [                                // список операций, в порядке времени
       { type:'recolor', at:3, toGlyph:'e', toColor:COL_PAL, start:1000, dur:null },
       { type:'split', at:3, into:['a','y'], start:3000, dur:null },
     ]
   }
   dur:null у recolor/turn — берётся из MS_PER_360 автоматически (для recolor
   длительность не нужна вовсе, это мгновенная смена в момент start). */
/* ═══════════════════ ДВИЖОК: mount/unmount по данным примера ═══════════════════
   data = {
     initial: [{slot:0,tr:'a'},{slot:1,tr:'g'},{slot:2,tr:'n'},{slot:3,tr:'i'},
               {slot:5,tr:'a'},{slot:6,tr:'s'}],  // слот 4 НАРОЧНО пропущен —
                                                    // под будущий split, план
                                                    // слотов считает автор данных
                                                    // заранее (см. centerSlots
                                                    // как калькулятор), не движок.
     ops: [
       { type:'recolor', at:3, toGlyph:'e', toColor:COL_PAL, start:1000 },
       { type:'split', at:3, into:['a','y'], newSlot:4, start:3000, dur:1800 },
     ]
   } */
export function mountSlotExample(container, data) {
  container.innerHTML = `<div class="slot-stage" style="width:100%;height:100%;position:relative;"></div>`;
  const stageEl = container.querySelector('.slot-stage');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 3.2, 9.5);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  stageEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(3, 6, 4);
  scene.add(key);

  const cubes = {}; // slot-index → {tr, mesh, seed}
  data.initial.forEach(({ slot, tr }) => {
    const c = makeCube(tr, slot * 97 + 13);
    c.mesh.position.set(slotX(slot), 0, 0);
    scene.add(c.mesh);
    cubes[slot] = c;
  });

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stageEl);
  resize();

  const t0 = performance.now();
  let rafId = null;

  function applyOp(op, elapsed) {
    const cube = cubes[op.at];
    if (!cube) return;
    if (op.type === 'recolor') {
      if (elapsed >= op.start && !cube._done_recolor) {
        cube._done_recolor = true;
        cube.mesh.material = buildChalkMaterials(op.toColor, cube.seed, op.toGlyph);
        cube.tr = op.toGlyph;
      }
    } else if (op.type === 'split') {
      // Кубик на месте `at` распадается на два звука: сам остаётся первым
      // (op.into[0]), второй (op.into[1]) появляется в слоте op.newSlot —
      // ОБЯЗАТЕЛЬНО заранее пустом в data.initial (план слотов — забота
      // автора данных примера, не движка; коллизия с занятым слотом здесь
      // не проверяется намеренно — минимум кода, ошибка в данных должна
      // быть видна на глаз при проверке, не гаситься тихой автокоррекцией).
      const dur = op.dur || MS_PER_360 * 0.5;
      if (elapsed < op.start) return;
      if (!cube._splitStarted) {
        cube._splitStarted = true;
        cube.tr = op.into[0];
        cube.mesh.material = buildChalkMaterials(colorFor(op.into[0]), cube.seed, op.into[0]);
        const nc = makeCube(op.into[1], op.newSlot * 97 + 31);
        nc.mesh.position.set(slotX(op.at) + 0.3, 2.5, -1.5); // стартует «из-за» источника, сверху
        nc.mesh.visible = false;
        scene.add(nc.mesh);
        cubes[op.newSlot] = nc;
        cube._splitTarget = { mesh: nc.mesh, from: nc.mesh.position.clone(), to: new THREE.Vector3(slotX(op.newSlot), 0, 0), start: elapsed, dur };
      }
      const st = cube._splitTarget;
      if (st && !st.done) {
        const t = Math.max(0, Math.min(1, (elapsed - st.start) / st.dur));
        const te = 1 - Math.pow(1 - t, 3);
        st.mesh.visible = true;
        st.mesh.position.lerpVectors(st.from, st.to, te);
        st.mesh.position.y += Math.sin(t * Math.PI) * 1.0;
        if (t >= 1) st.done = true;
      }
    }
  }

  function frame(now) {
    const elapsed = now - t0;
    (data.ops || []).forEach(op => applyOp(op, elapsed));
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  function unmount() {
    resizeObserver.disconnect();
    if (rafId !== null) cancelAnimationFrame(rafId);
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    renderer.dispose();
  }

  return { unmount, replay: () => mountSlotExample(container, data) };
}
