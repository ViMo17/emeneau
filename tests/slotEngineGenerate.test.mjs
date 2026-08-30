// Тесты buildInfluenceTransformExample (slot-engine-generate.js) —
// каждое число проверено сверкой с ДВУМЯ уже построенными и визуально
// подтверждёнными эталонами (rule71 vāk asti, rule70 taddhiraṇyam шаг 1),
// не абстрактно. Допуск ±20мс на influence.start/transform.start —
// расхождение с ручным выбором буфера после падения (340мс у rule71,
// 300мс у taddhiraṇyam — обычная ручная вариация, не ошибка формулы).
// ringHoldDur — ТОЧНОЕ совпадение в обоих случаях, без допуска.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInfluenceTransformExample, buildInfluenceTransformChain, TRANSFORM_KIND, validateExampleData } from '../docs/app/lib/slot-engine.js';

test('buildInfluenceTransformExample: раскладка слотов совпадает побуквенно с rule71 (vāk asti)', () => {
  const data = buildInfluenceTransformExample({
    words: [['v', 'ā', 'k'], ['a', 's', 't', 'i']],
    trigger: { word: 1, letter: 0 },
    target: { word: 0, letter: 2 },
    toGlyph: 'g',
    transformKind: TRANSFORM_KIND.vargaPair,
    ruleNum: 71,
    color: 0xAE987A,
  });
  assert.deepEqual(data.initial, [
    { slot: 1, tr: 'v' }, { slot: 2, tr: 'ā' }, { slot: 3, tr: 'k' },
    { slot: 5, tr: 'a' }, { slot: 6, tr: 's' }, { slot: 7, tr: 't' }, { slot: 8, tr: 'i' },
  ]);
});

test('buildInfluenceTransformExample: тайминги в пределах 20мс от рукописного rule71', () => {
  const data = buildInfluenceTransformExample({
    words: [['v', 'ā', 'k'], ['a', 's', 't', 'i']],
    trigger: { word: 1, letter: 0 },
    target: { word: 0, letter: 2 },
    toGlyph: 'g',
    transformKind: TRANSFORM_KIND.vargaPair,
    ruleNum: 71,
    color: 0xAE987A,
  });
  const influence = data.ops.find(op => op.type === 'influence');
  const transform = data.ops.find(op => op.type === 'transform');
  assert.ok(Math.abs(influence.start - 3200) <= 20, `influence.start=${influence.start}, эталон 3200`);
  assert.ok(Math.abs(transform.start - 5800) <= 20, `transform.start=${transform.start}, эталон 5800`);
  assert.equal(influence.ringHoldDur, 3300, 'ringHoldDur — точное совпадение, не допуск');
  assert.equal(influence.from, 5);
  assert.equal(influence.to, 3);
  assert.equal(transform.at, 3);
  assert.equal(transform.toGlyph, 'g');
});

test('buildInfluenceTransformExample: ringHoldDur точно совпадает со ВТОРЫМ эталоном (taddhiraṇyam шаг 1, другой spinTurns)', () => {
  // Раскладка своя (сжатый блок «yam», не через generic-раскладку) —
  // здесь проверяется ТОЛЬКО формула ringHoldDur на spinTurns:1 (не 0.5),
  // независимо от layout-логики.
  const data = buildInfluenceTransformExample({
    words: [['t', 'a', 't'], ['h', 'i', 'r', 'a', 'x', 'y']], // 9 "букв" — то же число кубиков, что у taddhiraṇyam (сжатый блок считается одним)
    trigger: { word: 0, letter: 2 },
    target: { word: 1, letter: 0 },
    toGlyph: 'dh',
    transformKind: TRANSFORM_KIND.assimToNeighbor, // spinTurns:1, как h→dh в реальном примере
    ruleNum: 70,
    color: 0xAE987A,
  });
  const influence = data.ops.find(op => op.type === 'influence');
  const transform = data.ops.find(op => op.type === 'transform');
  assert.equal(influence.ringHoldDur, 4000, 'ringHoldDur = GAP(2600) + spinTurns(1)×MS_PER_360(1400) = 4000, эталон taddhiraṇyam');
  assert.ok(Math.abs(influence.start - 3680) <= 20, `influence.start=${influence.start}, эталон 3680`);
  assert.ok(Math.abs(transform.start - 6280) <= 20, `transform.start=${transform.start}, эталон 6280`);
});

test('buildInfluenceTransformChain: раскладка (включая сжатый блок «yam») совпадает побайтово с taddhiraṇyam', () => {
  const data = buildInfluenceTransformChain({
    words: [['t', 'a', 't'], ['h', 'i', 'r', 'a', 'ṇ', 'yam']],
    steps: [
      { trigger: { word: 0, letter: 2 }, target: { word: 1, letter: 0 }, toGlyph: 'dh', transformKind: TRANSFORM_KIND.assimToNeighbor, ruleNum: 70, color: 0xAE987A, primary: true, clearance: -0.35 },
      { trigger: { word: 1, letter: 0 }, target: { word: 0, letter: 2 }, toGlyph: 'd', transformKind: TRANSFORM_KIND.vargaPair, ruleNum: 71, color: 0xAE987A },
    ],
  });
  assert.deepEqual(data.initial, [
    { slot: 0, tr: 't' }, { slot: 1, tr: 'a' }, { slot: 2, tr: 't' },
    { slot: 4, tr: 'h' }, { slot: 5, tr: 'i' }, { slot: 6, tr: 'r' }, { slot: 7, tr: 'a' }, { slot: 8, tr: 'ṇ' }, { slot: 9, tr: 'yam' },
  ]);
});

test('buildInfluenceTransformChain: формула связки шагов (step2.start = step1.transform.start + 2×anticipateDur) — точное совпадение с taddhiraṇyam', () => {
  const data = buildInfluenceTransformChain({
    words: [['t', 'a', 't'], ['h', 'i', 'r', 'a', 'ṇ', 'yam']],
    steps: [
      { trigger: { word: 0, letter: 2 }, target: { word: 1, letter: 0 }, toGlyph: 'dh', transformKind: TRANSFORM_KIND.assimToNeighbor, ruleNum: 70, color: 0xAE987A, primary: true, clearance: -0.35 },
      { trigger: { word: 1, letter: 0 }, target: { word: 0, letter: 2 }, toGlyph: 'd', transformKind: TRANSFORM_KIND.vargaPair, ruleNum: 71, color: 0xAE987A },
    ],
  });
  const [influence1, transform1, influence2, transform2] = data.ops;
  assert.ok(Math.abs(influence1.start - 3680) <= 20, `influence1.start=${influence1.start}, эталон 3680`);
  assert.ok(Math.abs(transform1.start - 6280) <= 20, `transform1.start=${transform1.start}, эталон 6280`);
  assert.equal(influence1.ringHoldDur, 4000);
  assert.ok(Math.abs(influence2.start - 8080) <= 20, `influence2.start=${influence2.start}, эталон 8080`);
  assert.ok(Math.abs(transform2.start - 10680) <= 20, `transform2.start=${transform2.start}, эталон 10680`);
  assert.equal(influence2.ringHoldDur, 3300);
  assert.equal(data.steps[0].primary, true);
  assert.equal(data.steps[1].primary, false, 'вспомогательный шаг цепочки — БЕЗ primary, как в реальном примере');
  assert.deepEqual(validateExampleData(data), []);
});

test('buildInfluenceTransformExample (один шаг) — частный случай buildInfluenceTransformChain, поведение не изменилось после рефакторинга', () => {
  const single = buildInfluenceTransformExample({
    words: [['v', 'ā', 'k'], ['a', 's', 't', 'i']],
    trigger: { word: 1, letter: 0 }, target: { word: 0, letter: 2 },
    toGlyph: 'g', transformKind: TRANSFORM_KIND.vargaPair, ruleNum: 71, color: 0xAE987A,
  });
  const chain = buildInfluenceTransformChain({
    words: [['v', 'ā', 'k'], ['a', 's', 't', 'i']],
    steps: [{ trigger: { word: 1, letter: 0 }, target: { word: 0, letter: 2 }, toGlyph: 'g', transformKind: TRANSFORM_KIND.vargaPair, ruleNum: 71, color: 0xAE987A, primary: true }],
  });
  assert.deepEqual(single, chain);
});

test('buildInfluenceTransformExample: результат проходит validateExampleData без замечаний', () => {
  const data = buildInfluenceTransformExample({
    words: [['v', 'ā', 'k'], ['a', 's', 't', 'i']],
    trigger: { word: 1, letter: 0 },
    target: { word: 0, letter: 2 },
    toGlyph: 'g',
    transformKind: TRANSFORM_KIND.vargaPair,
    ruleNum: 71,
    color: 0xAE987A,
  });
  assert.deepEqual(validateExampleData(data), []);
});
