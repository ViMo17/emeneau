// Тесты colorFor — включая РЕГРЕССИОННЫЙ случай, дважды пойманный вручную
// за сессию (заходы 48-49): проверка "многобуквенная строка = сжатый
// блок" ловила по длине строки, а не по точному списку однофонемных
// многобуквенных записей (придыхательные согласные, дифтонги ai/au) —
// из-за этого кубик 'dh' в уже работающем śādhi чуть не получил неверный
// нейтральный цвет вместо честного зубного тона. Раньше это проверялось
// одноразовым скриптом в /tmp и терялось сразу после ответа — теперь
// живёт здесь постоянно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorFor, COL_VEL, COL_PAL, COL_RET, COL_DEN, COL_LAB, COL_DIM, GROUP_COLOR } from '../docs/app/lib/slot-engine.js';

test('colorFor: одиночные гласные — по традиционному месту образования', () => {
  assert.equal(colorFor('a'), COL_VEL);
  assert.equal(colorFor('ā'), COL_VEL);
  assert.equal(colorFor('i'), COL_PAL);
  assert.equal(colorFor('u'), COL_LAB);
});

test('colorFor: придыхательные согласные (2 ASCII-символа, 1 фонема) — НЕ нейтральный цвет', () => {
  // Это и есть регрессия заходов 48-49 — dh/kh/gh и т.п. должны получать
  // честный фонетический цвет своей варги, не GROUP_COLOR.
  for (const [ch, expected] of [
    ['kh', COL_VEL], ['gh', COL_VEL],
    ['ch', COL_PAL], ['jh', COL_PAL],
    ['ṭh', COL_RET], ['ḍh', COL_RET],
    ['th', COL_DEN], ['dh', COL_DEN],
    ['ph', COL_LAB], ['bh', COL_LAB],
  ]) {
    assert.equal(colorFor(ch), expected, `${ch} должен получать ${expected}, не нейтральный`);
    assert.notEqual(colorFor(ch), GROUP_COLOR, `${ch} НЕ должен быть нейтральным (GROUP_COLOR)`);
  }
});

test('colorFor: дифтонги ai/au (та же природа, что придыхательные) — НЕ нейтральный цвет', () => {
  assert.equal(colorFor('ai'), COL_PAL);
  assert.equal(colorFor('au'), COL_LAB);
  assert.notEqual(colorFor('ai'), GROUP_COLOR);
  assert.notEqual(colorFor('au'), GROUP_COLOR);
});

test('colorFor: сжатые многобуквенные блоки (заход 48) — нейтральный GROUP_COLOR', () => {
  assert.equal(colorFor('yam'), GROUP_COLOR);
  assert.equal(colorFor('yati'), GROUP_COLOR);
  assert.equal(colorFor('raṇyam'), GROUP_COLOR);
  assert.equal(colorFor('ta'), GROUP_COLOR);
});

test('colorFor: h без единого места образования — COL_DIM', () => {
  assert.equal(colorFor('h'), COL_DIM);
  assert.equal(colorFor('ṃ'), COL_DIM);
  assert.equal(colorFor('ḥ'), COL_DIM);
});
