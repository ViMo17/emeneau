// Проверяет, что в реализации движка не завелись новые «заход N» —
// история должна жить в CHANGELOG.md, в коде — только техническая причина
// «почему сейчас так» (см. CLAUDE.md, Стадия 3). Написано на Node, не на
// grep/bash — единственный способ работать одинаково и в CI (Linux), и на
// машине разработки (Windows): та же причина, по которой раньше сломался
// сам npm test (одинарные кавычки не разворачивались cmd.exe).
//
// Проверяются ВСЕ варианты регистра явно («заход»/«Заход»/«ЗАХОД»), не
// через флаг -i/regex-i — на этой кодовой базе однажды уже поймали
// реальный случай, когда регистронезависимый поиск кириллицы в этой среде
// тихо не находил «ЗАХОД» (см. CHANGELOG.md, заход 62).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// docs/app целиком (lib/examples/data.js/role-demo.js/alpha-panel.js/
// rule-panel.js/sanskrit-sandhi-app.html/test-slot-engine*.html), не только
// lib/ — ровно та же дыра в дисциплине, что уже дважды подводила в этой
// сессии (заход 66: правило распространялось только на lib/, «заход N»
// дважды случайно проскочило в код за пределами lib/, пока его не нашли
// вручную построчным аудитом). vendor/ и явно замороженные эталонные модули
// исключены — они не редактируются, требовать от них чистоты бессмысленно.
const TARGET_DIRS = ['docs/app'];
const EXCLUDE = new Set([
  join('docs/app', 'vendor'),
  join('docs/app/examples', 'rule3-agnayas.js'),
  join('docs/app/examples', 'rule71-vak-asti.js'),
  join('docs/app/lib', 'anim-elements.js'),
]);
const PATTERN = /заход\s*\d|Заход\s*\d|ЗАХОД\s*\d/;

function collectFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (EXCLUDE.has(full)) continue;
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectFiles(full));
    else if (name.endsWith('.js') || name.endsWith('.html')) out.push(full);
  }
  return out;
}

let problems = [];
for (const dir of TARGET_DIRS) {
  for (const file of collectFiles(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (PATTERN.test(line)) problems.push(`${file}:${i + 1}: ${line.trim()}`);
    });
  }
}

if (problems.length) {
  console.error('Найдено «заход N» в реализации движка (история должна жить в CHANGELOG.md):');
  problems.forEach(p => console.error('  ' + p));
  process.exit(1);
} else {
  console.log('OK — «заход N» не найдено в docs/app/**/*.{js,html} (кроме vendor/ и замороженных эталонов)');
}
