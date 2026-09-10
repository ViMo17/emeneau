// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — общие DOM/визуальные помощники (кольца, искры, пилюли, волны, рамка группы), используемые несколькими apply*-обработчиками разом.
// Часть модульного разбиения slot-engine-ops.js — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { paintGlyph } from './chalk-module.js';
import {
  CUBE_SIZE, SLOT, SILVER_RGB, GOLD_RGB, GROUP_RGB, colorFor, clamp01, lerp, easeInOutCubic, slotX,
} from './slot-engine-core.js';

/** @param {import('three').Vector3} vec3 @param {import('./slot-engine-types.js').Ctx} ctx @returns {{x: number, y: number}} */
export function project(vec3, ctx) {
  const { stageEl, camera } = ctx;
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  const v = vec3.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
}

// rgbStr необязателен: по умолчанию серебряный (см. SILVER_COLOR/SILVER_RGB
// выше) — раньше цвет волны был жёстко зашит золотым прямо в CSS вызывающей
// страницы (test-slot-engine.html), это и был тот «оранжевый для гуны»,
// на который прямо указали. Золотой остаётся доступен через явный override,
// когда понадобится (вриддхи).
/* Кольца анкорятся НЕ на mesh.position (геометрический центр кубика), а со
   сдвигом по ЛОКАЛЬНОЙ +Z (к камере, туда же, где рисуется буква),
   провёрнутым через текущий поворот кубика (mesh.quaternion) — иначе при
   более высокой камере (camBase y=3.2, не низкая почти-анфас, как в
   rule3-agnayas.js) кольца проецируются заметно выше и в сторону от
   видимой грани. Формула верна даже пока кубик дрожит/крутится. */
/** @param {import('three').Mesh} mesh @param {number} [zOff] @param {number} [yOff] @returns {import('three').Vector3} */
export function frontAnchor(mesh, zOff = CUBE_SIZE * 0.42, yOff = 0.1) {
  const local = new THREE.Vector3(0, yOff, zOff).applyQuaternion(mesh.quaternion);
  return mesh.position.clone().add(local);
}

/* Кольцо-пульс НА МЕСТЕ (не бежит от точки к точке, а расходится вокруг
   одной) — сигнал «вот-вот изменится» (пауза-осознание перед split) ИЛИ
   «я источник, я влияю» (сустейн-кольца у нимитты в influence, см. ниже).
   rgbStr — необязательный: без него кольцо серебряное (CSS по умолчанию —
   см. .slot-pulse-ring, SILVER_RGB), с ним — оттенок СОБСТВЕННОГО цвета
   конкретного кубика (см. ringColorFrom) — общая утилита, не частность
   agnayas. */
/** @param {import('three').Vector3} atVec3 @param {number} dur @param {string|undefined} rgbStr @param {import('./slot-engine-types.js').Ctx} ctx */
export function spawnPulseRing(atVec3, dur, rgbStr, ctx) {
  const { labelsEl } = ctx;
  const p = project(atVec3, ctx);
  const ring = document.createElement('div');
  ring.className = 'slot-pulse-ring';
  ring.style.left = p.x + 'px';
  ring.style.top = p.y + 'px';
  ring.style.setProperty('--pulse-dur', dur + 'ms');
  if (rgbStr) ring.style.borderColor = `rgba(${rgbStr},.55)`;
  labelsEl.appendChild(ring);
  setTimeout(() => ring.remove(), dur + 80);
}

// Россыпь искр — изначально прямой запрос пользователя для вриддхи
// (signal:'gold'), позже переиспользована для elide (буква «рассыпается» в
// момент исчезновения, см. applyElide) — тот же язык, что и остальные
// DOM-оверлеи движка (project() для позиции, CSS-анимация на
// --custom-property, самоудаление по setTimeout), не новая техника, просто
// новая форма (частицы, не кольцо/волна). Цвет — необязательный: без него
// золотой (GOLD_RGB, как и было для вриддхи), с ним — строка "R,G,B"
// переопределяет фон/свечение (тот же приём, что и у spawnPulseRing/
// rgbStr) — для elide передаётся нейтральный GROUP_RGB, золото остаётся
// строго за вриддхи (см. CLAUDE.md, «Серебро/Золото»).
//
// ВТОРАЯ ПРАВКА (по прямой обратной связи после просмотра — «кратно
// больше, в 10-20 раз, и разнообразить размер; но главное — кубик должен
// РАССЫПАТЬСЯ, а не стрелять из точки»): count по умолчанию 16→200.
// Раньше ВСЕ искры стартовали из ОДНОЙ и той же точки (frontAnchor) и
// только разлетались в разные стороны — читалось как «выстрел», не как
// «распад». Теперь у каждой искры своя случайная СТАРТОВАЯ точка,
// разбросанная по всей видимой площади кубика (не общий центр) — сама
// точка появления уже выглядит как облако, не как источник-точка.
// Ширина разброса переведена из мировых единиц в пиксели ЧЕРЕЗ РЕАЛЬНУЮ
// проекцию камеры (вторая точка на расстоянии 1 мировой единицы, та же
// техника, что и project() везде в движке) — не константа в пикселях,
// иначе при разных FOV/масштабах экрана разброс был бы то теснее, то шире
// самого кубика.
/** @param {import('three').Vector3} atVec3 @param {import('./slot-engine-types.js').Ctx} ctx @param {number} [count] @param {string} [rgbStr] */
export function spawnSparkleBurst(atVec3, ctx, count = 200, rgbStr) {
  const { labelsEl } = ctx;
  const p = project(atVec3, ctx);
  const pRef = project(new THREE.Vector3(atVec3.x + 1, atVec3.y, atVec3.z), ctx);
  const pxPerUnit = Math.abs(pRef.x - p.x) || 40;
  const spreadPx = pxPerUnit * CUBE_SIZE * 0.5; // примерно видимая полуширина грани
  const color = rgbStr ?? GOLD_RGB;
  for (let i = 0; i < count; i++) {
    const originAngle = Math.random() * Math.PI * 2;
    const originR = Math.random() * spreadPx;
    const startX = p.x + Math.cos(originAngle) * originR;
    const startY = p.y + Math.sin(originAngle) * originR * 0.85; // грань чуть шире, чем выше
    const angle = Math.random() * Math.PI * 2;
    const dist = 16 + Math.random() * 64; // разлёт ОТ своей стартовой точки, не от общего центра
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 6;
    const dur = 450 + Math.random() * 400;
    const size = 2.5 + Math.random() * 10; // разного размера, 2.5–12.5px
    const half = size / 2;
    const el = document.createElement('div');
    el.className = 'slot-sparkle';
    el.style.left = startX + 'px';
    el.style.top = startY + 'px';
    el.style.width = size + 'px';
    el.style.height = size + 'px';
    el.style.marginLeft = -half + 'px';
    el.style.marginTop = -half + 'px';
    el.style.setProperty('--sx', dx + 'px');
    el.style.setProperty('--sy', dy + 'px');
    el.style.setProperty('--sparkle-dur', dur + 'ms');
    el.style.background = `rgba(${color},.95)`;
    el.style.boxShadow = `0 0 ${(4 + size).toFixed(1)}px ${(size * 0.3).toFixed(1)}px rgba(${color},.75)`;
    labelsEl.appendChild(el);
    setTimeout(() => el.remove(), dur + 60);
  }
}

// ПИЛЮЛЯ-ПОДПИСЬ — прямой запрос пользователя: во время события над (или
// под) местом действия висит короткое слово, называющее сам эффект
// («Гуна», «Вриддхи», «Ассимиляция», «Элизия», ...) — не заменяет текст
// примера, а даёт зрителю сразу считываемый якорь, что сейчас происходит.
// Тот же DOM-оверлей язык, что и у колец/искр (project() один раз при
// создании, дальше чистая CSS-анимация, самоудаление по setTimeout) — не
// отслеживается покадрово, лёгкий боковой дрейф кубика во время паузы/
// вращения для читаемости не критичен (та же логика, что у колец).
// Две ВСЕГДА действующие анимации разом (не одна): «конверт» видимости
// (плавно появилась → плавно исчезла, ровно на всю dur, один раз) и
// непрерывное «дыхание» (лёгкая пульсация масштабом, фиксированный
// период, зацикленная — привлекает взгляд, не зависит от длительности
// самого события). above=true — над точкой (превращение/слияние/распад:
// «вверх = продолжается в новой форме», см. CLAUDE.md Часть 2), false —
// под точкой (elide: «вниз = пропадает», тот же смысловой регистр, что и
// у направления отстойника).
/** @param {string} text @param {number} slotIndex @param {boolean} above @param {number} dur @param {import('./slot-engine-types.js').Ctx} ctx @param {number} [yOverride] @param {number} [xOverride] @param {number} [xWorldOverride] */
export function spawnLabelPill(text, slotIndex, above, dur, ctx, yOverride, xOverride, xWorldOverride) {
  const { labelsEl } = ctx;
  // yOverride — для случаев, где кубик поднимается выше обычной высоты
  // ряда (split, отстойник до y≈2.4) — фиксированная «1-2 кубика над
  // рядом» проходила бы СКВОЗЬ восходящий кубик на середине подъёма
  // (реальный найденный баг, rule50: держатель отстойника выше пилюли).
  // Дефолт не меняется — только явная передача извне поднимает планку.
  const y = yOverride ?? (above ? 1 : -1) * CUBE_SIZE * 1.6; // «1-2 кубика» от ряда, см. запрос
  // РЕАЛЬНЫЙ НАЙДЕННЫЙ БАГ (по скриншоту пользователя, rule15): elide
  // ВСЕГДА сползает вбок влево (holdOffset.x отрицательный, -0.45, во
  // всех примерах без исключения) — пилюля без горизонтального сдвига
  // оказывалась ровно над тонущим кубиком. Сдвиг вправо — ТОЛЬКО для
  // below (elide), у above (transform/merge/split) направление бокового
  // раскачивания/полёта разное по знаку в разных примерах, единого
  // безопасного сдвига там нет.
  // xOverride — аналогично yOverride: для случаев, где прилетающий
  // результат (split.arrivals) пролетает через ту же зону, что и пилюля
  // (rule50: «o» прилетает СПРАВА и приземляется ровно под слотом — сдвиг
  // пилюли ВЛЕВО категорически исключает пересечение, а не приблизительно
  // уменьшает его, т.к. траектория прилёта математически монотонна и
  // никогда не заходит левее целевого слота).
  const x = xOverride ?? (above ? 0 : CUBE_SIZE * 0.9);
  // xWorldOverride — АБСОЛЮТНАЯ мировая X-позиция БАЗЫ, заменяющая
  // slotX(slotIndex) (не x целиком — x складывается ПОВЕРХ неё, см. ниже).
  // НАЙДЕННЫЙ РЕАЛЬНЫЙ БАГ (rule2, живая проверка, скриншот пользователя:
  // «пилюли не на одной линии»): merge/transform привязывают пилюлю к
  // slotX(op.at) — НОМИНАЛЬНОМУ слоту-ключу кубика в cubes{}, а не к его
  // ФАКТИЧЕСКОЙ текущей позиции — если кубик уже физически переехал
  // (approach на общий зазор ДО merge/transform, см. atX/fromX), пилюля
  // повисает НАД СТАРЫМ местом (в rule2 — буквально над соседним кубиком
  // t), не над самим событием. Абсолютная мировая X — та же цель, что и
  // atX у transform, просто для DOM-оверлея пилюли.
  // СЛОЖЕНИЕ, не замена (правка по прямой обратной связи: «расположить
  // надписи на одной линии» — две пилюли одного шага, обе привязанные к
  // ОДНОЙ и той же физической точке merge→transform на одном кубике,
  // нуждаются в горизонтальном разведении друг от друга ПОВЕРХ уже
  // правильной базовой позиции, не вместо нее) — иначе xOverride
  // (labelX) не имел эффекта на тех же вызовах, что уже передают
  // xWorldOverride (merge/transform). Безопасно для всех прежних
  // вызовов: там, где xOverride не передан явно (x=0 при above:true —
  // дефолт transform/merge/split), сумма не отличается от прежней замены.
  const worldX = (xWorldOverride ?? slotX(slotIndex)) + x;
  const p = project(new THREE.Vector3(worldX, y, 0), ctx);
  const el = document.createElement('div');
  el.className = 'slot-label-pill';
  el.textContent = text;
  el.style.left = p.x + 'px';
  el.style.top = p.y + 'px';
  el.style.setProperty('--label-dur', dur + 'ms');
  labelsEl.appendChild(el);
  setTimeout(() => el.remove(), dur + 60);
}

/** @param {number} hex @param {string} glyph @returns {import('./slot-engine-types.js').PulseFace} */
export function buildPulseFace(hex, glyph) {
  const SZ = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const cvCtx = cv.getContext('2d');
  cvCtx.fillStyle = '#' + hex.toString(16).padStart(6, '0');
  cvCtx.fillRect(0, 0, SZ, SZ);
  const baseCv = document.createElement('canvas');
  baseCv.width = baseCv.height = SZ;
  baseCv.getContext('2d').drawImage(cv, 0, 0); // чистая заливка — эталон для перерисовки каждый кадр
  if (glyph) paintGlyph(cv, glyph);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  // transparent:true ОБЯЗАТЕЛЕН — без него THREE.js молча игнорирует
  // .opacity на этом материале (рендерит как полностью непрозрачный,
  // какое бы число ни было записано в .opacity). Все ОСТАЛЬНЫЕ наборы
  // материалов кубика получают transparent:true через buildOneMatSet
  // (slot-engine-cube.js) — эта грань строится отдельно, тем же свойством
  // раньше не была снабжена. Найдено при расследовании CLAUDE.md, Часть 6,
  // п.0 (асимметричная прозрачность): пока кубик пульсирует (setFacePulse,
  // грань [4] — эта самая), applyStepDim пишет тому же материалу .opacity
  // как обычно, но без transparent:true эффекта не видно — кубик выглядит
  // полностью непрозрачным, хотя реальное значение opacity корректно.
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, envMapIntensity: 0, fog: false, transparent: true });
  return { material, canvas: cv, baseCanvas: baseCv, glyph };
}
// radiusFrac — доля от полуширины грани (0..1); null — чистое состояние без кольца
/** @param {import('./slot-engine-types.js').PulseFace} pf @param {number|null} radiusFrac @param {number} [alpha] @param {string} [ringRgb] */
export function redrawPulseFace(pf, radiusFrac, alpha, ringRgb) {
  const sz = pf.canvas.width;
  const pfCtx = pf.canvas.getContext('2d');
  pfCtx.clearRect(0, 0, sz, sz);
  pfCtx.drawImage(pf.baseCanvas, 0, 0);
  if (radiusFrac !== null) {
    const cx = sz / 2, cy = sz / 2, r = Math.max(1, radiusFrac * (sz / 2));
    pfCtx.save();
    pfCtx.filter = `blur(${sz * 0.024}px)`;
    pfCtx.strokeStyle = `rgba(${ringRgb},${alpha})`;
    pfCtx.lineWidth = sz * 0.05;
    pfCtx.beginPath(); pfCtx.arc(cx, cy, r, 0, Math.PI * 2); pfCtx.stroke();
    pfCtx.restore();
  }
  if (pf.glyph) paintGlyph(pf.canvas, pf.glyph);
  pf.material.map.needsUpdate = true;
}
/* Включить/выключить пульсирующую грань у конкретного кубика. Строит
   pulseFace лениво (один раз на кубик, кешируется), подменяет ТОЛЬКО
   индекс 4 (передняя грань) в СВЕЖЕЙ копии текущего набора материалов —
   сам matsMain не трогается ни разу, поэтому «выключить» — это просто
   вернуть cube.mesh.material = cube.matsMain как было. */
/** @param {import('./slot-engine-types.js').Cube} cube @param {number|null} radiusFrac @param {number} [alpha] @param {string} [ringRgb] */
export function setFacePulse(cube, radiusFrac, alpha, ringRgb) {
  if (!cube._pulseFace) {
    cube._pulseFace = buildPulseFace(colorFor(cube.tr), cube.tr);
  }
  if (radiusFrac === null) {
    cube.mesh.material = cube.matsMain;
    return;
  }
  if (cube.mesh.material !== cube._pulsingMats) {
    cube._pulsingMats = [...cube.matsMain];
    cube._pulsingMats[4] = cube._pulseFace.material;
    cube.mesh.material = cube._pulsingMats;
  }
  redrawPulseFace(cube._pulseFace, radiusFrac, alpha, ringRgb);
}

// Уничтожает текстуру пульса на грани, если она вообще строилась (не
// каждый кубик за пример хоть раз пульсирует) — не часть обычных наборов
// материалов (matsMain и т.п., см. slot-engine-cube.js), поэтому не
// уничтожается автоматически вместе с ними; отдельная утечка, найденная
// и исправленная попутно с ленивыми материалами (тот же класс проблемы:
// per-cube текстура без единого места, где её уничтожают).
/** @param {import('./slot-engine-types.js').Cube} cube */
export function disposePulseFace(cube) {
  if (!cube._pulseFace) return;
  if (cube._pulseFace.material?.map) cube._pulseFace.material.map.dispose();
  cube._pulseFace.material?.dispose();
  cube._pulseFace = null;
}

// Как и spawnPulseRing — DOM-кольцо, координаты через project(vec3, ctx),
// поэтому берёт ctx явным параметром вместо захвата через замыкание.
/** @param {import('three').Vector3} fromVec3 @param {import('three').Vector3} toVec3 @param {number} dur @param {string|undefined} rgbStr @param {import('./slot-engine-types.js').Ctx} ctx */
export function spawnWave(fromVec3, toVec3, dur, rgbStr, ctx) {
  const { labelsEl } = ctx;
  const pA = project(fromVec3, ctx), pB = project(toVec3, ctx);
  const ring = document.createElement('div');
  ring.className = 'slot-wave-ring';
  ring.style.left = pA.x + 'px';
  ring.style.top = pA.y + 'px';
  ring.style.setProperty('--dx', (pB.x - pA.x) + 'px');
  ring.style.setProperty('--dy', (pB.y - pA.y) + 'px');
  ring.style.setProperty('--wave-dur', dur + 'ms');
  ring.style.borderColor = `rgba(${rgbStr || SILVER_RGB},.85)`;
  labelsEl.appendChild(ring);
  setTimeout(() => ring.remove(), dur + 80);
}

/* РАМКА-ПОДЧЁРКИВАНИЕ ПОД ГРУППОЙ. Тонкая светящаяся линия под всеми
   кубиками группы разом — тот же приём, что
   подчёркивание/скобка окончания в морфологическом разборе (привычный
   язык, не изобретённый). Держится, пока держится сама принадлежность к
   группе (та же ringHoldDur, что и у сустейн-колец — один параметр, не
   два рассинхронизированных). Общая утилита операции, не частность
   influence — как только появится другая операция, работающая с группой,
   эта же функция подойдёт ей без правок.

   op.frameSignal ('gold'|'silver', опционально) — прямой запрос
   пользователя: часть слова, вызывающая необходимость вриддхи,
   подчёркивается на всю длину золотой сияющей полоской (симметрично —
   серебряной для гунации), тем же цветовым языком, что и сама буква при
   transform (см. «Серебро/Золото» в CLAUDE.md). Без frameSignal — прежнее
   поведение НЕ ИЗМЕНИЛОСЬ: нейтральный GROUP_COLOR и только для настоящих
   групп (>1 кубика, подчёркивать одну букву незачем, если это не
   специально запрошенный сигнал) — уже построенные примеры (agnayas и
   др.) ничего не передают в frameSignal, значит рисуются как раньше. */
/** @param {import('./slot-engine-types.js').InfluenceOp|import('./slot-engine-types.js').ResistOp} op @param {import('./slot-engine-types.js').Cube[]} sources @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function updateGroupFrame(op, sources, elapsed, ctx) {
  const { labelsEl } = ctx;
  const holdEnd = op._frameHoldEnd;
  const forced = op.frameSignal === 'gold' || op.frameSignal === 'silver';
  if ((sources.length < 2 && !forced) || elapsed < op.start || elapsed > holdEnd) {
    if (op._frameEl) { op._frameEl.remove(); op._frameEl = null; }
    return;
  }
  if (!op._frameEl) {
    const el = document.createElement('div');
    el.className = 'slot-group-frame';
    const rgb = op.frameSignal === 'gold' ? GOLD_RGB : op.frameSignal === 'silver' ? SILVER_RGB : GROUP_RGB;
    el.style.background = `rgba(${rgb},.75)`;
    el.style.boxShadow = `0 0 7px 1px rgba(${rgb},.55)`;
    labelsEl.appendChild(el);
    op._frameEl = el;
  }
  // Рамка должна покрывать слот ЦЕЛИКОМ, не только видимую ширину буквы на
  // грани — граница берётся не от ЦЕНТРА крайних кубиков, а со сдвигом на
  // пол-слота НАРУЖУ (±SLOT/2, через quaternion — как и остальные якоря,
  // верно при любом повороте) у крайнего левого и крайнего правого кубика.
  const sorted = sources.slice().sort((a, b) => a.mesh.position.x - b.mesh.position.x);
  const leftCube = sorted[0], rightCube = sorted[sorted.length - 1];
  const edgeAnchor = (mesh, xOff) => {
    const local = new THREE.Vector3(xOff, -CUBE_SIZE * 0.56, CUBE_SIZE * 0.42).applyQuaternion(mesh.quaternion);
    return mesh.position.clone().add(local);
  };
  const pLeft = project(edgeAnchor(leftCube.mesh, -SLOT / 2), ctx);
  const pRight = project(edgeAnchor(rightCube.mesh, SLOT / 2), ctx);
  // Y — по нижнему краю грани у всех кубиков группы (не только крайних),
  // на случай если группа не строго горизонтальна на экране (наклон камеры/поворот)
  const ys = sources.map(s => project(frontAnchor(s.mesh, CUBE_SIZE * 0.42, -CUBE_SIZE * 0.56), ctx).y);
  const y = Math.max(pLeft.y, pRight.y, ...ys);
  const left = Math.min(pLeft.x, pRight.x);
  const right = Math.max(pLeft.x, pRight.x);
  const el = op._frameEl;
  el.style.left = left + 'px';
  el.style.top = y + 'px';
  el.style.width = Math.max(8, right - left) + 'px';
  // мягкое появление/исчезание по краям окна — то же 400мс, что уже
  // ощущается «плавно» у остальных рамп в движке, отдельного числа не вводим
  const fadeT = Math.min(elapsed - op.start, holdEnd - elapsed) / 400;
  el.style.opacity = String(clamp01(fadeT)); // CSSOM-свойство — строка, значение не меняется
}

/* INFLUENCE — дальнодействие до самого превращения: несколько волн-
   пульсов бегут от триггера к цели с задержкой между собой, и цель мелко
   дрожит, пока волны идут.
   { type:'influence', from, to, start, waveCount=3, waveGap=550, waveTravel=1400 }

   ПРАВКА (по обратной связи после просмотра): цель БОЛЬШЕ НЕ меняет цвет на
   сигнальный (золотой/оранжевый) — раньше делала это в момент signalAt, и
   этот оранжевый потом «доживал» до самого начала transform. По прямой
   формулировке пользователя «больше оранжевый не допустим» — оставлена
   только дрожь, без смены цвета; единственный цветовой переход у цели — уже
   сам transform.

   «Нимитта» (то, что физически влияет) часто НЕ одна буква, а вся
   грамматическая единица целиком (например всё окончание -as). `from`
   принимает не только одно число, но и массив/ссылку на группу слов
   ({word:2}, см. resolveSlotRef/computeWordGroups) — тогда волна идёт от
   КАЖДОГО кубика группы одновременно, они синхронно подпрыгивают масштабом
   в момент каждой волны — читаются как одно целое.

   ЭТАЛОН ДЛЯ КОЛЕЦ (по прямой ссылке пользователя на examples/rule71-
   vak-asti.js, redrawPulseFace): у самого источника-нимитты, помимо бегущих
   волн к цели, ДОЛЖНЫ расходиться широкие размытые светлые кольца оттенка
   СОБСТВЕННОГО цвета кубика, и держаться до конца связанной трансформации —
   не только на время короткой фазы волн. Здесь — упрощённая DOM-версия
   того же языка (не текстура на грани кубика, как в rule71-vak-asti.js —
   та техника глубже, взята только цветовая формула ringColorFrom и сам
   характер кольца), длительность управляется отдельно от `dur` через
   `ringHoldDur` (по умолчанию = `dur`, но пример может продлить её до конца
   transform). Это одновременно и ответ на «не вижу выделения АС как единой
   группы» — сустейн-кольца на ОБОИХ кубиках группы одновременно и есть
   видимое выделение. */
/** @param {{x: number, y: number, z: number}} from @param {number} toX @param {number} toY @param {number} toZ @param {number} t @param {number} [arcHeight] @returns {{x: number, y: number, z: number}} */
export function flyArcPosition(from, toX, toY, toZ, t, arcHeight = 1.0) {
  const te = easeInOutCubic(t);
  const arc = Math.sin(t * Math.PI) * arcHeight;
  return {
    x: lerp(from.x, toX, te),
    y: lerp(from.y, toY, te) + arc,
    z: lerp(from.z, toZ, te),
  };
}

/* Цвет паузы-осознания НЕ меняется — серебро однозначно закреплено за
   гунацией в applyTransform, держать его ещё и здесь означало бы два
   разных события одним и тем же сигналом. Пульс масштабом и два кольца
   сами по себе достаточно ясно говорят «сейчас что-то произойдёт». */
