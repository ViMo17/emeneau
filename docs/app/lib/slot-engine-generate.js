// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — ЭКСПЕРИМЕНТАЛЬНЫЙ генератор ops/steps/initial. Пока
// покрывает одну категорию реестра взаимодействий (docs/reference/
// interaction-registry.md, Часть А): influence + transform (voicing/place/
// часть grade — правила 19,30-33,37-40,59,63,69,70,71 и другие), в двух
// формах — один шаг (buildInfluenceTransformExample) и цепочка нескольких
// шагов подряд (buildInfluenceTransformChain, например taddhiraṇyam: шаг
// 70 → шаг 71). elide/merge/split — отдельные категории, генератор для
// них ещё не написан. НЕ используется основным приложением ни одним из
// EXAMPLES[] — только новыми example-файлами, которые сознательно вызывают
// его.
//
// Формулы таймингов подобраны не на глаз, а сверены с уже построенными и
// визуально проверенными эталонами: rule71 (vāk asti, один шаг) и rule70
// (taddhiraṇyam, цепочка из двух шагов). Совпадение по influence.start/
// transform.start в пределах 20мс (меньше кадра при 60fps); ringHoldDur и
// формула связки шагов (step2.start = step1.transform.start+2×anticipate
// Dur) — ТОЧНОЕ совпадение. Раскладка слотов (центрирование слов с
// однослотовым зазором между ними) совпала с rule71 побуквенно.
// Численная проверка — не замена визуальной: любой новый пример,
// построенный через этот генератор, всё равно проходит обычный цикл
// (тестовый полигон → визуальная проверка пользователем) перед
// интеграцией в приложение, как и рукописные примеры.
// ═══════════════════════════════════════════════════════════════════════════

import { N_SLOTS, MS_PER_360, slotX } from './slot-engine-core.js';

const FALL_STAGGER = 260; // движковый дефолт (data.fallStagger ?? 260) — продублирован здесь для расчёта момента приземления
const FALL_DUR = 1300;    // движковый дефолт (data.fallDur ?? 1300)
// Буфер после приземления до начала шага — 340мс у rule71, 300мс у
// taddhiraṇyam шаг 1 (оба вручную построены и визуально проверены) —
// разброс ±40мс, обычная ручная вариация при авторстве, не ошибка.
// Среднее (320) — разумный дефолт, автор при желании подправит на глаз.
const BUFFER_AFTER_FALL = 320;
// Пауза между стартом influence и стартом transform — ТОЧНО одинакова во
// всех трёх наблюдаемых шагах (rule71, taddhiraṇyam шаг1 и шаг2) — не
// усреднение, а совпавшее число.
const INFLUENCE_TO_TRANSFORM_GAP = 2600;
const ANTICIPATE_DUR = 900; // движковый дефолт applyTransform (op.anticipateDur ?? 900)
// Зазор между концом нетерминального шага цепочки и стартом следующего —
// сверено с taddhiraṇyam (step1.end=7830, step2.start=8080, разница
// ровно 250) — проверено только на ОДНОЙ цепочке (в отличие от остальных
// констант выше, у формулы связки шагов пока нет второго независимого
// подтверждения).
const STEP_END_LEAD = 250;

/**
 * Раскладка: слова подряд, между ними по одному пустому слоту (граница
 * слов — тот же принцип, что и у ВСЕХ примеров внешних сандхи, зазор не
 * схлопывается), весь блок центрируется по N_SLOTS — формула сверена
 * побуквенно с rule71 (vāk asti).
 * @param {string[][]} words
 * @returns {{initial: import('./slot-engine-types.js').InitialItem[], wordSlots: number[][], totalLetters: number}}
 */
function layoutWords(words) {
  const totalLetters = words.reduce((s, w) => s + w.length, 0);
  const totalSpan = totalLetters + (words.length - 1);
  const startSlot = Math.floor((N_SLOTS - totalSpan) / 2);

  const initial = [];
  /** @type {number[][]} */
  const wordSlots = [];
  let cursor = startSlot;
  for (const word of words) {
    const slots = [];
    for (const glyph of word) {
      initial.push({ slot: cursor, tr: glyph });
      slots.push(cursor);
      cursor += 1;
    }
    wordSlots.push(slots);
    cursor += 1; // зазор перед следующим словом
  }
  return { initial, wordSlots, totalLetters };
}

/**
 * @typedef {Object} InfluenceTransformStepSpec
 * @property {{word: number, letter: number}} trigger — источник влияния (nimitta)
 * @property {{word: number, letter: number}} target — буква, которая меняется (sthānin)
 * @property {string} toGlyph — новый глиф после transform
 * @property {{spinTurns: number, signal: 'blank'|'gold'|'silver'}} transformKind — обычно TRANSFORM_KIND.vargaPair/assimToNeighbor
 * @property {number} ruleNum
 * @property {number} color - цвет чипа шага (сверить с реальным CSS-тиром правила)
 * @property {boolean} [primary] - главный шаг ролика (дефолт false — автор решает явно, не угадывается)
 * @property {number} [clearance] - переопределение направления раскачивания transform (дефолт движка +0.35)
 */

/**
 * Строит { initial, steps, ops } для ЦЕПОЧКИ из одного или нескольких
 * шагов категории «influence+transform» подряд (реестр, Часть А: voicing/
 * place/часть grade) — например taddhiraṇyam: шаг 70 (h→dh) → шаг 71
 * (t→d). Каждый следующий шаг стартует от TRANSFORM.START предыдущего
 * (не от падения) — см. константы ANTICIPATE_DUR/STEP_END_LEAD выше.
 *
 * @param {Object} spec
 * @param {string[][]} spec.words — слова, каждое — массив глифов (1 кубик = 1 глиф)
 * @param {InfluenceTransformStepSpec[]} spec.steps — шаги подряд, в порядке исполнения
 * @returns {import('./slot-engine-types.js').ExampleData}
 */
export function buildInfluenceTransformChain(spec) {
  const { words, steps } = spec;
  const { initial, wordSlots, totalLetters } = layoutWords(words);
  const fallComplete = (totalLetters - 1) * FALL_STAGGER + FALL_DUR;

  // Первый проход: influence.start/transform.start каждого шага — каждый
  // зависит только от ПРЕДЫДУЩЕГО transform.start (падение — только для
  // самого первого шага цепочки).
  const timing = [];
  let prevTransformStart = null;
  for (let i = 0; i < steps.length; i++) {
    const influenceStart = prevTransformStart === null
      ? fallComplete + BUFFER_AFTER_FALL
      : prevTransformStart + 2 * ANTICIPATE_DUR;
    const transformStart = influenceStart + INFLUENCE_TO_TRANSFORM_GAP;
    timing.push({ influenceStart, transformStart });
    prevTransformStart = transformStart;
  }

  // Второй проход: step.end — терминальный (последний) шаг заканчивается
  // как одиночный (transformStart+anticipateDur-50), нетерминальный —
  // вплотную к старту следующего шага минус STEP_END_LEAD.
  const runtimeSteps = steps.map((s, i) => {
    const { influenceStart, transformStart } = timing[i];
    const isLast = i === steps.length - 1;
    const end = isLast
      ? transformStart + ANTICIPATE_DUR - 50
      : timing[i + 1].influenceStart - STEP_END_LEAD;
    const triggerSlot = wordSlots[s.trigger.word][s.trigger.letter];
    const targetSlot = wordSlots[s.target.word][s.target.letter];
    // Длительность оборота — ТА ЖЕ формула, что и в applyTransform
    // (slot-engine-ops.js, landsOnOppositeFace): полуоборот (0.5, 1.5...,
    // TRANSFORM_KIND.vargaPair) садится на противолежащую грань и всегда
    // идёт 1800мс (эталон — docs/effects/rule-assimilation-varga-t-d.html),
    // не по общей формуле spinTurns×MS_PER_360 — та применяется только к
    // целым оборотам (гуна/вриддхи/ассимиляция).
    const spinTurns = s.transformKind.spinTurns ?? 1;
    const landsOnOppositeFace = Math.round(spinTurns * 2) % 2 !== 0;
    const transformDur = landsOnOppositeFace ? 1800 : Math.abs(spinTurns) * MS_PER_360;
    const ringHoldDur = INFLUENCE_TO_TRANSFORM_GAP + transformDur;
    /** @type {import('./slot-engine-types.js').Step} */
    const step = {
      kind: 'rule', ruleNum: s.ruleNum, start: influenceStart, end,
      activeSlots: [targetSlot, triggerSlot], color: s.color, primary: s.primary ?? false,
    };
    /** @type {import('./slot-engine-types.js').InfluenceOp} */
    const influenceOp = { type: 'influence', from: triggerSlot, to: targetSlot, start: influenceStart, ringHoldDur };
    /** @type {import('./slot-engine-types.js').TransformOp} */
    const transformOp = {
      type: 'transform', at: targetSlot, toGlyph: s.toGlyph, start: transformStart, ...s.transformKind,
      ...(s.clearance !== undefined ? { clearance: s.clearance } : {}),
    };
    return { step, ops: [influenceOp, transformOp] };
  });

  return {
    initial,
    steps: runtimeSteps.map(r => r.step),
    ops: runtimeSteps.flatMap(r => r.ops),
  };
}

// Зазор между концом leg1 (подъезд вплотную) и стартом elide — движки
// приближения (spawnWave при holdPulse) реально «долетают» за ~400мс,
// плюс небольшой запас, чтобы реакция читалась ПОСЛЕ импульса, не
// одновременно с ним — сверено с śādhi (leg1End=3500, elide.start=3950,
// разница ровно 450).
const APPROACH_TO_ELIDE_GAP = 450;
// Полная длительность elide (рождение+пауза+угасание) — сумма дефолтов
// самой applyElide (riseDur:1300 + holdDur:800 + fadeDur:1100 = 3200), не
// отдельная константа генератора — если дефолты движка изменятся, эта
// формула должна быть пересчитана вместе с ними.
const ELIDE_TOTAL_DUR = 1300 + 800 + 1100;
// Запас после полного угасания elide до конца шага — сверено с śādhi
// (150мс), тот же порядок величины, что и в approach+merge (āsīt).
const ELIDE_TAIL_BUFFER = 150;

/**
 * Строит { initial, steps, ops } для категории «approach + elide» (реестр:
 * буква исчезает без замены как реакция на приближение соседа — например
 * śādhi, s+dh→∅). Один шаг: движущаяся часть (movers) подъезжает вплотную
 * к цели (leg1), держит паузу с непрерывным пульсом (midHoldDur) — В ЭТОЙ
 * паузе цель начинает elide (погружается, исчезает), — затем movers
 * довершают путь на освободившееся место (leg2).
 *
 * @param {Object} spec
 * @param {string[][]} spec.words — слова (морфологические части), между ними зазор в 1 слот
 * @param {{word: number, letter: number}[]} spec.movers — буквы, которые едут (первая — «активный» участник для activeSlots, остальные едут пассажирами)
 * @param {{word: number, letter: number}} spec.target — буква, которая исчезает (elide, без замены)
 * @param {number} spec.ruleNum
 * @param {number} spec.color
 * @param {number} [spec.approachDur] - длительность leg1 (дефолт движка 900)
 * @param {number} [spec.midHoldDur] - длительность паузы, в которой начинается elide (дефолт 1400 — сверено с śādhi, но только на ОДНОМ примере, меньше уверенности, чем у остальных констант)
 * @param {number} [spec.leg2Dur] - длительность довозки на освободившееся место (дефолт движка 600)
 * @param {number} [spec.midDistance] - зазор, на котором останавливается leg1 (дефолт движка 1.0)
 * @param {number} [spec.distance] - общее расстояние подъезда (дефолт движка 2.0)
 * @returns {import('./slot-engine-types.js').ExampleData}
 */
export function buildApproachElideExample(spec) {
  const { words, movers, target, ruleNum, color, approachDur, midHoldDur, leg2Dur, midDistance, distance } = spec;
  const { initial, wordSlots, totalLetters } = layoutWords(words);

  const moverSlots = movers.map(({ word, letter }) => wordSlots[word][letter]);
  const targetSlot = wordSlots[target.word][target.letter];
  const approachDurVal = approachDur ?? 900;

  const fallComplete = (totalLetters - 1) * FALL_STAGGER + FALL_DUR;
  const stepStart = fallComplete + BUFFER_AFTER_FALL;
  const leg1End = stepStart + approachDurVal;
  const elideStart = leg1End + APPROACH_TO_ELIDE_GAP;
  const stepEnd = elideStart + ELIDE_TOTAL_DUR + ELIDE_TAIL_BUFFER;

  return {
    initial,
    steps: [
      { kind: 'rule', ruleNum, start: stepStart, end: stepEnd, activeSlots: [targetSlot, moverSlots[0]], color, primary: true },
    ],
    ops: [
      {
        type: 'approach', movers: moverSlots, target: targetSlot, start: stepStart,
        approachDur: approachDurVal, midDistance: midDistance ?? 1.0, midHoldDur: midHoldDur ?? 1400,
        leg2Dur: leg2Dur ?? 600, distance: distance ?? 2.0, retreat: false, jitterAmp: 0, pulse: false,
        holdPulse: true,
      },
      { type: 'elide', at: targetSlot, start: elideStart },
    ],
  };
}

// Дефолты applyApproach (БЕЗ midDistance — простая одноразовая ветка:
// подъезд → пауза → пружинистый отскок назад) — сверены с кодом
// slot-engine-ops.js, не подобраны.
const APPROACH_DUR_DEFAULT = 1150;
const APPROACH_HOLD_DUR_DEFAULT = 550;
const APPROACH_RETREAT_DUR_DEFAULT = 950;
// Запас между полным циклом approach (туда-пауза-обратно) и стартом split
// — сверено с agnayas (ТОЧНОЕ совпадение), не допуск.
const APPROACH_TO_SPLIT_GAP = 100;
// Дефолты applySplit — сверены с кодом, не подобраны.
const SPLIT_ANTICIPATE_DUR = 900;
const SPLIT_RISE_DUR = 1300;
const SPLIT_HOLD_DUR = 1000;
const SPLIT_FADE_DUR = 1100;

/**
 * Строит { initial, steps, ops } для категории «грамматика (guṇa,
 * influence+transform) → сандхи (approach+split)» — например agnayas:
 * i→e (guṇa, вызвана всем хвостом -as), затем e+a→a+y (несовместимость,
 * approach с отскоком, распад на два звука). ДВА разных механизма
 * подряд — самая сложная из покрытых категорий реестра.
 *
 * @param {Object} spec
 * @param {string[][]} spec.words
 * @param {{word: number, letter: number}} spec.gunaTarget — гласная, которая гунируется (i→e)
 * @param {{word: number}} spec.gunaTrigger — СЛОВО целиком (не одна буква) — вызывает гунацию
 * @param {string} spec.toGuna — итог гунации (обычно 'e')
 * @param {number} spec.toGunaColor
 * @param {{word: number}} spec.approachMovers — слово целиком, подъезжает и отскакивает от гунированной гласной
 * @param {Array<{into: string, slotOffset: number, fromOffset: {x:number,y:number,z:number}, delay: number, dur: number, arcHeight?: number}>} spec.arrivals — результаты распада; slotOffset — смещение слота ОТНОСИТЕЛЬНО gunaTarget (0 = то же место, 1 = следующий)
 * @param {{x:number,y:number,z:number}} [spec.holdOffset] - куда поднимается исходная буква на время отстойника (дефолт как в agnayas)
 * @param {number} spec.ruleNum
 * @param {number} spec.color
 * @returns {import('./slot-engine-types.js').ExampleData}
 */
export function buildGunaSplitExample(spec) {
  const { words, gunaTarget, gunaTrigger, toGuna, toGunaColor, approachMovers, arrivals, holdOffset, ruleNum, color } = spec;
  const { initial, wordSlots, totalLetters } = layoutWords(words);

  const targetSlot = wordSlots[gunaTarget.word][gunaTarget.letter];
  const fallComplete = (totalLetters - 1) * FALL_STAGGER + FALL_DUR;

  // Шаг 1 (грамматика: гунация) — та же формула, что и в
  // buildInfluenceTransformChain, но триггер — СЛОВО целиком ({word:N}),
  // не одна буква, поэтому не переиспользуем ту функцию напрямую (её
  // сигнатура рассчитана на {word,letter}).
  const influenceStart = fallComplete + BUFFER_AFTER_FALL;
  const transformStart = influenceStart + INFLUENCE_TO_TRANSFORM_GAP;
  const transformDur = 1 * MS_PER_360; // гунация — целый оборот, всегда spinTurns:1
  const ringHoldDur = INFLUENCE_TO_TRANSFORM_GAP + transformDur;

  // Между шагом 1 и шагом 2 — «проявление» (activeSlots разные), та же
  // формула, что и в buildApproachMergeExample, только буфер после
  // проявления сверен отдельно с agnayas (250, не 100 — оба значения
  // наблюдались на разных примерах, разброс больше, чем у остальных
  // констант, меньше уверенности).
  const revealDur = REVEAL_STAGGER * (totalLetters - 1) + REVEAL_RAMP;
  const REVEAL_EXTRA_AGNAYAS = 250;
  // step1.end = transform.start + длительность самого оборота (НЕ формула
  // «одиночного терминального шага» transformStart+anticipateDur-50,
  // которая тут не подошла) — сверено с agnayas ТОЧНО: 5300+1400=6700.
  const step1End = transformStart + transformDur;
  const step2Start = step1End + revealDur + REVEAL_EXTRA_AGNAYAS;

  const moverSlots = wordSlots[approachMovers.word];
  const approachStart = step2Start;
  const splitStart = approachStart + APPROACH_DUR_DEFAULT + APPROACH_HOLD_DUR_DEFAULT + APPROACH_RETREAT_DUR_DEFAULT + APPROACH_TO_SPLIT_GAP;

  const splitActiveStart = splitStart + SPLIT_ANTICIPATE_DUR;
  const riseEnd = splitActiveStart + SPLIT_RISE_DUR;
  const lastArrivalEnd = Math.max(...arrivals.map(a => a.delay + a.dur));
  const compareReadyAt = Math.max(riseEnd, splitActiveStart + lastArrivalEnd);
  const fadeStart = compareReadyAt + SPLIT_HOLD_DUR;
  const step2End = fadeStart + SPLIT_FADE_DUR;

  const arrivalOps = arrivals.map(a => {
    const newSlot = targetSlot + a.slotOffset;
    return {
      into: a.into, newSlot,
      from: { x: slotX(newSlot) + a.fromOffset.x, y: a.fromOffset.y, z: a.fromOffset.z },
      delay: a.delay, dur: a.dur, arcHeight: a.arcHeight ?? 1.0,
    };
  });

  // activeSlots шага 2 — цель + будущие слоты результатов распада (видны
  // заранее, хотя кубики появятся только внутри самого split) + ПЕРВЫЙ
  // (ближайший) mover, не все movers — сверено с agnayas ([4,5,6], не
  // [4,6,7]): дальний mover (s) остаётся притенённым фоном, хоть и
  // физически едет вместе с ближним.
  const arrivalSlots = [...new Set(arrivals.map(a => targetSlot + a.slotOffset))];
  const step2ActiveSlots = [...new Set([...arrivalSlots, moverSlots[0]])];

  return {
    initial,
    steps: [
      { kind: 'grammar', start: influenceStart, end: step1End, activeSlots: [targetSlot, ...wordSlots[gunaTrigger.word]] },
      { kind: 'rule', ruleNum, start: step2Start, end: step2End, activeSlots: step2ActiveSlots, color, primary: true },
    ],
    ops: [
      // {word:N} в САМИХ ops — вход в resolveSlotRef (slot-engine-words.js),
      // а не в наш собственный wordSlots — там N ЕДИНИЦЕЙ-индексирован
      // (`groups[ref.word - 1]`), тогда как spec.gunaTrigger.word/spec.
      // approachMovers.word здесь и всюду в этом файле — 0-индексированы
      // (как индекс в spec.words). Отсюда +1 — реальный найденный баг: без
      // него `{word:1}` (по смыслу «второе слово», 0-индекс) движок читал
      // бы как «первое слово» (agni) — триггер гунации и movers approach
      // указывали НЕ на -as, а на саму agni.
      { type: 'influence', from: { word: gunaTrigger.word + 1 }, to: targetSlot, start: influenceStart, ringHoldDur },
      { type: 'transform', at: targetSlot, toGlyph: toGuna, toColor: toGunaColor, start: transformStart, spinTurns: 1 },
      { type: 'approach', movers: { word: approachMovers.word + 1 }, target: targetSlot, start: approachStart, distance: 0.5, pulse: true },
      { type: 'split', at: targetSlot, start: splitStart, holdOffset: holdOffset ?? { x: -1.6, y: 2.4, z: 0.4 }, arrivals: arrivalOps },
    ],
  };
}

/**
 * Строит { initial, steps, ops } для ОДНОШАГОВОГО правила категории
 * «influence+transform» — частный случай buildInfluenceTransformChain с
 * ровно одним шагом (primary всегда true — единственный шаг ролика).
 *
 * @param {Object} spec
 * @param {string[][]} spec.words
 * @param {{word: number, letter: number}} spec.trigger
 * @param {{word: number, letter: number}} spec.target
 * @param {string} spec.toGlyph
 * @param {{spinTurns: number, signal: 'blank'|'gold'|'silver'}} spec.transformKind
 * @param {number} spec.ruleNum
 * @param {number} spec.color
 * @param {number} [spec.clearance]
 * @returns {import('./slot-engine-types.js').ExampleData}
 */
export function buildInfluenceTransformExample(spec) {
  const { words, trigger, target, toGlyph, transformKind, ruleNum, color, clearance } = spec;
  return buildInfluenceTransformChain({
    words,
    steps: [{ trigger, target, toGlyph, transformKind, ruleNum, color, clearance, primary: true }],
  });
}

// Между шагами с РАЗНЫМ activeSlots движок сам вставляет «проявление»
// (buildRuntimeSteps/sameActiveSlots, slot-engine-steps.js) — все буквы
// на миг становятся видны, прежде чем притенение сузится под следующий
// шаг. Длительность этого проявления — та же формула, что и у самого
// движка (REVEAL_STAGGER/REVEAL_RAMP, дефолты 130/700).
const REVEAL_STAGGER = 130;
const REVEAL_RAMP = 700;
// Небольшой запас после конца проявления до реального старта следующего
// шага — сверено с āsīt (100мс) — та же ручная вариация, что и у
// остальных буферов.
const REVEAL_EXTRA_BUFFER = 100;
// Запас после конца approach (движение подъезда/присоединения) до конца
// шага — сверено с āsīt (150мс).
const APPROACH_TAIL_BUFFER = 150;
// Запас после конца merge (сама вспышка слияния, applyMerge.dur=1400 по
// умолчанию) до конца шага — сверено с āsīt (500мс).
const MERGE_TAIL_BUFFER = 500;

/**
 * Строит { initial, steps, ops } для категории «approach + merge» (реестр,
 * Часть А: два одинаковых соседних звука сливаются в один, например āsīt
 * a+a→ā) — ДВА шага: (1) грамматический — окончание примыкает к основе
 * (approach, без притенения, activeSlots=все слоты), (2) сандхи — слияние
 * (merge). Шаг 1 — общий для конкретно этой грамматической ситуации
 * (не всегда нужен другим примерам той же merge-категории, например
 * внешнему сандхи без предварительного присоединения — там можно
 * передать steps:[] и вызвать buildMergeStep напрямую, отдельной
 * функции для этого пока нет).
 *
 * @param {Object} spec
 * @param {string[][]} spec.words — слова (морфологические части), между ними зазор в 1 слот
 * @param {Object} spec.attach — шаг 1: окончание примыкает к основе
 * @param {{word: number, letter: number}[]} spec.attach.movers — буквы, которые едут
 * @param {{word: number, letter: number}} spec.attach.target — буква, к которой едут
 * @param {number} [spec.attach.approachDur] - длительность подъезда (дефолт движка 1200)
 * @param {Object} spec.merge — шаг 2: слияние
 * @param {{word: number, letter: number}} spec.merge.from — буква-источник (исчезает)
 * @param {{word: number, letter: number}} spec.merge.at — буква-цель (получает новый глиф)
 * @param {string} spec.merge.toGlyph
 * @param {number} [spec.merge.dur] - длительность самого слияния (дефолт движка 1400)
 * @param {number} spec.ruleNum
 * @param {number} spec.color
 * @returns {import('./slot-engine-types.js').ExampleData}
 */
export function buildApproachMergeExample(spec) {
  const { words, attach, merge, ruleNum, color } = spec;
  const { initial, wordSlots, totalLetters } = layoutWords(words);

  const moverSlots = attach.movers.map(({ word, letter }) => wordSlots[word][letter]);
  const targetSlot1 = wordSlots[attach.target.word][attach.target.letter];
  const approachDur = attach.approachDur ?? 1200;

  const fallComplete = (totalLetters - 1) * FALL_STAGGER + FALL_DUR;
  const step1Start = fallComplete + BUFFER_AFTER_FALL;
  const step1End = step1Start + approachDur + APPROACH_TAIL_BUFFER;

  const revealDur = REVEAL_STAGGER * (totalLetters - 1) + REVEAL_RAMP;
  const step2Start = step1End + revealDur + REVEAL_EXTRA_BUFFER;

  const fromSlot = wordSlots[merge.from.word][merge.from.letter];
  const atSlot = wordSlots[merge.at.word][merge.at.letter];
  const mergeDur = merge.dur ?? 1400;
  const step2End = step2Start + mergeDur + MERGE_TAIL_BUFFER;

  const allSlots = initial.map(x => x.slot);
  return {
    initial,
    steps: [
      { kind: 'grammar', start: step1Start, end: step1End, activeSlots: allSlots },
      { kind: 'rule', ruleNum, start: step2Start, end: step2End, activeSlots: [fromSlot, atSlot], color, primary: true },
    ],
    ops: [
      {
        type: 'approach', movers: moverSlots, target: targetSlot1, start: step1Start,
        approachDur, holdDur: 0, retreat: false, distance: 1.0, jitterAmp: 0, pulse: false,
      },
      { type: 'merge', from: fromSlot, at: atSlot, start: step2Start, dur: mergeDur, toGlyph: merge.toGlyph },
    ],
  };
}
