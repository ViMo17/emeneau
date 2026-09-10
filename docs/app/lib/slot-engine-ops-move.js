// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — applySplit/applyArrive/applyMerge/applyBud — операции, создающие или физически перемещающие кубики (распад, тихий прилёт, слияние, отпочкование).
// Часть модульного разбиения slot-engine-ops.js — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  GROUP_COLOR, GROUP_RGB, colorFor, clamp01, lerp, easeOutCubic, easeInOutCubic, easeOutBackProgress, slotX, setOpacity,
} from './slot-engine-core.js';
import { makeCube, regenMats } from './slot-engine-cube.js';
import { frontAnchor, spawnPulseRing, spawnLabelPill, flyArcPosition } from './slot-engine-ops-shared.js';

/** @param {import('./slot-engine-types.js').SplitOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
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
    // Пилюля-подпись — НАД источником (split = «продолжается в новой
    // форме»), на весь путь: подъём + ожидание результатов + пауза-
    // сравнение + угасание (та же формула compareReadyAt/fadeStart, что и
    // в фазе 3 ниже, посчитана здесь заранее относительно activeStart).
    if (op.label) {
      const arrivalsList = op.arrivals || [];
      const lastArrivalEnd = arrivalsList.length ? Math.max(...arrivalsList.map(a => a.delay + a.dur)) : 0;
      const compareReadyDur = Math.max(riseDur, lastArrivalEnd);
      // op.labelY — необязательное per-op переопределение высоты пилюли.
      // РЕАЛЬНЫЙ НАЙДЕННЫЙ БАГ: генерическая формула «holdOffset.y+CUBE_SIZE»
      // здесь ранее применялась КО ВСЕМ split с label одинаково — на
      // тесном окне (900x440, тестовый полигон) это давало мировой y=3.5,
      // который проецируется в считаные пиксели от верхнего края кадра
      // (реальной камерой проверено: pixelY≈3.4 из 440) — пилюля физически
      // уходила за пределы видимой области. Более того, безопасная высота
      // ЗАВИСИТ от геометрии arrivals конкретного примера (у agnayas
      // arrival «y» поднимается до мировых y≈3.7 — единой безопасной
      // формулы для всех split нет). Дефолт без op.labelY — прежний,
      // проверенный (CUBE_SIZE*1.6, см. spawnLabelPill) — не трогает уже
      // подтверждённые примеры (agnayas); rule50 передаёт labelY явно.
      spawnLabelPill(op.label, op.at, true, compareReadyDur + holdDur + fadeDur, ctx, op.labelY, op.labelX);
    }
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

/** @param {import('./slot-engine-types.js').ArriveOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
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

/** @param {import('./slot-engine-types.js').MergeOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
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
    // Пилюля-подпись — НАД целью (merge = «продолжается в новой форме»), на
    // весь путь мувера плюс спад вспышки-удара после (600мс, см. ниже).
    // xWorldOverride — ЖИВАЯ target.mesh.position.x, не slotX(op.at): цель
    // сама может быть УЖЕ физически переехавшей до merge (собственный
    // approach на общий зазор, см. rule1/rule2) — пилюля должна висеть НАД
    // ней там, где она реально стоит, не над номинальным слотом-ключом.
    // НО только когда op.labelX НЕ передан явно — если target's approach
    // стартует в ТОТ ЖЕ elapsed, что и сам merge (обычный случай), на
    // первом кадре target ЕЩЁ не сдвинулась (te=0), и «живая» позиция
    // совпадает со СТАРЫМ местом — ложное срабатывание найдено численно
    // (rule1/rule2: пилюля всё равно висела не там). Явный op.labelX
    // (относительное смещение от slotX(op.at), например slotX(зазора) −
    // slotX(op.at)) должен ПОБЕЖДАТЬ автоматику, не наоборот.
    if (op.label && !op._labelSpawned) {
      op._labelSpawned = true;
      const liveX = op.labelX != null ? undefined : target.mesh.position.x;
      spawnLabelPill(op.label, op.at, true, dur + 600, ctx, op.labelY, op.labelX, liveX);
    }
    const t = clamp01((elapsed - op.start) / dur);
    const te = easeInOutCubic(t);
    const toX = target.mesh.position.x;
    mover.mesh.position.x = lerp(slotX(op.from), toX, te);
    mover.shadow.position.x = mover.mesh.position.x;
    // Буква на грани мувера исчезает на полпути к цели — тот же приём и
    // то же обоснование, что и у approach (см. applyApproach) — «кубики
    // наполовину соприкоснулись» относится и к полёту мувера здесь, не
    // только к approach-сближению до него.
    if (op.blankAtProgress != null && !op._blanked && t >= op.blankAtProgress) {
      op._blanked = true;
      mover.mesh.material = mover.matsBlank;
    }
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
  // НАЙДЕННЫЙ БАГ (численная симуляция, при подготовке rule1 — merge с
  // ПОСЛЕДУЮЩИМ transform на том же кубике): без `_decayDone` этот блок
  // продолжал ЛЕЗТЬ в `target.mesh.material.forEach` НАВСЕГДА, даже спустя
  // много секунд после того, как спад уже полностью завершился (pt=1,
  // clamp01 держит его там) — а к тому моменту последующий transform уже
  // не раз переприсваивал `target.mesh.material` на временные/уничтоженные
  // наборы (blank-стадия вриддхи), и обращение к ним падало. Одноразовый
  // `_decayDone` останавливает блок РОВНО ОДИН РАЗ, когда спад уже
  // применён и завершён — не мешает самому спаду (тот всё ещё видит каждый
  // промежуточный кадр, кроме самого последнего лишнего).
  if (op._pulsedAt != null && !op._decayDone) {
    const pt = clamp01((elapsed - op._pulsedAt) / 600);
    if (pt >= 1) op._decayDone = true;
    const e = easeOutCubic(pt);
    target.mesh.scale.setScalar(lerp(1.35, 1, e));
    target.mesh.material.forEach(m => { m.emissiveIntensity = lerp(0.9, 0, e); });
  }
}

/* BUD (отпочкование) — зеркало `merge`, не вариант `split`. В merge
   существующий мувер едет по прямой (высота ряда) к цели и ИСЧЕЗАЕТ при
   контакте, вспышка — на ЦЕЛИ в момент касания (конец пути). Здесь —
   наоборот: источник остаётся на месте, клон ПОЯВЛЯЕТСЯ ровно в его
   позиции (визуально ещё не отделился) и едет по прямой к своему слоту,
   вспышка — на ИСТОЧНИКЕ в момент появления клона (начало пути, не конец
   — тот же принцип «момент начала реакции нуждается в отдельном сигнале»,
   что и у elide). Прямой запрос пользователя: «как будто исходная буква
   пульсирует, вспыхивает расширяясь на мгновенье — и от неё горизонтально
   отпочковывается такая же буква... как капля отрывается от другой капли,
   но форма куба должна оставаться основной» — три уже проверенных приёма
   (вспышка-в-начале из elide, спад свечения из merge, пружинка easeOutBack
   из отскока approach) впервые собраны в одной операции, не изобретаются
   заново. Первый реальный тест гэпа DOUBLE (гемина́ция) — источник и клон
   получают ОДИНАКОВЫЙ toGlyph, движок не делает для этого ничего особого
   (просто makeCube с тем же глифом, что и у источника).
   { type:'bud', from, to, toGlyph, start, dur=1200, flashDecay=600 } */

/** @param {import('./slot-engine-types.js').BudOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function applyBud(op, elapsed, ctx) {
  const { cubes, scene } = ctx;
  if (elapsed < op.start) return;
  const source = cubes[op.from];
  if (!source) return;
  const dur = op.dur ?? 1200;
  const flashDecay = op.flashDecay ?? 600; // тот же темп спада, что у merge

  if (!op._clone) {
    // Клон появляется РОВНО на месте источника — визуально ещё не
    // отделился, читается как «источник ещё дрожит, из него уже
    // проступает копия», не «два независимых кубика с самого начала».
    const nc = makeCube(op.toGlyph, op.to * 97 + 41);
    nc._fallDone = true;
    nc.mesh.position.set(slotX(op.from), 0, 0);
    scene.add(nc.mesh);
    scene.add(nc.shadow);
    cubes[op.to] = nc;
    op._clone = nc;

    if (op.label) spawnLabelPill(op.label, op.from, true, dur + flashDecay, ctx, op.labelY, op.labelX);

    spawnPulseRing(frontAnchor(source.mesh), op.pulseHoldMs ?? 1300, GROUP_RGB, ctx);
    source.mesh.scale.setScalar(1.35);
    source.mesh.material.forEach(m => { m.emissive.setHex(GROUP_COLOR); m.emissiveIntensity = 0.9; });
    op._flashAt = elapsed;
  }

  // Спад вспышки источника — ВНЕ guard'а выше, идёт каждый кадр независимо
  // от того, долетел ли уже клон (тот же класс бага, что и в applyMerge/
  // applyTransform — финализация и продолжающийся спад не должны сидеть
  // за одним и тем же early-return).
  if (op._flashAt != null) {
    const ft = clamp01((elapsed - op._flashAt) / flashDecay);
    const fe = easeOutCubic(ft);
    source.mesh.scale.setScalar(lerp(1.35, 1, fe));
    source.mesh.material.forEach(m => { m.emissiveIntensity = lerp(0.9, 0, fe); });
  }

  // Полёт клона — по прямой (высота ряда, БЕЗ дуги — то же скольжение
  // вдоль полосы, что и у мувера в merge, зеркально по направлению),
  // easeOutBackProgress (НЕ easeOutBack — та не 0→1 функция, см. её
  // комментарий в slot-engine-core.js) даёт лёгкий перелёт-и-пружинку на
  // прибытии («оторвалось и слегка спружинило», не мёртвая остановка).
  const nc = op._clone;
  const t = clamp01((elapsed - op.start) / dur);
  const te = easeOutBackProgress(t);
  nc.mesh.position.x = lerp(slotX(op.from), slotX(op.to), te);
  nc.shadow.position.x = nc.mesh.position.x;
  if (t >= 1) op._done = true;
}

// Двойной прыжок: основной высокий взлёт (t 0–0.6, амплитуда bounceH) и
// заметно меньший довдох сразу следом (t 0.6–1.0, ~30% от основной
// высоты) — та же логика «удар, потом меньший отзвук», что уже
// используется в паузе перед split. Обе половины стыкуются без разрыва
// (обе синусоиды дают 0 на границе t=0.6). Цвет меняется РОВНО на
// вершине волны (t=0.5).
