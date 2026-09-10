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
  ALPHA_ROWS, GLOSSARY, glossarySlug,
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

// Прямой запрос пользователя: глоссарий должен «уяснить язык Панини» — не
// только термины-названия конкретных операций сандхи, но и метаязыковые
// понятия его грамматики (pada, adhikāra, varga, nimitta и т.п.), каждый с
// деванагари. openTerm:true — законное исключение (временный кириллический
// плейсхолдер для явления, у которого устоявшийся санскритский термин ещё
// не найден, см. CLAUDE.md «Термины, остающиеся НЕ решены») — деванагари у
// русского слова не имеет смысла.
test('GLOSSARY — каждая запись без openTerm имеет devanagari (не только ИАСТ)', () => {
  for (const [term, entry] of Object.entries(GLOSSARY)) {
    if (entry.openTerm) continue;
    assert.equal(typeof entry.devanagari, 'string', `${term} — нет devanagari`);
    assert.ok(entry.devanagari.length > 0, `${term} — devanagari пустая строка`);
  }
});

test('GLOSSARY — glossarySlug даёт непустой, без пробелов слаг для каждого ключа', () => {
  for (const term of Object.keys(GLOSSARY)) {
    const slug = glossarySlug(term);
    assert.ok(slug.length > 0, `${term} — пустой слаг`);
    assert.ok(!/\s/.test(slug), `${term} — слаг содержит пробел: "${slug}"`);
  }
});

// Реальный найденный класс бага (śādhi/EXAMPLES[15], suhārt/EXAMPLES[8]) —
// опечатка в glossaryTerm молча не рендерит ссылку (тихий console.warn в
// role-demo.js, не бросает) — легко не заметить визуально. Проверяем
// структурно, что КАЖДАЯ ссылка на термин в любом roleDemo.steps по всем
// 71 правилам резолвится в реально существующую запись GLOSSARY.
test('EXAMPLES — каждый glossaryTerm (строка или массив) ссылается на существующую запись GLOSSARY', () => {
  for (const [ruleNum, arr] of Object.entries(EXAMPLES)) {
    arr.forEach((ex, exi) => {
      (ex.roleDemo?.steps ?? []).forEach((step, si) => {
        if (step.glossaryTerm == null) return;
        const terms = [].concat(step.glossaryTerm);
        terms.forEach(term => {
          assert.ok(GLOSSARY[term], `EXAMPLES[${ruleNum}][${exi}].roleDemo.steps[${si}].glossaryTerm — "${term}" нет в GLOSSARY`);
        });
      });
    });
  }
});
