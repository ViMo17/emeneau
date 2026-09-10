// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — applyInfluence (дальнодействие причина→цель) и applyApproach (физическое сближение).
// Часть модульного разбиения slot-engine-ops.js — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  SLOT, GROUP_RGB, colorFor, ringColorFrom, clamp01, lerp, easeInOutCubic, easeOutBack, slotX,
} from './slot-engine-core.js';
import { resolveSlotRef } from './slot-engine-words.js';
import { frontAnchor, spawnPulseRing, setFacePulse, spawnWave, updateGroupFrame } from './slot-engine-ops-shared.js';

/** @param {import('./slot-engine-types.js').InfluenceOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
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
  // op.ringRgb — явное переопределение (строка "R,G,B"): нужно для
  // ВЗАИМНОЙ пары РАВНОЗНАЧНЫХ участников (два встречных influence, каждый
  // с ОДНИМ источником) — без override каждая сторона тонируется в СВОЙ
  // фонетический цвет (a≠au/ī), и хотя тайминг у обеих РОВНО одинаковый
  // (общий elapsed на кадр, доказано по коду), разный цвет читается как
  // «не согласовано, не одно событие» (прямая обратная связь: «не
  // синхронизированы кольца пульсации»). Общий ringRgb на обеих сторонах
  // пары — визуально «одно дышащее целое», как уже сделано для настоящих
  // групп >1 источников.
  const ringRgb = op.ringRgb ?? (sources.length > 1 ? GROUP_RGB : ringColorFrom(colorFor(sources[0].tr)));
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

/** @param {import('./slot-engine-types.js').ApproachOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
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
  // baseXs — стартовая позиция каждого мувера. По умолчанию slotX(slot)
  // (мувер стоит на своём канонiчном слоте) — op.fromX (необязательный
  // массив, тот же порядок, что и movers/slots) переопределяет её, когда
  // мувер к этому моменту уже физически стоит НЕ на своём слоте (например,
  // слился с соседом на общем зазоре через merge — ключ в cubes{} не
  // меняется от merge/approach, см. rule1). Без fromX поведение не меняется
  // ни на йоту — ни один существующий пример его не передаёт.
  const baseXs = slots.map((s, i) => op.fromX?.[i] ?? slotX(s));
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

  // Буква на грани мувера исчезает, как только сближение прошло долю
  // op.blankAtProgress (0..1) от approachDur — прямой запрос пользователя:
  // «как только кубики наполовину соприкоснулись, надписи должны
  // исчезнуть», не ждать до самой посадки/слияния. Переключается РОВНО
  // один раз (op._blanked), на matsBlank (тот же приём, что и везде для
  // «кубик виден, буквы нет» — TRANSFORM_KIND.vargaPair/assimToNeighbor,
  // rule50 avagraha). Необязательное поле — ни один существующий пример
  // его не передаёт, поведение остальных approach не меняется.
  if (op.blankAtProgress != null && !op._blanked && elapsed >= op.start) {
    const approachProgress = clamp01((elapsed - op.start) / approachDur);
    if (approachProgress >= op.blankAtProgress) {
      op._blanked = true;
      movers.forEach(m => { m.mesh.material = m.matsBlank; });
    }
  }

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
