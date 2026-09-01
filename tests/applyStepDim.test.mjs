// Тесты РЕАЛЬНО импортированной applyStepDim (заход 60, Стадия 2: перенесена
// на уровень модуля, 10/10 — ПОСЛЕДНЯЯ функция плана). Автоматическое
// притенение по data.steps, отдельно от ручного 'dim'. runtimeSteps строится
// той же buildRuntimeSteps, что уже проверена в buildRuntimeSteps.test.mjs —
// здесь не дублируем те тесты, проверяем именно применение (setOpacity) поверх
// готовых runtimeSteps.
//
// Регрессия «заход 7» (двойное мерцание): на самой границе шага (t=0)
// целевая яркость должна РОВНО совпасть с реальной яркостью prev-шага —
// непрерывный переход, не скачок к декларативному target.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { applyStepDim, buildRuntimeSteps } from '../docs/app/lib/slot-engine.js';

function makeCube() {
  const mesh = new THREE.Object3D();
  mesh.material = [{ opacity: 1 }];
  return { mesh };
}

function makeCtx(cubes, steps, data = {}) {
  return { cubes, runtimeSteps: buildRuntimeSteps(steps), data };
}

test('applyStepDim: без runtimeSteps — тихо ничего не делает, не падает', () => {
  const ctx = { cubes: { 1: makeCube() }, runtimeSteps: null, data: {} };
  assert.doesNotThrow(() => applyStepDim(100, ctx));
});

test('applyStepDim: неактивный слот притенён до dimOpacity, активный — полная непрозрачность', () => {
  const cubes = { 1: makeCube(), 2: makeCube() };
  const steps = [
    { kind: 'a', start: 0, end: 1000, activeSlots: [1] },
    { kind: 'b', start: 1000, end: 2000, activeSlots: [2] },
  ];
  const ctx = makeCtx(cubes, steps);

  applyStepDim(500, ctx); // глубоко внутри первого шага, prev не существует — без рампы
  assert.equal(cubes[1].mesh.material[0].opacity, 1, 'слот 1 активен в первом шаге');
  assert.ok(Math.abs(cubes[2].mesh.material[0].opacity - 0.22) < 1e-9, 'слот 2 неактивен — дефолтный dimOpacity 0.22');
});

test('applyStepDim: заход 7 — ровно на границе шага целевая яркость совпадает с РЕАЛЬНОЙ яркостью prev, не скачет', () => {
  const cubes = { 1: makeCube(), 2: makeCube() };
  const steps = [
    { kind: 'a', start: 0, end: 1000, activeSlots: [1] },
    { kind: 'b', start: 1000, end: 2000, activeSlots: [2] },
  ];
  const ctx = makeCtx(cubes, steps);

  applyStepDim(1000, ctx); // ровно граница (t=0 рампы нового шага)
  assert.ok(Math.abs(cubes[2].mesh.material[0].opacity - 0.22) < 1e-9, 'слот 2 (станет активным) на самой границе ещё держит РЕАЛЬНУЮ яркость prev (0.22), не прыгает сразу к 1');
  assert.ok(Math.abs(cubes[1].mesh.material[0].opacity - 1) < 1e-9, 'слот 1 (был активен) на самой границе ещё держит РЕАЛЬНУЮ яркость prev (1), не прыгает сразу к dimOpacity');
});

test('applyStepDim: к концу RAMP после границы — яркость полностью подведена к target нового шага', () => {
  const cubes = { 1: makeCube(), 2: makeCube() };
  const steps = [
    { kind: 'a', start: 0, end: 1000, activeSlots: [1] },
    { kind: 'b', start: 1000, end: 2000, activeSlots: [2] },
  ];
  const ctx = makeCtx(cubes, steps, { stepRamp: 300 });

  applyStepDim(1000 + 300, ctx); // ровно конец RAMP
  assert.ok(Math.abs(cubes[2].mesh.material[0].opacity - 1) < 1e-6, 'слот 2 полностью проявился');
  assert.ok(Math.abs(cubes[1].mesh.material[0].opacity - 0.22) < 1e-6, 'слот 1 полностью притенился');
});

test('applyStepDim: пользовательский dimOpacity из data применяется вместо дефолта 0.22', () => {
  const cubes = { 1: makeCube(), 2: makeCube() };
  const steps = [{ kind: 'a', start: 0, end: 1000, activeSlots: [1] }];
  const ctx = makeCtx(cubes, steps, { dimOpacity: 0.5 });

  applyStepDim(500, ctx);
  assert.ok(Math.abs(cubes[2].mesh.material[0].opacity - 0.5) < 1e-9, 'кастомный dimOpacity из data.dimOpacity применён');
});

test('applyStepDim: РЕАЛЬНЫЙ НАЙДЕННЫЙ БАГ — слот под управлением активного elide не должен перебиваться притенением/активацией по activeSlots, даже когда сам в этом списке', () => {
  const cube = makeCube();
  cube.mesh.material[0].opacity = 0.4123; // произвольное значение, которое якобы держит elide в этом кадре
  const cubes = { 4: cube };
  const steps = [{ kind: 'rule', start: 0, end: 5000, activeSlots: [4] }]; // slot 4 АКТИВЕН — без фикса stepDim принудительно поставил бы opacity=1
  const data = { ops: [{ type: 'elide', at: 4, start: 1000 }] };
  const ctx = makeCtx(cubes, steps, data);

  applyStepDim(1500, ctx); // elapsed >= op.start, кубик всё ещё существует
  assert.equal(cube.mesh.material[0].opacity, 0.4123, 'opacity НЕ тронута — слот 4 пропущен, elide ведёт свою кривую сам');
});

test('applyStepDim: elide ЕЩЁ не начался (elapsed < op.start) — обычное притенение по activeSlots работает как всегда', () => {
  const cube = makeCube();
  const cubes = { 4: cube };
  const steps = [{ kind: 'rule', start: 0, end: 5000, activeSlots: [4] }];
  const data = { ops: [{ type: 'elide', at: 4, start: 1000 }] };
  const ctx = makeCtx(cubes, steps, data);

  applyStepDim(500, ctx); // elapsed < op.start=1000 — elide ещё не активен
  assert.equal(cube.mesh.material[0].opacity, 1, 'слот активен (в activeSlots), elide ещё не начался — обычное поведение, opacity=1');
});
