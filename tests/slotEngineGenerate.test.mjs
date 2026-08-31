// Тесты buildInfluenceTransformExample (slot-engine-generate.js) —
// каждое число проверено сверкой с уже построенными и визуально
// подтверждёнными эталонами (rule71 vāk asti, rule70 taddhiraṇyam шаг 1),
// не абстрактно. Допуск ±20мс на influence.start/transform.start —
// расхождение с ручным выбором буфера после падения (340мс у rule71,
// 300мс у taddhiraṇyam — обычная ручная вариация, не ошибка формулы).
// ringHoldDur — точная формула GAP+transformDur, где transformDur для
// landsOnOppositeFace (TRANSFORM_KIND.vargaPair) — 1800мс (после фикса
// «буква на противолежащей грани заранее», не 700 = spinTurns×MS_PER_360,
// как было раньше) — см. slot-engine-ops.js, applyTransform. Значение
// 3300 в рукописном rule71-vak-asti-slots.js — СТАРОЕ, до этого фикса,
// новый расчёт (4400) с ним больше не совпадает — это ожидаемо, не
// регрессия генератора.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInfluenceTransformExample, buildInfluenceTransformChain, buildApproachMergeExample, buildApproachElideExample, buildGunaSplitExample, TRANSFORM_KIND, validateExampleData } from '../docs/app/lib/slot-engine.js';

const AGNAYAS_SPEC = {
  words: [['a', 'g', 'n', 'i'], ['a', 's']],
  gunaTarget: { word: 0, letter: 3 },
  gunaTrigger: { word: 1 },
  toGuna: 'e', toGunaColor: 0x7DCFCA,
  approachMovers: { word: 1 },
  arrivals: [
    { into: 'a', slotOffset: 0, fromOffset: { x: 1.0, y: 2.5, z: -1.5 }, delay: 500, dur: 1600, arcHeight: 0.9 },
    { into: 'y', slotOffset: 1, fromOffset: { x: 1.3, y: 3.0, z: -1.8 }, delay: 0, dur: 1850, arcHeight: 1.3 },
  ],
  ruleNum: 3, color: 0xAFBFD4,
};

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
  assert.equal(influence.ringHoldDur, 4400, 'ringHoldDur = GAP(2600) + 1800 (landsOnOppositeFace, после фикса грани) — не 3300 из старого рукописного примера');
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
  assert.equal(influence.ringHoldDur, 4600, 'ringHoldDur = GAP(2600) + spinTurns(1)×MS_PER_360(2000) = 4600 (MS_PER_360 замедлен с 1400 по прямому замечанию пользователя — гунация читалась слишком быстро)');
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
  assert.equal(influence1.ringHoldDur, 4600, 'GAP(2600)+spinTurns(1)×MS_PER_360(2000) — assimToNeighbor, целый оборот');
  assert.ok(Math.abs(influence2.start - 8080) <= 20, `influence2.start=${influence2.start}, эталон 8080`);
  assert.ok(Math.abs(transform2.start - 10680) <= 20, `transform2.start=${transform2.start}, эталон 10680`);
  assert.equal(influence2.ringHoldDur, 4400, 'GAP(2600)+1800 (шаг 2 — vargaPair, landsOnOppositeFace)');
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

test('buildApproachMergeExample: раскладка совпадает побуквенно с āsīt (rule7)', () => {
  const data = buildApproachMergeExample({
    words: [['a'], ['a', 's'], ['ī', 't']],
    attach: { movers: [{ word: 2, letter: 0 }, { word: 2, letter: 1 }], target: { word: 1, letter: 1 } },
    merge: { from: { word: 0, letter: 0 }, at: { word: 1, letter: 0 }, toGlyph: 'ā' },
    ruleNum: 7, color: 0xAFBFD4,
  });
  assert.deepEqual(data.initial, [
    { slot: 1, tr: 'a' }, { slot: 3, tr: 'a' }, { slot: 4, tr: 's' }, { slot: 6, tr: 'ī' }, { slot: 7, tr: 't' },
  ]);
});

test('buildApproachMergeExample: тайминги в пределах 40мс от рукописного āsīt (постоянное смещение по всей цепочке — та же ручная вариация, что и в остальных генераторах)', () => {
  const data = buildApproachMergeExample({
    words: [['a'], ['a', 's'], ['ī', 't']],
    attach: { movers: [{ word: 2, letter: 0 }, { word: 2, letter: 1 }], target: { word: 1, letter: 1 } },
    merge: { from: { word: 0, letter: 0 }, at: { word: 1, letter: 0 }, toGlyph: 'ā' },
    ruleNum: 7, color: 0xAFBFD4,
  });
  const [approach, merge] = data.ops;
  assert.equal(approach.movers[0], 6); assert.equal(approach.movers[1], 7);
  assert.equal(approach.target, 4);
  assert.equal(merge.from, 1); assert.equal(merge.at, 3); assert.equal(merge.toGlyph, 'ā');
  assert.ok(Math.abs(approach.start - 2700) <= 40, `approach.start=${approach.start}, эталон 2700`);
  assert.ok(Math.abs(data.steps[0].end - 4050) <= 40, `steps[0].end=${data.steps[0].end}, эталон 4050`);
  assert.ok(Math.abs(merge.start - 5370) <= 40, `merge.start=${merge.start}, эталон 5370`);
  assert.ok(Math.abs(data.steps[1].end - 7270) <= 40, `steps[1].end=${data.steps[1].end}, эталон 7270`);
  assert.deepEqual(validateExampleData(data), []);
});

test('buildApproachElideExample: структура ops/steps совпадает с śādhi (rule15) — approach(movers,target)+elide(at), activeSlots=[target,первый mover]', () => {
  const data = buildApproachElideExample({
    words: [['ś', 'ā', 's'], ['dh', 'i']],
    movers: [{ word: 1, letter: 0 }, { word: 1, letter: 1 }],
    target: { word: 0, letter: 2 },
    ruleNum: 15, color: 0x869EC1,
  });
  const [approach, elide] = data.ops;
  assert.equal(approach.type, 'approach');
  assert.equal(elide.type, 'elide');
  assert.equal(approach.target, elide.at, 'approach едет К той же цели, что потом исчезает');
  assert.deepEqual(data.steps[0].activeSlots, [elide.at, approach.movers[0]]);
  assert.equal(data.steps.length, 1, 'śādhi — один шаг, без предварительной грамматики');
});

test('buildApproachElideExample: тайминги в пределах 60мс от рукописного śādhi (approachDur/midHoldDur/leg2Dur — те же значения по умолчанию)', () => {
  const data = buildApproachElideExample({
    words: [['ś', 'ā', 's'], ['dh', 'i']],
    movers: [{ word: 1, letter: 0 }, { word: 1, letter: 1 }],
    target: { word: 0, letter: 2 },
    ruleNum: 15, color: 0x869EC1,
  });
  const [approach, elide] = data.ops;
  assert.equal(approach.approachDur, 900);
  assert.equal(approach.midHoldDur, 1400);
  assert.equal(approach.leg2Dur, 600);
  assert.ok(Math.abs(approach.start - 2600) <= 60, `approach.start=${approach.start}, эталон 2600`);
  assert.ok(Math.abs(elide.start - 3950) <= 60, `elide.start=${elide.start}, эталон 3950 (leg1End+450)`);
  assert.ok(Math.abs(data.steps[0].end - 7300) <= 60, `steps[0].end=${data.steps[0].end}, эталон 7300 (elide.start+3200+150)`);
  assert.deepEqual(validateExampleData(data), []);
});

test('buildGunaSplitExample: раскладка совпадает побайтово с agnayas (rule3)', () => {
  const data = buildGunaSplitExample(AGNAYAS_SPEC);
  assert.deepEqual(data.initial, [
    { slot: 1, tr: 'a' }, { slot: 2, tr: 'g' }, { slot: 3, tr: 'n' }, { slot: 4, tr: 'i' },
    { slot: 6, tr: 'a' }, { slot: 7, tr: 's' },
  ]);
});

test('buildGunaSplitExample: РЕГРЕССИЯ — {word:N} в ops должен быть на единицу больше spec.word (движок 1-индексирован, spec — 0-индексирован)', () => {
  // Реальный найденный баг: resolveSlotRef (slot-engine-words.js) читает
  // {word:N} как groups[N-1] — единицей-индексированное. gunaTrigger.word/
  // approachMovers.word в спецификации генератора — индекс в spec.words
  // (0-индексированный, как везде в этом файле). Без +1 при построении
  // ops триггер гунации/movers approach указывали на ПЕРВОЕ слово (agni)
  // вместо второго (as) — влияние подчёркивало не ту группу, approach
  // двигал буквы agni к их же собственной букве (цель — i, слот внутри
  // agni), что приводило к падению движка (mesh у несуществующего
  // кубика) при реальном рендере.
  const data = buildGunaSplitExample(AGNAYAS_SPEC);
  const [influence, , approach] = data.ops;
  assert.deepEqual(influence.from, { word: 2 }, 'gunaTrigger:{word:1} (0-индекс, "as") -> {word:2} в ops (1-индекс)');
  assert.deepEqual(approach.movers, { word: 2 }, 'approachMovers:{word:1} (0-индекс, "as") -> {word:2} в ops (1-индекс)');
});

test('buildGunaSplitExample: activeSlots и структура ops точно совпадают с agnayas ([4,6,7] затем [4,5,6] — не «цель+все movers»)', () => {
  const data = buildGunaSplitExample(AGNAYAS_SPEC);
  assert.deepEqual(data.steps[0].activeSlots, [4, 6, 7]);
  assert.deepEqual(data.steps[1].activeSlots, [4, 5, 6], 'дальний mover (s, слот 7) НЕ входит — только цель, будущий слот "y" и ближний mover');
  const [influence, transform, approach, split] = data.ops;
  assert.equal(influence.ringHoldDur, 4600, 'GAP(2600)+spinTurns(1)×MS_PER_360(2000)');
  assert.equal(transform.spinTurns, 1);
  assert.equal(approach.distance, 0.5);
  assert.equal(approach.pulse, true);
  assert.equal(split.arrivals[0].newSlot, 4);
  assert.equal(split.arrivals[1].newSlot, 5);
  assert.deepEqual(split.holdOffset, { x: -1.6, y: 2.4, z: 0.4 });
});

test('buildGunaSplitExample: тайминги — ПОСТОЯННОЕ смещение ~220мс по всей цепочке (буфер после падения меньше, чем в среднем), без дополнительного расхождения дальше по цепочке', () => {
  // Эталонные числа (6700/8300/8300/11050/16150) — из rule3-agnayas-slots.js
  // ПОСЛЕ пересчёта на MS_PER_360=2000 (было 1400): всё, что физически
  // зависит от фактического приземления вращения (весь хвост после
  // transform.start), сдвинуто на +600мс — та же формула
  // (transformDur=1×MS_PER_360), что и в самом генераторе, поэтому
  // постоянное смещение (первоначально ~220мс) сохраняется тем же самым
  // числом, не растёт — оба сдвинулись синхронно.
  const data = buildGunaSplitExample(AGNAYAS_SPEC);
  const [influence, transform, approach, split] = data.ops;
  const deltas = [
    influence.start - 2700,
    transform.start - 5300,
    data.steps[0].end - 7300,
    data.steps[1].start - 8900,
    approach.start - 8900,
    split.start - 11650,
    data.steps[1].end - 16750,
  ];
  const first = deltas[0];
  for (const d of deltas) assert.equal(d, first, `все смещения должны быть РАВНЫ (${JSON.stringify(deltas)}) — иначе формула где-то разошлась независимо от буфера`);
  assert.ok(Math.abs(first) <= 250, `смещение=${first}, ожидание в пределах ~220-250мс`);
  assert.deepEqual(validateExampleData(data), []);
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
