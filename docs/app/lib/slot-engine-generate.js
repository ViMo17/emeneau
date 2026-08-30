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

import { N_SLOTS, MS_PER_360 } from './slot-engine-core.js';

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
    const transformDur = Math.abs(s.transformKind.spinTurns ?? 1) * MS_PER_360;
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
