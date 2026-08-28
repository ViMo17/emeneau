// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — один движок + данные на правило, вместо файла на каждый пример.
// ═══════════════════════════════════════════════════════════════════════════
//
// ТРЕБОВАНИЕ К ВЫЗЫВАЮЩЕЙ СТРАНИЦЕ (движок сам вёрстку не задаёт): у контейнера
// нужен explicit `#контейнер canvas { display:block; width:100%; height:100%; }`
// — без него канвас держится дефолтного браузерного размера (~300×150px).
//
// Принцип (зафиксирован в чате и в second-examples-todo.md):
//  · Один кубик = один ЗВУК, не деванагари-буква. Обоснование — в предисловии
//    приложения («Почему звук, а не буква деванагари»).
//  · Ряд — 10 слотов, фиксированная камера, без адаптации под длину примера.
//  · Правила 61, 62, 64, 65 — сознательно не переводятся в 3D, только 2D.
//  · Операции — конечный список алгоритмов, пример = данные, не код.
//  · Все правки ниже — ОБЩИЕ свойства движка. Пример agnayas в
//    test-slot-engine.html — полигон для проверки, не цель сама по себе:
//    правим алгоритм на все будущие правила, не «причёсываем» один ролик.
//
// ЗАХОД 2 (этот): три системных фикса + одна новая возможность.
//  1. БАГ (не частность agnayas): matsSignal/matsReady собирались ОДИН РАЗ при
//     создании кубика с тем глифом, который был на старте — если кубик потом
//     проходит transform (i→e и т.п.), «сигнальный» и «финальный» материалы
//     оставались с исходной, уже неактуальной буквой. Из-за этого на agnayas
//     после transform (i→e) при approach на пике «сигнального» пульса на долю
//     секунды снова показывалась исходная И (жёлтым/сигнальным цветом,
//     воспринимается как «оранжевая») — призрак старого материала, не текущего.
//     Чинится один раз, здесь, для ЛЮБОГО будущего примера с transform.
//  2. Скорость/плавность — общие тайминги движка и часть кривых сглажены и
//     замедлены (падение, подход/отскок, отстойник/прилёт) — не только числа
//     в данных agnayas, но и дефолты самого движка.
//  3. ШАГИ — новый, общий раздел данных `data.steps`: явные границы между
//     «грамматика» и «правило N» с автоматическим притенением фона по текущему
//     шагу (кто активен — не притенён, кто нет — притенён) вместо того, чтобы
//     автору примера вручную рассчитывать пересекающиеся окна dim. Заодно
//     показывается лента шагов под сценой и короткий маркер-вспышка в момент
//     смены шага — то, что было в second-examples-todo.md отмечено как
//     «придумать» для перехода грамматика→правило.
//
// Материал/геометрия кубика — не здесь, берутся из уже готового chalk-module.js.

import * as THREE from 'three';
import { buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture, paintGlyph } from './chalk-module.js';

export const N_SLOTS = 10;
export const CUBE_SIZE = 1.1;
export const SLOT = 1.2;
// Скорость оборота трансформации — 1400мс на один оборот, взята из
// T.gunaDur rule3-agnayas.js (не своё число движка). ЛОКАЛЬНАЯ константа-
// стандарт: не менять без явной сверки с рабочим файлом. Для вриддхи —
// spinTurns:2 (те же 1400мс на оборот, ×2 через существующий множитель).
export const MS_PER_360 = 1400;
export const READY_COLOR = 0xDECDAF; // тот же тёплый бежевый, что и в rule3-agnayas.js
// Золотой (SIGNAL_COLOR) зарезервирован под вриддхи (когда появится:
// transform с spinTurns:2, её сигнал/кольца — золотые, отличие от
// «рядовой» гуны должно быть цветовым) — НЕ используется нигде в движке
// до появления настоящего вриддхи-механизма, иначе золото тихо просочится
// в обычные примеры через общий код. Для обычной гуны (и «вот-вот
// изменится» по умолчанию) — SILVER_COLOR, металлический холодный
// оттенок, не пересекается ни с одной категорией алфавитной палитры
// (vel/pal/ret/den/lab) и с READY_COLOR.
export const SIGNAL_COLOR = 0xE8C860; // зарезервировано под вриддхи — намеренно не используется нигде в движке
export const SILVER_COLOR = 0xCDD3D9; // «под влиянием/вот-вот изменится» по умолчанию — металлический блеск
const SILVER_RGB = '205,211,217'; // тот же тон в rgb-строке — для DOM-колец (spawnWave/spawnPulseRing)
// Сустейн-кольца и рамка-подчёркивание группы источников тонируются в ОДИН
// нейтральный цвет (не в собственный фонетический цвет каждого кубика) —
// синхронная группа должна читаться как единое целое, не как несколько
// разных событий рядом. Перекрашивать сами КУБИКИ в общий цвет — вне
// обсуждения (цвет кубика = место образования звука, не роль в слове),
// правило касается только временных индикаторов группы. Цвет — тёплый,
// вне фонетической палитры, не пересекается ни с READY_COLOR, ни с
// SILVER_COLOR, ни с зарезервированным золотом.
export const GROUP_COLOR = 0xE2D9BE;
const GROUP_RGB = '226,217,190';
// Именованные пресеты spinTurns+signal для каждой категории transform (см.
// реестр эталонных эффектов, CLAUDE.md) — данные примера ссылаются на них
// по имени ({ type:'transform', ...TRANSFORM_KIND.vargaPair }), не
// повторяют числа вручную (ручное повторение — источник ошибок: лёгко
// перепутать угол поворота одной категории с другой). guna — не отдельный
// пресет: дефолты движка (spinTurns:1, signal не 'blank') УЖЕ и есть
// гунация, передавать через пресет нечего.
export const TRANSFORM_KIND = {
  // Парная замена внутри варги (k↔g, глухая↔звонкая, придых↔непридых,
  // любая↔назальная) — 180°, противолежащая грань.
  vargaPair: { spinTurns: 0.5, signal: 'blank' },
  // Общая ассимиляция под соседа (буква вне всех варг — h/ṃ/ḥ — целиком
  // меняет место образования) — 360°, обычный оборот, нейтральная грань.
  assimToNeighbor: { spinTurns: 1, signal: 'blank' },
  // Вриддхи — ОТКРЫТЫЙ вопрос (нужен ли отдельный signal:'gold', сейчас
  // движок поддерживает только 'silver'/'blank'), не построена ни разу.
  // Не включена в пресет намеренно — включить и решить signal только при
  // первом реальном примере, не заранее вслепую.
};
const FLOOR_Y = -CUBE_SIZE / 2; // уровень пола — там, где нижняя грань кубика касается земли в покое
let _shadowTex = null; // общая на все кубики, создаётся один раз при первом использовании
let _stylesInjected = false; // общий <style> движка — вставляется в <head> один раз на документ

/* ═══════════════════ ТОКЕНИЗАТОР ═══════════════════
   Один кубик = один звук. Придыхательные и дифтонги — двухбуквенные в IAST,
   но один звук, один кубик, не разбиваются. Согласный без гласной после него —
   голая буква. Гласная после согласного — всегда отдельный кубик. */
const TWO_CHAR = new Set([
  'kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh',
  'ai','au'
]);
const ONE_CHAR = new Set('āīūṛṝḷaeiou' + 'kgṅcjñṭḍṇtdnpbmyrlvśṣsh' + 'ṃḥ');

export function tokenize(word) {
  const clean = word.replace(/[-']/g, '');
  const cubes = [];
  let i = 0;
  while (i < clean.length) {
    const two = clean.slice(i, i + 2);
    if (TWO_CHAR.has(two)) { cubes.push(two); i += 2; continue; }
    const one = clean[i];
    if (ONE_CHAR.has(one)) cubes.push(one);
    i += 1;
  }
  return cubes;
}

/* ═══════════════════ ГЕОМЕТРИЯ РЯДА ═══════════════════ */
export function slotX(i) { return (i - (N_SLOTS - 1) / 2) * SLOT; }

/* Утилита для автора данных — считает, с какого слота центрировать N букв,
   ПЕРЕД тем как вручную прописывать initial. Не используется в рантайме. */
export function centerSlots(letters, startAt = null) {
  const n = letters.length;
  const start = startAt !== null ? startAt : Math.floor((N_SLOTS - n) / 2);
  return letters.map((tr, i) => ({ slot: start + i, tr }));
}

/* ═══════════════════ ЦВЕТА ПО МЕСТУ ОБРАЗОВАНИЯ ═══════════════════ */
export const COL_VEL = 0xA8D878, COL_PAL = 0x7DCFCA, COL_RET = 0xC5B0D8,
             COL_DEN = 0xE8A8C0, COL_LAB = 0xF0BF88, COL_DIM = 0xEDE8D8;

// Многобуквенные (по написанию), но ОДНОФОНЕМНЫЕ записи IAST — два случая:
// придыхательные согласные (kh/gh/ch/jh/ṭh/ḍh/th/dh/ph/bh — звонкость+
// придыхание, не два звука) и дифтонги вриддхи (ai/au — уже используются в
// classifyFor ниже для i/u-рядов). Нужен явный список, не длина строки —
// иначе многобуквенный сжатый блок (см. colorFor ниже) и обычная одна
// фонема, записанная двумя символами, неразличимы формально.
const MULTI_CHAR_PHONEMES = new Set(['kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh','ai','au']);

export function colorFor(tr) {
  // «Сжатый многобуквенный блок → нейтральный цвет» нельзя проверять по
  // tr.length>1 — это ловит и однофонемные многобуквенные записи (см.
  // MULTI_CHAR_PHONEMES выше): без исключения кубики dh/kh/gh/ai/au
  // получили бы неверный нейтральный цвет вместо честного фонетического.
  if (tr.length > 1 && !MULTI_CHAR_PHONEMES.has(tr)) return GROUP_COLOR;
  // гласные — по традиционному месту образования (то же самое место, что и у
  // одноимённой группы согласных): a/ā гортанные, i/ī/e/ai нёбные,
  // ṛ/ṝ церебральные, ḷ зубная, u/ū/o/au губные.
  if (tr === 'a' || tr === 'ā') return COL_VEL;
  if (tr === 'i' || tr === 'ī' || tr === 'e' || tr === 'ai') return COL_PAL;
  if (tr === 'ṛ' || tr === 'ṝ') return COL_RET;
  if (tr === 'ḷ') return COL_DEN;
  if (tr === 'u' || tr === 'ū' || tr === 'o' || tr === 'au') return COL_LAB;
  // согласные
  const c = tr[0];
  if ('kgṅ'.includes(c) || tr === 'kh' || tr === 'gh') return COL_VEL;
  if ('cjñyś'.includes(c) || tr === 'ch' || tr === 'jh') return COL_PAL;
  if ('ṭḍṇr'.includes(c) || c === 'ṣ' || tr === 'ṭh' || tr === 'ḍh') return COL_RET;
  if ('tdnl'.includes(c) || c === 's' || tr === 'th' || tr === 'dh') return COL_DEN;
  if ('pbmv'.includes(c) || tr === 'ph' || tr === 'bh') return COL_LAB;
  return COL_DIM; // ṃ, ḥ, h — без единого места образования
}

/* Цвет кольца-пульса — НЕ фиксированный золотой, а оттенок СОБСТВЕННОГО цвета
   кубика (светлее и насыщеннее), тот же приём, что уже был найден и провере
   для 2D-примера ассимиляции (examples/rule71-vak-asti.js, ringColorFrom) —
   перенесено дословно (формулы hexToHsl/hslToRgbStr идентичны), чтобы кольцо
   у любого кубика в 3D читалось как «его собственное свечение», не как один
   и тот же безликий жёлтый сигнал на всех. */
function hexToHsl(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; } else {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; default: h = (r - g) / d + 4; }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgbStr(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const hue2rgb = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
  }
  return `${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}`;
}
function ringColorFrom(hex) {
  const [h, s, l] = hexToHsl(hex);
  return hslToRgbStr(h, Math.min(1, s + 0.25), Math.min(0.86, l + 0.22)); // тот же тон, заметно светлее
}

export function clamp01(t) { return Math.max(0, Math.min(1, t)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
// добавлено (плавность): мягкий разгон И торможение — там, где раньше
// движение стартовало сразу на полной скорости (easeOutCubic в t=0 имеет
// не нулевую производную, отсюда «рывок» в начале хода).
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
// медленный старт, ускоряющееся исчезновение — читается как растворение
// (elide), не механическое схлопывание.
export function easeInCubic(t) { return t * t * t; }
export function easeOutBack(t) { const s = 2.4; return 1 + s * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
export function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t-=1.5/d1)*t+0.75;
  if (t < 2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
  return n1*(t-=2.625/d1)*t+0.984375;
}
// Падение использует easeOutBounce напрямую, без подмеси easeOutCubic —
// та же формула, что и в rule3-agnayas.js, с полноценным отскоком при
// приземлении. Не заменять на смесь с easeOutCubic — это глушит отскок.
export function easeFall(t) { return easeOutBounce(t); }

/* ═══════════════════ КУБИК ═══════════════════
   Каждый кубик хранит НЕСКОЛЬКО готовых наборов материалов (не перерисовывает
   текстуру на лету) — тот же приём, что в rule3-agnayas.js: заранее собранный
   «пустой» вариант (без буквы, для момента вращения) и «ready»-вариант
   (READY_COLOR, для финальной волны), плюс «сигнальный» (SIGNAL_COLOR, для
   влияния/подхода). Все четыре набора ПЕРЕСОБИРАЮТСЯ заново в момент, когда
   кубик реально меняет букву (см. applyTransform) — иначе они держат глиф,
   с которым кубик родился, даже после того как он стал другой буквой. */
function makeShadow() {
  if (!_shadowTex) _shadowTex = makeShadowBlobTexture();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(CUBE_SIZE * 1.6, CUBE_SIZE * 1.6),
    new THREE.MeshBasicMaterial({ map: _shadowTex, transparent: true, depthWrite: false, fog: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, FLOOR_Y + 0.01, 0.05);
  return shadow;
}

function buildMatSet(tr, color, seed) {
  const matsMain   = buildChalkMaterials(color, seed, tr);
  const matsBlank  = buildChalkMaterials(color, seed + 1, null);
  const matsReady  = buildChalkMaterials(READY_COLOR, seed + 2, tr);
  const matsSignal = buildChalkMaterials(SILVER_COLOR, seed + 3, tr);
  [matsMain, matsBlank, matsReady, matsSignal].forEach(mats => mats.forEach(m => { m.transparent = true; }));
  return { matsMain, matsBlank, matsReady, matsSignal };
}

function makeCube(tr, seed) {
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const color = colorFor(tr);
  const { matsMain, matsBlank, matsReady, matsSignal } = buildMatSet(tr, color, seed);
  const mesh = new THREE.Mesh(geo, matsMain);
  const shadow = makeShadow();
  return { tr, mesh, shadow, seed, matsMain, matsBlank, matsReady, matsSignal, _settled: false };
}

/* Пересобрать все наборы материалов кубика под НОВУЮ букву/цвет — вызывать
   в момент, когда кубик реально становится другой буквой (transform), чтобы
   matsSignal/matsReady/matsBlank не оставались с исходным, уже неактуальным
   глифом. Общая утилита, не частность конкретной операции. */
function regenMats(cube, newTr, newColor) {
  const color = newColor ?? colorFor(newTr);
  const { matsMain, matsBlank, matsReady, matsSignal } = buildMatSet(newTr, color, cube.seed + 10);
  cube.matsMain = matsMain;
  cube.matsBlank = matsBlank;
  cube.matsReady = matsReady;
  cube.matsSignal = matsSignal;
  cube.tr = newTr;
}

/* Тень уменьшается и тускнеет с высотой кубика над полом (минимум 0.35 —
   никогда не исчезает совсем даже высоко в воздухе), плюс учитывает текущую
   прозрачность самого кубика (бледный кубик — бледная тень). Отдельно
   гаснет пропорционально глубине ПОД полом (кубик уходит вниз, elide) —
   heightAbove=Math.max(0,y-FLOOR_Y) сама по себе верна только для движения
   вверх: без отдельного belowK отрицательная разница обнулялась бы, и
   формула читала бы «глубоко под полом» как «ровно на полу» (heightK=1,
   тень оставалась бы в полный размер, зависшей на месте, пока кубик
   реально уходит вниз). Тень пропадает полностью ещё до того, как кубик
   успевает уйти далеко вниз. */
function updateShadow(cube) {
  cube.shadow.position.x = cube.mesh.position.x + 0.08;
  cube.shadow.position.z = cube.mesh.position.z + 0.05;
  const heightAbove = Math.max(0, cube.mesh.position.y - FLOOR_Y);
  const depthBelow = Math.max(0, FLOOR_Y - cube.mesh.position.y);
  const heightK = Math.max(0.35, 1 - heightAbove * 0.14);
  const belowK = Math.max(0, 1 - depthBelow * 1.6); // гаснет полностью к глубине ~0.6 под полом
  const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
  const matOpacity = mats[0].opacity ?? 1;
  cube.shadow.visible = cube.mesh.visible && belowK > 0;
  cube.shadow.scale.setScalar(heightK);
  cube.shadow.material.opacity = heightK * matOpacity * belowK;
}

function setOpacity(mesh, val) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(m => { m.opacity = val; });
}

/* ═══════════════════ ГРУППЫ СЛОВ (для формулы «вся единица, не одна буква») ═══════════════════

   Раньше «источник влияния» (nimitta) в `influence`/`approach`/`activeSlots` задавался
   голыми номерами слотов, подобранными вручную под конкретный пример (agnayas: 6 и 7
   выписаны буквально). Пользователь попросила ОБЩУЮ ФОРМУЛУ вместо этого: берём вторую
   часть примера (второе «слово» — не обязательно грамматическое слово, а любая
   непрерывная группа занятых слотов), определяем её длину, определяем, какая ЧАСТЬ этой
   группы физически влияет (по умолчанию — вся группа целиком, т.к. в подавляющем
   большинстве случаев именно всё окончание/суффикс — нимитта, не одна его буква),
   фиксируем длину этой влияющей части — её положение уже вытекает из структуры данных
   (она стоит через «зазор» = пустой слот после первой части, ничего вычислять отдельно
   не нужно, зазор УЖЕ есть в data.initial).

   computeWordGroups(initial) — сканирует data.initial, группирует номера слотов в
   непрерывные последовательности (разрыв в нумерации = граница между «частями» примера).
   Для agnayas initial = [1,2,3,4,6,7] → группы [[1,2,3,4],[6,7]] (слот 5 пуст — это и
   есть тот самый зазор «первая часть, пробел», о котором говорила пользователь).

   resolveSlotRef(ref, groups) — превращает ссылку в плоский список номеров слотов:
     - число (5)              → [5]                              (обратная совместимость)
     - массив ([6,7])         → как есть, рекурсивно резолвится   (обратная совместимость)
     - { word: 2 }            → ВСЯ 2-я группа целиком (формула по умолчанию)
     - { word: 2, length: 1 } → только последние N слотов этой группы (anchor:'end' по
                                 умолчанию — триггер обычно на конце слова/окончания;
                                 anchor:'start' — первые N, если влияет начало части)
   Используется везде, где раньше был список слотов вручную: `influence.from`,
   `approach.movers`/`mover`, `steps[].activeSlots`. Не меняет уже написанные данные с
   голыми числами — старые примеры (agnayas и любые будущие) продолжают работать как
   есть; формула — это ДОПОЛНИТЕЛЬНАЯ возможность, не обязательная замена. */
export function computeWordGroups(initial) {
  const slots = (initial || []).map(x => x.slot).sort((a, b) => a - b);
  const groups = [];
  let cur = [];
  for (const s of slots) {
    if (cur.length && s !== cur[cur.length - 1] + 1) { groups.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length) groups.push(cur);
  return groups;
}
export function resolveSlotRef(ref, groups) {
  if (ref == null) return [];
  if (typeof ref === 'number') return [ref];
  if (Array.isArray(ref)) return ref.flatMap(r => resolveSlotRef(r, groups));
  if (typeof ref === 'object' && ref.word) {
    const g = groups[ref.word - 1];
    if (!g) return [];
    const len = ref.length ?? g.length;
    const anchor = ref.anchor ?? 'end';
    return anchor === 'start' ? g.slice(0, len) : g.slice(Math.max(0, g.length - len));
  }
  return [];
}

/* ═══════════════════ ШАГИ (грамматика / правило N) ═══════════════════

   Новый, общий раздел данных примера — необязательный, но рекомендованный
   вместо ручных 'dim'-операций для основного случая «что сейчас активно».

   data.steps = [
     { kind:'grammar', label:'грам.', start, end, activeSlots:[...] },
     { kind:'rule', ruleNum: 3, start, end, activeSlots:[...] },
     ...
   ]

   Требование: шаги идут подряд без разрывов (end одного = start следующего) —
   движок сам добавляет служебный «хвост» после последнего шага (до конца
   ролика), в котором ничего не притенено — так дим плавно снимается перед
   финальной волной READY_COLOR (applySettle), а не остаётся зависшим.

   Для каждого кубика в НУМЕРОВАННОМ слоте (временные ключи отстойника —
   не трогаем, ими управляет сама операция split): если слот входит в
   activeSlots текущего шага — полная непрозрачность, если нет — притенён.
   У границ шагов — плавный переход (RAMP мс), не рывок. */
export function stepTargetOpacity(step, slot, dimOpacity) {
  if (!step) return 1;
  if (step.activeSlots === 'ALL') return 1;
  return (step.activeSlots || []).includes(slot) ? 1 : dimOpacity;
}

/* Между авторскими шагами МОЖЕТ быть зазор (steps[i].start > steps[i-1].end) —
   движок сам превращает такой зазор в явное «проявление»: все буквы становятся
   активны (activeSlots:'ALL') на всё время зазора, с обычными рамп-переходами
   по краям (тот же RAMP, что и у любой другой границы шага). Задумано по
   прямой формулировке пользователя: снятие притенения и возврат исходных
   цветов = сигнал «шаг преобразований закончен», прежде чем начнётся
   притенение под следующий шаг. Если зазора нет (шаги примыкают впритык,
   как раньше) — поведение как было, мгновенный кроссфейд без паузы, для
   обратной совместимости с более старыми данными. Хвост после последнего
   шага (без зазора нужен) уже и так «развиден» — это и есть сигнал конца
   ВСЕХ преобразований перед волной settle. */
// Проявление («все видны») семантически означает «состав участников
// меняется» — если activeSlots у соседних шагов ОДИНАКОВЫ (цепочка правил
// с тем же составом, как у taddhiraṇyam: оба шага держат [2,4]), реальной
// причины показывать проявление нет, а при коротком зазоре и широкой
// раскладке (много кубиков → большой суммарный сдвиг REVEAL_STAGGER) волна
// проявления ещё и не успевает докатиться до дальнего края за отведённое
// время — обрывается на полпути и откатывается назад, левая и правая
// половина ряда оказываются на разной стадии прерванной волны. Поэтому
// одинаковый состав активных слотов — зазор пропускается без проявления.
export function sameActiveSlots(a, b) {
  if (a === 'ALL' || b === 'ALL') return a === b;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}
export function buildRuntimeSteps(steps) {
  if (!steps || !steps.length) return null;
  const list = [];
  // До старта первого авторского шага (data.steps[0].start) stepIndexAt
  // (смотрит только на .end, не на .start) всё равно считал бы ТЕКУЩИМ уже
  // этот шаг и применял бы его притенение МГНОВЕННО, без рампы (у первого
  // шага нет prev) — буквы, не входящие в его activeSlots, гасли бы ещё в
  // воздухе, до приземления. Симметрично хвостовому виртуальному шагу — если
  // до первого шага есть зазор (обычно есть, т.к. шаг стартует уже после
  // падения), добавляем такой же «пока всё видно» участок в начале.
  if (steps[0].start > 0) {
    list.push({ _virtual: true, activeSlots: 'ALL', start: 0, end: steps[0].start });
  }
  for (let i = 0; i < steps.length; i++) {
    if (i > 0 && steps[i].start > steps[i - 1].end && !sameActiveSlots(steps[i].activeSlots, steps[i - 1].activeSlots)) {
      list.push({ _reveal: true, activeSlots: 'ALL', start: steps[i - 1].end, end: steps[i].start });
    }
    list.push(steps[i]);
  }
  const last = list[list.length - 1];
  list.push({ _virtual: true, activeSlots: 'ALL', start: last.end, end: Infinity });
  return list;
}

export function stepIndexAt(elapsed, runtimeSteps) {
  for (let i = 0; i < runtimeSteps.length; i++) {
    if (elapsed < runtimeSteps[i].end) return i;
  }
  return runtimeSteps.length - 1;
}

/* ═══════════════════ ОПЕРАЦИИ ═══════════════════

   Каждый обработчик — функция уровня модуля с единой сигнатурой
   applyX(op, elapsed, ctx) (искл. applyStepDim(elapsed, ctx) — она не
   привязана к конкретной операции). ctx несёт всё, что обработчику нужно
   извне (cubes, camera, stageEl, labelsEl, wordGroupsList, scene,
   runtimeSteps, data) — один и тот же объект, не пересоздаётся под
   каждый вызов. Такая сигнатура делает функции тестируемыми настоящим
   импортом (см. tests/) без запуска рендера — рендера/браузера у автора
   движка нет вообще, только Node.js.

   1. TRANSFORM — превращение на месте (гуна/вриддхи/ассимиляция и т.п.).
      Подскок и оборот идут ОДНОВРЕМЕННО (не по очереди), буква на грани
      пропадает в начале оборота и наносится РАНО (около 15% пути, не в конце
      и не мгновенно) — та же хореография, что в rule3-agnayas.js.
      { type:'transform', at, toGlyph, toColor, start, spinTurns=1, bounceH=0.3 }
      Длительность НЕ вшивается — считается из spinTurns через MS_PER_360.
      В момент смены буквы ВСЕ наборы материалов кубика пересобираются под
      новый глиф (см. regenMats) — иначе более поздние операции (approach,
      influence), которые временно включают «сигнальный» материал, покажут
      исходную, уже неактуальную букву.

   2. SPLIT — распад на два звука через отстойник. Исходный кубик уходит В
      СТОРОНУ (не остаётся на месте!), поднимается, бледнеет и повисает —
      ПОКА он висит, прилетают оба результата как НОВЫЕ кубики (каждый со
      своими параметрами дуги/длительности/задержки).
      Только после паузы для сравнения исходный полностью растворяется.
      { type:'split', at, start,
        holdOffset:{x,y,z}, riseDur, holdOpacity, holdDur, fadeDur,
        arrivals: [
          { into, newSlot, from:{x,y,z}, delay, dur, arcHeight },
          ...
        ] }

   3. SETTLE — финальная волна READY_COLOR слева направо по всем указанным
      слотам, с подскоком на каждом — сигнал «весь процесс завершён».
      { type:'settle', slots:[...], start, stepDelay=150, bounceDur=500 }
*/
// Верхняя граница по elapsed (`elapsed > op.start+dur`) НЕ используется для
// раннего выхода — при обычной частоте кадров (~60fps, шаг ~16.7мс) шанс,
// что elapsed окажется РОВНО равен op.start+dur, практически нулевой:
// кадр либо ещё до границы, либо уже за ней, и такая проверка почти
// никогда не даёт финализации сработать на кадре, где реально t достиг 1.
// Вместо неё — guard по уже выставленному `op._done` (дешёвый выход после
// того, как всё уже сделано); t считается через clamp01, который сам
// ограничит переполёт значением 1 — финализация гарантированно происходит
// РОВНО ОДИН РАЗ, на первом же кадре, где elapsed достиг или превысил конец.
//
// Три явные фазы окраски: (1) кубик получает импульс — материал сразу
// переключается на сигнальный (серебро/нейтраль, см. op.signal ниже),
// СТАРАЯ буква ещё видна — понятно, КТО меняется; (2) на ~15% оборота
// буква меняется, но материал остаётся сигнальным — уже пересобранный под
// НОВУЮ букву (см. regenMats) — кубик «стал» новой буквой, но переход
// цветом ещё не завершён; (3) в момент приземления (t=1, тот же кадр, что
// и сброс поворота/позиции — не отдельная пауза) — переключение на
// matsMain, истинный цвет столбца. Серебро закреплено ИМЕННО за гунацией,
// не за самим фактом трансформации — см. op.signal ниже.
export function applyTransform(op, elapsed, ctx) {
    const { cubes } = ctx;
    const cube = cubes[op.at];
    if (!cube) return;
    if (elapsed < op.start) return;
    if (op._done) return;
    const spinTurns = op.spinTurns ?? 1;
    const dur = Math.abs(spinTurns) * MS_PER_360;
    const bounceH = op.bounceH ?? 0.3;
    const clearance = op.clearance ?? 0.35; // боковой отъезд от соседа на время вращения

    // transform получает ТУ ЖЕ симметричную пару пауз, что уже есть у split
    // (anticipateDur до, holdDur после) — почти каждый значимый шаг
    // нуждается в паузе-фиксации для осознания результата, те же имена
    // параметров и тот же характер сигнала, не изобретаются заново для
    // каждой операции отдельно. Для гунации отдельной approach-стадии
    // «столкновение/невозможность соседства» не нужно — уже существующая
    // последовательность influence→transform (подчёркиваем влияющие
    // кубики, даём импульс, начинаем гунирование) — это и есть смысловой
    // эквивалент, без исключения для грамматических шагов.
    const anticipateDur = op.anticipateDur ?? 900; // тот же дефолт, что у split — единообразие, не случайное число
    const activeStart = op.start + anticipateDur;
    if (elapsed < activeStart) {
      // Пауза-осознание: пульс масштабом (два удара, как у split), два
      // кольца — БЕЗ смены цвета (серебро/нейтраль включается только в
      // активной фазе, не здесь — тот же принцип, что у split: «держать
      // сигнальный цвет ещё и на паузе означало бы два разных события
      // одним и тем же сигналом»).
      const t = clamp01((elapsed - op.start) / anticipateDur);
      const beat = Math.abs(Math.sin(t * Math.PI * 2)) * 0.06;
      cube.mesh.scale.setScalar(1 + beat);
      if (!op._pulse0 && t >= 0.15) { op._pulse0 = true; spawnPulseRing(frontAnchor(cube.mesh), anticipateDur * 0.6, undefined, ctx); }
      if (!op._pulse1 && t >= 0.6) { op._pulse1 = true; spawnPulseRing(frontAnchor(cube.mesh), anticipateDur * 0.6, undefined, ctx); }
      return;
    }
    if (!op._anticipateDone) {
      op._anticipateDone = true;
      cube.mesh.scale.setScalar(1);
    }

    // matsSignal (серебро) — не единственный вариант промежуточной фазы:
    // серебро/золото годится ТОЛЬКО для гунации/вриддхи, где сам их смысл —
    // «идёт огласовка»; для любого другого transform (парная замена внутри
    // варги, ассимиляция под соседа) серебро ложно намекало бы на ту же
    // природу. op.signal ('silver' — дефолт, обратная совместимость с
    // agnayas; 'blank' — нейтральная грань БЕЗ буквы, тот же цвет кубика,
    // никакого намёка на гуну/вриддхи) переключает это через общий параметр
    // движка, не отдельным куском кода внутри
    // примера.
    const signalMats = op.signal === 'blank' ? 'matsBlank' : 'matsSignal';
    if (!op._began) {
      op._began = true;
      cube.mesh.material = cube[signalMats];
    }
    const t = clamp01((elapsed - activeStart) / dur);
    cube.mesh.position.y = Math.sin(t * Math.PI) * bounceH;
    cube.mesh.position.x = slotX(op.at) + Math.sin(t * Math.PI) * clearance;
    cube.mesh.rotation.y = -1 * easeOutCubic(t) * Math.PI * 2 * spinTurns;
    if (!op._swapped && t >= 0.15) {
      op._swapped = true;
      const newColor = op.toColor ?? colorFor(op.toGlyph);
      // Пересобираем ВСЕ наборы материалов кубика (matsMain/matsBlank/
      // matsReady/matsSignal), не только текущий — фикс бага, из-за которого
      // «сигнальный»/«финальный» материал ещё долго хранил исходную,
      // добуквенную версию (см. комментарий в regenMats). Новая буква
      // наносится сразу же, тем же моментом ~15% пути, что и раньше —
      // но материал остаётся тем же промежуточным (silver ИЛИ blank, см.
      // выше), не matsMain: буква уже новая, цвет ещё не вернулся, это
      // следующая, отдельная фаза (см. ниже).
      regenMats(cube, op.toGlyph, newColor);
      cube.mesh.material = cube[signalMats];
    }
    if (t >= 1 && !op._landed) {
      op._landed = true;
      cube.mesh.rotation.y = 0;
      cube.mesh.position.y = 0;
      cube.mesh.position.x = slotX(op.at);
      cube.mesh.material = cube.matsMain; // возвращает себе истинный цвет столбца
      op._rotationEnd = elapsed;
    }
    // Пауза-фиксация: кубик уже полностью финализирован (см. выше), просто
    // держится в этом состоянии ещё holdDur — op._done откладывается на
    // это время, не срабатывает мгновенно в момент посадки. Даёт зрителю
    // время увидеть результат, прежде чем следующий шаг/операция начнёт
    // что-то ещё менять — тот же смысл, что у holdDur в split, просто без
    // отдельной активности во время паузы (кубик и так уже в покое, не
    // висит в отстойнике — покачивать нечего).
    if (op._landed) {
      const holdDur = op.holdDur ?? 700;
      if (elapsed - op._rotationEnd >= holdDur) op._done = true;
    }
}

export function project(vec3, ctx) {
  const { stageEl, camera } = ctx;
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  const v = vec3.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
}

// rgbStr необязателен: по умолчанию серебряный (см. SILVER_COLOR/SILVER_RGB
// выше) — раньше цвет волны был жёстко зашит золотым прямо в CSS вызывающей
// страницы (test-slot-engine.html), это и был тот «оранжевый для гуны»,
// на который прямо указали. Золотой остаётся доступен через явный override,
// когда понадобится (вриддхи).
/* Кольца анкорятся НЕ на mesh.position (геометрический центр кубика), а со
   сдвигом по ЛОКАЛЬНОЙ +Z (к камере, туда же, где рисуется буква),
   провёрнутым через текущий поворот кубика (mesh.quaternion) — иначе при
   более высокой камере (camBase y=3.2, не низкая почти-анфас, как в
   rule3-agnayas.js) кольца проецируются заметно выше и в сторону от
   видимой грани. Формула верна даже пока кубик дрожит/крутится. */
export function frontAnchor(mesh, zOff = CUBE_SIZE * 0.42, yOff = 0.1) {
  const local = new THREE.Vector3(0, yOff, zOff).applyQuaternion(mesh.quaternion);
  return mesh.position.clone().add(local);
}

/* Кольцо-пульс НА МЕСТЕ (не бежит от точки к точке, а расходится вокруг
   одной) — сигнал «вот-вот изменится» (пауза-осознание перед split) ИЛИ
   «я источник, я влияю» (сустейн-кольца у нимитты в influence, см. ниже).
   rgbStr — необязательный: без него кольцо золотое (CSS по умолчанию,
   как раньше), с ним — оттенок СОБСТВЕННОГО цвета конкретного кубика
   (см. ringColorFrom) — общая утилита, не частность agnayas. */
export function spawnPulseRing(atVec3, dur, rgbStr, ctx) {
  const { labelsEl } = ctx;
  const p = project(atVec3, ctx);
  const ring = document.createElement('div');
  ring.className = 'slot-pulse-ring';
  ring.style.left = p.x + 'px';
  ring.style.top = p.y + 'px';
  ring.style.setProperty('--pulse-dur', dur + 'ms');
  if (rgbStr) ring.style.borderColor = `rgba(${rgbStr},.55)`;
  labelsEl.appendChild(ring);
  setTimeout(() => ring.remove(), dur + 80);
}

export function applyElide(op, elapsed, ctx) {
    const { cubes } = ctx;
    if (elapsed < op.start) return;
    const cube = cubes[op.at];
    if (!cube || op._done) return;
    // Плавная easeInOutCubic-кривая имеет нулевую производную в t=0 —
    // первые кадры движения визуально неразличимы, без отдельного сигнала
    // момент начала реакции не читается вообще. Ровно в момент op.start —
    // вспышка (spawnPulseRing) и мгновенный скачок масштаба на самой S, тот
    // же язык, что уже использует merge в момент слияния. Скачок считается
    // КАЖДЫЙ кадр ОТДЕЛЬНО от ветвления ниже (rise/hold/fade) — класс бага
    // «спад заблокирован общим guard'ом финализации» (см. applyTransform,
    // applyMerge) — здесь заранее вынесен за пределы веток, не внутрь них.
    if (!op._impactAt) {
      op._impactAt = elapsed;
      spawnPulseRing(frontAnchor(cube.mesh), 700, op.impactColor ?? GROUP_RGB, ctx);
    }
    const riseDur = op.riseDur ?? 1300; // тот же темп, что у split — общий язык, не изобретённый заново
    const holdOpacity = op.holdOpacity ?? 0.5;
    const holdDur = op.holdDur ?? 800;
    const fadeDur = op.fadeDur ?? 1100;
    // Отступ от края слотов до ближнего края отстойника = CUBE_SIZE/2 (в
    // любую сторону) — не подбирается на глаз. FLOOR_Y (нижний край слотов,
    // -0.55) минус CUBE_SIZE/2 (сам отступ, 0.55) даёт верхний край
    // отстойника (-1.1); минус ещё CUBE_SIZE/2 (половина высоты самого
    // кубика в отстойнике) даёт его центр: -1.65. При этом числе камера
    // всё ещё даёт комфортный запас (0.247 в NDC, реальная проекционная
    // математика — не на глаз) — даже больше, чем у подъёма E (0.075) при
    // том же lookAt.
    const holdOffset = op.holdOffset ?? { x: -0.2, y: -1.65, z: -0.4 };
    const basePos = new THREE.Vector3(slotX(op.at), 0, 0);
    const holdPos = basePos.clone().add(new THREE.Vector3(holdOffset.x, holdOffset.y, holdOffset.z));
    const riseEnd = op.start + riseDur;
    if (elapsed <= riseEnd) {
      const t = clamp01((elapsed - op.start) / riseDur);
      const te = easeInOutCubic(t);
      cube.mesh.position.lerpVectors(basePos, holdPos, te);
      setOpacity(cube.mesh, lerp(1, holdOpacity, te));
    } else if (elapsed <= riseEnd + holdDur) {
      cube.mesh.position.copy(holdPos);
      const idle = (elapsed - riseEnd) * 0.0022;
      cube.mesh.position.y += Math.sin(idle) * 0.06; // то же лёгкое покачивание, что у split
    } else {
      const t = clamp01((elapsed - (riseEnd + holdDur)) / fadeDur);
      setOpacity(cube.mesh, lerp(holdOpacity, 0, t));
      if (t >= 1) {
        op._done = true;
        cube.mesh.visible = false;
        spawnPulseRing(frontAnchor(cube.mesh), 900, GROUP_RGB, ctx);
        delete cubes[op.at];
      }
    }
    // Скачок масштаба в момент удара, спадающий за 350мс — ВНЕ веток
    // rise/hold/fade выше, идёт каждый кадр независимо от того, в какой
    // из них мы сейчас находимся (см. комментарий про класс бага вверху).
    if (op._impactAt != null && !op._done) {
      const pt = clamp01((elapsed - op._impactAt) / 350);
      cube.mesh.scale.setScalar(lerp(1.25, 1, easeOutCubic(pt)));
    }
}

/* ПУЛЬС В ТЕКСТУРЕ ГРАНИ — та же эталонная техника, что в rule71-vak-asti.js
   (перенесена из docs/effects/rule-assimilation-varga-t-d.html). Отличие
   от spawnPulseRing: тот — отдельный
   DOM-слой поверх сцены, позиционируется проекцией 3D→экран каждый кадр;
   этот — кольцо нарисовано ПРЯМО в canvas передней грани кубика, жёстко
   часть самой геометрии, поворачивается/масштабируется вместе с кубиком
   без всякой проекционной математики. Две функции: build — один раз при
   первой необходимости (готовит холст-эталон без кольца, чтобы каждый
   кадр рисовать поверх чистой копии, не поверх предыдущего кольца),
   redraw — каждый кадр с текущим радиусом/прозрачностью. Использование:
   buildPulseFace на кубике один раз (лениво, кешируется в cube._pulseFace),
   на время пульсации — cube.mesh.material меняется на КОПИЮ matsMain с
   подменённым индексом 4 (не мутирует сам matsMain — иначе после возврата
   к обычному виду грань осталась бы с кольцом навсегда), после —
   возвращается обычный matsMain как есть. */
export function buildPulseFace(hex, glyph) {
  const SZ = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const cvCtx = cv.getContext('2d');
  cvCtx.fillStyle = '#' + hex.toString(16).padStart(6, '0');
  cvCtx.fillRect(0, 0, SZ, SZ);
  const baseCv = document.createElement('canvas');
  baseCv.width = baseCv.height = SZ;
  baseCv.getContext('2d').drawImage(cv, 0, 0); // чистая заливка — эталон для перерисовки каждый кадр
  if (glyph) paintGlyph(cv, glyph);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, envMapIntensity: 0, fog: false });
  return { material, canvas: cv, baseCanvas: baseCv, glyph };
}
// radiusFrac — доля от полуширины грани (0..1); null — чистое состояние без кольца
export function redrawPulseFace(pf, radiusFrac, alpha, ringRgb) {
  const sz = pf.canvas.width;
  const pfCtx = pf.canvas.getContext('2d');
  pfCtx.clearRect(0, 0, sz, sz);
  pfCtx.drawImage(pf.baseCanvas, 0, 0);
  if (radiusFrac !== null) {
    const cx = sz / 2, cy = sz / 2, r = Math.max(1, radiusFrac * (sz / 2));
    pfCtx.save();
    pfCtx.filter = `blur(${sz * 0.024}px)`;
    pfCtx.strokeStyle = `rgba(${ringRgb},${alpha})`;
    pfCtx.lineWidth = sz * 0.05;
    pfCtx.beginPath(); pfCtx.arc(cx, cy, r, 0, Math.PI * 2); pfCtx.stroke();
    pfCtx.restore();
  }
  if (pf.glyph) paintGlyph(pf.canvas, pf.glyph);
  pf.material.map.needsUpdate = true;
}
/* Включить/выключить пульсирующую грань у конкретного кубика. Строит
   pulseFace лениво (один раз на кубик, кешируется), подменяет ТОЛЬКО
   индекс 4 (передняя грань) в СВЕЖЕЙ копии текущего набора материалов —
   сам matsMain не трогается ни разу, поэтому «выключить» — это просто
   вернуть cube.mesh.material = cube.matsMain как было. */
export function setFacePulse(cube, radiusFrac, alpha, ringRgb) {
  if (!cube._pulseFace) {
    cube._pulseFace = buildPulseFace(colorFor(cube.tr), cube.tr);
  }
  if (radiusFrac === null) {
    cube.mesh.material = cube.matsMain;
    return;
  }
  if (cube.mesh.material !== cube._pulsingMats) {
    cube._pulsingMats = [...cube.matsMain];
    cube._pulsingMats[4] = cube._pulseFace.material;
    cube.mesh.material = cube._pulsingMats;
  }
  redrawPulseFace(cube._pulseFace, radiusFrac, alpha, ringRgb);
}

// Как и spawnPulseRing — DOM-кольцо, координаты через project(vec3, ctx),
// поэтому берёт ctx явным параметром вместо захвата через замыкание.
export function spawnWave(fromVec3, toVec3, dur, rgbStr, ctx) {
  const { labelsEl } = ctx;
  const pA = project(fromVec3, ctx), pB = project(toVec3, ctx);
  const ring = document.createElement('div');
  ring.className = 'slot-wave-ring';
  ring.style.left = pA.x + 'px';
  ring.style.top = pA.y + 'px';
  ring.style.setProperty('--dx', (pB.x - pA.x) + 'px');
  ring.style.setProperty('--dy', (pB.y - pA.y) + 'px');
  ring.style.setProperty('--wave-dur', dur + 'ms');
  ring.style.borderColor = `rgba(${rgbStr || SILVER_RGB},.85)`;
  labelsEl.appendChild(ring);
  setTimeout(() => ring.remove(), dur + 80);
}

/* РАМКА-ПОДЧЁРКИВАНИЕ ПОД ГРУППОЙ. Тонкая светящаяся линия под всеми
   кубиками группы разом — тот же приём, что
   подчёркивание/скобка окончания в морфологическом разборе (привычный
   язык, не изобретённый). Держится, пока держится сама принадлежность к
   группе (та же ringHoldDur, что и у сустейн-колец — один параметр, не
   два рассинхронизированных). Только для настоящих групп (>1 кубика) —
   подчёркивать одну букву незачем, там и так ясно, что происходит. Общая
   утилита операции, не частность influence — как только появится другая
   операция, работающая с группой, эта же функция подойдёт ей без правок. */
export function updateGroupFrame(op, sources, elapsed, ctx) {
  const { labelsEl } = ctx;
  const holdEnd = op._frameHoldEnd;
  if (sources.length < 2 || elapsed < op.start || elapsed > holdEnd) {
    if (op._frameEl) { op._frameEl.remove(); op._frameEl = null; }
    return;
  }
  if (!op._frameEl) {
    const el = document.createElement('div');
    el.className = 'slot-group-frame';
    labelsEl.appendChild(el);
    op._frameEl = el;
  }
  // Рамка должна покрывать слот ЦЕЛИКОМ, не только видимую ширину буквы на
  // грани — граница берётся не от ЦЕНТРА крайних кубиков, а со сдвигом на
  // пол-слота НАРУЖУ (±SLOT/2, через quaternion — как и остальные якоря,
  // верно при любом повороте) у крайнего левого и крайнего правого кубика.
  const sorted = sources.slice().sort((a, b) => a.mesh.position.x - b.mesh.position.x);
  const leftCube = sorted[0], rightCube = sorted[sorted.length - 1];
  const edgeAnchor = (mesh, xOff) => {
    const local = new THREE.Vector3(xOff, -CUBE_SIZE * 0.56, CUBE_SIZE * 0.42).applyQuaternion(mesh.quaternion);
    return mesh.position.clone().add(local);
  };
  const pLeft = project(edgeAnchor(leftCube.mesh, -SLOT / 2), ctx);
  const pRight = project(edgeAnchor(rightCube.mesh, SLOT / 2), ctx);
  // Y — по нижнему краю грани у всех кубиков группы (не только крайних),
  // на случай если группа не строго горизонтальна на экране (наклон камеры/поворот)
  const ys = sources.map(s => project(frontAnchor(s.mesh, CUBE_SIZE * 0.42, -CUBE_SIZE * 0.56), ctx).y);
  const y = Math.max(pLeft.y, pRight.y, ...ys);
  const left = Math.min(pLeft.x, pRight.x);
  const right = Math.max(pLeft.x, pRight.x);
  const el = op._frameEl;
  el.style.left = left + 'px';
  el.style.top = y + 'px';
  el.style.width = Math.max(8, right - left) + 'px';
  // мягкое появление/исчезание по краям окна — то же 400мс, что уже
  // ощущается «плавно» у остальных рамп в движке, отдельного числа не вводим
  const fadeT = Math.min(elapsed - op.start, holdEnd - elapsed) / 400;
  el.style.opacity = clamp01(fadeT);
}

/* INFLUENCE — дальнодействие до самого превращения: несколько волн-
   пульсов бегут от триггера к цели с задержкой между собой, и цель мелко
   дрожит, пока волны идут.
   { type:'influence', from, to, start, waveCount=3, waveGap=550, waveTravel=1400 }

   ПРАВКА (по обратной связи после просмотра): цель БОЛЬШЕ НЕ меняет цвет на
   сигнальный (золотой/оранжевый) — раньше делала это в момент signalAt, и
   этот оранжевый потом «доживал» до самого начала transform. По прямой
   формулировке пользователя «больше оранжевый не допустим» — оставлена
   только дрожь, без смены цвета; единственный цветовой переход у цели — уже
   сам transform.

   «Нимитта» (то, что физически влияет) часто НЕ одна буква, а вся
   грамматическая единица целиком (например всё окончание -as). `from`
   принимает не только одно число, но и массив/ссылку на группу слов
   ({word:2}, см. resolveSlotRef/computeWordGroups) — тогда волна идёт от
   КАЖДОГО кубика группы одновременно, они синхронно подпрыгивают масштабом
   в момент каждой волны — читаются как одно целое.

   ЭТАЛОН ДЛЯ КОЛЕЦ (по прямой ссылке пользователя на examples/rule71-
   vak-asti.js, redrawPulseFace): у самого источника-нимитты, помимо бегущих
   волн к цели, ДОЛЖНЫ расходиться широкие размытые светлые кольца оттенка
   СОБСТВЕННОГО цвета кубика, и держаться до конца связанной трансформации —
   не только на время короткой фазы волн. Здесь — упрощённая DOM-версия
   того же языка (не текстура на грани кубика, как в rule71-vak-asti.js —
   та техника глубже, взята только цветовая формула ringColorFrom и сам
   характер кольца), длительность управляется отдельно от `dur` через
   `ringHoldDur` (по умолчанию = `dur`, но пример может продлить её до конца
   transform). Это одновременно и ответ на «не вижу выделения АС как единой
   группы» — сустейн-кольца на ОБОИХ кубиках группы одновременно и есть
   видимое выделение. */
export function applyInfluence(op, elapsed, ctx) {
  const { cubes, wordGroupsList } = ctx;
  const target = cubes[op.to];
  const sourceSlots = resolveSlotRef(op.from, wordGroupsList);
  const sources = sourceSlots.map(s => cubes[s]).filter(Boolean);
  if (!target || !sources.length) return;
  const waveCount = op.waveCount ?? 3;
  const waveGap = op.waveGap ?? 550; // было 440
  const waveTravel = op.waveTravel ?? 1400; // было 1100
  const dur = (waveCount - 1) * waveGap + waveTravel;

  // Сустейн-«пульс» на источниках — независимо от фазы волн, до ringHoldDur.
  const ringHoldDur = op.ringHoldDur ?? dur;
  op._frameHoldEnd = op.start + ringHoldDur; // общее окно и для рамки, и для пульса
  updateGroupFrame(op, sources, elapsed, ctx);
  // Цвет пульса — ОДИН на всю группу (GROUP_COLOR), если источников больше
  // одного (настоящая группа-нимитта, см. GROUP_COLOR выше); для одиночной
  // буквы-источника прежнее поведение сохранено — тонировка в её
  // собственный фонетический цвет (там нечего объединять, один кубик).
  const ringRgb = sources.length > 1 ? GROUP_RGB : ringColorFrom(colorFor(sources[0].tr));
  // Каждый источник группы пульсирует кольцом В СВОЕЙ ЖЕ ГРАНИ (текстурная
  // пульсация, не отдельные DOM-вспышки по таймеру — единый язык с
  // approach.holdPulse), синхронно — одна и та же формула cyclePos на всех
  // сразу, не по отдельности, поэтому группа читается как единое дышащее
  // целое, а не набор случайно моргающих вспышек. ringPulsePeriod —
  // длительность ОДНОГО цикла непрерывной пульсации.
  if (elapsed >= op.start && elapsed <= op.start + ringHoldDur) {
    const pulsePeriod = op.ringPulsePeriod ?? 1400;
    const cyclePos = ((elapsed - op.start) % pulsePeriod) / pulsePeriod;
    const radiusFrac = lerp(0.25, 1.0, cyclePos);
    const envelope = Math.sin(cyclePos * Math.PI);
    sources.forEach(src => setFacePulse(src, radiusFrac, 0.85 * envelope, ringRgb));
  } else if (elapsed > op.start + ringHoldDur && !op._ringOff) {
    op._ringOff = true;
    sources.forEach(src => setFacePulse(src, null));
  }

  if (elapsed < op.start || elapsed > op.start + dur) {
    if (elapsed > op.start + dur) {
      target.mesh.scale.setScalar(1);
      sources.forEach(src => src.mesh.scale.setScalar(1));
    }
    return;
  }
  for (let i = 0; i < waveCount; i++) {
    const key = '_wave' + i;
    if (!op[key] && elapsed >= op.start + i * waveGap) {
      op[key] = true;
      sources.forEach(src => spawnWave(
        frontAnchor(src.mesh),
        frontAnchor(target.mesh),
        waveTravel,
        undefined,
        ctx
      ));
    }
  }
  // общий «пульс группы»: каждый источник синхронно подпрыгивает масштабом
  // ровно в момент, когда от него уходит волна — источники из одной группы
  // всегда бьются в одном и том же кадре (одна и та же формула по elapsed,
  // не по индивидуальному состоянию кубика), поэтому визуально читаются как
  // единое целое, даже если их несколько.
  let srcPulse = 0;
  for (let i = 0; i < waveCount; i++) {
    const waveAt = op.start + i * waveGap;
    const pt = (elapsed - waveAt) / 260;
    if (pt >= 0 && pt <= 1) srcPulse = Math.max(srcPulse, Math.sin(pt * Math.PI) * 0.06);
  }
  sources.forEach(src => src.mesh.scale.setScalar(1 + srcPulse));

  // Цель откликается масштабным «удар»-пульсом (не вращением — синус-
  // тряска читается как визуальный шум, не как понятный сигнал), тот же
  // язык, что уже используется у источников (см. srcPulse выше) и на
  // паузе перед split: один согласованный приём «пульс = вот-вот
  // изменится» по всему движку, а не отдельный жест для каждого случая.
  // Пульс цели синхронизирован не
  // с ОТПРАВКОЙ волны (как у источника), а с её ПРИХОДОМ (waveTravel
  // спустя) — цель откликается именно когда волна её достигает, не раньше.
  // Сила пульса растёт от волны к волне (последняя — самая заметная,
  // прямо перед началом transform) — нарастающее напряжение, а не ровный
  // шум на всём протяжении шага.
  let targetPulse = 0;
  for (let i = 0; i < waveCount; i++) {
    const arriveAt = op.start + i * waveGap + waveTravel;
    const pt = (elapsed - arriveAt) / 320;
    if (pt >= 0 && pt <= 1) {
      const grow = 0.045 + i * 0.02;
      targetPulse = Math.max(targetPulse, Math.sin(pt * Math.PI) * grow);
    }
  }
  target.mesh.scale.setScalar(1 + targetPulse);
}

/* APPROACH — иллюстрация несовместимости/невозможности стыка: подвижный
   кубик (mover) трогается с места и проходит часть расстояния до цели
   (target), не долетая (distance — доля ширины ОДНОГО слота), задерживается
   на пике, затем пружинисто отскакивает назад — не плавно, а с небольшим
   перелётом за исходную позицию (easeOutBack), как от столкновения с
   невидимой преградой. Подход к пику — плавный разгон/торможение
   (easeInOutCubic, было easeOutCubic — убран рывок в самом начале хода).
   { type:'approach', mover, target, start, approachDur=1150, holdDur=550,
     retreatDur=950, distance=0.5, pulse=true, jitterAmp=0.16, retreat=true }

   ПРАВКА (по обратной связи): цель БОЛЬШЕ НЕ перекрашивается в сигнальный
   (оранжевый) цвет на пике — прямо названо ошибкой («Е становится
   оранжевой на время»). Вместо смены цвета цели — один тёплый кольцевой
   пульс оттенка ПОДХОДЯЩЕГО кубика (не цели) ровно на пике, той же техникой
   ringColorFrom, что и у сустейн-колец influence — сигнал «момент
   напряжения» остаётся, но летящий кубик не перекрашивает саму цель.

   Та же самая механика подхода годится и для ПРОТИВОПОЛОЖНОГО смысла: не
   несовместимость, а совместимость («примагничивание», āsīt, ĪТ
   подъезжает к АС и остаётся, а не отскакивает) — через `retreat:false`.
   distance:1.0 при зазоре ровно в один слот приводит мувер точно встык с
   целью; retreat:false отключает фазу отскока целиком (retreatDur
   обнуляется) — кубик остаётся у цели навсегда, jitterAmp у вызывающего
   кода обычно ставится в 0 отдельно (дрожь — язык именно несовместимости,
   не нужна тут по смыслу, но остаётся доступной, если понадобится
   где-то ещё). */
export function applyApproach(op, elapsed, ctx) {
  const { cubes, wordGroupsList } = ctx;
  // op.movers/op.mover — как раньше (число/массив), либо ссылка на группу слов
  // ({word:2}) через ту же общую формулу, что и у influence.from (см. выше).
  const slots = resolveSlotRef(op.movers ?? op.mover, wordGroupsList);
  const movers = slots.map(s => cubes[s]).filter(Boolean);
  if (!movers.length) return;
  // Цель (target) может исчезнуть по ходу движения (сценарий «приближение
  // вызывает реакцию» — śādhi: DH приближается к S, а S по ходу
  // приближения ИСЧЕЗАЕТ через elide) — approach не должен из-за этого
  // обрываться целиком, движение mover'ов обязано доехать до конца.
  // Направление движения (dir) вычисляется по НОМЕРУ слота цели
  // (slotX(op.target)) — цель как живой объект для этого не нужна
  // вообще, нужна только для дрожи/пульса НА ней самой (см. ниже, оба
  // под `if (target)`).
  const target = cubes[op.target]; // может быть undefined — это ОК
  const approachDur = op.approachDur ?? 1150; // было 800
  const holdDur = op.holdDur ?? 550; // было 400
  const retreat = op.retreat !== false;
  const retreatDur = retreat ? (op.retreatDur ?? 950) : 0; // было 700
  const distance = op.distance ?? 0.5;
  const jitterAmp = op.jitterAmp ?? 0.16;
  const baseXs = slots.map(s => slotX(s));
  const dir = Math.sign(slotX(op.target) - baseXs[0]); // в какую сторону цель

  // Если distance большая (закрыть исходный зазор И занять место
  // исчезающей соседней буквы ОДНИМ движением), один сплошной путь от 0
  // до distance без паузы читается как «проехало насквозь», а не «подошло
  // → произошла реакция → въехало в освободившееся место»: нет отдельного,
  // заметного момента прибытия.
  // midDistance (необязательный параметр) — путь идёт в ДВА отрезка с
  // явной паузой между ними (midHoldDur), ровно там, где и должна
  // произойти реакция (обычно — elide соседней буквы, синхронизировано
  // данными примера снаружи, не встроено сюда). Без midDistance поведение
  // не меняется ни на йоту — старые примеры (agnayas, āsīt) его не
  // передают. Общая возможность движка, не разовый хак под один пример.
  if (op.midDistance != null) {
    const leg1Dur = approachDur;
    const midHoldDur = op.midHoldDur ?? 0;
    const leg2Dur = op.leg2Dur ?? approachDur;
    const leg1End = op.start + leg1Dur;
    const holdEnd = leg1End + midHoldDur;
    const leg2End = holdEnd + leg2Dur;
    if (elapsed < op.start) return;
    let progress; // 0..distance, в тех же единицах, что и distance
    if (elapsed <= leg1End) {
      progress = op.midDistance * easeInOutCubic(clamp01((elapsed - op.start) / leg1Dur));
    } else if (elapsed <= holdEnd) {
      progress = op.midDistance; // пауза — здесь и должна случиться реакция (данные примера)
      // Пульс на триггере — НЕПРЕРЫВНАЯ текстурная пульсация (не отдельные
      // DOM-вспышки через равные интервалы), нарисованная прямо в текстуру
      // передней грани самого триггера (setFacePulse/redrawPulseFace) —
      // радиус растёт по кругу с
      // sin-конвертом на вход/выход каждого цикла, кольцо жёстко часть
      // геометрии кубика, не отдельный слой поверх сцены. Волна к цели
      // (spawnWave) остаётся ДИСКРЕТНЫМИ пакетами — это другое явление
      // (конкретный сигнал долетает и что-то вызывает), не путать со
      // сплошной пульсацией «я источник, я влияю».
      if (op.holdPulse) {
        const trigger = movers[0];
        const pulsePeriod = op.holdPulsePeriod ?? 1400;
        const cyclePos = ((elapsed - leg1End) % pulsePeriod) / pulsePeriod;
        const radiusFrac = lerp(0.25, 1.0, cyclePos);
        const envelope = Math.sin(cyclePos * Math.PI);
        setFacePulse(trigger, radiusFrac, 0.85 * envelope, op.holdPulseColor ?? ringColorFrom(colorFor(trigger.tr)));
        const waveGap = op.holdWaveGap ?? 500;
        const waveIdx = Math.floor((elapsed - leg1End) / waveGap);
        const waveKey = '_holdWave' + waveIdx;
        if (!op[waveKey]) {
          op[waveKey] = true;
          const waveTravel = op.holdWaveTravel ?? 400;
          spawnWave(
            frontAnchor(trigger.mesh),
            new THREE.Vector3(slotX(op.target), 0, 0),
            waveTravel,
            op.holdPulseColor ?? ringColorFrom(colorFor(trigger.tr)),
            ctx
          );
        }
      }
    } else if (elapsed <= leg2End) {
      // Пульсация выключается ровно один раз при выходе из паузы —
      // возвращает триггеру его обычный, некольцевой набор материалов
      // (см. setFacePulse: null означает «выключить», просто
      // cube.mesh.material = cube.matsMain, matsMain никогда не
      // мутировался, так что возврат мгновенный и чистый).
      if (op.holdPulse && !op._pulseOff) {
        op._pulseOff = true;
        setFacePulse(movers[0], null);
      }
      progress = op.midDistance + (distance - op.midDistance) * easeInOutCubic(clamp01((elapsed - holdEnd) / leg2Dur));
    } else {
      progress = distance;
    }
    const shift = SLOT * progress * dir;
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift; });
    return;
  }

  const shift = SLOT * distance * dir;
  const peakStart = op.start + approachDur;
  const peakEnd = peakStart + holdDur;
  const retreatEnd = peakEnd + retreatDur;

  if (elapsed < op.start || elapsed > retreatEnd) {
    if (elapsed > retreatEnd) {
      // retreat:false — остаёмся у цели (shift), а не возвращаемся домой (0)
      movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + (retreat ? 0 : shift); });
      if (target) target.mesh.rotation.z = 0;
    }
    return;
  }

  if (elapsed <= peakStart) {
    const t = clamp01((elapsed - op.start) / approachDur);
    const te = easeInOutCubic(t); // было easeOutCubic — плавнее старт
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift * te; });
  } else if (elapsed <= peakEnd) {
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift; });
    if (target && op.pulse !== false && !op._pulsed) {
      op._pulsed = true;
      spawnPulseRing(
        frontAnchor(target.mesh),
        900,
        ringColorFrom(colorFor(movers[0].tr)),
        ctx
      );
    }
  } else {
    const t = clamp01((elapsed - peakEnd) / retreatDur);
    const te = easeOutBack(t); // пружина остаётся — это осознанный характер отскока
    movers.forEach((m, i) => { m.mesh.position.x = baseXs[i] + shift * (1 - te); });
  }

  // дрожь цели: амплитуда растёт до пика, обрывается резко в момент отскока
  // (только если цель ещё существует — см. комментарий выше)
  if (target) {
    if (elapsed <= peakEnd) {
      const growT = clamp01((elapsed - op.start) / (approachDur + holdDur));
      target.mesh.rotation.z = Math.sin(elapsed * 0.024) * jitterAmp * growT;
    } else {
      target.mesh.rotation.z = 0; // обрыв резкий, не спад
    }
  }
}

/* ОБЩИЙ ХЕЛПЕР ПРИЛЁТА — разгон/торможение + дуга по высоте, единая
   математика для трёх мест (split.arrivals, arrive, merge — где угодно,
   где кубик материализуется за кадром и прилетает по дуге), не
   дублируется под каждую операцию отдельно. Чистая функция — ctx не
   требует вообще. */
export function flyArcPosition(from, toX, toY, toZ, t, arcHeight = 1.0) {
  const te = easeInOutCubic(t);
  const arc = Math.sin(t * Math.PI) * arcHeight;
  return {
    x: lerp(from.x, toX, te),
    y: lerp(from.y, toY, te) + arc,
    z: lerp(from.z, toZ, te),
  };
}

/* Цвет паузы-осознания НЕ меняется — серебро однозначно закреплено за
   гунацией в applyTransform, держать его ещё и здесь означало бы два
   разных события одним и тем же сигналом. Пульс масштабом и два кольца
   сами по себе достаточно ясно говорят «сейчас что-то произойдёт». */
export function applySplit(op, elapsed, ctx) {
  const { cubes, scene } = ctx;
  if (elapsed < op.start) return;
  // Источник держим под ОТДЕЛЬНЫМ временным ключом на время отстойника —
  // иначе прилетающий результат с тем же номером слота перезаписывает
  // cubes[op.at] ПОКА источник ещё висит и тает.
  if (!op._srcKey) {
    op._srcKey = '_hold_' + op.at + '_' + Math.random().toString(36).slice(2, 7);
    cubes[op._srcKey] = cubes[op.at];
    delete cubes[op.at];
  }
  const src = cubes[op._srcKey];
  if (!src) return;
  const riseDur = op.riseDur ?? 1300; // было 1000
  const holdOpacity = op.holdOpacity ?? 0.55;
  // Пауза после того, как E уже зависла на месте (riseDur кончился) И
  // результаты (А+Й) уже прилетели и легли в ряд — «дать сравнить старое
  // и новое рядом», не тянуть без единого нового события на экране.
  const holdDur = op.holdDur ?? 1000;
  const fadeDur = op.fadeDur ?? 1100; // было 900
  const holdOffset = op.holdOffset ?? { x: -1.6, y: 2.4, z: 0.4 };
  const basePos = new THREE.Vector3(slotX(op.at), 0, 0);
  const holdPos = basePos.clone().add(new THREE.Vector3(holdOffset.x, holdOffset.y, holdOffset.z));

  // фаза 0: ПАУЗА-ОСОЗНАНИЕ. Раньше распад начинался фактически сразу же
  // после approach (кубик тут же трогался с места) — по живой обратной
  // связи это читалось «слишком быстро», зритель не успевал понять, ЧТО
  // сейчас произойдёт (Е уходит, А+Й приходят), прежде чем это уже
  // произошло. Явная пауза перед подъёмом: кубик НЕ двигается, но заметно
  // сигналит «вот-вот» — мягко пульсирует масштабом (2 удара, как
  // вдох-вдох), плюс два кольца-пульса расходятся вокруг него на сцене.
  const anticipateDur = op.anticipateDur ?? 900;
  const activeStart = op.start + anticipateDur; // отсюда начинается реальное движение
  if (elapsed < activeStart) {
    const t = clamp01((elapsed - op.start) / anticipateDur);
    // два «удара»: |sin| за один период даёт два симметричных горба
    // (пик на четверти и на трёх четвертях, ноль на старте/середине/конце)
    const beat = Math.abs(Math.sin(t * Math.PI * 2)) * 0.06;
    const scale = 1 + beat;
    src.mesh.scale.setScalar(scale);
    src.mesh.position.copy(basePos);
    // два кольца-пульса, разнесённые по паузе — не одновременно со стартом
    // и не в самом конце, а примерно на четверти и на трёх четвертях
    if (!op._pulse0 && t >= 0.15) { op._pulse0 = true; spawnPulseRing(frontAnchor(src.mesh), anticipateDur * 0.6, undefined, ctx); }
    if (!op._pulse1 && t >= 0.6) { op._pulse1 = true; spawnPulseRing(frontAnchor(src.mesh), anticipateDur * 0.6, undefined, ctx); }
    return; // пока идёт пауза — больше в этом кадре по этой операции ничего не делаем
  }
  if (!op._anticipateDone) {
    op._anticipateDone = true;
    src.mesh.scale.setScalar(1);
    src.mesh.material = src.matsMain; // возвращаемся к обычному виду e перед самим подъёмом
  }

  // фаза 1: исходный поднимается в сторону и бледнеет — плавный разгон/
  // торможение (easeInOutCubic, было easeOutCubic — убран рывок в начале).
  const riseEnd = activeStart + riseDur;
  if (elapsed <= riseEnd) {
    const t = clamp01((elapsed - activeStart) / riseDur);
    const te = easeInOutCubic(t);
    src.mesh.position.lerpVectors(basePos, holdPos, te);
    setOpacity(src.mesh, lerp(1, holdOpacity, te));
  } else {
    // фаза 2: покачивание, пока висит
    const idle = (elapsed - riseEnd) * 0.0022;
    src.mesh.position.copy(holdPos);
    src.mesh.position.y += Math.sin(idle) * 0.06;
  }

  // прилёт результатов — каждый по своим параметрам, отсчёт от activeStart
  // (не от op.start — пока идёт пауза-осознание, ничего ещё не прилетает).
  // Разгон/торможение — easeInOutCubic, тот же мотив «без рывка».
  (op.arrivals || []).forEach(arr => {
    if (elapsed < activeStart + arr.delay) return;
    let nc = op._arrived?.[arr.newSlot];
    if (!nc) {
      nc = makeCube(arr.into, arr.newSlot * 97 + 31);
      nc._fallDone = true; // прилетает через отстойник, не через обычное падение
      nc.mesh.visible = false;
      scene.add(nc.mesh);
      scene.add(nc.shadow);
      cubes[arr.newSlot] = nc;
      op._arrived = op._arrived || {};
      op._arrived[arr.newSlot] = nc;
    }
    nc.mesh.visible = true;
    const t = clamp01((elapsed - (activeStart + arr.delay)) / arr.dur);
    const p = flyArcPosition(arr.from, slotX(arr.newSlot), 0, 0, t, arr.arcHeight ?? 1.0);
    nc.mesh.position.set(p.x, p.y, p.z);
  });

  // фаза 3: после паузы для сравнения — исходный растворяется совсем.
  // Момент старта угасания зависит от того, что случится ПОЗЖЕ — источник
  // поднялся в отстойник, ИЛИ все результаты долетели и сели.
  const arrivals = op.arrivals || [];
  const lastArrivalEnd = arrivals.length
    ? Math.max(...arrivals.map(a => a.delay + a.dur))
    : 0;
  const compareReadyAt = Math.max(riseEnd, activeStart + lastArrivalEnd);
  const fadeStart = compareReadyAt + holdDur; // holdDur = пауза ПОСЛЕ того, как всё уже видно вместе
  if (elapsed >= fadeStart) {
    const t = clamp01((elapsed - fadeStart) / fadeDur);
    setOpacity(src.mesh, lerp(holdOpacity, 0, t));
    if (t >= 1) {
      src.mesh.visible = false;
      delete cubes[op._srcKey]; // источник совсем ушёл — временный ключ больше не нужен
    }
  }
}

/* ARRIVE (шаг «грам.» в āsīt: окончание -īt тихо присоединяется к основе,
   без единого события сандхи). Кубик(и) материализуются ЗА кадром и
   прилетают по дуге в свой слот — та же матчасть, что у прилёта
   результатов split (flyArcPosition), но БЕЗ второй половины split (никто
   не тает, никто не превращается) — просто прибыл и остался. Специально
   БЕЗ сигнального цвета/вспышки в момент посадки: это тихое морфологическое
   присоединение, не сандхи — эффект только там, где реально сработало
   правило. Несколько элементов сразу — items[], каждый со своим
   delay/dur/from/arcHeight, как у split.arrivals.
   { type:'arrive', items:[{into,newSlot,from,delay,dur,arcHeight}], start } */
export function applyArrive(op, elapsed, ctx) {
  const { cubes, scene } = ctx;
  (op.items || []).forEach(item => {
    if (elapsed < op.start + item.delay) return;
    let nc = op._made?.[item.newSlot];
    if (!nc) {
      nc = makeCube(item.into, item.newSlot * 131 + 17);
      nc._fallDone = true;
      nc.mesh.visible = false;
      scene.add(nc.mesh);
      scene.add(nc.shadow);
      cubes[item.newSlot] = nc;
      op._made = op._made || {};
      op._made[item.newSlot] = nc;
    }
    nc.mesh.visible = true;
    const t = clamp01((elapsed - (op.start + item.delay)) / item.dur);
    const p = flyArcPosition(item.from, slotX(item.newSlot), 0, 0, t, item.arcHeight ?? 1.0);
    nc.mesh.position.set(p.x, p.y, p.z);
  });
}

/* MERGE — слияние. Все буквы падают вместе, с зазором между смысловыми
   частями слова, потом происходит притяжение — merge работает с УЖЕ
   существующим, упавшим кубиком (не материализует его за кадром: все
   буквы должны быть видны с самого начала, просто с паузой между частями
   слова), from — номер его исходного слота, ровно как movers у
   approach), просто едет вдоль ряда в позицию цели по прямой (без дуги —
   это скольжение по своей полосе, не прилёт со стороны, дуга здесь была
   бы визуально противоречащей самой идее). Слот-ключ источника (from)
   специально НЕ переименовывается у соседей справа — они просто держат
   СВОИ исходные номера слотов, даже когда их РЕАЛЬНАЯ позиция на экране
   смещена соседней approach-операцией (см. applyApproach retreat:false) —
   для порядка/подсчёта это неважно, важна только сортировка номеров, а
   не их непрерывность.
   { type:'merge', from, at, toGlyph, toColor, start, dur=1400, pulseHoldMs } */
export function applyMerge(op, elapsed, ctx) {
  const { cubes } = ctx;
  if (elapsed < op.start) return;
  const target = cubes[op.at];
  if (!target) return;
  // mover ищется и проверяется ТОЛЬКО внутри фазы полёта (где он ещё
  // нужен), не одним guard'ом со всей функцией — источник УДАЛЯЕТСЯ из
  // cubes{} по завершении слияния (см. `delete cubes[op.from]` ниже), и
  // guard над всей функцией на следующем кадре нашёл бы mover===undefined
  // и оборвал бы спад пика масштаба, который к этому моменту ещё не
  // начинался. Спад пика зависит только от target, который никогда не
  // удаляется, и потому не обрывается (тот же класс бага, что и в
  // applyTransform — см. комментарий про guard по op._done там).
  if (!op._done) {
    const mover = cubes[op.from];
    if (!mover) return; // источник ещё не существует/уже удалён раньше времени — не должно происходить штатно, но не роняем функцию
    const dur = op.dur ?? 1400;
    const t = clamp01((elapsed - op.start) / dur);
    const te = easeInOutCubic(t);
    const toX = target.mesh.position.x;
    mover.mesh.position.x = lerp(slotX(op.from), toX, te);
    mover.shadow.position.x = mover.mesh.position.x;
    if (t >= 1) {
      op._done = true;
      mover.mesh.visible = false;
      mover.shadow.visible = false;
      delete cubes[op.from]; // слились — отдельного кубика больше нет вообще
      const newColor = op.toColor ?? colorFor(op.toGlyph);
      regenMats(target, op.toGlyph, newColor);
      target.mesh.material = target.matsMain; // категория звука не меняется — сигнального цвета не нужно
      spawnPulseRing(frontAnchor(target.mesh), op.pulseHoldMs ?? 1300, GROUP_RGB, ctx);
      // Настоящая вспышка: пик масштаба заметно выше стандартного (1.35) +
      // реальное свечение материала (emissive/emissiveIntensity — не
      // имитация цветом текстуры, а живое GPU-свойство), тон — тот же
      // нейтральный GROUP_COLOR, что у кольца-пульса рядом (одна и та же
      // вспышка, не два разных цветовых события одновременно). Оба —
      // масштаб и свечение — спадают синхронно, одной и той же кривой, до 0.
      target.mesh.material.forEach(m => { m.emissive.setHex(GROUP_COLOR); m.emissiveIntensity = 0.9; });
      target.mesh.scale.setScalar(1.35);
      op._pulsedAt = elapsed;
    }
  }
  // Спад пика масштаба — ВНЕ guard'а `if (op._done) return`: идёт каждый
  // кадр после слияния независимо от op._done — тот же класс бага, что и
  // выше (финализация и продолжающийся спад НЕ должны сидеть за одним и
  // тем же early-return, иначе масштаб застревает на пике навсегда).
  if (op._pulsedAt != null) {
    const pt = clamp01((elapsed - op._pulsedAt) / 600);
    const e = easeOutCubic(pt);
    target.mesh.scale.setScalar(lerp(1.35, 1, e));
    target.mesh.material.forEach(m => { m.emissiveIntensity = lerp(0.9, 0, e); });
  }
}

// Двойной прыжок: основной высокий взлёт (t 0–0.6, амплитуда bounceH) и
// заметно меньший довдох сразу следом (t 0.6–1.0, ~30% от основной
// высоты) — та же логика «удар, потом меньший отзвук», что уже
// используется в паузе перед split. Обе половины стыкуются без разрыва
// (обе синусоиды дают 0 на границе t=0.6). Цвет меняется РОВНО на
// вершине волны (t=0.5).
export function applySettle(op, elapsed, ctx) {
  const { cubes } = ctx;
  const stepDelay = op.stepDelay ?? 180;
  const bounceDur = op.bounceDur ?? 600;
  const bounceH = op.bounceH ?? 0.32;
  op.slots.forEach((slot, i) => {
    const cube = cubes[slot];
    if (!cube) return;
    const start = op.start + i * stepDelay;
    if (elapsed < start || elapsed > start + bounceDur) return;
    const t = clamp01((elapsed - start) / bounceDur);
    const h = t <= 0.6
      ? bounceH * Math.sin((t / 0.6) * Math.PI)
      : bounceH * 0.3 * Math.sin(((t - 0.6) / 0.4) * Math.PI);
    cube.mesh.position.y = h;
    if (!cube._settled && t >= 0.5) {
      cube._settled = true;
      cube.mesh.material = cube.matsReady;
    }
  });
}

/* DIM (форма ручного управления, оставлена для обратной совместимости и
   точечных случаев) — притенение неактивных букв по явному списку слотов
   и окну времени. Для нового материала предпочтительно data.steps выше —
   он сам считает пересечения и снимает притенение к концу; ручной 'dim'
   по-прежнему полезен для локальных, не связанных с шагами эффектов.
   { type:'dim', slots:[...], start, end, dimOpacity=0.22, ramp=700 } */
export function applyDim(op, elapsed, ctx) {
  const { cubes } = ctx;
  if (elapsed < op.start || elapsed > op.end) return;
  const dimOpacity = op.dimOpacity ?? 0.22;
  const ramp = op.ramp ?? 700;
  op.slots.forEach(slot => {
    const cube = cubes[slot];
    if (!cube) return;
    let opacity;
    if (elapsed < op.start + ramp) opacity = lerp(1, dimOpacity, clamp01((elapsed - op.start) / ramp));
    else if (elapsed < op.end - ramp) opacity = dimOpacity;
    else opacity = lerp(dimOpacity, 1, clamp01((elapsed - (op.end - ramp)) / ramp));
    setOpacity(cube.mesh, opacity);
  });
}

/* Притенение неактивных букв по текущему шагу (data.steps) — общий,
   автоматический механизм, отдельный от ручного 'dim' выше. Между
   авторскими шагами МОЖЕТ быть зазор — движок сам превращает его в явное
   «проявление» (activeSlots:'ALL', см. buildRuntimeSteps/sameActiveSlots).

   Переход на КАЖДОЙ границе шагов считается РОВНО ОДИН РАЗ — ramp-in в
   шаге, наступающем ПОСЛЕ границы, читает реальную (уже подведённую к
   цели) яркость prev, не декларативный target. Отдельного ramp-out НЕТ —
   он был бы конфликтующим (двойной счёт одного и того же перехода с
   двух концов), не просто лишним. Не op-based (сигнатура отличается от
   всех остальных apply* — вызывается раз в кадр без привязки к конкретной
   операции), но по той же схеме: внешние зависимости через ctx. */
export function applyStepDim(elapsed, ctx) {
  const { cubes, runtimeSteps, data } = ctx;
  if (!runtimeSteps) return;
  const dimOpacity = data.dimOpacity ?? 0.22;
  const RAMP = data.stepRamp ?? 550;
  const REVEAL_STAGGER = data.revealStagger ?? 130;
  const REVEAL_RAMP = data.revealRamp ?? 700;
  const idx = stepIndexAt(elapsed, runtimeSteps);
  const cur = runtimeSteps[idx];
  const prev = runtimeSteps[idx - 1];
  const orderedSlots = Object.keys(cubes)
    .filter(key => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b); // порядок слева направо — тот самый, что просила пользователь
  const enteringReveal = prev && cur.activeSlots === 'ALL';
  orderedSlots.forEach((slot, order) => {
    const cube = cubes[slot];
    let target = stepTargetOpacity(cur, slot, dimOpacity);
    if (enteringReveal) {
      const t = clamp01((elapsed - cur.start - order * REVEAL_STAGGER) / REVEAL_RAMP);
      target = lerp(stepTargetOpacity(prev, slot, dimOpacity), target, t);
    } else if (prev && elapsed - cur.start < RAMP) {
      const t = clamp01((elapsed - cur.start) / RAMP);
      target = lerp(stepTargetOpacity(prev, slot, dimOpacity), target, t);
    }
    setOpacity(cube.mesh, target);
  });
}

export function mountSlotExample(container, data, opts = {}) {
  injectStylesOnce();

  // .slot-stage держит min-height:220px (не только height:100%) — без
  // явной страховки сцена рискует схлопнуться в 0px в контейнерах без
  // собственной явной высоты (#anim-tiles в sanskrit-sandhi-app.html —
  // чистый flex:1 1 auto;min-height:0), не только в изолированных тестах,
  // где контейнер всегда получает высоту снаружи (vh/px).
  container.innerHTML = `<div class="slot-stage" style="width:100%;height:100%;min-height:220px;position:relative;display:flex;flex-direction:column;">
    <div class="slot-canvas-wrap" style="position:relative;flex:1 1 auto;min-height:0;">
      <div class="slot-labels" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>
    </div>
    <div class="slot-steps"></div>
  </div>`;
  const stageEl = container.querySelector('.slot-canvas-wrap');
  const labelsEl = container.querySelector('.slot-labels');
  const stepsEl = container.querySelector('.slot-steps');

  // группы слов (по зазорам в data.initial) — общая формула вместо ручных номеров
  // слотов, см. computeWordGroups/resolveSlotRef выше. Доступна ниже как замыкание
  // (applyInfluence/applyApproach) и здесь же — для разрешения activeSlots шагов.
  const wordGroupsList = computeWordGroups(data.initial);

  // data — ЕДИНЫЙ объект МОДУЛЯ (export const data в examples/*.js), не
  // одноразовое состояние конкретного показа — переиспользуется на каждый
  // повторный mount() (replay, повторный клик, два пересёкшихся по времени
  // монтирования). apply* пишут флаги (`op._began`, `op._swapped`,
  // `op._done`, `op._pulsedAt`...) ПРЯМО на объекты op — если бы это были
  // объекты data.ops, они делились бы МЕЖДУ прогонами: при двух
  // пересёкшихся прогонах (два набора кубиков, но один и тот же набор
  // op-флагов) тот, что успел раньше, «съедал» бы флаг, и второй прогон
  // пропускал бы своё же превращение целиком, потому что guard видел бы
  // флаг уже true от чужого прогона. Поэтому ops клонируются заново на
  // каждый mount(), без унаследованных «_»-полей ни от какого предыдущего
  // прогона — data.ops остаётся нетронутым модульным экспортом.
  const ops = (data.ops || []).map(op => {
    const clean = {};
    for (const k in op) if (!k.startsWith('_')) clean[k] = op[k];
    return clean;
  });

  // лента шагов — чипы строятся один раз из data.steps (если есть); activeSlots
  // каждого шага прогоняется через resolveSlotRef — ссылки вида {word:2} становятся
  // плоским списком номеров слотов ДО того, как в дело вступит buildRuntimeSteps
  // (та функция как была «глухой» к словам-группам, так и остаётся — проще).
  const resolvedAuthoredSteps = (data.steps || []).map(step => {
    if (!step.activeSlots || step.activeSlots === 'ALL') return step;
    return { ...step, activeSlots: [...new Set(resolveSlotRef(step.activeSlots, wordGroupsList))] };
  });
  const runtimeSteps = buildRuntimeSteps(resolvedAuthoredSteps);

  // Момент старта settle СЧИТАЕТСЯ автоматически, не прописывается в
  // данных примера вручную — ручное число легко рассинхронизировать с
  // реальным таймлайном при любой правке скорости более ранних операций
  // (число settle.start пришлось бы пересчитывать вручную при каждом
  // сдвиге, и до первого случая, когда кто-то забыл это сделать, ошибка
  // не проявляется). Формула: конец хвостового шага (= конец последнего
  // авторского шага) + время последнего по порядку кубика на стаггер+рампу
  // проявления + пауза (data.settleDelay ?? 1000). Явный settle в ops
  // по-прежнему в приоритете (обратная совместимость / нестандартный
  // старт) — автоматика только достраивает недостающее. Пишет в ЛОКАЛЬНЫЙ
  // ops, не в data.ops — иначе при повторном mount() settle накапливался
  // бы по одному на каждый показ.
  const hasExplicitSettle = ops.some(op => op.type === 'settle');
  if (!hasExplicitSettle && runtimeSteps) {
    const tail = runtimeSteps[runtimeSteps.length - 1];
    // merge поглощает кубик-источник целиком, elide заставляет кубик
    // исчезнуть целиком (см. applyMerge/applyElide, оба делают delete
    // cubes[...]) — их номера слотов должны ВЫЙТИ из финального набора,
    // иначе settle попытается подсветить кубик, который к моменту своего
    // старта уже не существует.
    const goneSlots = new Set([
      ...ops.filter(op => op.type === 'merge').map(op => op.from),
      ...ops.filter(op => op.type === 'elide').map(op => op.at),
    ]);
    const finalSlots = [...new Set([
      ...data.initial.map(x => x.slot),
      ...ops
        .filter(op => op.type === 'split')
        .flatMap(op => (op.arrivals || []).map(a => a.newSlot)),
      ...ops
        .filter(op => op.type === 'arrive')
        .flatMap(op => (op.items || []).map(a => a.newSlot)),
    ])].filter(s => !goneSlots.has(s)).sort((a, b) => a - b);
    const revealStagger = data.revealStagger ?? 130;
    const revealRamp = data.revealRamp ?? 700;
    const lastRevealEnd = tail.start + (finalSlots.length - 1) * revealStagger + revealRamp;
    const settleDelay = data.settleDelay ?? 1000;
    ops.push({
      type: 'settle', slots: finalSlots, start: lastRevealEnd + settleDelay,
    });
  }

  const authoredSteps = resolvedAuthoredSteps;
  authoredSteps.forEach((step, i) => {
    const chip = document.createElement('div');
    // Цвет чипа определяется ТОЛЬКО тем, главный ли шаг (primary), не его
    // kind: главный — цвет своего тира (is-rule+is-primary, крупно); ВСЁ
    // остальное — грамматика И любое вспомогательное/цепочное правило
    // (например, правило 71 внутри примера про правило 70) — один и тот
    // же стандартизированный охровый тон is-grammar (#CDA84E), мелко, не
    // новый цвет под каждый случай. Текст подписи («Правило N» /
    // «Грамматика») по-прежнему берётся из step.kind отдельно, независимо
    // от того, каким классом это красится.
    const isPrimary = step.kind === 'rule' && step.primary;
    const cls = ['slot-step-chip', isPrimary ? 'is-rule' : 'is-grammar'];
    if (isPrimary) cls.push('is-primary');
    chip.className = cls.join(' ');
    const tag = step.kind === 'grammar' ? (step.label || 'Грамматика') : (step.label || ('Правило ' + (step.ruleNum ?? '?')));
    chip.textContent = 'Шаг ' + (i + 1) + '. ' + tag;
    // Клик по шагу — полная чистая пересборка сцены (unmount убирает
    // старую целиком, тот же путь, что и при обычной смене примера) с
    // новой точкой отсчёта времени, см. opts.startAt в сигнатуре
    // mountSlotExample выше — не перемотка уже идущего прогона.
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', () => {
      unmount();
      mountSlotExample(container, data, { startAt: step.start });
    });
    // Цвет кнопки «Правило N» — из данных примера (step.color, hex-число),
    // ожидается тот же цвет, что и у карточки этого правила на панели слева
    // в sanskrit-sandhi-app.html (классы .c1–.c4) — применяется к любому
    // 'rule'-шагу, не только primary (см. комментарий выше).
    if (step.kind === 'rule' && step.color != null) {
      chip.style.setProperty('--rule-chip-color', '#' + step.color.toString(16).padStart(6, '0'));
    }
    stepsEl.appendChild(chip);
    step._chipEl = chip;
  });
  let _lastStepIdx = -1;

  function updateSteps(elapsed) {
    if (!runtimeSteps) return;
    const idx = stepIndexAt(elapsed, runtimeSteps);
    const curStep = runtimeSteps[idx];
    authoredSteps.forEach((step, i) => {
      step._chipEl.classList.toggle('active', step === curStep);
    });
    if (!curStep._virtual && !curStep._reveal && idx !== _lastStepIdx) {
      // маркер-вспышка ровно в момент, когда становится текущим НОВЫЙ
      // авторский шаг (в т.ч. переход грамматика→правило) — то самое
      // «нужен отдельный визуальный маркер», отмеченное как нерешённое
      // в second-examples-todo.md. На _reveal (пауза-проявление между шагами)
      // и _virtual (финальный хвост) не срабатывает — там нет своего чипа,
      // сигналом служит само проявление, отдельная вспышка не нужна.
      flashStepBoundary(curStep);
      // Движок сам сообщает о смене авторского шага НАРУЖУ (не держит
      // отдельную кнопочную ленту переключения ролей внутри себя) —
      // хост-страница слушает событие на container и сама решает, что с
      // ним делать (обычно — подсветить соответствующий шаг в 2D-системе
      // ролей); один источник истины про текущий шаг, не два независимых
      // набора «Шаг 1/Шаг 2» на экране одновременно.
      const stepIdx = authoredSteps.indexOf(curStep);
      container.dispatchEvent(new CustomEvent('slotstep', {
        detail: { index: stepIdx, kind: curStep.kind, ruleNum: curStep.ruleNum },
      }));
    }
    if (idx !== _lastStepIdx) _lastStepIdx = idx;
  }

  function flashStepBoundary(step) {
    // Раньше здесь ещё была верхняя полоса-вспышка (.slot-step-flashbar,
    // золотая, во всю ширину сцены) — по обратной связи читалась как
    // «мелькающая оранжевая полоса сверху», лишний шум. Убрана: чипа-вспышки
    // снизу и самого (теперь последовательного, см. applyStepDim) проявления
    // букв достаточно как сигнала смены шага, отдельная полоса не нужна.
    const chip = step._chipEl;
    if (chip) {
      chip.classList.remove('flash'); void chip.offsetWidth; // рестарт CSS-анимации
      chip.classList.add('flash');
    }
  }

  /* Развидка (снятие притенения) — ПОСЛЕДОВАТЕЛЬНАЯ, слева направо, не
     одновременная. Раньше все буквы разом ре-таргетировались одним общим
     RAMP — по прямой обратной связи после просмотра это читалось как
     «нелогичные вздрагивания и мелькания», а не как ясный сигнал «шаг
     закончен». Теперь у каждой буквы свой сдвиг старта (по её порядку слева
     направо среди занятых слотов), и сам переход медленнее и мягче обычного
     межшагового RAMP — «не спеша», её слово. Действует только на РАЗВИДКУ
     (переход к activeSlots:'ALL' — пауза между шагами и финальный хвост
     перед settle); сужение притенения под НОВЫЙ узкий шаг (обратное
     направление) остаётся одновременным, как раньше — туда претензий не
     было, и резкое «внимание сузилось» там уместнее плавного расползания. */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 3.2, 9.5);
  camera.position.copy(camBase);
  // Верхняя граница сцены проверена реальной проекционной математикой
  // камеры (THREE.Vector3.project), не на глаз — на верхний край кубика в
  // отстойнике (holdOffset.y=2.4 + CUBE_SIZE/2) —
  // при lookAt(0,0,0) он проецируется в NDC y=1.069, за пределами кадра
  // (край кадра — ровно 1.0). Ряд кубиков при этом использует только
  // нижнюю половину кадра (низ ряда — NDC y≈−0.18, до края −1 ещё много
  // запаса) — «места много» подтвердилось расчётом, не только на вид.
  // lookAt(0, 0.4, 0) вместо (0,0,0) — камера чуть наклоняется вверх,
  // верхний край отстойника уходит на NDC y≈0.93 (с запасом), ряд остаётся
  // хорошо видимым (низ ряда NDC y≈−0.31, ещё не у края). Общий фикс, не
  // частность agnayas — тот же отстойник у любого будущего split.
  camera.lookAt(0, 0.4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  stageEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(3, 6, 4);
  scene.add(key);

  const cubes = {}; // slot-index → кубик
  // ctx — единый объект контекста для всех apply*-функций (см. ═ ОПЕРАЦИИ ═
  // выше) — тот же самый объект передаётся во все, не создаётся заново под
  // каждую.
  const ctx = { cubes, camera, stageEl, labelsEl, wordGroupsList, scene, runtimeSteps, data };
  const fallOrder = data.initial.map(x => x.slot).sort((a, b) => a - b);
  data.initial.forEach(({ slot, tr }) => {
    const c = makeCube(tr, slot * 97 + 13);
    c.mesh.position.set(slotX(slot), 6 + Math.random() * 2, 0); // старт высоко, с разбросом
    c._fallStart = fallOrder.indexOf(slot) * (data.fallStagger ?? 260); // было 200 — медленнее, спокойнее
    c._fallDur = data.fallDur ?? 1300; // было 900
    c._fallDone = false;
    scene.add(c.mesh);
    scene.add(c.shadow);
    cubes[slot] = c;
  });

  function fallY(elapsed, cube) {
    const t = clamp01((elapsed - cube._fallStart) / cube._fallDur);
    if (elapsed < cube._fallStart) return cube.mesh.position.y;
    const fromY = 6, toY = 0;
    return fromY + (toY - fromY) * easeFall(t);
  }

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stageEl);
  resize();

  // Клик по шагу не перематывает уже идущий прогон (для этого пришлось бы
  // уметь считать состояние в обратном времени — сложно для направленного
  // движения типа approach/split) — сдвигает ТОЧКУ ОТСЧЁТА нового, полностью
  // свежего прогона: t0 смещается назад на opts.startAt, поэтому первый же
  // кадр уже вычисляет elapsed ≈ opts.startAt, и все ops, проверяющие
  // пороги по elapsed с одноразовыми флагами, корректно каскадом проходят
  // все более ранние фазы за один кадр — те же свежие флаги на каждый
  // вызов, что и у ops при обычном mount(), просто здесь elapsed сразу
  // большой, а не растёт с нуля.
  const t0 = performance.now() - (opts.startAt ?? 0);
  let rafId = null;

  function frame(now) {
    const elapsed = now - t0;
    Object.values(cubes).forEach(cube => {
      if (!cube._fallDone) {
        cube.mesh.position.y = fallY(elapsed, cube);
        if (elapsed >= cube._fallStart + cube._fallDur) cube._fallDone = true;
      }
    });
    ops.forEach(op => {
      if (op.type === 'influence') applyInfluence(op, elapsed, ctx);
      else if (op.type === 'approach') applyApproach(op, elapsed, ctx);
      else if (op.type === 'transform') applyTransform(op, elapsed, ctx);
      else if (op.type === 'split') applySplit(op, elapsed, ctx);
      else if (op.type === 'arrive') applyArrive(op, elapsed, ctx);
      else if (op.type === 'merge') applyMerge(op, elapsed, ctx);
      else if (op.type === 'elide') applyElide(op, elapsed, ctx);
      else if (op.type === 'settle') applySettle(op, elapsed, ctx);
      else if (op.type === 'dim') applyDim(op, elapsed, ctx);
    });
    applyStepDim(elapsed, ctx);
    updateSteps(elapsed);
    Object.values(cubes).forEach(updateShadow);
    camera.position.copy(camBase);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  function unmount() {
    resizeObserver.disconnect();
    if (rafId !== null) cancelAnimationFrame(rafId);
    scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
      }
    });
    renderer.dispose();
  }

  return { unmount, replay: () => mountSlotExample(container, data) };
}

/* Стили ленты шагов — общие на все примеры движка, вставляются в <head>
   один раз на документ (не в shadow/scoped-стиль, чтобы не тащить сборку). */
function injectStylesOnce() {
  if (_stylesInjected || document.getElementById('slot-engine-style')) { _stylesInjected = true; return; }
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'slot-engine-style';
  style.textContent = `
    .slot-steps { display:flex; gap:8px; justify-content:center; align-items:center;
      padding:20px 4px 2px; flex:0 0 auto; }
    /* Неактивный чип — сплошной тёмный фон (не почти прозрачный), читается
       как отдельный элемент интерфейса в любом состоянии, не только активном. */
    .slot-step-chip { font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px;
      letter-spacing:.02em; padding:5px 12px; border-radius:999px;
      background:#3A3E48; color:rgba(230,225,210,.55);
      border:1px solid rgba(255,255,255,.12); transition:all .35s ease; }
    .slot-step-chip:hover { filter: brightness(1.18); transform: translateY(-1px); }
    /* Цвет фона — ПОСТОЯННЫЙ признак принадлежности («это грамматика» /
       «это правило N»), не индикатор «сейчас идёт» — прямо на классе
       is-grammar/is-rule, всегда; .active добавляет только СВЕЧЕНИЕ (сейчас
       именно этот шаг играет), не единственный источник цвета. Текст в
       разметке уже капитализирован («Шаг N. Слово») — без
       text-transform:lowercase, оно перебивало бы это визуально обратно. */
    .slot-step-chip.is-grammar { background:#CDA84E; color:#2A2D35; }
    .slot-step-chip.is-rule { font-variant-numeric: tabular-nums;
      background:var(--rule-chip-color, #5B7EAE); color:#0F2547; }
    .slot-step-chip.active { border-color:transparent; }
    /* PRIMARY — тот единственный шаг, ради которого сделан весь ролик
       («шаг 2» из её формулировки: правило N, а не вспомогательная ссылка).
       Вдвое выше и в 1.5 раза шире обычного чипа — font-size и padding
       подобраны раздельно (не transform:scale, чтобы не растянуть пилюлю в
       овал и не исказить буквы). Цвет не переопределяется — тот же
       var(--rule-chip-color), что и у обычного правила (см. выше);
       единственное отличие primary — размер. */
    .slot-step-chip.is-primary { font-size:16px; font-weight:700; padding:14px 19px; }
    .slot-step-chip.flash { animation: slot-step-pop .55s ease; }
    @keyframes slot-step-pop {
      0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(205,168,78,.55); }
      35%  { transform: scale(1.16); box-shadow: 0 0 0 6px rgba(205,168,78,0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(205,168,78,0); }
    }
    /* Кольцо-пульс на кубике-источнике (нимитта) — эталон: широкое, размытое,
       светлое кольцо оттенка СОБСТВЕННОГО цвета кубика (см. ringColorFrom),
       не жёсткий однотонный диск. border-color переопределяется инлайном
       под конкретный кубик — здесь только форма/характер движения. Цвет по
       умолчанию — серебряный (см. SILVER_COLOR/SILVER_RGB), НЕ золотой —
       золото зарезервировано под вриддхи (см. константы вверху файла), для
       мест, где инлайн не задан (пауза-осознание перед split). */
    .slot-pulse-ring {
      position: absolute;
      width: 18px; height: 18px;
      margin: -9px 0 0 -9px;
      border-radius: 50%;
      border: 3px solid rgba(205,211,217,.5);
      filter: blur(1.5px);
      animation: slot-pulse-out var(--pulse-dur) ease-out forwards;
      pointer-events: none;
    }
    @keyframes slot-pulse-out {
      0%   { transform: scale(0.4); opacity: 0; border-width: 4px; filter: blur(1.5px) brightness(1); }
      18%  { opacity: .6; filter: blur(1.5px) brightness(1.7); }
      100% { transform: scale(4.4); opacity: 0; border-width: 0.5px; filter: blur(1.5px) brightness(1); }
    }
    /* Рамка-подчёркивание под группой-нимиттой — нейтральный GROUP_COLOR,
       не фонетический; opacity управляется из JS покадрово
       (updateGroupFrame), здесь только форма/свечение. */
    .slot-group-frame {
      position: absolute;
      height: 3px;
      border-radius: 2px;
      margin-top: 10px;
      background: rgba(226,217,190,.75);
      box-shadow: 0 0 7px 1px rgba(226,217,190,.55);
      pointer-events: none;
    }
    /* Стиль живёт здесь, в движке, не в HTML-странице отдельного примера —
       новому примеру ничего копировать не нужно (риск реален: без этого
       стиля бегущие волны influence были бы полностью невидимы, без
       единой ошибки в консоли, молча). Цвет border ставится инлайном из
       spawnWave (по умолчанию серебряный, см. SILVER_COLOR/SILVER_RGB) —
       то, что ниже, только фолбэк на случай, если стиль применится на
       долю кадра раньше инлайна. */
    .slot-wave-ring {
      position: absolute;
      width: 14px; height: 14px;
      margin: -7px 0 0 -7px;
      border-radius: 50%;
      border: 2px solid rgba(205,211,217,.85);
      animation: slot-wave-travel var(--wave-dur) ease-out forwards;
    }
    @keyframes slot-wave-travel {
      0%   { transform: translate(0,0) scale(0.6); opacity: 0; filter: brightness(1); }
      12%  { opacity: 1; filter: brightness(1.8); }
      100% { transform: translate(var(--dx), var(--dy)) scale(1.5); opacity: 0; filter: brightness(1); }
    }
  `;
  document.head.appendChild(style);
}
