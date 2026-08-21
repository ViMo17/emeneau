// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — один движок + данные на правило, вместо файла на каждый пример.
// ═══════════════════════════════════════════════════════════════════════════
//
// ТРЕБОВАНИЕ К ВЫЗЫВАЮЩЕЙ СТРАНИЦЕ (движок сам вёрстку не задаёт): у контейнера
// нужен explicit `#контейнер canvas { display:block; width:100%; height:100%; }`
// — без него канвас держится дефолтного браузерного размера (~300×150px).
//
// Принцип (зафиксирован в чате и в second-examples-todo.md):
//  · Один кубик = один ЗВУК, не деванагари-буква. Обоснование — в предисловии
//    приложения («Почему звук, а не буква деванагари»).
//  · Ряд — 10 слотов, фиксированная камера, без адаптации под длину примера.
//  · Правила 61, 62, 64, 65 — сознательно не переводятся в 3D, только 2D.
//  · Операции — конечный список алгоритмов, пример = данные, не код.
//
// ЭТА ВЕРСИЯ: перенесены техники из уже проверенного rule3-agnayas.js (полный
// разбор — см. чат). Взято: настоящий оборот (подскок+вращение вместе, ранняя
// смена буквы, сброс погрешности), отстойник (split честно распадается на два
// НОВЫХ прилетающих кубика, исходный уходит в сторону/бледнеет/висит и только
// потом растворяется — а не «сам становится первой половиной результата», как
// было в прошлой версии), финальная волна READY_COLOR.
//
// ОСОЗНАННО ОТЛОЖЕНО на следующий заход (см. чат, группы B/F/G/I разбора):
// волна-предупреждение по экрану до превращения, плавающие подписи у кубиков,
// фазовая (не постоянная) связь с внешней таблицей гуна, притенение фона
// неучаствующих кубиков. Не потому что не нужны — а чтобы не писать всё разом
// и суметь проверить каждую часть отдельно.
//
// Материал/геометрия кубика — не здесь, берутся из уже готового chalk-module.js.

import * as THREE from 'three';
import { buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from './chalk-module.js';

export const N_SLOTS = 10;
export const CUBE_SIZE = 1.1;
export const SLOT = 1.2;
export const MS_PER_360 = 3600; // эталонная скорость — ассимиляция (t+dh), см. чат
export const READY_COLOR = 0xDECDAF; // тот же тёплый бежевый, что и в rule3-agnayas.js
export const SIGNAL_COLOR = 0xE8C860; // «под влиянием, вот-вот изменится» — тот же золотой, что gv-active в 2D-системе ролей
const FLOOR_Y = -CUBE_SIZE / 2; // уровень пола — там, где нижняя грань кубика касается земли в покое
let _shadowTex = null; // общая на все кубики, создаётся один раз при первом использовании

/* ═══════════════════ ТОКЕНИЗАТОР ═══════════════════
   Один кубик = один звук. Придыхательные и дифтонги — двухбуквенные в IAST,
   но один звук, один кубик, не разбиваются. Согласный без гласной после него —
   голая буква. Гласная после согласного — всегда отдельный кубик. */
const TWO_CHAR = new Set([
  'kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh',
  'ai','au'
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

/* ═══════════════════ ГЕОМЕТРИЯ РЯДА ═══════════════════ */
export function slotX(i) { return (i - (N_SLOTS - 1) / 2) * SLOT; }

/* Утилита для автора данных — считает, с какого слота центрировать N букв,
   ПЕРЕД тем как вручную прописывать initial. Не используется в рантайме. */
export function centerSlots(letters, startAt = null) {
  const n = letters.length;
  const start = startAt !== null ? startAt : Math.floor((N_SLOTS - n) / 2);
  return letters.map((tr, i) => ({ slot: start + i, tr }));
}

/* ═══════════════════ ЦВЕТА ПО МЕСТУ ОБРАЗОВАНИЯ ═══════════════════ */
export const COL_VEL = 0xA8D878, COL_PAL = 0x7DCFCA, COL_RET = 0xC5B0D8,
             COL_DEN = 0xE8A8C0, COL_LAB = 0xF0BF88, COL_DIM = 0xEDE8D8;

function colorFor(tr) {
  // гласные — по традиционному месту образования (то же самое место, что и у
  // одноимённой группы согласных): a/ā гортанные, i/ī/e/ai нёбные,
  // ṛ/ṝ церебральные, ḷ зубная, u/ū/o/au губные. Раньше эта часть отсутствовала
  // вовсе — гласные проваливались в нейтральный цвет по умолчанию (отсюда были
  // «серая А» при прилёте и небеленая А в столбце — оба чинятся этим же местом).
  if (tr === 'a' || tr === 'ā') return COL_VEL;
  if (tr === 'i' || tr === 'ī' || tr === 'e' || tr === 'ai') return COL_PAL;
  if (tr === 'ṛ' || tr === 'ṝ') return COL_RET;
  if (tr === 'ḷ') return COL_DEN;
  if (tr === 'u' || tr === 'ū' || tr === 'o' || tr === 'au') return COL_LAB;
  // согласные
  const c = tr[0];
  if ('kgṅ'.includes(c) || tr === 'kh' || tr === 'gh') return COL_VEL;
  if ('cjñyś'.includes(c) || tr === 'ch' || tr === 'jh') return COL_PAL;
  if ('ṭḍṇr'.includes(c) || c === 'ṣ' || tr === 'ṭh' || tr === 'ḍh') return COL_RET;
  if ('tdnl'.includes(c) || c === 's' || tr === 'th' || tr === 'dh') return COL_DEN;
  if ('pbmv'.includes(c) || tr === 'ph' || tr === 'bh') return COL_LAB;
  return COL_DIM; // ṃ, ḥ, h — без единого места образования
}

function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) { const s = 2.4; return 1 + s * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t-=1.5/d1)*t+0.75;
  if (t < 2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
  return n1*(t-=2.625/d1)*t+0.984375;
}

/* ═══════════════════ КУБИК ═══════════════════
   Каждый кубик хранит НЕСКОЛЬКО готовых наборов материалов (не перерисовывает
   текстуру на лету) — тот же приём, что в rule3-agnayas.js: заранее собранный
   «пустой» вариант (без буквы, для момента вращения) и «ready»-вариант
   (READY_COLOR, для финальной волны). */
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

function makeCube(tr, seed) {
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const color = colorFor(tr);
  const matsMain   = buildChalkMaterials(color, seed, tr);
  const matsBlank  = buildChalkMaterials(color, seed + 1, null);
  const matsReady  = buildChalkMaterials(READY_COLOR, seed + 2, tr);
  const matsSignal = buildChalkMaterials(SIGNAL_COLOR, seed + 3, tr);
  [matsMain, matsBlank, matsReady, matsSignal].forEach(mats => mats.forEach(m => { m.transparent = true; }));
  const mesh = new THREE.Mesh(geo, matsMain);
  const shadow = makeShadow();
  return { tr, mesh, shadow, seed, matsMain, matsBlank, matsReady, matsSignal, _settled: false };
}

/* Тень уменьшается и тускнеет с высотой кубика над полом (минимум 0.35 —
   никогда не исчезает совсем даже высоко в воздухе), плюс учитывает текущую
   прозрачность самого кубика (бледный кубик — бледная тень). Тот же расчёт,
   что уже проверен в rule3-agnayas.js, перенесён без изменений. */
function updateShadow(cube) {
  cube.shadow.visible = cube.mesh.visible;
  cube.shadow.position.x = cube.mesh.position.x + 0.08;
  cube.shadow.position.z = cube.mesh.position.z + 0.05;
  const heightAbove = Math.max(0, cube.mesh.position.y - FLOOR_Y);
  const heightK = Math.max(0.35, 1 - heightAbove * 0.14);
  const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
  const matOpacity = mats[0].opacity ?? 1;
  cube.shadow.scale.setScalar(heightK);
  cube.shadow.material.opacity = heightK * matOpacity;
}

function setOpacity(mesh, val) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(m => { m.opacity = val; });
}

/* ═══════════════════ ОПЕРАЦИИ ═══════════════════

   1. TRANSFORM — превращение на месте (гуна/вриддхи/ассимиляция и т.п.).
      Подскок и оборот идут ОДНОВРЕМЕННО (не по очереди), буква на грани
      пропадает в начале оборота и наносится РАНО (около 15% пути, не в конце
      и не мгновенно) — та же хореография, что в rule3-agnayas.js.
      { type:'transform', at, toGlyph, toColor, start, spinTurns=1, bounceH=0.3 }
      Длительность НЕ вшивается — считается из spinTurns через MS_PER_360.

   2. SPLIT — распад на два звука через отстойник. Исходный кубик уходит В
      СТОРОНУ (не остаётся на месте!), поднимается, бледнеет и повисает —
      ПОКА он висит, прилетают оба результата как НОВЫЕ кубики (каждый со
      своими параметрами дуги/длительности/задержки — группа E разбора).
      Только после паузы для сравнения исходный полностью растворяется.
      { type:'split', at, start,
        holdOffset:{x,y,z}, riseDur, holdOpacity, holdDur, fadeDur,
        arrivals: [
          { into, newSlot, from:{x,y,z}, delay, dur, arcHeight },
          ...
        ] }

   3. SETTLE — финальная волна READY_COLOR слева направо по всем указанным
      слотам, с подскоком на каждом — сигнал «весь процесс завершён».
      { type:'settle', slots:[...], start, stepDelay=150, bounceDur=500 }
*/
export function mountSlotExample(container, data) {
  container.innerHTML = `<div class="slot-stage" style="width:100%;height:100%;position:relative;">
    <div class="slot-labels" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>
  </div>`;
  const stageEl = container.querySelector('.slot-stage');
  const labelsEl = container.querySelector('.slot-labels');

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 3.2, 9.5);
  camera.position.copy(camBase);
  camera.lookAt(0, 0, 0);

  function project(vec3) {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    const v = vec3.clone().project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  function spawnWave(fromVec3, toVec3, dur) {
    const pA = project(fromVec3), pB = project(toVec3);
    const ring = document.createElement('div');
    ring.className = 'slot-wave-ring';
    ring.style.left = pA.x + 'px';
    ring.style.top = pA.y + 'px';
    ring.style.setProperty('--dx', (pB.x - pA.x) + 'px');
    ring.style.setProperty('--dy', (pB.y - pA.y) + 'px');
    ring.style.setProperty('--wave-dur', dur + 'ms');
    labelsEl.appendChild(ring);
    setTimeout(() => ring.remove(), dur + 80);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  stageEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(3, 6, 4);
  scene.add(key);

  const cubes = {}; // slot-index → кубик
  const fallOrder = data.initial.map(x => x.slot).sort((a, b) => a - b);
  data.initial.forEach(({ slot, tr }) => {
    const c = makeCube(tr, slot * 97 + 13);
    c.mesh.position.set(slotX(slot), 6 + Math.random() * 2, 0); // старт высоко, с разбросом
    c._fallStart = fallOrder.indexOf(slot) * (data.fallStagger ?? 200);
    c._fallDur = data.fallDur ?? 900;
    c._fallDone = false;
    scene.add(c.mesh);
    scene.add(c.shadow);
    cubes[slot] = c;
  });

  function fallY(elapsed, cube) {
    const t = clamp01((elapsed - cube._fallStart) / cube._fallDur);
    if (elapsed < cube._fallStart) return cube.mesh.position.y;
    const fromY = 6, toY = 0;
    return fromY + (toY - fromY) * easeOutBounce(t);
  }

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stageEl);
  resize();

  const t0 = performance.now();
  let rafId = null;

  /* 0. INFLUENCE — дальнодействие до самого превращения: несколько волн-
     пульсов (2D-кольца поверх сцены) бегут от триггера к цели с задержкой
     между собой, цель мелко дрожит, пока волны идут, и переключается на
     сигнальный (золотой) цвет ровно тогда, когда ПЕРВАЯ волна долетает —
     не раньше и не одновременно со стартом. Перенесено из rule3-agnayas.js.
     { type:'influence', from, to, start, waveCount=3, waveGap=440, waveTravel=1100 } */
  function applyInfluence(op, elapsed) {
    const target = cubes[op.to];
    const trigger = cubes[op.from];
    if (!target || !trigger) return;
    const waveCount = op.waveCount ?? 3;
    const waveGap = op.waveGap ?? 440;
    const waveTravel = op.waveTravel ?? 1100;
    const dur = (waveCount - 1) * waveGap + waveTravel;
    if (elapsed < op.start || elapsed > op.start + dur) {
      if (elapsed > op.start + dur) target.mesh.rotation.z = 0;
      return;
    }
    for (let i = 0; i < waveCount; i++) {
      const key = '_wave' + i;
      if (!op[key] && elapsed >= op.start + i * waveGap) {
        op[key] = true;
        spawnWave(
          trigger.mesh.position.clone().add(new THREE.Vector3(0, 0.1, 0)),
          target.mesh.position.clone().add(new THREE.Vector3(0, 0.1, 0)),
          waveTravel
        );
      }
    }
    const t = clamp01((elapsed - op.start) / dur);
    target.mesh.rotation.z = Math.sin(elapsed * 0.0125) * 0.05 * Math.sin(t * Math.PI);
    if (!op._signalled && elapsed >= op.start + waveTravel) {
      op._signalled = true;
      target.mesh.material = target.matsSignal; // первая волна долетела — цель «под наблюдением»
    }
  }

  /* APPROACH — иллюстрация несовместимости/невозможности стыка: подвижный
     кубик (mover) трогается с места и проходит часть расстояния до цели
     (target), не долетая (distance — доля пути, по умолчанию половина),
     задерживается на пике, затем пружинисто отскакивает назад — не плавно,
     а с небольшим перелётом за исходную позицию (easeOutBack), как от
     столкновения с невидимой преградой. Цель всё это время дрожит —
     амплитуда растёт по мере сближения, пик — в момент максимального
     подхода, обрыв резкий (не плавный спад) — ровно в момент начала
     отскока, как задержанный вдох и внезапный выдох. Опционально — на пике
     цель на мгновение вспыхивает сигнальным цветом (тот же жёлтый, что и в
     influence — переиспользуется, отдельный материал под это не заводится).
     { type:'approach', mover, target, start, approachDur=800, holdDur=400,
       retreatDur=700, distance=0.5, pulse=true, jitterAmp=0.09 } */
  function applyApproach(op, elapsed) {
    const movers = (op.movers ?? [op.mover]).map(s => cubes[s]).filter(Boolean);
    const target = cubes[op.target];
    if (!movers.length || !target) return;
    const approachDur = op.approachDur ?? 800;
    const holdDur = op.holdDur ?? 400;
    const retreatDur = op.retreatDur ?? 700;
    // distance — доля ширины ОДНОГО слота (не всего пути до цели!). Было
    // доля полного расстояния до target — а поскольку между ними всего один
    // пустой слот, «половина пути» физически совпадала с позицией этого
    // пустого слота вплотную к цели. Теперь движение — часть SLOT, дальше
    // отсчёта на ширину одного слота от исходной позиции точно не уйдёт.
    const distance = op.distance ?? 0.5;
    const jitterAmp = op.jitterAmp ?? 0.16; // усилено (было 0.09)
    const peakStart = op.start + approachDur;
    const peakEnd = peakStart + holdDur;
    const retreatEnd = peakEnd + retreatDur;
    const slots = op.movers ?? [op.mover];
    const baseXs = slots.map(s => slotX(s));
    const dir = Math.sign(slotX(op.target) - baseXs[0]); // в какую сторону цель
    const shift = SLOT * distance * dir;

    if (elapsed < op.start || elapsed > retreatEnd) {
      if (elapsed > retreatEnd) {
        movers.forEach((m, i) => { m.mesh.position.x = baseXs[i]; });
        target.mesh.rotation.z = 0;
      }
      return;
    }

    if (elapsed <= peakStart) {
      const t = clamp01((elapsed - op.start) / approachDur);
      const te = easeOutCubic(t);
      movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift * te; });
    } else if (elapsed <= peakEnd) {
      movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift; });
      if (op.pulse !== false && !op._pulsed) {
        op._pulsed = true;
        target.mesh.material = target.matsSignal;
      }
    } else {
      const t = clamp01((elapsed - peakEnd) / retreatDur);
      const te = easeOutBack(t); // пружина — усилена ниже, в самой функции easeOutBack
      movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift * (1 - te); });
      if (op._pulsed && !op._unpulsed) {
        op._unpulsed = true;
        const restoreColor = op.targetColorAfter ?? colorFor(target.tr);
        target.mesh.material = buildChalkMaterials(restoreColor, target.seed + 4, target.tr);
      }
    }

    // дрожь цели: амплитуда растёт до пика, обрывается резко в момент отскока
    if (elapsed <= peakEnd) {
      const growT = clamp01((elapsed - op.start) / (approachDur + holdDur));
      target.mesh.rotation.z = Math.sin(elapsed * 0.024) * jitterAmp * growT;
    } else {
      target.mesh.rotation.z = 0; // обрыв резкий, не спад
    }
  }

  function applyTransform(op, elapsed) {
    const cube = cubes[op.at];
    if (!cube) return;
    const spinTurns = op.spinTurns ?? 1;
    const dur = Math.abs(spinTurns) * MS_PER_360;
    const bounceH = op.bounceH ?? 0.3;
    const clearance = op.clearance ?? 0.35; // боковой отъезд от соседа на время вращения
    if (elapsed < op.start || elapsed > op.start + dur) return;
    if (!op._began) {
      op._began = true;
      cube.mesh.material = cube.matsBlank; // буква пропадает на время оборота
    }
    const t = clamp01((elapsed - op.start) / dur);
    cube.mesh.position.y = Math.sin(t * Math.PI) * bounceH;
    cube.mesh.position.x = slotX(op.at) + Math.sin(t * Math.PI) * clearance;
    cube.mesh.rotation.y = -1 * easeOutCubic(t) * Math.PI * 2 * spinTurns;
    if (!op._swapped && t >= 0.15) {
      op._swapped = true;
      const newColor = op.toColor ?? colorFor(op.toGlyph);
      cube.mesh.material = buildChalkMaterials(newColor, cube.seed + 3, op.toGlyph);
      cube.tr = op.toGlyph;
    }
    if (t >= 1 && !op._done) {
      op._done = true;
      cube.mesh.rotation.y = 0;
      cube.mesh.position.y = 0;
      cube.mesh.position.x = slotX(op.at);
    }
  }

  function applySplit(op, elapsed) {
    if (elapsed < op.start) return;
    // Источник держим под ОТДЕЛЬНЫМ временным ключом на время отстойника —
    // иначе прилетающий результат с тем же номером слота (a садится туда же,
    // где было i/e) перезаписывает cubes[op.at] ПОКА источник ещё висит и
    // тает, и оба технически претендуют на один и тот же ключ словаря.
    if (!op._srcKey) {
      op._srcKey = '_hold_' + op.at + '_' + Math.random().toString(36).slice(2, 7);
      cubes[op._srcKey] = cubes[op.at];
      delete cubes[op.at];
    }
    const src = cubes[op._srcKey];
    if (!src) return;
    const riseDur = op.riseDur ?? 1000;
    const holdOpacity = op.holdOpacity ?? 0.55;
    const holdDur = op.holdDur ?? 2000;
    const fadeDur = op.fadeDur ?? 900;
    const holdOffset = op.holdOffset ?? { x: -1.6, y: 2.4, z: 0.4 };
    const basePos = new THREE.Vector3(slotX(op.at), 0, 0);
    const holdPos = basePos.clone().add(new THREE.Vector3(holdOffset.x, holdOffset.y, holdOffset.z));

    // фаза 1: исходный поднимается в сторону и бледнеет
    const riseEnd = op.start + riseDur;
    if (elapsed <= riseEnd) {
      const t = clamp01((elapsed - op.start) / riseDur);
      const te = easeOutCubic(t);
      src.mesh.position.lerpVectors(basePos, holdPos, te);
      setOpacity(src.mesh, lerp(1, holdOpacity, te));
    } else {
      // фаза 2: покачивание, пока висит
      const idle = (elapsed - riseEnd) * 0.0022;
      src.mesh.position.copy(holdPos);
      src.mesh.position.y += Math.sin(idle) * 0.06;
    }

    // прилёт результатов — каждый по своим параметрам (группа E). Может
    // спокойно занять op.at (тот же номер слота, где висел источник) — слот
    // уже свободен, см. фикс выше.
    (op.arrivals || []).forEach(arr => {
      if (elapsed < op.start + arr.delay) return;
      let nc = op._arrived?.[arr.newSlot];
      if (!nc) {
        nc = makeCube(arr.into, arr.newSlot * 97 + 31);
        nc._fallDone = true; // прилетает через отстойник, не через обычное падение
        nc.mesh.visible = false;
        scene.add(nc.mesh);
        scene.add(nc.shadow);
        cubes[arr.newSlot] = nc;
        op._arrived = op._arrived || {};
        op._arrived[arr.newSlot] = nc;
      }
      nc.mesh.visible = true;
      const t = clamp01((elapsed - (op.start + arr.delay)) / arr.dur);
      const te = easeOutCubic(t);
      const arc = Math.sin(t * Math.PI) * (arr.arcHeight ?? 1.0);
      nc.mesh.position.set(
        lerp(arr.from.x, slotX(arr.newSlot), te),
        lerp(arr.from.y, 0, te) + arc,
        lerp(arr.from.z, 0, te)
      );
    });

    // фаза 3: после паузы для сравнения — исходный растворяется совсем.
    // Момент старта угасания зависит от того, что случится ПОЗЖЕ — источник
    // поднялся в отстойник, ИЛИ все результаты долетели и сели (какой из
    // прилётов дольше — с учётом собственной задержки старта). Раньше здесь
    // был фиксированный отсчёт от подъёма источника, не связанный с прилётом —
    // если бы прилёт занял дольше, источник начал бы таять ДО того, как AY
    // реально появится в кадре целиком. Теперь так не получится.
    const arrivals = op.arrivals || [];
    const lastArrivalEnd = arrivals.length
      ? Math.max(...arrivals.map(a => a.delay + a.dur))
      : 0;
    const compareReadyAt = Math.max(riseEnd, op.start + lastArrivalEnd);
    const fadeStart = compareReadyAt + holdDur; // holdDur = пауза ПОСЛЕ того, как всё уже видно вместе
    if (elapsed >= fadeStart) {
      const t = clamp01((elapsed - fadeStart) / fadeDur);
      setOpacity(src.mesh, lerp(holdOpacity, 0, t));
      if (t >= 1) {
        src.mesh.visible = false;
        delete cubes[op._srcKey]; // источник совсем ушёл — временный ключ больше не нужен
      }
    }
  }

  function applySettle(op, elapsed) {
    const stepDelay = op.stepDelay ?? 150;
    const bounceDur = op.bounceDur ?? 500;
    op.slots.forEach((slot, i) => {
      const cube = cubes[slot];
      if (!cube) return;
      const start = op.start + i * stepDelay;
      if (elapsed < start || elapsed > start + bounceDur) return;
      const t = clamp01((elapsed - start) / bounceDur);
      cube.mesh.position.y = Math.sin(t * Math.PI) * 0.12;
      if (!cube._settled && t >= 0.4) {
        cube._settled = true;
        cube.mesh.material = cube.matsReady;
      }
    });
  }

  /* 4. DIM — притенение неактивных букв. Буквы, НЕ участвующие в текущей
     операции, гаснут почти до прозрачности, пока идёт действие — фокус
     внимания читается яснее на фоне того, что реально меняется. Гаснет и
     возвращается плавно (рампа в начале и в конце), не рывком. Полная
     видимость возвращается САМА к моменту `end` — это отдельный, более
     ранний момент «все буквы снова видны в своих цветах», ДО того как по
     слову пройдёт финальная волна READY_COLOR (см. applySettle выше) —
     не одновременно с ней, а раньше.
     { type:'dim', slots:[...], start, end, dimOpacity=0.22, ramp=700 }
     Планирование конфликтов (например, если dim и split управляют
     прозрачностью одного и того же кубика одновременно) — забота автора
     данных примера, не движка: не проверяется намеренно, минимум кода. */
  function applyDim(op, elapsed) {
    // Вне своего окна — НЕ трогаем прозрачность вообще (не сбрасываем в 1
    // принудительно). Раньше сбрасывали — и если два dim-окна подряд делят
    // общие слоты (как здесь: 1,2,3 участвуют в обеих фазах), та, что идёт
    // позже в data.ops, каждый кадр перезатирала то, что выставила первая,
    // пока не наступило её же собственное начало. Теперь конфликта нет —
    // клетка остаётся в состоянии, которое ей оставила последняя АКТИВНАЯ
    // операция, а не любая операция, которой она вообще упомянута.
    if (elapsed < op.start || elapsed > op.end) return;
    const dimOpacity = op.dimOpacity ?? 0.22;
    const ramp = op.ramp ?? 700;
    op.slots.forEach(slot => {
      const cube = cubes[slot];
      if (!cube) return;
      let opacity;
      if (elapsed < op.start + ramp) opacity = lerp(1, dimOpacity, clamp01((elapsed - op.start) / ramp));
      else if (elapsed < op.end - ramp) opacity = dimOpacity;
      else opacity = lerp(dimOpacity, 1, clamp01((elapsed - (op.end - ramp)) / ramp));
      setOpacity(cube.mesh, opacity);
    });
  }

  function frame(now) {
    const elapsed = now - t0;
    Object.values(cubes).forEach(cube => {
      if (!cube._fallDone) {
        cube.mesh.position.y = fallY(elapsed, cube);
        if (elapsed >= cube._fallStart + cube._fallDur) cube._fallDone = true;
      }
      updateShadow(cube);
    });
    (data.ops || []).forEach(op => {
      if (op.type === 'influence') applyInfluence(op, elapsed);
      else if (op.type === 'approach') applyApproach(op, elapsed);
      else if (op.type === 'transform') applyTransform(op, elapsed);
      else if (op.type === 'split') applySplit(op, elapsed);
      else if (op.type === 'settle') applySettle(op, elapsed);
      else if (op.type === 'dim') applyDim(op, elapsed);
    });
    camera.position.copy(camBase);
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
