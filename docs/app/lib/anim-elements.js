/* ═══════════════════════════════════════════════════════════════════════════
   АНИМАЦИОННЫЕ ЭЛЕМЕНТЫ — общая база для всех 13 категорий сандхи
   ═══════════════════════════════════════════════════════════════════════════

   Уровень ниже, чем 13 категорий сандхи (effects-assignment.md). Категория —
   это ЧТО происходит с звуком (гуна, ассимиляция, выпадение...). Элемент —
   это ИЗ ЧЕГО технически собрана анимация на экране. Одна категория = список
   вызовов 3–5 элементов, не новый код с нуля.

   Происхождение каждого элемента указано явно — часть вынесена из уже
   работающих файлов (rule-guna-agnayas.html, rule-vriddhi-stauti.html,
   rule-assimilation-varga-t-d.html), часть написана заново по словесному
   описанию из effects-map.html и визуально ЕЩЁ НЕ ПРОВЕРЕНА — это отмечено
   у каждой функции отдельно, не общей фразой в шапке.

   Использование: чистые функции, ничего не меняют вне переданных объектов.
   Вызывающий код сам решает, в какой момент (elapsed) какой элемент запустить —
   этот модуль не содержит расписания фаз, только сами движения. */

/* ── Общая скорость вращения — ЕДИНАЯ РУЧКА, см. чат: ассимиляция (t+dh)
   признана эталонной скоростью, 180° за 1800мс = 3600мс на полный оборот.
   Меняешь одно число здесь — meняется скорость во всех элементах разом. */
export const MS_PER_360 = 3600;

/* ── Базовые хелперы (те же, что уже используются во всех трёх файлах) ── */
export function clamp01(t) { return Math.max(0, Math.min(1, t)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
export function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t-=1.5/d1)*t+0.75;
  if (t < 2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
  return n1*(t-=2.625/d1)*t+0.984375;
}

/* ═══ 1. ОБОРОТ ═══
   Источник: одинаковый паттерн из гуны/вриддхи/ассимиляции, обобщено.
   Длительность больше не вшивается — считается из угла через MS_PER_360,
   это и есть исправление найденной в чате нестыковки скорости. */
export function elTurn(mesh, elapsed, start, angleDeg, { dir = -1, axis = 'y', ease = easeOutCubic } = {}) {
  const dur = Math.abs(angleDeg) / 360 * MS_PER_360;
  if (elapsed < start) return { active: false, done: false, t: 0, dur };
  const t = clamp01((elapsed - start) / dur);
  mesh.rotation[axis] = dir * ease(t) * (angleDeg * Math.PI / 180);
  return { active: true, done: elapsed >= start + dur, t, dur };
}

/* ═══ 2. СМЕНА ЦВЕТА/БУКВЫ ═══
   Источник: паттерн «пересобрать материал в момент X» из всех трёх файлов.
   buildMaterialsFn — функция построения материала кубика (своя в каждом
   файле, сюда передаётся как параметр, не дублируется). */
export function elRecolor(cube, elapsed, at, newColorHex, newGlyph, buildMaterialsFn, seed) {
  if (elapsed >= at && !cube._recolored) {
    cube._recolored = true;
    cube.mesh.material = buildMaterialsFn(newColorHex, seed, newGlyph);
  }
  return cube._recolored === true;
}

/* ═══ 3. ПУЛЬС-ВОЛНА ВЛИЯНИЯ ═══
   Источник: spawnWave() из гуны/вриддхи, дословно то же самое, только
   вынесено как параметризованная функция (нужен доступ к project() и
   labelsEl — передаются явно, не через замыкание). */
export function elPulseWave(project, labelsEl, fromVec3, toVec3, dur) {
  const pA = project(fromVec3);
  const pB = project(toVec3);
  const ring = document.createElement('div');
  ring.className = 'wave-ring';
  ring.style.left = pA.x + 'px';
  ring.style.top = pA.y + 'px';
  ring.style.setProperty('--dx', (pB.x - pA.x) + 'px');
  ring.style.setProperty('--dy', (pB.y - pA.y) + 'px');
  ring.style.setProperty('--wave-dur', dur + 'ms');
  labelsEl.appendChild(ring);
  setTimeout(() => ring.remove(), dur + 80);
}

/* ═══ 4. ДРОЖЬ ═══
   ИСПРАВЛЕНО при пересборке ассимиляции: раньше здесь была позиционная тряска
   (сдвиг x/z) — написано по памяти, без доступа к реальному коду. Настоящая
   реализация в rule-assimilation-varga-t-d.html — покачивание ПОВОРОТОМ по оси
   Z, не позицией: `rotation.z = sin(elapsed*0.025) * amplitude * envelope`.
   Теперь дословно то же самое, просто параметризовано. */
export function elJitter(mesh, elapsed, start, dur, amplitude = 0.05, axis = 'z') {
  if (elapsed < start || elapsed > start + dur) { mesh.rotation[axis] = 0; return false; }
  const t = clamp01((elapsed - start) / dur);
  const envelope = Math.sin(t * Math.PI);
  mesh.rotation[axis] = Math.sin(elapsed * 0.025) * amplitude * envelope;
  return true;
}

/* ═══ 5. РАСТЯЖЕНИЕ ГЛИФА ═══
   НОВЫЙ КОД — для УДЛИН (компенсаторное удлинение гласного). В отличие от
   остальных, это НЕ вращение кубика, а растяжение самого меша по горизонтали
   (scale.x), с пиком в середине фазы и возвратом к 1 — имитация «гласный
   тянется дольше». Визуально не проверено, нет готового прототипа для сверки. */
export function elStretchGlyph(mesh, elapsed, start, dur, maxScaleX = 1.4) {
  if (elapsed < start || elapsed > start + dur) { mesh.scale.x = 1; return false; }
  const t = clamp01((elapsed - start) / dur);
  const envelope = Math.sin(t * Math.PI);
  mesh.scale.x = 1 + (maxScaleX - 1) * envelope;
  return true;
}

/* ═══ 6. ПОГРУЖЕНИЕ (тонет сквозь пол) ═══
   НОВЫЙ КОД — для ВЫПАД. По effects-map.html: «бледнеет → уходит вниз
   сквозь пол». Использует ту же opacity-логику, что уже есть в проекте
   (tintCube/mix из ассимиляции), плюс движение по Y вниз. Визуально не
   проверено. depth — насколько ниже пола уйдёт (пол обычно y=0). */
export function elSink(mesh, elapsed, start, dur, restY, depth = 3) {
  if (elapsed < start) return { active: false, done: false };
  const t = clamp01((elapsed - start) / dur);
  const te = easeOutCubic(t);
  mesh.position.y = lerp(restY, restY - depth, te);
  if (mesh.material) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => { if (m.opacity !== undefined) { m.transparent = true; m.opacity = 1 - te; } });
  }
  return { active: true, done: t >= 1 };
}

/* ═══ 7. ОТПОЧКОВАНИЕ КОПИИ ═══
   НОВЫЙ КОД — для УДВОЕН. По effects-map.html: «отпочковывает копию вбок».
   Требует уже готовый ВТОРОЙ меш-копию (создаётся вызывающим кодом заранее,
   изначально в той же позиции, что источник, invisible) — эта функция просто
   двигает копию в сторону и делает видимой. Визуально не проверено. */
export function elSpawnCopy(copyMesh, elapsed, start, dur, sourcePos, offset = { x: 0.9, y: 0, z: 0 }) {
  if (elapsed < start) { copyMesh.visible = false; return { active: false, done: false }; }
  copyMesh.visible = true;
  const t = clamp01((elapsed - start) / dur);
  const te = easeOutCubic(t);
  copyMesh.position.set(
    sourcePos.x + offset.x * te,
    sourcePos.y + offset.y * te,
    sourcePos.z + offset.z * te
  );
  return { active: true, done: t >= 1 };
}

/* ═══ 8. ПРИЛЁТ НОВОГО КУБИКА ═══
   Источник: обобщено из «y/a прилетают из алфавита» в гуне (arrivalStart,
   yInDur/aInDur) — рабочий, визуально проверенный код, только вынесен из
   привязки к конкретным cubes.y/cubes.aNew в параметризованную функцию. */
export function elFlyIn(mesh, elapsed, start, dur, fromPos, toPos, { arcHeight = 1.1, spinTurns = 2.5 } = {}) {
  if (elapsed < start) { mesh.visible = false; return { active: false, done: false }; }
  mesh.visible = true;
  const t = clamp01((elapsed - start) / dur);
  const te = easeOutCubic(t);
  const arc = Math.sin(t * Math.PI) * arcHeight;
  mesh.position.set(
    lerp(fromPos.x, toPos.x, te),
    lerp(fromPos.y, toPos.y, te) + arc,
    lerp(fromPos.z, toPos.z, te)
  );
  mesh.rotation.y = (1 - t) * Math.PI * spinTurns;
  return { active: true, done: t >= 1, t: te };
}

/* ═══ 9. ПЕРЕНОС ЧЕРЕЗ СЦЕНУ ═══
   НОВЫЙ КОД — для БАРТОЛОМЭ (перенос придыхания через всё слово на
   расстояние, bhotsyate/adhok). По смыслу — не новый визуальный примитив,
   а КОМПОЗИЦИЯ уже существующих: elPulseWave (сам перенос как волна через
   сцену) + elRecolor дважды (гаснет на источнике, проявляется на цели,
   с задержкой между ними). Отдельной новой геометрии не требует — здесь
   только координирующая функция, чтобы не собирать эту связку каждый раз
   заново. Визуально не проверено (сама композиция), элементы внутри — да. */
export function elTransferAcross(project, labelsEl, fromCube, toCube, elapsed, start, {
  waveDur = 900, fadeDur = 500, gapAfterWave = 200,
  fadeColorHex, fadeGlyph, riseColorHex, riseGlyph, buildMaterialsFn, seed
} = {}) {
  if (elapsed < start) return { phase: 'idle' };
  elPulseWave(project, labelsEl, fromCube.mesh.position, toCube.mesh.position, waveDur);
  const fadeAt = start; // источник начинает гаснуть сразу с волной
  const riseAt = start + waveDur + gapAfterWave; // цель проявляется после того, как волна долетела
  elRecolor(fromCube, elapsed, fadeAt, fadeColorHex, fadeGlyph, buildMaterialsFn, seed);
  elRecolor(toCube, elapsed, riseAt, riseColorHex, riseGlyph, buildMaterialsFn, seed);
  return { phase: elapsed < riseAt ? 'travelling' : 'arrived' };
}

/* ═══ 10. ПЛАШКА-ПОДПИСЬ ═══
   Источник: обобщено из tag-float (гуна) — рабочий, визуально проверенный
   код. В 2D-системе (алфавит) уже есть аналог — svgBadge для ∅/×2; здесь —
   3D-вариант, плавающий над сценой, не над буквой в таблице. */
export function elLabel(labelEl, elapsed, showAt, hideAt) {
  if (elapsed >= showAt && !labelEl.classList.contains('show') && elapsed < hideAt) {
    labelEl.classList.add('show');
  }
  if (elapsed >= hideAt && labelEl.classList.contains('show')) {
    labelEl.classList.remove('show');
  }
}
