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

const TARGET_DIRS = ['docs/app/lib'];
const PATTERN = /заход\s*\d|Заход\s*\d|ЗАХОД\s*\d/;

function collectFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...collectFiles(full));
    else if (name.endsWith('.js')) out.push(full);
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
  console.log('OK — «заход N» не найдено в docs/app/lib/*.js');
}
