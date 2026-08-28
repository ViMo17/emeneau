// Тест-предохранитель на вынос данных приложения из sanskrit-sandhi-app.html
// в docs/app/data.js (заход 68). Это чисто декларативные данные (тексты
// правил, роли на алфавите, упражнения, группировка) — сам JS-код
// приложения (рендер, обработчики) их не проверял раньше и не проверяет
// сейчас, но при переносе легко забыть export у одного из блоков или
// случайно обрезать границу объекта не в том месте (см. CLAUDE.md, «заход
// 58» — тот же класс риска при похожем переносе). Тест ловит именно это:
// каждый экспорт существует, имеет ожидаемую форму и разумный размер —
// не полная проверка содержания (оно не менялось, только переехало).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SECTIONS, EXAMPLES, EXERCISES,
  RULE_GROUP, RULE_SUBGROUP, GROUP_INFO, SUBGROUP_INFO,
  ALPHA_ROWS,
} from '../docs/app/data.js';

test('SECTIONS — непустой массив разделов с id/label/cards', () => {
  assert.ok(Array.isArray(SECTIONS) && SECTIONS.length > 0);
  for (const section of SECTIONS) {
    assert.equal(typeof section.id, 'string');
    assert.equal(typeof section.label, 'string');
    assert.ok(Array.isArray(section.cards) && section.cards.length > 0);
  }
});

test('SECTIONS — суммарно все 71 правило присутствуют ровно один раз', () => {
  const seen = new Set();
  for (const section of SECTIONS) {
    for (const card of section.cards) {
      assert.ok(!seen.has(card.n), `правило ${card.n} встречается дважды`);
      seen.add(card.n);
    }
  }
  assert.equal(seen.size, 71);
});

test('EXAMPLES — ключи это номера правил 1..71, значения непустые массивы', () => {
  const keys = Object.keys(EXAMPLES).map(Number);
  assert.ok(keys.length > 0);
  for (const k of keys) {
    assert.ok(k >= 1 && k <= 71, `неожиданный номер правила ${k}`);
    assert.ok(Array.isArray(EXAMPLES[k]) && EXAMPLES[k].length > 0);
  }
});

test('EXERCISES — ключи это номера правил, значения массивы номеров упражнений', () => {
  const keys = Object.keys(EXERCISES).map(Number);
  assert.ok(keys.length > 0);
  for (const k of keys) {
    assert.ok(Array.isArray(EXERCISES[k]));
  }
});

test('RULE_GROUP/RULE_SUBGROUP ссылаются только на существующие GROUP_INFO/SUBGROUP_INFO', () => {
  for (const g of Object.values(RULE_GROUP)) {
    assert.ok(g in GROUP_INFO, `группа ${g} без описания в GROUP_INFO`);
  }
  for (const sg of Object.values(RULE_SUBGROUP)) {
    assert.ok(sg in SUBGROUP_INFO, `подгруппа ${sg} без описания в SUBGROUP_INFO`);
  }
});

test('ALPHA_ROWS — непустой массив рядов алфавита, каждая ячейка либо null, либо {dv,tr}', () => {
  assert.ok(Array.isArray(ALPHA_ROWS) && ALPHA_ROWS.length > 0);
  for (const row of ALPHA_ROWS) {
    if (row.gap) continue; // разделитель между блоками алфавита, без cells
    assert.ok(Array.isArray(row.cells) && row.cells.length > 0);
    for (const cell of row.cells) {
      if (cell === null) continue;
      assert.equal(typeof cell.dv, 'string');
      assert.equal(typeof cell.tr, 'string');
    }
  }
});
