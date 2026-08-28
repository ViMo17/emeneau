// Минимальная настройка ESLint — только "рекомендованные" правила
// (реальные классы ошибок: необъявленные/неиспользуемые переменные,
// недостижимый код и т.п.), без стилистических правил (кавычки, точки с
// запятой) — тот же минимализм, что и во всём проекте, не карго-культ
// "поставить линтер со всеми правилами по умолчанию".
import js from '@eslint/js';

const browserGlobals = {
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  navigator: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  ResizeObserver: 'readonly',
  CustomEvent: 'readonly',
  performance: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  fetch: 'readonly',
};

export default [
  js.configs.recommended,
  {
    ignores: [
      'node_modules/**',
      'docs/app/vendor/**', // вендоренный three.module.js — не наш код
      // Старые рукописные модули — эталоны техник, сознательно НЕ
      // подключены никуда и не редактируются (см. CLAUDE.md, «Файлы»);
      // линтинг мёртвого, замороженного кода не даёт пользы.
      'docs/app/examples/rule3-agnayas.js',
      'docs/app/examples/rule71-vak-asti.js',
      'docs/app/lib/anim-elements.js',
    ],
  },
  {
    files: ['docs/app/lib/**/*.js', 'docs/app/examples/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: browserGlobals,
    },
  },
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...browserGlobals, process: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
];
