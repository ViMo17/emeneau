// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — обработчики операций (apply*) и их прямые помощники.
// Часть модульного разбиения slot-engine.js (Стадия 5) — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { paintGlyph, buildOpposingFaceMaterials } from './chalk-module.js';
import {
  CUBE_SIZE, SLOT, MS_PER_360, SILVER_RGB, GROUP_COLOR, GROUP_RGB,
  colorFor, ringColorFrom, clamp01, lerp, easeOutCubic, easeInOutCubic,
  easeOutBack, slotX, setOpacity,
} from './slot-engine-core.js';
import { makeCube, regenMats, disposeMatSet } from './slot-engine-cube.js';
import { resolveSlotRef } from './slot-engine-words.js';
import { stepIndexAt, stepTargetOpacity } from './slot-engine-steps.js';

/**
 * @typedef {import('./slot-engine-types.js').Ctx} Ctx
 * @typedef {import('./slot-engine-types.js').PulseFace} PulseFace
 * @typedef {import('./slot-engine-types.js').TransformOp} TransformOp
 * @typedef {import('./slot-engine-types.js').ElideOp} ElideOp
 * @typedef {import('./slot-engine-types.js').InfluenceOp} InfluenceOp
 * @typedef {import('./slot-engine-types.js').ApproachOp} ApproachOp
 * @typedef {import('./slot-engine-types.js').SplitOp} SplitOp
 * @typedef {import('./slot-engine-types.js').ArriveOp} ArriveOp
 * @typedef {import('./slot-engine-types.js').MergeOp} MergeOp
 * @typedef {import('./slot-engine-types.js').SettleOp} SettleOp
 * @typedef {import('./slot-engine-types.js').DimOp} DimOp
 */

/* ═══════════════════ ОПЕРАЦИИ ═══════════════════

   Каждый обработчик — функция уровня модуля с единой сигнатурой
   applyX(op, elapsed, ctx) (искл. applyStepDim(elapsed, ctx) — она не
   привязана к конкретной операции). ctx несёт всё, что обработчику нужно
   извне (cubes, camera, stageEl, labelsEl, wordGroupsList, scene,
   runtimeSteps, data) — один и тот же объект, не пересоздаётся под
   каждый вызов. Такая сигнатура делает функции тестируемыми настоящим
   импортом (см. tests/) без запуска рендера — рендера/браузера у автора
   движка нет вообще, только Node.js.

   1. TRANSFORM — превращение на месте (гуна/вриддхи/ассимиляция и т.п.).
      Подскок и оборот идут ОДНОВРЕМЕННО (не по очереди), буква на грани
      пропадает в начале оборота и наносится РАНО (около 15% пути, не в конце
      и не мгновенно) — та же хореография, что в rule3-agnayas.js.
      { type:'transform', at, toGlyph, toColor, start, spinTurns=1, bounceH=0.3 }
      Длительность НЕ вшивается — считается из spinTurns через MS_PER_360.
      В момент смены буквы ВСЕ наборы материалов кубика пересобираются под
      новый глиф (см. regenMats) — иначе более поздние операции (approach,
      influence), которые временно включают «сигнальный» материал, покажут
      исходную, уже неактуальную букву.

   2. SPLIT — распад на два звука через отстойник. Исходный кубик уходит В
      СТОРОНУ (не остаётся на месте!), поднимается, бледнеет и повисает —
      ПОКА он висит, прилетают оба результата как НОВЫЕ кубики (каждый со
      своими параметрами дуги/длительности/задержки).
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
// Верхняя граница по elapsed (`elapsed > op.start+dur`) НЕ используется для
// раннего выхода — при обычной частоте кадров (~60fps, шаг ~16.7мс) шанс,
// что elapsed окажется РОВНО равен op.start+dur, практически нулевой:
// кадр либо ещё до границы, либо уже за ней, и такая проверка почти
// никогда не даёт финализации сработать на кадре, где реально t достиг 1.
// Вместо неё — guard по уже выставленному `op._done` (дешёвый выход после
// того, как всё уже сделано); t считается через clamp01, который сам
// ограничит переполёт значением 1 — финализация гарантированно происходит
// РОВНО ОДИН РАЗ, на первом же кадре, где elapsed достиг или превысил конец.
//
// Три явные фазы окраски: (1) кубик получает импульс — материал сразу
// переключается на сигнальный (серебро/нейтраль, см. op.signal ниже),
// СТАРАЯ буква ещё видна — понятно, КТО меняется; (2) на ~15% оборота
// буква меняется, но материал остаётся сигнальным — уже пересобранный под
// НОВУЮ букву (см. regenMats) — кубик «стал» новой буквой, но переход
// цветом ещё не завершён; (3) в момент приземления (t=1, тот же кадр, что
// и сброс поворота/позиции — не отдельная пауза) — переключение на
// matsMain, истинный цвет столбца. Серебро закреплено ИМЕННО за гунацией,
// не за самим фактом трансформации — см. op.signal ниже.
/** @param {TransformOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyTransform(op, elapsed, ctx) {
    const { cubes } = ctx;
    const cube = cubes[op.at];
    if (!cube) return;
    if (elapsed < op.start) return;
    if (op._done) return;
    const spinTurns = op.spinTurns ?? 1;
    // Полуоборот (0.5, 1.5, 2.5...) — к зрителю в конце разворота выходит
    // ПРОТИВОЛЕЖАЩАЯ грань кубика (TRANSFORM_KIND.vargaPair). Для этого
    // случая буква нового звука наносится на противолежащую грань ЗАРАНЕЕ,
    // до начала вращения (см. buildOpposingFaceMaterials в chalk-module.js)
    // — без промежуточного «слепого» материала и без перерисовки на
    // середине пути, когда грань ещё обращена к зрителю. Портировано из
    // проверенного эталона (docs/effects/rule-assimilation-varga-t-d.html,
    // buildDentalVarga) — там же и более медленный, «тяжёлый» оборот
    // (1800мс на 180°, не по общей формуле spinTurns×MS_PER_360) и меньший
    // подскок (0.16 вместо 0.3).
    const landsOnOppositeFace = Math.round(spinTurns * 2) % 2 !== 0;
    const dur = landsOnOppositeFace ? (op.dur ?? 1800) : Math.abs(spinTurns) * MS_PER_360;
    const bounceH = op.bounceH ?? (landsOnOppositeFace ? 0.16 : 0.3);
    const clearance = op.clearance ?? 0.35; // боковой отъезд от соседа на время вращения

    // transform получает ТУ ЖЕ симметричную пару пауз, что уже есть у split
    // (anticipateDur до, holdDur после) — почти каждый значимый шаг
    // нуждается в паузе-фиксации для осознания результата, те же имена
    // параметров и тот же характер сигнала, не изобретаются заново для
    // каждой операции отдельно. Для гунации отдельной approach-стадии
    // «столкновение/невозможность соседства» не нужно — уже существующая
    // последовательность influence→transform (подчёркиваем влияющие
    // кубики, даём импульс, начинаем гунирование) — это и есть смысловой
    // эквивалент, без исключения для грамматических шагов.
    const anticipateDur = op.anticipateDur ?? 900; // тот же дефолт, что у split — единообразие, не случайное число
    const activeStart = op.start + anticipateDur;
    if (elapsed < activeStart) {
      // Пауза-осознание: пульс масштабом (два удара, как у split), два
      // кольца — БЕЗ смены цвета (серебро/нейтраль включается только в
      // активной фазе, не здесь — тот же принцип, что у split: «держать
      // сигнальный цвет ещё и на паузе означало бы два разных события
      // одним и тем же сигналом»).
      const t = clamp01((elapsed - op.start) / anticipateDur);
      const beat = Math.abs(Math.sin(t * Math.PI * 2)) * 0.06;
      cube.mesh.scale.setScalar(1 + beat);
      if (!op._pulse0 && t >= 0.15) { op._pulse0 = true; spawnPulseRing(frontAnchor(cube.mesh), anticipateDur * 0.6, undefined, ctx); }
      if (!op._pulse1 && t >= 0.6) { op._pulse1 = true; spawnPulseRing(frontAnchor(cube.mesh), anticipateDur * 0.6, undefined, ctx); }
      return;
    }
    if (!op._anticipateDone) {
      op._anticipateDone = true;
      cube.mesh.scale.setScalar(1);
    }

    // matsSignal (серебро) — не единственный вариант промежуточной фазы:
    // серебро/золото годится ТОЛЬКО для гунации/вриддхи, где сам их смысл —
    // «идёт огласовка»; для любого другого transform (парная замена внутри
    // варги, ассимиляция под соседа) серебро ложно намекало бы на ту же
    // природу. op.signal ('silver' — дефолт, обратная совместимость с
    // agnayas; 'gold' — вриддхи, matsGold; 'blank' — нейтральная грань БЕЗ
    // буквы, тот же цвет кубика, никакого намёка на гуну/вриддхи)
    // переключает это через общий параметр движка, не отдельным куском
    // кода внутри примера.
    const signalMats = op.signal === 'blank' ? 'matsBlank' : op.signal === 'gold' ? 'matsGold' : 'matsSignal';
    if (!op._began) {
      op._began = true;
      if (landsOnOppositeFace) {
        // Оба глифа — сразу, ДО начала вращения: idx4 (лицевая) держит
        // ТЕКУЩУЮ букву, idx5 (противолежащая) — БУДУЩУЮ. Никакой
        // перерисовки на середине пути не требуется — «превращение»
        // целиком получается из самой геометрии разворота.
        const newColor = op.toColor ?? colorFor(op.toGlyph);
        cube._oppositeMats = buildOpposingFaceMaterials(cube.color, cube.seed + 5, cube.tr, op.toGlyph);
        cube.mesh.material = cube._oppositeMats;
        op._pendingColor = newColor; // нужен после приземления, см. ниже
      } else {
        cube.mesh.material = cube[signalMats];
      }
    }
    const t = clamp01((elapsed - activeStart) / dur);
    // ТОЛЬКО пока не приземлился — иначе НАЙДЕННЫЙ РЕАЛЬНЫЙ БАГ (поймано
    // численной симуляцией): t остаётся зажатым в 1 и на КАЖДОМ следующем
    // кадре формула ниже пересчитывает rotation.y заново — для целых
    // оборотов (spinTurns:1,2 — 360°/720°) результат (-360°/-720°)
    // визуально неотличим от 0°, поэтому оставался незамеченным, но для
    // половинного оборота (0.5 — 180°) даёт ЗАМЕТНО другой угол (-180°,
    // не 0°), затирая явный сброс в блоке приземления ниже уже на
    // СЛЕДУЮЩЕМ кадре после самого приземления.
    if (!op._landed) {
      cube.mesh.position.y = Math.sin(t * Math.PI) * bounceH;
      cube.mesh.position.x = slotX(op.at) + Math.sin(t * Math.PI) * clearance;
      cube.mesh.rotation.y = -1 * easeOutCubic(t) * Math.PI * 2 * spinTurns;
    }
    if (!landsOnOppositeFace && !op._swapped && t >= 0.15) {
      op._swapped = true;
      const newColor = op.toColor ?? colorFor(op.toGlyph);
      // Пересобираем ВСЕ наборы материалов кубика (matsMain/matsBlank/
      // matsReady/matsSignal), не только текущий — фикс бага, из-за которого
      // «сигнальный»/«финальный» материал ещё долго хранил исходную,
      // добуквенную версию (см. комментарий в regenMats). Новая буква
      // наносится сразу же, тем же моментом ~15% пути, что и раньше —
      // но материал остаётся тем же промежуточным (silver ИЛИ blank, см.
      // выше), не matsMain: буква уже новая, цвет ещё не вернулся, это
      // следующая, отдельная фаза (см. ниже). НЕ применяется, когда кубик
      // садится на противолежащую грань — там оба глифа уже нанесены
      // заранее (см. op._began выше), перерисовывать нечего.
      regenMats(cube, op.toGlyph, newColor);
      cube.mesh.material = cube[signalMats];
    }
    if (t >= 1 && !op._landed) {
      op._landed = true;
      cube.mesh.rotation.y = 0;
      cube.mesh.position.y = 0;
      cube.mesh.position.x = slotX(op.at);
      if (landsOnOppositeFace) {
        // matsMain/matsBlank/... пересобираются под новую букву ТОЛЬКО
        // теперь, после приземления — нужно для будущих операций на этом
        // же кубике (повторный transform, settle и т.п.), а не для самого
        // текущего разворота (тот уже полностью показан через _oppositeMats
        // выше). Временный набор граней уничтожается — иначе утечка
        // текстур, тот же класс бага, что уже был найден и исправлен для
        // regenMats/lazily-собираемых наборов.
        regenMats(cube, op.toGlyph, op._pendingColor);
        disposeMatSet(cube._oppositeMats);
        cube._oppositeMats = null;
      }
      cube.mesh.material = cube.matsMain; // возвращает себе истинный цвет столбца
      op._rotationEnd = elapsed;
    }
    // Пауза-фиксация: кубик уже полностью финализирован (см. выше), просто
    // держится в этом состоянии ещё holdDur — op._done откладывается на
    // это время, не срабатывает мгновенно в момент посадки. Даёт зрителю
    // время увидеть результат, прежде чем следующий шаг/операция начнёт
    // что-то ещё менять — тот же смысл, что у holdDur в split, просто без
    // отдельной активности во время паузы (кубик и так уже в покое, не
    // висит в отстойнике — покачивать нечего).
    if (op._landed) {
      const holdDur = op.holdDur ?? 700;
      if (elapsed - op._rotationEnd >= holdDur) op._done = true;
    }
}

/** @param {import('three').Vector3} vec3 @param {Ctx} ctx @returns {{x: number, y: number}} */
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
   rgbStr — необязательный: без него кольцо золотое (CSS по умолчанию,
   как раньше), с ним — оттенок СОБСТВЕННОГО цвета конкретного кубика
   (см. ringColorFrom) — общая утилита, не частность agnayas. */
/** @param {import('three').Vector3} atVec3 @param {number} dur @param {string|undefined} rgbStr @param {Ctx} ctx */
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

/** @param {ElideOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyElide(op, elapsed, ctx) {
    const { cubes } = ctx;
    if (elapsed < op.start) return;
    const cube = cubes[op.at];
    if (!cube || op._done) return;
    // Плавная easeInOutCubic-кривая имеет нулевую производную в t=0 —
    // первые кадры движения визуально неразличимы, без отдельного сигнала
    // момент начала реакции не читается вообще. Ровно в момент op.start —
    // вспышка (spawnPulseRing) и мгновенный скачок масштаба на самой S, тот
    // же язык, что уже использует merge в момент слияния. Скачок считается
    // КАЖДЫЙ кадр ОТДЕЛЬНО от ветвления ниже (rise/hold/fade) — класс бага
    // «спад заблокирован общим guard'ом финализации» (см. applyTransform,
    // applyMerge) — здесь заранее вынесен за пределы веток, не внутрь них.
    if (!op._impactAt) {
      op._impactAt = elapsed;
      spawnPulseRing(frontAnchor(cube.mesh), 700, op.impactColor ?? GROUP_RGB, ctx);
    }
    const riseDur = op.riseDur ?? 1300; // тот же темп, что у split — общий язык, не изобретённый заново
    const holdOpacity = op.holdOpacity ?? 0.5;
    const holdDur = op.holdDur ?? 800;
    const fadeDur = op.fadeDur ?? 1100;
    // Отступ от края слотов до ближнего края отстойника = CUBE_SIZE/2 (в
    // любую сторону) — не подбирается на глаз. FLOOR_Y (нижний край слотов,
    // -0.55) минус CUBE_SIZE/2 (сам отступ, 0.55) даёт верхний край
    // отстойника (-1.1); минус ещё CUBE_SIZE/2 (половина высоты самого
    // кубика в отстойнике) даёт его центр: -1.65. При этом числе камера
    // всё ещё даёт комфортный запас (0.247 в NDC, реальная проекционная
    // математика — не на глаз) — даже больше, чем у подъёма E (0.075) при
    // том же lookAt.
    const holdOffset = op.holdOffset ?? { x: -0.2, y: -1.65, z: -0.4 };
    const basePos = new THREE.Vector3(slotX(op.at), 0, 0);
    const holdPos = basePos.clone().add(new THREE.Vector3(holdOffset.x, holdOffset.y, holdOffset.z));
    const riseEnd = op.start + riseDur;
    if (elapsed <= riseEnd) {
      const t = clamp01((elapsed - op.start) / riseDur);
      const te = easeInOutCubic(t);
      cube.mesh.position.lerpVectors(basePos, holdPos, te);
      setOpacity(cube.mesh, lerp(1, holdOpacity, te));
    } else if (elapsed <= riseEnd + holdDur) {
      cube.mesh.position.copy(holdPos);
      const idle = (elapsed - riseEnd) * 0.0022;
      cube.mesh.position.y += Math.sin(idle) * 0.06; // то же лёгкое покачивание, что у split
    } else {
      const t = clamp01((elapsed - (riseEnd + holdDur)) / fadeDur);
      setOpacity(cube.mesh, lerp(holdOpacity, 0, t));
      if (t >= 1) {
        op._done = true;
        cube.mesh.visible = false;
        spawnPulseRing(frontAnchor(cube.mesh), 900, GROUP_RGB, ctx);
        delete cubes[op.at];
      }
    }
    // Скачок масштаба в момент удара, спадающий за 350мс — ВНЕ веток
    // rise/hold/fade выше, идёт каждый кадр независимо от того, в какой
    // из них мы сейчас находимся (см. комментарий про класс бага вверху).
    if (op._impactAt != null && !op._done) {
      const pt = clamp01((elapsed - op._impactAt) / 350);
      cube.mesh.scale.setScalar(lerp(1.25, 1, easeOutCubic(pt)));
    }
}

/* ПУЛЬС В ТЕКСТУРЕ ГРАНИ — та же эталонная техника, что в rule71-vak-asti.js
   (перенесена из docs/effects/rule-assimilation-varga-t-d.html). Отличие
   от spawnPulseRing: тот — отдельный
   DOM-слой поверх сцены, позиционируется проекцией 3D→экран каждый кадр;
   этот — кольцо нарисовано ПРЯМО в canvas передней грани кубика, жёстко
   часть самой геометрии, поворачивается/масштабируется вместе с кубиком
   без всякой проекционной математики. Две функции: build — один раз при
   первой необходимости (готовит холст-эталон без кольца, чтобы каждый
   кадр рисовать поверх чистой копии, не поверх предыдущего кольца),
   redraw — каждый кадр с текущим радиусом/прозрачностью. Использование:
   buildPulseFace на кубике один раз (лениво, кешируется в cube._pulseFace),
   на время пульсации — cube.mesh.material меняется на КОПИЮ matsMain с
   подменённым индексом 4 (не мутирует сам matsMain — иначе после возврата
   к обычному виду грань осталась бы с кольцом навсегда), после —
   возвращается обычный matsMain как есть. */
/** @param {number} hex @param {string} glyph @returns {PulseFace} */
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
/** @param {PulseFace} pf @param {number|null} radiusFrac @param {number} [alpha] @param {string} [ringRgb] */
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
/** @param {import('three').Vector3} fromVec3 @param {import('three').Vector3} toVec3 @param {number} dur @param {string|undefined} rgbStr @param {Ctx} ctx */
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
   два рассинхронизированных). Только для настоящих групп (>1 кубика) —
   подчёркивать одну букву незачем, там и так ясно, что происходит. Общая
   утилита операции, не частность influence — как только появится другая
   операция, работающая с группой, эта же функция подойдёт ей без правок. */
/** @param {InfluenceOp} op @param {import('./slot-engine-types.js').Cube[]} sources @param {number} elapsed @param {Ctx} ctx */
export function updateGroupFrame(op, sources, elapsed, ctx) {
  const { labelsEl } = ctx;
  const holdEnd = op._frameHoldEnd;
  if (sources.length < 2 || elapsed < op.start || elapsed > holdEnd) {
    if (op._frameEl) { op._frameEl.remove(); op._frameEl = null; }
    return;
  }
  if (!op._frameEl) {
    const el = document.createElement('div');
    el.className = 'slot-group-frame';
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
/** @param {InfluenceOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyInfluence(op, elapsed, ctx) {
  const { cubes, wordGroupsList } = ctx;
  const target = cubes[op.to];
  const sourceSlots = resolveSlotRef(op.from, wordGroupsList);
  const sources = sourceSlots.map(s => cubes[s]).filter(Boolean);
  if (!target || !sources.length) return;
  const waveCount = op.waveCount ?? 3;
  const waveGap = op.waveGap ?? 550; // было 440
  const waveTravel = op.waveTravel ?? 1400; // было 1100
  const dur = (waveCount - 1) * waveGap + waveTravel;

  // Сустейн-«пульс» на источниках — независимо от фазы волн, до ringHoldDur.
  const ringHoldDur = op.ringHoldDur ?? dur;
  op._frameHoldEnd = op.start + ringHoldDur; // общее окно и для рамки, и для пульса
  updateGroupFrame(op, sources, elapsed, ctx);
  // Цвет пульса — ОДИН на всю группу (GROUP_COLOR), если источников больше
  // одного (настоящая группа-нимитта, см. GROUP_COLOR выше); для одиночной
  // буквы-источника прежнее поведение сохранено — тонировка в её
  // собственный фонетический цвет (там нечего объединять, один кубик).
  const ringRgb = sources.length > 1 ? GROUP_RGB : ringColorFrom(colorFor(sources[0].tr));
  // Каждый источник группы пульсирует кольцом В СВОЕЙ ЖЕ ГРАНИ (текстурная
  // пульсация, не отдельные DOM-вспышки по таймеру — единый язык с
  // approach.holdPulse), синхронно — одна и та же формула cyclePos на всех
  // сразу, не по отдельности, поэтому группа читается как единое дышащее
  // целое, а не набор случайно моргающих вспышек. ringPulsePeriod —
  // длительность ОДНОГО цикла непрерывной пульсации.
  if (elapsed >= op.start && elapsed <= op.start + ringHoldDur) {
    const pulsePeriod = op.ringPulsePeriod ?? 1400;
    const cyclePos = ((elapsed - op.start) % pulsePeriod) / pulsePeriod;
    const radiusFrac = lerp(0.25, 1.0, cyclePos);
    const envelope = Math.sin(cyclePos * Math.PI);
    sources.forEach(src => setFacePulse(src, radiusFrac, 0.85 * envelope, ringRgb));
  } else if (elapsed > op.start + ringHoldDur && !op._ringOff) {
    op._ringOff = true;
    sources.forEach(src => setFacePulse(src, null));
  }

  if (elapsed < op.start || elapsed > op.start + dur) {
    if (elapsed > op.start + dur) {
      target.mesh.scale.setScalar(1);
      sources.forEach(src => src.mesh.scale.setScalar(1));
    }
    return;
  }
  for (let i = 0; i < waveCount; i++) {
    const key = '_wave' + i;
    if (!op[key] && elapsed >= op.start + i * waveGap) {
      op[key] = true;
      sources.forEach(src => spawnWave(
        frontAnchor(src.mesh),
        frontAnchor(target.mesh),
        waveTravel,
        undefined,
        ctx
      ));
    }
  }
  // общий «пульс группы»: каждый источник синхронно подпрыгивает масштабом
  // ровно в момент, когда от него уходит волна — источники из одной группы
  // всегда бьются в одном и том же кадре (одна и та же формула по elapsed,
  // не по индивидуальному состоянию кубика), поэтому визуально читаются как
  // единое целое, даже если их несколько.
  let srcPulse = 0;
  for (let i = 0; i < waveCount; i++) {
    const waveAt = op.start + i * waveGap;
    const pt = (elapsed - waveAt) / 260;
    if (pt >= 0 && pt <= 1) srcPulse = Math.max(srcPulse, Math.sin(pt * Math.PI) * 0.06);
  }
  sources.forEach(src => src.mesh.scale.setScalar(1 + srcPulse));

  // Цель откликается масштабным «удар»-пульсом (не вращением — синус-
  // тряска читается как визуальный шум, не как понятный сигнал), тот же
  // язык, что уже используется у источников (см. srcPulse выше) и на
  // паузе перед split: один согласованный приём «пульс = вот-вот
  // изменится» по всему движку, а не отдельный жест для каждого случая.
  // Пульс цели синхронизирован не
  // с ОТПРАВКОЙ волны (как у источника), а с её ПРИХОДОМ (waveTravel
  // спустя) — цель откликается именно когда волна её достигает, не раньше.
  // Сила пульса растёт от волны к волне (последняя — самая заметная,
  // прямо перед началом transform) — нарастающее напряжение, а не ровный
  // шум на всём протяжении шага.
  let targetPulse = 0;
  for (let i = 0; i < waveCount; i++) {
    const arriveAt = op.start + i * waveGap + waveTravel;
    const pt = (elapsed - arriveAt) / 320;
    if (pt >= 0 && pt <= 1) {
      const grow = 0.045 + i * 0.02;
      targetPulse = Math.max(targetPulse, Math.sin(pt * Math.PI) * grow);
    }
  }
  target.mesh.scale.setScalar(1 + targetPulse);
}

/* APPROACH — иллюстрация несовместимости/невозможности стыка: подвижный
   кубик (mover) трогается с места и проходит часть расстояния до цели
   (target), не долетая (distance — доля ширины ОДНОГО слота), задерживается
   на пике, затем пружинисто отскакивает назад — не плавно, а с небольшим
   перелётом за исходную позицию (easeOutBack), как от столкновения с
   невидимой преградой. Подход к пику — плавный разгон/торможение
   (easeInOutCubic, было easeOutCubic — убран рывок в самом начале хода).
   { type:'approach', mover, target, start, approachDur=1150, holdDur=550,
     retreatDur=950, distance=0.5, pulse=true, jitterAmp=0.16, retreat=true }

   ПРАВКА (по обратной связи): цель БОЛЬШЕ НЕ перекрашивается в сигнальный
   (оранжевый) цвет на пике — прямо названо ошибкой («Е становится
   оранжевой на время»). Вместо смены цвета цели — один тёплый кольцевой
   пульс оттенка ПОДХОДЯЩЕГО кубика (не цели) ровно на пике, той же техникой
   ringColorFrom, что и у сустейн-колец influence — сигнал «момент
   напряжения» остаётся, но летящий кубик не перекрашивает саму цель.

   Та же самая механика подхода годится и для ПРОТИВОПОЛОЖНОГО смысла: не
   несовместимость, а совместимость («примагничивание», āsīt, ĪТ
   подъезжает к АС и остаётся, а не отскакивает) — через `retreat:false`.
   distance:1.0 при зазоре ровно в один слот приводит мувер точно встык с
   целью; retreat:false отключает фазу отскока целиком (retreatDur
   обнуляется) — кубик остаётся у цели навсегда, jitterAmp у вызывающего
   кода обычно ставится в 0 отдельно (дрожь — язык именно несовместимости,
   не нужна тут по смыслу, но остаётся доступной, если понадобится
   где-то ещё). */
/** @param {ApproachOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyApproach(op, elapsed, ctx) {
  const { cubes, wordGroupsList } = ctx;
  // op.movers/op.mover — как раньше (число/массив), либо ссылка на группу слов
  // ({word:2}) через ту же общую формулу, что и у influence.from (см. выше).
  const slots = resolveSlotRef(op.movers ?? op.mover, wordGroupsList);
  const movers = slots.map(s => cubes[s]).filter(Boolean);
  if (!movers.length) return;
  // Цель (target) может исчезнуть по ходу движения (сценарий «приближение
  // вызывает реакцию» — śādhi: DH приближается к S, а S по ходу
  // приближения ИСЧЕЗАЕТ через elide) — approach не должен из-за этого
  // обрываться целиком, движение mover'ов обязано доехать до конца.
  // Направление движения (dir) вычисляется по НОМЕРУ слота цели
  // (slotX(op.target)) — цель как живой объект для этого не нужна
  // вообще, нужна только для дрожи/пульса НА ней самой (см. ниже, оба
  // под `if (target)`).
  const target = cubes[op.target]; // может быть undefined — это ОК
  const approachDur = op.approachDur ?? 1150; // было 800
  const holdDur = op.holdDur ?? 550; // было 400
  const retreat = op.retreat !== false;
  const retreatDur = retreat ? (op.retreatDur ?? 950) : 0; // было 700
  const distance = op.distance ?? 0.5;
  const jitterAmp = op.jitterAmp ?? 0.16;
  const baseXs = slots.map(s => slotX(s));
  const dir = Math.sign(slotX(op.target) - baseXs[0]); // в какую сторону цель

  // Если distance большая (закрыть исходный зазор И занять место
  // исчезающей соседней буквы ОДНИМ движением), один сплошной путь от 0
  // до distance без паузы читается как «проехало насквозь», а не «подошло
  // → произошла реакция → въехало в освободившееся место»: нет отдельного,
  // заметного момента прибытия.
  // midDistance (необязательный параметр) — путь идёт в ДВА отрезка с
  // явной паузой между ними (midHoldDur), ровно там, где и должна
  // произойти реакция (обычно — elide соседней буквы, синхронизировано
  // данными примера снаружи, не встроено сюда). Без midDistance поведение
  // не меняется ни на йоту — старые примеры (agnayas, āsīt) его не
  // передают. Общая возможность движка, не разовый хак под один пример.
  if (op.midDistance != null) {
    const leg1Dur = approachDur;
    const midHoldDur = op.midHoldDur ?? 0;
    const leg2Dur = op.leg2Dur ?? approachDur;
    const leg1End = op.start + leg1Dur;
    const holdEnd = leg1End + midHoldDur;
    const leg2End = holdEnd + leg2Dur;
    if (elapsed < op.start) return;
    let progress; // 0..distance, в тех же единицах, что и distance
    if (elapsed <= leg1End) {
      progress = op.midDistance * easeInOutCubic(clamp01((elapsed - op.start) / leg1Dur));
    } else if (elapsed <= holdEnd) {
      progress = op.midDistance; // пауза — здесь и должна случиться реакция (данные примера)
      // Пульс на триггере — НЕПРЕРЫВНАЯ текстурная пульсация (не отдельные
      // DOM-вспышки через равные интервалы), нарисованная прямо в текстуру
      // передней грани самого триггера (setFacePulse/redrawPulseFace) —
      // радиус растёт по кругу с
      // sin-конвертом на вход/выход каждого цикла, кольцо жёстко часть
      // геометрии кубика, не отдельный слой поверх сцены. Волна к цели
      // (spawnWave) остаётся ДИСКРЕТНЫМИ пакетами — это другое явление
      // (конкретный сигнал долетает и что-то вызывает), не путать со
      // сплошной пульсацией «я источник, я влияю».
      if (op.holdPulse) {
        const trigger = movers[0];
        const pulsePeriod = op.holdPulsePeriod ?? 1400;
        const cyclePos = ((elapsed - leg1End) % pulsePeriod) / pulsePeriod;
        const radiusFrac = lerp(0.25, 1.0, cyclePos);
        const envelope = Math.sin(cyclePos * Math.PI);
        setFacePulse(trigger, radiusFrac, 0.85 * envelope, op.holdPulseColor ?? ringColorFrom(colorFor(trigger.tr)));
        const waveGap = op.holdWaveGap ?? 500;
        const waveIdx = Math.floor((elapsed - leg1End) / waveGap);
        const waveKey = '_holdWave' + waveIdx;
        if (!op[waveKey]) {
          op[waveKey] = true;
          const waveTravel = op.holdWaveTravel ?? 400;
          spawnWave(
            frontAnchor(trigger.mesh),
            new THREE.Vector3(slotX(op.target), 0, 0),
            waveTravel,
            op.holdPulseColor ?? ringColorFrom(colorFor(trigger.tr)),
            ctx
          );
        }
      }
    } else if (elapsed <= leg2End) {
      // Пульсация выключается ровно один раз при выходе из паузы —
      // возвращает триггеру его обычный, некольцевой набор материалов
      // (см. setFacePulse: null означает «выключить», просто
      // cube.mesh.material = cube.matsMain, matsMain никогда не
      // мутировался, так что возврат мгновенный и чистый).
      if (op.holdPulse && !op._pulseOff) {
        op._pulseOff = true;
        setFacePulse(movers[0], null);
      }
      progress = op.midDistance + (distance - op.midDistance) * easeInOutCubic(clamp01((elapsed - holdEnd) / leg2Dur));
    } else {
      progress = distance;
    }
    const shift = SLOT * progress * dir;
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift; });
    return;
  }

  const shift = SLOT * distance * dir;
  const peakStart = op.start + approachDur;
  const peakEnd = peakStart + holdDur;
  const retreatEnd = peakEnd + retreatDur;

  if (elapsed < op.start || elapsed > retreatEnd) {
    if (elapsed > retreatEnd) {
      // retreat:false — остаёмся у цели (shift), а не возвращаемся домой (0)
      movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + (retreat ? 0 : shift); });
      if (target) target.mesh.rotation.z = 0;
    }
    return;
  }

  if (elapsed <= peakStart) {
    const t = clamp01((elapsed - op.start) / approachDur);
    const te = easeInOutCubic(t); // было easeOutCubic — плавнее старт
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift * te; });
  } else if (elapsed <= peakEnd) {
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift; });
    if (target && op.pulse !== false && !op._pulsed) {
      op._pulsed = true;
      spawnPulseRing(
        frontAnchor(target.mesh),
        900,
        ringColorFrom(colorFor(movers[0].tr)),
        ctx
      );
    }
  } else {
    const t = clamp01((elapsed - peakEnd) / retreatDur);
    const te = easeOutBack(t); // пружина остаётся — это осознанный характер отскока
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift * (1 - te); });
  }

  // дрожь цели: амплитуда растёт до пика, обрывается резко в момент отскока
  // (только если цель ещё существует — см. комментарий выше)
  if (target) {
    if (elapsed <= peakEnd) {
      const growT = clamp01((elapsed - op.start) / (approachDur + holdDur));
      target.mesh.rotation.z = Math.sin(elapsed * 0.024) * jitterAmp * growT;
    } else {
      target.mesh.rotation.z = 0; // обрыв резкий, не спад
    }
  }
}

/* ОБЩИЙ ХЕЛПЕР ПРИЛЁТА — разгон/торможение + дуга по высоте, единая
   математика для трёх мест (split.arrivals, arrive, merge — где угодно,
   где кубик материализуется за кадром и прилетает по дуге), не
   дублируется под каждую операцию отдельно. Чистая функция — ctx не
   требует вообще. */
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
/** @param {SplitOp} op @param {number} elapsed @param {Ctx} ctx */
export function applySplit(op, elapsed, ctx) {
  const { cubes, scene } = ctx;
  if (elapsed < op.start) return;
  // Источник держим под ОТДЕЛЬНЫМ временным ключом на время отстойника —
  // иначе прилетающий результат с тем же номером слота перезаписывает
  // cubes[op.at] ПОКА источник ещё висит и тает.
  if (!op._srcKey) {
    op._srcKey = '_hold_' + op.at + '_' + Math.random().toString(36).slice(2, 7);
    cubes[op._srcKey] = cubes[op.at];
    delete cubes[op.at];
  }
  const src = cubes[op._srcKey];
  if (!src) return;
  const riseDur = op.riseDur ?? 1300; // было 1000
  const holdOpacity = op.holdOpacity ?? 0.55;
  // Пауза после того, как E уже зависла на месте (riseDur кончился) И
  // результаты (А+Й) уже прилетели и легли в ряд — «дать сравнить старое
  // и новое рядом», не тянуть без единого нового события на экране.
  const holdDur = op.holdDur ?? 1000;
  const fadeDur = op.fadeDur ?? 1100; // было 900
  const holdOffset = op.holdOffset ?? { x: -1.6, y: 2.4, z: 0.4 };
  const basePos = new THREE.Vector3(slotX(op.at), 0, 0);
  const holdPos = basePos.clone().add(new THREE.Vector3(holdOffset.x, holdOffset.y, holdOffset.z));

  // фаза 0: ПАУЗА-ОСОЗНАНИЕ. Раньше распад начинался фактически сразу же
  // после approach (кубик тут же трогался с места) — по живой обратной
  // связи это читалось «слишком быстро», зритель не успевал понять, ЧТО
  // сейчас произойдёт (Е уходит, А+Й приходят), прежде чем это уже
  // произошло. Явная пауза перед подъёмом: кубик НЕ двигается, но заметно
  // сигналит «вот-вот» — мягко пульсирует масштабом (2 удара, как
  // вдох-вдох), плюс два кольца-пульса расходятся вокруг него на сцене.
  const anticipateDur = op.anticipateDur ?? 900;
  const activeStart = op.start + anticipateDur; // отсюда начинается реальное движение
  if (elapsed < activeStart) {
    const t = clamp01((elapsed - op.start) / anticipateDur);
    // два «удара»: |sin| за один период даёт два симметричных горба
    // (пик на четверти и на трёх четвертях, ноль на старте/середине/конце)
    const beat = Math.abs(Math.sin(t * Math.PI * 2)) * 0.06;
    const scale = 1 + beat;
    src.mesh.scale.setScalar(scale);
    src.mesh.position.copy(basePos);
    // два кольца-пульса, разнесённые по паузе — не одновременно со стартом
    // и не в самом конце, а примерно на четверти и на трёх четвертях
    if (!op._pulse0 && t >= 0.15) { op._pulse0 = true; spawnPulseRing(frontAnchor(src.mesh), anticipateDur * 0.6, undefined, ctx); }
    if (!op._pulse1 && t >= 0.6) { op._pulse1 = true; spawnPulseRing(frontAnchor(src.mesh), anticipateDur * 0.6, undefined, ctx); }
    return; // пока идёт пауза — больше в этом кадре по этой операции ничего не делаем
  }
  if (!op._anticipateDone) {
    op._anticipateDone = true;
    src.mesh.scale.setScalar(1);
    src.mesh.material = src.matsMain; // возвращаемся к обычному виду e перед самим подъёмом
  }

  // фаза 1: исходный поднимается в сторону и бледнеет — плавный разгон/
  // торможение (easeInOutCubic, было easeOutCubic — убран рывок в начале).
  const riseEnd = activeStart + riseDur;
  if (elapsed <= riseEnd) {
    const t = clamp01((elapsed - activeStart) / riseDur);
    const te = easeInOutCubic(t);
    src.mesh.position.lerpVectors(basePos, holdPos, te);
    setOpacity(src.mesh, lerp(1, holdOpacity, te));
  } else {
    // фаза 2: покачивание, пока висит
    const idle = (elapsed - riseEnd) * 0.0022;
    src.mesh.position.copy(holdPos);
    src.mesh.position.y += Math.sin(idle) * 0.06;
  }

  // прилёт результатов — каждый по своим параметрам, отсчёт от activeStart
  // (не от op.start — пока идёт пауза-осознание, ничего ещё не прилетает).
  // Разгон/торможение — easeInOutCubic, тот же мотив «без рывка».
  (op.arrivals || []).forEach(arr => {
    if (elapsed < activeStart + arr.delay) return;
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
    const t = clamp01((elapsed - (activeStart + arr.delay)) / arr.dur);
    const p = flyArcPosition(arr.from, slotX(arr.newSlot), 0, 0, t, arr.arcHeight ?? 1.0);
    nc.mesh.position.set(p.x, p.y, p.z);
  });

  // фаза 3: после паузы для сравнения — исходный растворяется совсем.
  // Момент старта угасания зависит от того, что случится ПОЗЖЕ — источник
  // поднялся в отстойник, ИЛИ все результаты долетели и сели.
  const arrivals = op.arrivals || [];
  const lastArrivalEnd = arrivals.length
    ? Math.max(...arrivals.map(a => a.delay + a.dur))
    : 0;
  const compareReadyAt = Math.max(riseEnd, activeStart + lastArrivalEnd);
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

/* ARRIVE (шаг «грам.» в āsīt: окончание -īt тихо присоединяется к основе,
   без единого события сандхи). Кубик(и) материализуются ЗА кадром и
   прилетают по дуге в свой слот — та же матчасть, что у прилёта
   результатов split (flyArcPosition), но БЕЗ второй половины split (никто
   не тает, никто не превращается) — просто прибыл и остался. Специально
   БЕЗ сигнального цвета/вспышки в момент посадки: это тихое морфологическое
   присоединение, не сандхи — эффект только там, где реально сработало
   правило. Несколько элементов сразу — items[], каждый со своим
   delay/dur/from/arcHeight, как у split.arrivals.
   { type:'arrive', items:[{into,newSlot,from,delay,dur,arcHeight}], start } */
/** @param {ArriveOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyArrive(op, elapsed, ctx) {
  const { cubes, scene } = ctx;
  (op.items || []).forEach(item => {
    if (elapsed < op.start + item.delay) return;
    let nc = op._made?.[item.newSlot];
    if (!nc) {
      nc = makeCube(item.into, item.newSlot * 131 + 17);
      nc._fallDone = true;
      nc.mesh.visible = false;
      scene.add(nc.mesh);
      scene.add(nc.shadow);
      cubes[item.newSlot] = nc;
      op._made = op._made || {};
      op._made[item.newSlot] = nc;
    }
    nc.mesh.visible = true;
    const t = clamp01((elapsed - (op.start + item.delay)) / item.dur);
    const p = flyArcPosition(item.from, slotX(item.newSlot), 0, 0, t, item.arcHeight ?? 1.0);
    nc.mesh.position.set(p.x, p.y, p.z);
  });
}

/* MERGE — слияние. Все буквы падают вместе, с зазором между смысловыми
   частями слова, потом происходит притяжение — merge работает с УЖЕ
   существующим, упавшим кубиком (не материализует его за кадром: все
   буквы должны быть видны с самого начала, просто с паузой между частями
   слова), from — номер его исходного слота, ровно как movers у
   approach), просто едет вдоль ряда в позицию цели по прямой (без дуги —
   это скольжение по своей полосе, не прилёт со стороны, дуга здесь была
   бы визуально противоречащей самой идее). Слот-ключ источника (from)
   специально НЕ переименовывается у соседей справа — они просто держат
   СВОИ исходные номера слотов, даже когда их РЕАЛЬНАЯ позиция на экране
   смещена соседней approach-операцией (см. applyApproach retreat:false) —
   для порядка/подсчёта это неважно, важна только сортировка номеров, а
   не их непрерывность.
   { type:'merge', from, at, toGlyph, toColor, start, dur=1400, pulseHoldMs } */
/** @param {MergeOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyMerge(op, elapsed, ctx) {
  const { cubes } = ctx;
  if (elapsed < op.start) return;
  const target = cubes[op.at];
  if (!target) return;
  // mover ищется и проверяется ТОЛЬКО внутри фазы полёта (где он ещё
  // нужен), не одним guard'ом со всей функцией — источник УДАЛЯЕТСЯ из
  // cubes{} по завершении слияния (см. `delete cubes[op.from]` ниже), и
  // guard над всей функцией на следующем кадре нашёл бы mover===undefined
  // и оборвал бы спад пика масштаба, который к этому моменту ещё не
  // начинался. Спад пика зависит только от target, который никогда не
  // удаляется, и потому не обрывается (тот же класс бага, что и в
  // applyTransform — см. комментарий про guard по op._done там).
  if (!op._done) {
    const mover = cubes[op.from];
    if (!mover) return; // источник ещё не существует/уже удалён раньше времени — не должно происходить штатно, но не роняем функцию
    const dur = op.dur ?? 1400;
    const t = clamp01((elapsed - op.start) / dur);
    const te = easeInOutCubic(t);
    const toX = target.mesh.position.x;
    mover.mesh.position.x = lerp(slotX(op.from), toX, te);
    mover.shadow.position.x = mover.mesh.position.x;
    if (t >= 1) {
      op._done = true;
      mover.mesh.visible = false;
      mover.shadow.visible = false;
      delete cubes[op.from]; // слились — отдельного кубика больше нет вообще
      const newColor = op.toColor ?? colorFor(op.toGlyph);
      regenMats(target, op.toGlyph, newColor);
      target.mesh.material = target.matsMain; // категория звука не меняется — сигнального цвета не нужно
      spawnPulseRing(frontAnchor(target.mesh), op.pulseHoldMs ?? 1300, GROUP_RGB, ctx);
      // Настоящая вспышка: пик масштаба заметно выше стандартного (1.35) +
      // реальное свечение материала (emissive/emissiveIntensity — не
      // имитация цветом текстуры, а живое GPU-свойство), тон — тот же
      // нейтральный GROUP_COLOR, что у кольца-пульса рядом (одна и та же
      // вспышка, не два разных цветовых события одновременно). Оба —
      // масштаб и свечение — спадают синхронно, одной и той же кривой, до 0.
      target.mesh.material.forEach(m => { m.emissive.setHex(GROUP_COLOR); m.emissiveIntensity = 0.9; });
      target.mesh.scale.setScalar(1.35);
      op._pulsedAt = elapsed;
    }
  }
  // Спад пика масштаба — ВНЕ guard'а `if (op._done) return`: идёт каждый
  // кадр после слияния независимо от op._done — тот же класс бага, что и
  // выше (финализация и продолжающийся спад НЕ должны сидеть за одним и
  // тем же early-return, иначе масштаб застревает на пике навсегда).
  if (op._pulsedAt != null) {
    const pt = clamp01((elapsed - op._pulsedAt) / 600);
    const e = easeOutCubic(pt);
    target.mesh.scale.setScalar(lerp(1.35, 1, e));
    target.mesh.material.forEach(m => { m.emissiveIntensity = lerp(0.9, 0, e); });
  }
}

// Двойной прыжок: основной высокий взлёт (t 0–0.6, амплитуда bounceH) и
// заметно меньший довдох сразу следом (t 0.6–1.0, ~30% от основной
// высоты) — та же логика «удар, потом меньший отзвук», что уже
// используется в паузе перед split. Обе половины стыкуются без разрыва
// (обе синусоиды дают 0 на границе t=0.6). Цвет меняется РОВНО на
// вершине волны (t=0.5).
/** @param {SettleOp} op @param {number} elapsed @param {Ctx} ctx */
export function applySettle(op, elapsed, ctx) {
  const { cubes } = ctx;
  const stepDelay = op.stepDelay ?? 180;
  const bounceDur = op.bounceDur ?? 600;
  const bounceH = op.bounceH ?? 0.32;
  op.slots.forEach((slot, i) => {
    const cube = cubes[slot];
    if (!cube) return;
    const start = op.start + i * stepDelay;
    if (elapsed < start || elapsed > start + bounceDur) return;
    const t = clamp01((elapsed - start) / bounceDur);
    const h = t <= 0.6
      ? bounceH * Math.sin((t / 0.6) * Math.PI)
      : bounceH * 0.3 * Math.sin(((t - 0.6) / 0.4) * Math.PI);
    cube.mesh.position.y = h;
    if (!cube._settled && t >= 0.5) {
      cube._settled = true;
      cube.mesh.material = cube.matsReady;
    }
  });
}

/* DIM (форма ручного управления, оставлена для обратной совместимости и
   точечных случаев) — притенение неактивных букв по явному списку слотов
   и окну времени. Для нового материала предпочтительно data.steps выше —
   он сам считает пересечения и снимает притенение к концу; ручной 'dim'
   по-прежнему полезен для локальных, не связанных с шагами эффектов.
   { type:'dim', slots:[...], start, end, dimOpacity=0.22, ramp=700 } */
/** @param {DimOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyDim(op, elapsed, ctx) {
  const { cubes } = ctx;
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

/* Притенение неактивных букв по текущему шагу (data.steps) — общий,
   автоматический механизм, отдельный от ручного 'dim' выше. Между
   авторскими шагами МОЖЕТ быть зазор — движок сам превращает его в явное
   «проявление» (activeSlots:'ALL', см. buildRuntimeSteps/sameActiveSlots).

   Переход на КАЖДОЙ границе шагов считается РОВНО ОДИН РАЗ — ramp-in в
   шаге, наступающем ПОСЛЕ границы, читает реальную (уже подведённую к
   цели) яркость prev, не декларативный target. Отдельного ramp-out НЕТ —
   он был бы конфликтующим (двойной счёт одного и того же перехода с
   двух концов), не просто лишним. Не op-based (сигнатура отличается от
   всех остальных apply* — вызывается раз в кадр без привязки к конкретной
   операции), но по той же схеме: внешние зависимости через ctx. */
/** @param {number} elapsed @param {Ctx} ctx */
export function applyStepDim(elapsed, ctx) {
  const { cubes, runtimeSteps, data } = ctx;
  if (!runtimeSteps) return;
  const dimOpacity = data.dimOpacity ?? 0.22;
  const RAMP = data.stepRamp ?? 550;
  const REVEAL_STAGGER = data.revealStagger ?? 130;
  const REVEAL_RAMP = data.revealRamp ?? 700;
  const idx = stepIndexAt(elapsed, runtimeSteps);
  const cur = runtimeSteps[idx];
  const prev = runtimeSteps[idx - 1];
  const orderedSlots = Object.keys(cubes)
    .filter(key => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b); // порядок слева направо — тот самый, что просила пользователь
  const enteringReveal = prev && cur.activeSlots === 'ALL';
  orderedSlots.forEach((slot, order) => {
    const cube = cubes[slot];
    let target = stepTargetOpacity(cur, slot, dimOpacity);
    if (enteringReveal) {
      const t = clamp01((elapsed - cur.start - order * REVEAL_STAGGER) / REVEAL_RAMP);
      target = lerp(stepTargetOpacity(prev, slot, dimOpacity), target, t);
    } else if (prev && elapsed - cur.start < RAMP) {
      const t = clamp01((elapsed - cur.start) / RAMP);
      target = lerp(stepTargetOpacity(prev, slot, dimOpacity), target, t);
    }
    setOpacity(cube.mesh, target);
  });
}
