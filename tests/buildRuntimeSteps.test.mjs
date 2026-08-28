// Тесты buildRuntimeSteps/sameActiveSlots/stepIndexAt/stepTargetOpacity —
// покрывает РЕГРЕССИЮ захода 52: проявление («все видны») вставлялось при
// ЛЮБОМ зазоре между шагами, даже если activeSlots у соседних шагов
// одинаковы (цепочка правил) — при короткой паузе и широкой раскладке
// (много кубиков → большой суммарный REVEAL_STAGGER) волна проявления не
// успевала докатиться до дальнего края, обрывалась и откатывалась назад,
// давая до 0.128 расхождения прозрачности у ОДНОЙ и той же буквы в двух
// позициях ряда (найдено пользователем визуально на taddhiraṇyam).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeSteps, sameActiveSlots, stepIndexAt, stepTargetOpacity } from '../docs/app/lib/slot-engine.js';

test('sameActiveSlots: одинаковые массивы (в любом порядке) — true', () => {
  assert.equal(sameActiveSlots([2, 4], [2, 4]), true);
  assert.equal(sameActiveSlots([4, 2], [2, 4]), true); // порядок не важен
});

test('sameActiveSlots: разные массивы — false', () => {
  assert.equal(sameActiveSlots([2, 4], [4, 6]), false);
  assert.equal(sameActiveSlots([2, 4], [2]), false);
});

test('sameActiveSlots: ALL сравнивается как есть', () => {
  assert.equal(sameActiveSlots('ALL', 'ALL'), true);
  assert.equal(sameActiveSlots('ALL', [2, 4]), false);
});

test('buildRuntimeSteps: РЕГРЕССИЯ заход 52 — НЕ вставляет проявление между шагами с ОДИНАКОВЫМ activeSlots (цепочка правил)', () => {
  const steps = [
    { kind: 'rule', ruleNum: 70, start: 3680, end: 7830, activeSlots: [2, 4] },
    { kind: 'rule', ruleNum: 71, start: 8080, end: 11530, activeSlots: [2, 4] }, // зазор 250мс, тот же состав
  ];
  const rt = buildRuntimeSteps(steps);
  const hasReveal = rt.some(s => s._reveal);
  assert.equal(hasReveal, false, 'проявление не должно вставляться — activeSlots совпадают');
});

test('buildRuntimeSteps: ВСЁ ЕЩЁ вставляет проявление, если activeSlots РЕАЛЬНО разные (agnayas)', () => {
  const steps = [
    { kind: 'grammar', start: 2600, end: 6700, activeSlots: [4, 6, 7] },
    { kind: 'rule', ruleNum: 3, start: 8300, end: 16150, activeSlots: [4, 5, 6] },
  ];
  const rt = buildRuntimeSteps(steps);
  const hasReveal = rt.some(s => s._reveal);
  assert.equal(hasReveal, true, 'проявление должно остаться — activeSlots реально разные');
});

test('buildRuntimeSteps + stepTargetOpacity: одна и та же буква в двух позициях получает ОДИНАКОВУЮ прозрачность на всём таймлайне цепочки', () => {
  const dimOpacity = 0.22;
  const steps = [
    { kind: 'rule', ruleNum: 70, start: 3680, end: 7830, activeSlots: [2, 4] },
    { kind: 'rule', ruleNum: 71, start: 8080, end: 11530, activeSlots: [2, 4] },
  ];
  const rt = buildRuntimeSteps(steps);
  // slot 1 и slot 7 — обе НЕ активны ни на одном шаге (та же ситуация,
  // что дала расхождение 0.128 до фикса)
  for (let t = 0; t <= 12000; t += 50) {
    const idx = stepIndexAt(t, rt);
    const cur = rt[idx];
    const target1 = stepTargetOpacity(cur, 1, dimOpacity);
    const target7 = stepTargetOpacity(cur, 7, dimOpacity);
    assert.equal(target1, target7, `t=${t}: слот1 и слот7 должны иметь одинаковую ЦЕЛЕВУЮ прозрачность`);
  }
});
