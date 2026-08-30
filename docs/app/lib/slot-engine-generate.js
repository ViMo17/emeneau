// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — ЭКСПЕРИМЕНТАЛЬНЫЙ генератор ops/steps/initial для самой
// частой категории реестра взаимодействий (docs/reference/interaction-
// registry.md, Часть А): influence + transform, ОДИН шаг, без цепочки
// (voicing/place/часть grade — правила 19,30-33,37-40,59,63,69,70,71 и
// другие). НЕ используется основным приложением ни одним из EXAMPLES[] —
// только новыми example-файлами, которые сознательно вызывают его.
//
// Формулы таймингов подобраны не на глаз, а сверены с ДВУМЯ уже
// построенными и визуально проверенными эталонами (rule71 vāk asti,
// rule70 taddhiraṇyam шаг 1) — совпадение по influence.start/
// transform.start в пределах 20мс (меньше кадра при 60fps), ringHoldDur —
// ТОЧНОЕ совпадение в обоих случаях. Раскладка слотов (центрирование слов
// с однослотовым зазором между ними) совпала с rule71 побуквенно.
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
// Пауза между стартом influence и стартом transform — ТОЧНО одинакова в
// обоих эталонах (2600мс) — не усреднение, а совпавшее число.
const INFLUENCE_TO_TRANSFORM_GAP = 2600;
const ANTICIPATE_DUR = 900; // движковый дефолт applyTransform (op.anticipateDur ?? 900)

/**
 * Строит { initial, steps, ops } для одношагового правила категории
 * «influence+transform» (реестр, Часть А: voicing/place/часть grade).
 * Не подходит для elide/merge/split/цепочек нескольких rule-шагов —
 * это отдельные категории, генератор для них не написан.
 *
 * @param {Object} spec
 * @param {string[][]} spec.words — слова, каждое — массив глифов (1 кубик = 1 глиф). Между словами автоматически встаёт зазор в 1 слот.
 * @param {{word: number, letter: number}} spec.trigger — источник влияния (nimitta)
 * @param {{word: number, letter: number}} spec.target — буква, которая меняется (sthānin)
 * @param {string} spec.toGlyph — новый глиф после transform
 * @param {{spinTurns: number, signal: 'blank'|'gold'|'silver'}} spec.transformKind — обычно TRANSFORM_KIND.vargaPair/assimToNeighbor
 * @param {number} spec.ruleNum
 * @param {number} spec.color - цвет чипа шага (сверить с реальным CSS-тиром правила)
 * @param {number} [spec.clearance] - переопределение направления раскачивания transform (дефолт движка +0.35)
 * @returns {import('./slot-engine-types.js').ExampleData}
 */
export function buildInfluenceTransformExample(spec) {
  const { words, trigger, target, toGlyph, transformKind, ruleNum, color, clearance } = spec;

  // Раскладка: слова подряд, между ними по одному пустому слоту (граница
  // слов — тот же принцип, что и у ВСЕХ примеров внешних сандхи, зазор не
  // схлопывается), весь блок центрируется по N_SLOTS — формула сверена
  // побуквенно с rule71 (vāk asti).
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

  const triggerSlot = wordSlots[trigger.word][trigger.letter];
  const targetSlot = wordSlots[target.word][target.letter];

  const fallComplete = (totalLetters - 1) * FALL_STAGGER + FALL_DUR;
  const influenceStart = fallComplete + BUFFER_AFTER_FALL;
  const transformStart = influenceStart + INFLUENCE_TO_TRANSFORM_GAP;
  // ringHoldDur — держать пульс до конца anticipateDur+самого оборота
  // (spinTurns×MS_PER_360) — ТОЧНОЕ совпадение с обоими эталонами (3300 и
  // 4000 соответственно), не подобранная константа.
  const transformDur = Math.abs(transformKind.spinTurns ?? 1) * MS_PER_360;
  const ringHoldDur = INFLUENCE_TO_TRANSFORM_GAP + transformDur;
  const stepEnd = transformStart + ANTICIPATE_DUR - 50;

  return {
    initial,
    steps: [
      { kind: 'rule', ruleNum, start: influenceStart, end: stepEnd, activeSlots: [targetSlot, triggerSlot], color, primary: true },
    ],
    ops: [
      { type: 'influence', from: triggerSlot, to: targetSlot, start: influenceStart, ringHoldDur },
      { type: 'transform', at: targetSlot, toGlyph, start: transformStart, ...transformKind, ...(clearance !== undefined ? { clearance } : {}) },
    ],
  };
}
