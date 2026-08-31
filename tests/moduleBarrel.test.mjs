// Тест-предохранитель на разбиение slot-engine.js по модулям (заход 62,
// Стадия 5 профессионализации). Реализация ушла в slot-engine-*.js
// (core/cube/words/steps/validate/ops/mount), slot-engine.js стал тонким
// barrel-файлом (`export * from './slot-engine-X.js'` на каждый модуль) —
// публичный API (что реально импортируют examples/*.js, тестовые HTML,
// приложение, остальные tests/*.mjs) не должен был измениться ни на одно
// имя. Этот тест — не полное покрытие функциональности (её покрывают
// остальные 94 теста, которые все продолжают импортировать из того же
// slot-engine.js), а страховка именно от ошибки СБОРКИ barrel'а: забытый
// `export *` для нового модуля или коллизия имён между модулями (`export *`
// молча ломается на коллизии — конкретное совпавшее имя просто пропадает
// из барреля, без ошибки при импорте).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as engine from '../docs/app/lib/slot-engine.js';

const EXPECTED_EXPORTS = [
  // core
  'N_SLOTS', 'CUBE_SIZE', 'SLOT', 'MS_PER_360', 'HALF_WORLD_H', 'READY_COLOR',
  'SIGNAL_COLOR', 'SILVER_COLOR', 'GROUP_COLOR', 'TRANSFORM_KIND', 'tokenize',
  'slotX', 'centeredStart', 'centerSlots', 'halfWorldW', 'computeFitFov',
  'colorFor', 'clamp01', 'lerp', 'easeOutCubic', 'easeInOutCubic',
  'easeInCubic', 'easeOutBack', 'easeOutBounce', 'easeFall',
  // words
  'computeWordGroups', 'resolveSlotRef',
  // steps
  'stepTargetOpacity', 'sameActiveSlots', 'buildRuntimeSteps', 'stepIndexAt',
  // validate
  'validateExampleData',
  // ops
  'applyTransform', 'applyElide', 'applyInfluence', 'applyApproach',
  'flyArcPosition', 'applySplit', 'applyArrive', 'applyMerge', 'applySettle',
  'applyDim', 'applyStepDim', 'project', 'frontAnchor', 'spawnPulseRing',
  // mount
  'mountSlotExample',
];

test('slot-engine.js (barrel): реэкспортирует все публичные имена всех модулей', () => {
  const missing = EXPECTED_EXPORTS.filter(name => typeof engine[name] === 'undefined');
  assert.deepEqual(missing, [], `отсутствуют в barrel: ${missing.join(', ')}`);
});

test('slot-engine.js (barrel): mountSlotExample и apply*-функции — реальные функции, не заглушки', () => {
  for (const name of ['mountSlotExample', 'applyTransform', 'applyInfluence', 'validateExampleData']) {
    assert.equal(typeof engine[name], 'function', `${name} должен быть функцией`);
  }
});

test('каждый submodule импортируется НАПРЯМУЮ (не только через barrel) без циклических зависимостей', async () => {
  const modules = [
    '../docs/app/lib/slot-engine-core.js',
    '../docs/app/lib/slot-engine-cube.js',
    '../docs/app/lib/slot-engine-words.js',
    '../docs/app/lib/slot-engine-steps.js',
    '../docs/app/lib/slot-engine-validate.js',
    '../docs/app/lib/slot-engine-ops.js',
    '../docs/app/lib/slot-engine-mount.js',
  ];
  for (const m of modules) {
    await assert.doesNotReject(() => import(m), `${m} не должен падать при импорте`);
  }
});
