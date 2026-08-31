// Тесты центрирования раскладки и адаптивного FOV камеры — портировано из
// старых (до общего движка) rule3-agnayas.js/rule71-vak-asti.js, где эта
// логика уже была написана и визуально проверена, но жила в двух копиях и
// не применялась к rule15 (сдвинут влево ещё диагностикой прозрачности и
// не был возвращён обратно) и к rule3/7 (центрированы вручную, не точно).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  N_SLOTS, centeredStart, centerSlots, halfWorldW, computeFitFov, slotX, CUBE_SIZE,
} from '../docs/app/lib/slot-engine.js';

test('centeredStart: чётный span — центр ровно посередине N_SLOTS', () => {
  // span=10 (весь стенд занят, как taddhiraṇyam) — начинать с 0.
  assert.equal(centeredStart(10), 0);
  // span=8 (как vāk asti) — (10-8)/2=1.
  assert.equal(centeredStart(8), 1);
});

test('centeredStart: нечётный span — не может быть центрирован идеально, floor к меньшему слоту', () => {
  // span=7 (agnayas/āsīt) — (10-7)/2=1.5 → floor 1.
  assert.equal(centeredStart(7), 1);
  // span=6 (śādhi) — (10-6)/2=2.
  assert.equal(centeredStart(6), 2);
});

test('centerSlots: без startAt использует ту же формулу, что centeredStart', () => {
  const letters = ['ś', 'ā', 's', 'dh', 'i']; // 5 позиций подряд, БЕЗ зазора внутри centerSlots самого по себе
  const placed = centerSlots(letters);
  assert.equal(placed[0].slot, centeredStart(letters.length));
  assert.equal(placed[0].tr, 'ś');
  assert.equal(placed[placed.length - 1].slot, centeredStart(letters.length) + letters.length - 1);
});

test('halfWorldW: центрированный диапазон — совпадает с половиной физического габарита + запас', () => {
  // taddhiraṇyam: занято 0..9, весь стенд — левый и правый край равноудалены от x=0.
  const hw = halfWorldW(0, 9);
  const expectedEdge = slotX(9) + CUBE_SIZE / 2; // правый край (симметричен левому)
  assert.ok(Math.abs(hw - (expectedEdge + 0.55)) < 1e-9);
});

test('halfWorldW: НЕцентрированный диапазон — не занижает отступ (регрессия найденной проблемы)', () => {
  // agnayas: занято 1..7 — сдвинуто влево от истинного центра (4.5) на пол-слота.
  // Наивная формула totalSpan/2 (без учёта смещения) занизила бы требуемый отступ и
  // обрезала бы левый край при пересчёте камеры — сравниваем с честным максимумом.
  const min = 1, max = 7;
  const hw = halfWorldW(min, max);
  const leftAbs = Math.abs(slotX(min) - CUBE_SIZE / 2);
  const rightAbs = Math.abs(slotX(max) + CUBE_SIZE / 2);
  assert.ok(hw >= Math.max(leftAbs, rightAbs), 'halfWorldW не должен быть меньше самого требовательного края');
  assert.notEqual(leftAbs, rightAbs, 'проверка ставится именно на асимметричном случае');
});

test('computeFitFov: широкий aspect — возвращает baseFov без изменений (сегодняшнее поведение всех 5 примеров)', () => {
  const hw = halfWorldW(0, 9); // самый требовательный реальный случай (taddhiraṇyam)
  assert.equal(computeFitFov(3.0, 9.5, hw, 32), 32);
});

test('computeFitFov: узкий aspect — растёт выше baseFov, чтобы не обрезать край', () => {
  const hw = halfWorldW(0, 9);
  const fov = computeFitFov(1.0, 9.5, hw, 32);
  assert.ok(fov > 32, 'при узком окне FOV должен вырасти сверх дефолта');
});

test('computeFitFov: никогда не опускается ниже baseFov, даже при очень широком aspect', () => {
  const hw = halfWorldW(4, 5); // короткий, почти точечный пример
  assert.equal(computeFitFov(10, 9.5, hw, 32), 32);
});

test('computeFitFov: более широкий пример при ОДНОМ И ТОМ ЖЕ узком aspect требует не меньший FOV, чем короткий', () => {
  const hwShort = halfWorldW(2, 7); // śādhi после центрирования, span=6
  const hwLong = halfWorldW(0, 9);  // taddhiraṇyam, span=10
  const aspect = 1.0;
  const fovShort = computeFitFov(aspect, 9.5, hwShort, 32);
  const fovLong = computeFitFov(aspect, 9.5, hwLong, 32);
  assert.ok(fovLong >= fovShort, 'длинный пример не должен требовать МЕНЬШЕ отступа, чем короткий');
});

test('N_SLOTS остаётся 10 — если константу когда-нибудь поменяют, тесты выше нужно пересчитать', () => {
  assert.equal(N_SLOTS, 10);
});
