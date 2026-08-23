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
import { buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from './chalk-module.js';

export const N_SLOTS = 10;
export const CUBE_SIZE = 1.1;
export const SLOT = 1.2;
// ЗАФИКСИРОВАНО (заход 7): скорость оборота трансформации взята буквально из
// T.gunaDur рабочего rule3-agnayas.js (1400мс на один оборот) — не придумана
// заново движком. Прошлые значения (3600, затем 4800 «для спокойствия») были
// собственными числами движка, не сверенными с эталоном — отсюда жалоба
// «крутится очень медленно». Это ЛОКАЛЬНАЯ константа-стандарт: не менять без
// новой явной сверки с рабочим файлом. Для вриддхи — spinTurns:2 (те же
// 1400мс на оборот, ×2 через уже существующий множитель, доп. кода не надо).
export const MS_PER_360 = 1400;
export const READY_COLOR = 0xDECDAF; // тот же тёплый бежевый, что и в rule3-agnayas.js
// РЕШЕНО (заход 7, прямая просьба): золотой (SIGNAL_COLOR) больше НЕ используется
// для гуны — резервируется под вриддхи (когда появится: transform с spinTurns:2,
// её сигнал/кольца — золотые, отличие от «рядовой» гуны должно быть цветовым).
// Для обычной гуны (и вообще для «вот-вот изменится» по умолчанию) — новый
// SILVER_COLOR, металлический холодный оттенок, не пересекается ни с одной
// категорией алфавитной палитры (vel/pal/ret/den/lab) и с READY_COLOR.
// ИСПРАВЛЕНО (заход 8, прямая жалоба «Е становится оранжевым после
// воздействия А перед заменой»): matsSignal строился из SIGNAL_COLOR
// (золото) — ровно то золото, которое заход 7 «зарезервировал под
// вриддхи», но не убрал из ЭТОГО, единственного места, где сигнальный
// материал реально надевается на кубик (пауза-осознание перед split).
// Теперь matsSignal — из SILVER_COLOR, тот же металлический тон, что и у
// колец влияния. SIGNAL_COLOR (золото) остаётся объявленным, но НИГДЕ не
// используется до появления настоящего вриддхи-механизма — когда он
// понадобится, ему нужен будет СВОЙ путь (не matsSignal), иначе золото
// снова тихо просочится в обычные примеры через общий код.
export const SIGNAL_COLOR = 0xE8C860; // зарезервировано под вриддхи — намеренно не используется нигде в движке
export const SILVER_COLOR = 0xCDD3D9; // «под влиянием/вот-вот изменится» по умолчанию — металлический блеск
const SILVER_RGB = '205,211,217'; // тот же тон в rgb-строке — для DOM-колец (spawnWave/spawnPulseRing)
// РЕШЕНО (заход 9, «объединить АС как единую грамматическую единицу»).
// Раньше сустейн-кольца у каждого кубика группы были тонированы в СВОЙ
// собственный фонетический цвет (a — vel-зелёный, s — den-розовый) — из-за
// этого пара визуально читалась как «два разных события рядом», а не как
// одно целое, хотя по факту синхронна. Перекрашивать сами КУБИКИ в общий
// цвет — отдельно уже решённый и закрытый вопрос (цвет кубика = место
// образования звука, не роль в слове) — трогать нельзя. Поэтому общий цвет
// применяется только к ВРЕМЕННЫМ индикаторам группы (сустейн-кольца и новая
// рамка-подчёркивание ниже) — нейтральный тёплый тон, вне фонетической
// палитры (vel/pal/ret/den/lab), не пересекается ни с READY_COLOR (тёплый,
// но холоднее и суше), ни с SILVER_COLOR, ни с зарезервированным золотом.
export const GROUP_COLOR = 0xE2D9BE;
const GROUP_RGB = '226,217,190';
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

function colorFor(tr) {
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

function clamp01(t) { return Math.max(0, Math.min(1, t)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
// добавлено (плавность): мягкий разгон И торможение — там, где раньше
// движение стартовало сразу на полной скорости (easeOutCubic в t=0 имеет
// не нулевую производную, отсюда «рывок» в начале хода).
function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
// добавлено (заход 27, elide — правило 15): медленный старт, ускоряющееся
// исчезновение — читается как растворение, не механическое схлопывание.
function easeInCubic(t) { return t * t * t; }
function easeOutBack(t) { const s = 2.4; return 1 + s * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t-=1.5/d1)*t+0.75;
  if (t < 2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
  return n1*(t-=2.625/d1)*t+0.984375;
}
// ЗАФИКСИРОВАНО (заход 7): easeOutBounce в этом файле УЖЕ был дословной копией
// функции из rule3-agnayas.js (см. её же формулу выше) — но заход 2 подменил
// её вызов на смесь с easeOutCubic, а заход 6 заменил смесь на чистый
// easeOutCubic, полностью убрав отскок. Обе правки были СВОИМИ решениями
// движка, не сверкой с рабочим файлом — отсюда жалоба «кубики перестали
// подпрыгивать». Возвращён прямой вызов уже готовой, ничем не изменённой
// easeOutBounce — то есть буквально то падение, что в agnayas.
function easeFall(t) { return easeOutBounce(t); }

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
   прозрачность самого кубика (бледный кубик — бледная тень). */
function updateShadow(cube) {
  cube.shadow.visible = cube.mesh.visible;
  cube.shadow.position.x = cube.mesh.position.x + 0.08;
  cube.shadow.position.z = cube.mesh.position.z + 0.05;
  const heightAbove = Math.max(0, cube.mesh.position.y - FLOOR_Y);
  const heightK = Math.max(0.35, 1 - heightAbove * 0.14);
  const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
  const matOpacity = mats[0].opacity ?? 1;
  cube.shadow.scale.setScalar(heightK);
  cube.shadow.material.opacity = heightK * matOpacity;
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
function computeWordGroups(initial) {
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
function resolveSlotRef(ref, groups) {
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
function stepTargetOpacity(step, slot, dimOpacity) {
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
function buildRuntimeSteps(steps) {
  if (!steps || !steps.length) return null;
  const list = [];
  // РЕШЕНО (заход 7, «падают уже прозрачные буквы»). Раньше до старта первого
  // авторского шага (data.steps[0].start) движок всё равно считал ТЕКУЩИМ
  // именно этот шаг (stepIndexAt смотрит только на .end, не на .start) — и
  // применял его притенение МГНОВЕННО, без рампы (у первого шага нет prev).
  // Из-за этого буквы, не входящие в activeSlots первого шага, гасли ещё в
  // воздухе, до приземления. Симметрично хвостовому виртуальному шагу — если
  // до первого шага есть зазор (обычно есть, т.к. шаг стартует уже после
  // падения), добавляем такой же «пока всё видно» участок в начале.
  if (steps[0].start > 0) {
    list.push({ _virtual: true, activeSlots: 'ALL', start: 0, end: steps[0].start });
  }
  for (let i = 0; i < steps.length; i++) {
    if (i > 0 && steps[i].start > steps[i - 1].end) {
      list.push({ _reveal: true, activeSlots: 'ALL', start: steps[i - 1].end, end: steps[i].start });
    }
    list.push(steps[i]);
  }
  const last = list[list.length - 1];
  list.push({ _virtual: true, activeSlots: 'ALL', start: last.end, end: Infinity });
  return list;
}

function stepIndexAt(elapsed, runtimeSteps) {
  for (let i = 0; i < runtimeSteps.length; i++) {
    if (elapsed < runtimeSteps[i].end) return i;
  }
  return runtimeSteps.length - 1;
}

/* ═══════════════════ ОПЕРАЦИИ ═══════════════════

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
export function mountSlotExample(container, data, opts = {}) {
  injectStylesOnce();

  // РЕШЕНО (заход 13, интеграция в основное приложение): раньше .slot-stage
  // был только height:100% — работало исключительно потому, что ЛЮБОЙ
  // тестовый контейнер, куда до сих пор монтировался пример, сам получал
  // явную высоту снаружи (vh/px в test-slot-engine*.html). Контейнер
  // #anim-tiles в sanskrit-sandhi-app.html — чистый flex:1 1 auto;min-height:0
  // БЕЗ такой явной высоты; без страховки сцена рисковала схлопнуться в
  // 0px именно там, где это труднее всего заметить (в реальном приложении,
  // не в изолированном тесте). min-height:220px — тот же самый пол, что уже
  // был у старого .eff-stage (rule3-agnayas.js) для той же самой цели.
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

  // ИСПРАВЛЕНО (заход 25, реальный баг «И не заменилось на Е, до самого
  // конца» — не на каждом прогоне, а когда монтирование пересекалось с
  // другим). Причина: data — это ЕДИНЫЙ объект МОДУЛЯ (export const data в
  // examples/*.js), не одноразовое состояние конкретного показа — он
  // переиспользуется на каждый повторный mount() (replay, повторный клик,
  // и в частности — два пересёкшихся по времени монтирования, если click
  // случился раньше, чем предыдущий async-импорт долетел). А applyTransform
  // /applySplit/applyMerge и т.д. пишут флаги (`op._began`, `op._swapped`,
  // `op._done`, `op._pulsedAt`...) ПРЯМО на объекты data.ops — то есть на
  // объекты, разделяемые МЕЖДУ прогонами. Если два прогона пересекаются
  // (два набора кубиков, но ОДИН и тот же набор op-флагов), тот, что успел
  // раньше, «съедает» флаг — и второй прогон, реально видимый на экране,
  // пропускает своё же превращение целиком, потому что guard (`if
  // (!op._swapped && ...)`) видит флаг уже true от чужого прогона.
  // Общий фикс — не патч под конкретный флаг: ops клонируются заново на
  // каждый mount(), без унаследованных «_»-полей ни от какого предыдущего
  // прогона. data.ops остаётся нетронутым модульным экспортом.
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

  // РЕШЕНО (заход 8, «бежевый должен начинаться через 1 сек после того как
  // возвращён цвет ВСЕМ и все взаимодействия закончились»). Раньше старт
  // settle прописывался в данных примера вручную (число, вручную сверенное
  // с моментом окончания хвостового пред-settle-проявления) — именно такая
  // ручная сверка и была источником ошибки в заходе 7 (при сдвиге таймлайна
  // под новую скорость transform число settle.start сдвинули МЕХАНИЧЕСКИ на
  // ту же дельту, не пересчитав заново момент, когда ПОСЛЕДНЯЯ буква
  // (с учётом стаггера) реально заканчивает проявляться — settle стартовал
  // раньше, чем на самом деле «все взаимодействия закончились»). Теперь это
  // СЧИТАЕТСЯ автоматически: конец хвостового шага (= конец последнего
  // авторского шага) + время последнего по порядку кубика на стаггер+рампу
  // проявления + пауза (data.settleDelay ?? 1000, её же значение и просила).
  // Явный settle в ops по-прежнему в приоритете (обратная совместимость /
  // случаи, где нужен нестандартный старт) — автоматика только достраивает
  // недостающее. Пишет в ЛОКАЛЬНЫЙ ops (заход 25), не в data.ops — иначе
  // при повторном mount() settle накапливался бы по одному на каждый показ.
  const hasExplicitSettle = ops.some(op => op.type === 'settle');
  if (!hasExplicitSettle && runtimeSteps) {
    const tail = runtimeSteps[runtimeSteps.length - 1];
    // РЕШЕНО (заход 15, расширено в заходе 27 на elide): merge поглощает
    // кубик-источник целиком, elide заставляет кубик исчезнуть целиком
    // (см. applyMerge/applyElide, оба делают delete cubes[...]) — их
    // номера слотов должны ВЫЙТИ из финального набора, иначе settle
    // попытается подсветить кубик, который к моменту своего старта уже
    // не существует.
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
    // РЕШЕНО (заход 10, уточнено следующим сообщением): 'grammar' — жёлто-
    // охровый тон. Любое 'rule' (и предварительное, и главное) — цвет
    // карточки ЭТОГО правила (step.color), одинаково у обоих. Разница
    // между обычным и главным правилом («шаг 2» из её формулировки) —
    // ТОЛЬКО размер: `primary:true` в данных даёт класс is-primary
    // (крупнее), цвет он не переопределяет — оба берут его из одного и
    // того же --rule-chip-color.
    const cls = ['slot-step-chip', step.kind === 'grammar' ? 'is-grammar' : 'is-rule'];
    if (step.kind === 'rule' && step.primary) cls.push('is-primary');
    chip.className = cls.join(' ');
    // ИСПРАВЛЕНО (заход 26, формат подписи по прямой просьбе): «Шаг N ·
    // грам.» → «Шаг N. Грамматика» / «Шаг N. Правило M» — точка вместо
    // середин­ной точки-разделителя, полные капитализированные слова, не
    // сокращения.
    const tag = step.kind === 'grammar' ? (step.label || 'Грамматика') : (step.label || ('Правило ' + (step.ruleNum ?? '?')));
    chip.textContent = 'Шаг ' + (i + 1) + '. ' + tag;
    // РЕШЕНО (заход 26, «клик по шагу — начать сначала, сразу приступить
    // к шагу N», её решение — записанный план «принудительный клик на
    // каждый шаг» см. second-examples-todo.md, конкретный технический
    // приём — сдвиг t0, не перемотка — дан только сейчас). Полная чистая
    // пересборка сцены (unmount убирает старую целиком — тот же путь,
    // что и при обычной смене примера) с новой точкой отсчёта времени —
    // см. opts.startAt в сигнатуре mountSlotExample выше.
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
      // РЕШЕНО (заход 17, «шаги-переключения ролей на плашках алфавита —
      // синхронизировать с анимацией»). Раньше 2D-подсветка алфавита жила
      // ПОЛНОСТЬЮ отдельно от 3D-анимации — своя кнопочная лента в правой
      // панели, переключаемая только кликом, и это же дублировало чипы
      // движка под самой анимацией (два независимых набора «Шаг 1/Шаг 2»
      // на экране одновременно). Теперь движок сам сообщает о смене
      // авторского шага наружу — хост-страница слушает событие на
      // container и сама решает, что с ним делать (обычно — подсветить
      // соответствующий шаг в 2D-системе ролей); кнопочная лента для
      // примеров с 3D-анимацией больше не нужна вообще.
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
  function applyStepDim(elapsed) {
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
    // РЕШЕНО (заход 7, «двойное мерцание»/«перекрашивание неудовлетворительно»).
    // Раньше здесь был ЕЩЁ один блок — «ramp-out к next» — считавший тот же
    // самый переход ВТОРОЙ раз, с другого конца: пока текущий шаг доживал
    // последние RAMP мс, он сам плавно вёл яркость к цели следующего шага, а
    // когда elapsed переходил границу — код следующего шага СНОВА запускал
    // переход «от prev к себе» с нуля, читая из prev не реальную (уже
    // подведённую к цели) яркость, а декларативный target шага (1, если
    // шаг ALL) — кубик дёргался обратно вверх и ещё раз плавно гас. Раз шаги
    // идут подряд без разрывов (buildRuntimeSteps это гарантирует), переход
    // на КАЖДОЙ границе обязан считаться РОВНО ОДИН РАЗ — и это уже полностью
    // берёт на себя ramp-in ниже, в шаге, который наступает ПОСЛЕ границы.
    // Отдельный ramp-out поэтому не просто лишний, а прямо конфликтующий —
    // убран целиком.
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

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 3.2, 9.5);
  camera.position.copy(camBase);
  // ИСПРАВЛЕНО (заход 25, «в правиле 3 обрезается висящая в отстойнике Е —
  // увеличить верхнюю границу сцены, места много»). Проверила не на глаз, а
  // прогнав реальную проекционную математику камеры (THREE.Vector3.project)
  // на верхний край кубика в отстойнике (holdOffset.y=2.4 + CUBE_SIZE/2) —
  // при lookAt(0,0,0) он проецируется в NDC y=1.069, за пределами кадра
  // (край кадра — ровно 1.0). Ряд кубиков при этом использует только
  // нижнюю половину кадра (низ ряда — NDC y≈−0.18, до края −1 ещё много
  // запаса) — «места много» подтвердилось расчётом, не только на вид.
  // lookAt(0, 0.4, 0) вместо (0,0,0) — камера чуть наклоняется вверх,
  // верхний край отстойника уходит на NDC y≈0.93 (с запасом), ряд остаётся
  // хорошо видимым (низ ряда NDC y≈−0.31, ещё не у края). Общий фикс, не
  // частность agnayas — тот же отстойник у любого будущего split.
  camera.lookAt(0, 0.4, 0);

  function project(vec3) {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    const v = vec3.clone().project(camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  // rgbStr необязателен: по умолчанию серебряный (см. SILVER_COLOR/SILVER_RGB
  // выше) — раньше цвет волны был жёстко зашит золотым прямо в CSS вызывающей
  // страницы (test-slot-engine.html), это и был тот «оранжевый для гуны»,
  // на который прямо указали. Золотой остаётся доступен через явный override,
  // когда понадобится (вриддхи).
  /* РЕШЕНО (заход 7, «кольца не центрированы, смещены влево-вверх грани»).
     Раньше кольца анкорились на mesh.position — это ГЕОМЕТРИЧЕСКИЙ ЦЕНТР
     кубика, не видимая грань с буквой (+Z, глиф). При низкой, почти анфас
     камере rule3-agnayas.js (camBase y=1.5) разница была незаметна — но
     камера движка стоит заметно выше (camBase y=3.2, см. ниже), и та же
     логика колец, скопированная без пересчёта под новый ракурс, проецируется
     заметно выше и в сторону от видимой грани. Общий фикс — не под конкретную
     камеру: берём точку не в центре, а со сдвигом по ЛОКАЛЬНОЙ +Z (к камере,
     туда же, где рисуется буква), провёрнутым через текущий поворот кубика
     (mesh.quaternion) — верно даже пока кубик дрожит/крутится. */
  function frontAnchor(mesh, zOff = CUBE_SIZE * 0.42, yOff = 0.1) {
    const local = new THREE.Vector3(0, yOff, zOff).applyQuaternion(mesh.quaternion);
    return mesh.position.clone().add(local);
  }

  /* ОБЩИЙ ХЕЛПЕР ПРИЛЁТА (заход 12, вынесено при добавлении arrive/merge).
     Раньше эта же математика (разгон/торможение + дуга по высоте) была
     ЖЁСТКО зашита прямо внутри applySplit — единственное место, где кубик
     материализуется за кадром и прилетает по дуге. Как только понадобилась
     ровно та же самая механика ещё в двух местах (arrive — тихий приход
     буквы без слияния; merge — приход буквы, которая исчезает в момент
     касания цели), переписывать её заново означало бы повторить ту самую
     ошибку, из-за которой начался весь этот заход («опять делается с
     нуля, хотя уже есть готовое и проверенное»). Теперь одна функция,
     три места вызова. */
  function flyArcPosition(from, toX, toY, toZ, t, arcHeight = 1.0) {
    const te = easeInOutCubic(t);
    const arc = Math.sin(t * Math.PI) * arcHeight;
    return {
      x: lerp(from.x, toX, te),
      y: lerp(from.y, toY, te) + arc,
      z: lerp(from.z, toZ, te),
    };
  }

  /* РАМКА-ПОДЧЁРКИВАНИЕ ПОД ГРУППОЙ (заход 9, «объединить АС»). Тонкая
     светящаяся линия под всеми кубиками группы разом — тот же приём, что
     подчёркивание/скобка окончания в морфологическом разборе (привычный
     язык, не изобретённый). Держится, пока держится сама принадлежность к
     группе (та же ringHoldDur, что и у сустейн-колец — один параметр, не
     два рассинхронизированных). Только для настоящих групп (>1 кубика) —
     подчёркивать одну букву незачем, там и так ясно, что происходит. Общая
     утилита операции, не частность influence — как только появится другая
     операция, работающая с группой, эта же функция подойдёт ей без правок. */
  function updateGroupFrame(op, sources, elapsed) {
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
    // РЕШЕНО (заход 10, «на всю протяжённость задействованных слотов»).
    // Раньше границы брались от ЦЕНТРА крайних кубиков (frontAnchor без
    // сдвига по X) — рамка не доходила до реальных краёв слотов, была уже
    // самой группы. Теперь у крайнего левого и крайнего правого кубика
    // берётся точка со сдвигом на пол-слота НАРУЖУ (±SLOT/2, через
    // quaternion — как и остальные якоря, верно при любом повороте) — рамка
    // покрывает слот целиком, а не только видимую ширину буквы на грани.
    const sorted = sources.slice().sort((a, b) => a.mesh.position.x - b.mesh.position.x);
    const leftCube = sorted[0], rightCube = sorted[sorted.length - 1];
    const edgeAnchor = (mesh, xOff) => {
      const local = new THREE.Vector3(xOff, -CUBE_SIZE * 0.56, CUBE_SIZE * 0.42).applyQuaternion(mesh.quaternion);
      return mesh.position.clone().add(local);
    };
    const pLeft = project(edgeAnchor(leftCube.mesh, -SLOT / 2));
    const pRight = project(edgeAnchor(rightCube.mesh, SLOT / 2));
    // Y — по нижнему краю грани у всех кубиков группы (не только крайних),
    // на случай если группа не строго горизонтальна на экране (наклон камеры/поворот)
    const ys = sources.map(s => project(frontAnchor(s.mesh, CUBE_SIZE * 0.42, -CUBE_SIZE * 0.56)).y);
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

  function spawnWave(fromVec3, toVec3, dur, rgbStr) {
    const pA = project(fromVec3), pB = project(toVec3);
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

  /* Кольцо-пульс НА МЕСТЕ (не бежит от точки к точке, а расходится вокруг
     одной) — сигнал «вот-вот изменится» (пауза-осознание перед split) ИЛИ
     «я источник, я влияю» (сустейн-кольца у нимитты в influence, см. ниже).
     rgbStr — необязательный: без него кольцо золотое (CSS по умолчанию,
     как раньше), с ним — оттенок СОБСТВЕННОГО цвета конкретного кубика
     (см. ringColorFrom) — общая утилита, не частность agnayas. */
  function spawnPulseRing(atVec3, dur, rgbStr) {
    const p = project(atVec3);
    const ring = document.createElement('div');
    ring.className = 'slot-pulse-ring';
    ring.style.left = p.x + 'px';
    ring.style.top = p.y + 'px';
    ring.style.setProperty('--pulse-dur', dur + 'ms');
    if (rgbStr) ring.style.borderColor = `rgba(${rgbStr},.55)`;
    labelsEl.appendChild(ring);
    setTimeout(() => ring.remove(), dur + 80);
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  stageEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(3, 6, 4);
  scene.add(key);

  const cubes = {}; // slot-index → кубик
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

  // РЕШЕНО (заход 26, «клик по шагу — не двигаться назад, а мгновенно
  // начать сначала и сразу приступить к шагу N», её прямое решение). Не
  // перемотка уже идущего прогона (для этого пришлось бы уметь считать
  // состояние в обратном времени — сложно для направленного движения типа
  // approach/split) — а сдвиг ТОЧКИ ОТСЧЁТА нового, полностью свежего
  // прогона: t0 смещается назад на opts.startAt, поэтому первый же кадр
  // уже вычисляет elapsed ≈ opts.startAt, и все ops (transform/split/merge
  // и т.д.), проверяющие пороги по elapsed с одноразовыми флагами,
  // корректно каскадом проходят все более ранние фазы за один кадр —
  // ровно то же поведение, что уже проверено симуляцией для бага
  // «переиспользуемые data.ops» (заход 25): свежие флаги на каждый вызов,
  // просто здесь elapsed сразу большой, а не растёт с нуля.
  const t0 = performance.now() - (opts.startAt ?? 0);
  let rafId = null;

  /* 0. INFLUENCE — дальнодействие до самого превращения: несколько волн-
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
  function applyInfluence(op, elapsed) {
    const target = cubes[op.to];
    const sourceSlots = resolveSlotRef(op.from, wordGroupsList);
    const sources = sourceSlots.map(s => cubes[s]).filter(Boolean);
    if (!target || !sources.length) return;
    const waveCount = op.waveCount ?? 3;
    const waveGap = op.waveGap ?? 550; // было 440
    const waveTravel = op.waveTravel ?? 1400; // было 1100
    const dur = (waveCount - 1) * waveGap + waveTravel;

    // Сустейн-кольца на источниках — независимо от фазы волн, до ringHoldDur.
    const ringHoldDur = op.ringHoldDur ?? dur;
    op._frameHoldEnd = op.start + ringHoldDur; // общее окно и для рамки, и для колец
    updateGroupFrame(op, sources, elapsed);
    const ringGap = op.ringGap ?? 900;
    // Цвет колец — ОДИН на всю группу (GROUP_COLOR), если источников больше
    // одного (настоящая группа-нимитта, см. GROUP_COLOR выше); для одиночной
    // буквы-источника прежнее поведение сохранено — тонировка в её
    // собственный фонетический цвет (там нечего объединять, один кубик).
    const ringRgb = sources.length > 1 ? GROUP_RGB : ringColorFrom(colorFor(sources[0].tr));
    if (elapsed >= op.start && elapsed <= op.start + ringHoldDur) {
      const ringIdx = Math.floor((elapsed - op.start) / ringGap);
      const key = '_ring' + ringIdx;
      if (!op[key]) {
        op[key] = true;
        sources.forEach(src => spawnPulseRing(
          frontAnchor(src.mesh),
          1300,
          ringRgb
        ));
      }
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
          waveTravel
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

    // ИСПРАВЛЕНО (заход 10, «Е слишком сильно трясётся, придумай другую
    // иллюстрацию»). Раньше цель дрожала вращением (rotation.z, случайного
    // вида синус-тряска, читалась как визуальный шум, а не как понятный
    // сигнал). Заменено на масштабный «удар»-пульс — тот же язык, что уже
    // используется у источников (см. srcPulse выше) и на паузе перед split:
    // один согласованный приём «пульс = вот-вот изменится» по всему движку,
    // а не отдельный жест для каждого случая. Пульс цели синхронизирован не
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

     РЕШЕНО (заход 15, `retreat:false`) — та же самая механика подхода
     годится и для ПРОТИВОПОЛОЖНОГО смысла: не несовместимость, а
     совместимость («примагничивание», āsīt, ĪТ подъезжает к АС и остаётся,
     а не отскакивает). distance:1.0 при зазоре ровно в один слот приводит
     мувер точно встык с целью; retreat:false отключает фазу отскока
     целиком (retreatDur обнуляется) — кубик остаётся у цели навсегда,
     jitterAmp у вызывающего кода обычно ставится в 0 отдельно (дрожь —
     язык именно несовместимости, не нужна тут по смыслу, но остаётся
     доступной, если понадобится где-то ещё). */
  function applyApproach(op, elapsed) {
    // op.movers/op.mover — как раньше (число/массив), либо ссылка на группу слов
    // ({word:2}) через ту же общую формулу, что и у influence.from (см. выше).
    const slots = resolveSlotRef(op.movers ?? op.mover, wordGroupsList);
    const movers = slots.map(s => cubes[s]).filter(Boolean);
    if (!movers.length) return;
    // ИСПРАВЛЕНО (заход 28, реальный баг — не мнимый, нашла именно чтением
    // кода, не только симуляцией с упрощённой копией функции). Раньше
    // строка ниже была `const target = cubes[op.target]; if (!movers.length
    // || !target) return;` — то есть ЦЕЛЬ ДОЛЖНА была существовать на
    // КАЖДОМ кадре, иначе approach обрывался целиком. Это ломается ровно в
    // сценарии «приближение вызывает реакцию» (śādhi: DH приближается к S,
    // а S по ходу приближения ИСЧЕЗАЕТ через elide) — как только цель
    // исчезала, движение mover'ов замирало на полпути, а не доезжало до
    // конца. Направление движения (dir) вычисляется по НОМЕРУ слота цели
    // (slotX(op.target)) — цель как живой объект для этого не нужна
    // вообще, нужна только для дрожи/пульса НА ней самой (см. ниже, оба
    // теперь под `if (target)`).
    const target = cubes[op.target]; // может быть undefined — это ОК
    const approachDur = op.approachDur ?? 1150; // было 800
    const holdDur = op.holdDur ?? 550; // было 400
    const retreat = op.retreat !== false;
    const retreatDur = retreat ? (op.retreatDur ?? 950) : 0; // было 700
    const distance = op.distance ?? 0.5;
    const jitterAmp = op.jitterAmp ?? 0.16;
    const baseXs = slots.map(s => slotX(s));
    const dir = Math.sign(slotX(op.target) - baseXs[0]); // в какую сторону цель

    // РЕШЕНО (заход 29, «ДХИ просто въезжает — не читается взаимодействие»).
    // Раньше единственный способ пройти путь — одна сплошная кривая от 0 до
    // distance, без паузы. Если distance большая (закрыть исходный зазор И
    // занять место исчезающей соседней буквы ОДНИМ движением) — это читается
    // как «проехало насквозь», а не «подошло → произошла реакция → въехало
    // в освободившееся место»: нет отдельного, заметного момента прибытия.
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
        // РЕШЕНО (заход 33, «не видно факта воздействия ДХ на С» — взято из
        // docs/effects/rule-assimilation-v2-via-elements.html, старого
        // файла до движка: там триггер постоянно пульсировал кольцом,
        // пока шло воздействие на цель — не перенесла дословно его технику
        // (перерисовка кольца прямо в текстуру грани, свою для каждого
        // кубика — сложнее, чем нужно сейчас), взяла ПРИЁМ и переложила на
        // уже готовый spawnPulseRing. Необязательно (op.holdPulse) — старые
        // примеры (agnayas, āsīt) его не передают, не затронуты.
        if (op.holdPulse) {
          const pulseGap = op.holdPulseGap ?? 500;
          const idx = Math.floor((elapsed - leg1End) / pulseGap);
          const key = '_holdPulse' + idx;
          if (!op[key]) {
            op[key] = true;
            movers.forEach(m => spawnPulseRing(
              frontAnchor(m.mesh),
              pulseGap * 0.9,
              op.holdPulseColor ?? ringColorFrom(colorFor(m.tr))
            ));
          }
        }
      } else if (elapsed <= leg2End) {
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
          ringColorFrom(colorFor(movers[0].tr))
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

  /* РЕШЕНО (заход 10, «серебро должно быть на гунировании, не на шаге
     правило 3»). Раньше серебро (SILVER_COLOR) нигде не касалось самой
     трансформации — кубик уходил в matsBlank (тот же ЕГО СОБСТВЕННЫЙ цвет,
     без буквы) на время оборота, без какого-либо сигнала «я меняюсь».
     Серебро по ошибке осталось только на паузе перед split (см. правку
     applySplit ниже — убрано оттуда). Теперь три явные фазы, ровно как она
     описала: (1) кубик получает импульс — материал сразу переключается на
     matsSignal (серебро, СТАРАЯ буква ещё видна — понятно, КТО меняется);
     (2) на ~15% оборота буква меняется, но материал остаётся matsSignal —
     уже пересобранный под НОВУЮ букву (см. regenMats) — кубик «стал E», но
     ещё серебряный, переход цветом не завершён; (3) в момент приземления
     (t=1, тот же кадр, что и сброс поворота/позиции — не отдельная пауза,
     чтобы не плодить лишнее ожидание, см. её же жалобу про паузу в split)
     — переключение на matsMain, истинный цвет столбца. matsBlank в этой
     операции больше не используется. */
  /* ИСПРАВЛЕНО (заход 11, «Е должна стать голубой, теряет серебряный» —
     реальный баг, не тонкая настройка). Строгая проверка `elapsed >
     op.start + dur` в самом начале возвращала из функции РАНЬШЕ, чем кадр
     мог попасть ровно в точку t>=1 внутри тела — при обычной частоте кадров
     (~60fps, шаг ~16.7мс) шанс, что elapsed окажется РОВНО равен op.start+dur,
     практически нулевой: либо кадр ещё до границы (t<1, материал остаётся
     серебряным), либо уже за ней (ранний return, до t>=1 дело не доходит
     вовсе). Из-за этого финализация (переход на matsMain — истинный цвет)
     почти никогда не срабатывала на практике, а не «иногда». Общий фикс —
     не только для agnayas: верхняя граница убрана из раннего return, вместо
     неё — guard по уже выставленному op._done (дешёвый выход после того,
     как всё уже сделано); t считается через clamp01, который сам ограничит
     переполёт значением 1 — финализация гарантированно происходит РОВНО
     ОДИН РАЗ, на первом же кадре, где elapsed достиг или превысил конец. */
  function applyTransform(op, elapsed) {
    const cube = cubes[op.at];
    if (!cube) return;
    if (elapsed < op.start) return;
    if (op._done) return;
    const spinTurns = op.spinTurns ?? 1;
    const dur = Math.abs(spinTurns) * MS_PER_360;
    const bounceH = op.bounceH ?? 0.3;
    const clearance = op.clearance ?? 0.35; // боковой отъезд от соседа на время вращения
    if (!op._began) {
      op._began = true;
      cube.mesh.material = cube.matsSignal; // серебро на СТАРОЙ букве — «получила импульс»
    }
    const t = clamp01((elapsed - op.start) / dur);
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
      // но материал остаётся серебряным (matsSignal), не matsMain: буква уже
      // «Е», цвет ещё не вернулся, это следующая, отдельная фаза (см. ниже).
      regenMats(cube, op.toGlyph, newColor);
      cube.mesh.material = cube.matsSignal;
    }
    if (t >= 1) {
      op._done = true;
      cube.mesh.rotation.y = 0;
      cube.mesh.position.y = 0;
      cube.mesh.position.x = slotX(op.at);
      cube.mesh.material = cube.matsMain; // возвращает себе истинный цвет столбца
    }
  }

  function applySplit(op, elapsed) {
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
    // ИСПРАВЛЕНО (заход 10, «ненужная пауза, когда Е исчезает в воздухе, мы
    // смотрим на экран без событий»). 2400мс — почти два с половиной
    // секунды ПОСЛЕ того, как E уже зависла на месте (riseDur кончился) И
    // результаты (А+Й) уже прилетели и легли в ряд — то есть чистое время
    // без единого нового события на экране. Смысл паузы («дать сравнить
    // старое и новое рядом») остаётся, но 2400мс для этого избыточны;
    // сокращено до 1000 — сравнение всё ещё читается, воздуха меньше.
    const holdDur = op.holdDur ?? 1000; // было 2400 (до этого — 2000)
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
    // ИСПРАВЛЕНО (заход 10, доведено до конца): цвет здесь БОЛЬШЕ НЕ
    // меняется — раньше это было золото (жалоба «Е оранжевая»), потом по
    // ошибке серебро (заход 8) — но серебро теперь однозначно закреплено
    // за трансформацией гуны (см. applyTransform), а не за паузой перед
    // split; держать его ЕЩЁ и здесь означало бы два разных события одним
    // и тем же цветом — путаница, а не сигнал. Пульс масштабом и кольца
    // сами по себе уже достаточно ясно говорят «сейчас что-то произойдёт»,
    // без перекраски кубика. Общий приём для ЛЮБОГО split, не частность
    // agnayas.
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
      if (!op._pulse0 && t >= 0.15) { op._pulse0 = true; spawnPulseRing(frontAnchor(src.mesh), anticipateDur * 0.6); }
      if (!op._pulse1 && t >= 0.6) { op._pulse1 = true; spawnPulseRing(frontAnchor(src.mesh), anticipateDur * 0.6); }
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

  /* ARRIVE (заход 12, шаг «грам.» в āsīt: окончание -īt тихо присоединяется
     к основе, без единого события сандхи). Кубик(и) материализуются ЗА
     кадром и прилетают по дуге в свой слот — та же матчасть, что у
     прилёта результатов split (flyArcPosition), но БЕЗ второй половины
     split (никто не тает, никто не превращается) — просто прибыл и
     остался. Специально БЕЗ сигнального цвета/вспышки в момент посадки:
     это тихое морфологическое присоединение, не сандхи — принцип «эффект
     только там, где реально сработало правило» (шаблон-документ, заход по
     āsīt). Несколько элементов сразу — items[], каждый со своим
     delay/dur/from/arcHeight, как у split.arrivals.
     { type:'arrive', items:[{into,newSlot,from,delay,dur,arcHeight}], start } */
  function applyArrive(op, elapsed) {
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

  /* MERGE — слияние (заход 15, полностью переработано под «все буквы падают
     вместе, с зазором, потом происходит притяжение»). Раньше кубик, который
     сливается, материализовался ЗА кадром и прилетал по дуге — то есть
     физически не существовал до собственного шага, хотя по её описанию все
     буквы должны быть видны с самого начала, просто с паузой между
     смысловыми частями слова. Теперь merge работает с УЖЕ существующим,
     упавшим кубиком (от — номер его исходного слота, ровно как movers у
     approach), просто едет вдоль ряда в позицию цели по прямой (без дуги —
     это скольжение по своей полосе, не прилёт со стороны, дуга здесь была
     бы визуально противоречащей самой идее). Слот-ключ источника (from)
     специально НЕ переименовывается у соседей справа — они просто держат
     СВОИ исходные номера слотов, даже когда их РЕАЛЬНАЯ позиция на экране
     смещена соседней approach-операцией (см. applyApproach retreat:false) —
     для порядка/подсчёта это неважно, важна только сортировка номеров, а
     не их непрерывность.
     { type:'merge', from, at, toGlyph, toColor, start, dur=1400, pulseHoldMs } */
  function applyMerge(op, elapsed) {
    if (elapsed < op.start) return;
    const target = cubes[op.at];
    if (!target) return;
    // ИСПРАВЛЕНО (заход 18, реальный баг «Ā застревает увеличенной
    // навсегда» — нашла симуляцией, не на глаз). Раньше mover искался
    // (`cubes[op.from]`) и проверялся на существование ОДНИМ guard'ом со
    // всей функцией, ДО ветки `if (!op._done)`. Как только слияние
    // завершается, кубик-источник УДАЛЯЕТСЯ из cubes{} (см. `delete
     // cubes[op.from]` ниже) — а на СЛЕДУЮЩЕМ кадре тот же guard находит
    // mover===undefined и обрывает ВСЮ функцию, включая спад пика
    // масштаба, который к этому моменту ещё не начинался. Тот же самый
    // класс бага, что уже чинили в applyTransform (заход 11) и в этой же
    // функции по-другому (заход 15) — здесь я сама создала его ТРЕТИЙ раз,
    // просто в новом месте. Теперь mover ищется и проверяется ТОЛЬКО
    // внутри фазы полёта (где он ещё нужен) — спад пика зависит только от
    // target, который никогда не удаляется, и потому не обрывается.
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
        spawnPulseRing(frontAnchor(target.mesh), op.pulseHoldMs ?? 1300, GROUP_RGB);
        // РЕШЕНО (заход 20, «сейчас нет никакого эффекта — может кубик
        // разбухнет со вспышкой?»). Была права: +9% масштаба без ничего
        // больше — на практике незаметно, не читается как событие. Теперь
        // настоящая вспышка: пик масштаба заметно выше (1.35, не 1.09) +
        // реальное свечение материала (emissive/emissiveIntensity — не
        // имитация цветом текстуры, а живое GPU-свойство, то же самое,
        // чем светятся неоновые вывески в играх), тон — тот же нейтральный
        // GROUP_COLOR, что у кольца-пульса рядом (одна и та же вспышка,
        // не два разных цветовых события одновременно). Оба — масштаб и
        // свечение — спадают синхронно, одной и той же кривой, до 0.
        target.mesh.material.forEach(m => { m.emissive.setHex(GROUP_COLOR); m.emissiveIntensity = 0.9; });
        target.mesh.scale.setScalar(1.35);
        op._pulsedAt = elapsed;
      }
    }
    // ИСПРАВЛЕНО (заход 15, реальный баг «результат крупнее стандарта» —
    // не тонкая настройка). Спад пика масштаба раньше стоял ПОД ТЕМ ЖЕ
    // guard'ом `if (op._done) return`, что и вся остальная функция — на
    // первом же кадре ПОСЛЕ слияния этот guard обрывал функцию раньше, чем
    // спад успевал сделать хоть шаг: масштаб застревал на 1.09 навсегда.
    // Тот же самый класс ошибки уже чинили в applyTransform (заход 11) —
    // здесь я сама воспроизвела его заново, поставив финализацию и
    // продолжающийся спад за одним и тем же early-return. Спад вынесен из-
    // под guard'а — идёт каждый кадр после слияния, независимо от op._done.
    // Пик и длительность спада — заход 20 (0.9/1.35 вместо прежних
    // умеренных значений, 600мс вместо 500 — заметная, но короткая вспышка,
    // не растянутая).
    if (op._pulsedAt != null) {
      const pt = clamp01((elapsed - op._pulsedAt) / 600);
      const e = easeOutCubic(pt);
      target.mesh.scale.setScalar(lerp(1.35, 1, e));
      target.mesh.material.forEach(m => { m.emissiveIntensity = lerp(0.9, 0, e); });
    }
  }

  /* ELIDE (заход 27, правило 15, śādhi: s между ā и dh пропадает, ничего
     не появляется взамен) — первое применение к пункту «элизия» из списка
     недостающего в шаблон-документе. Сдвиг соседних букв, чтобы закрыть
     образовавшийся промежуток, — НЕ часть этой операции: используется уже
     готовый `approach` (retreat:false) с любым СУЩЕСТВУЮЩИМ соседним
     кубиком в роли `target` — тот же приём, что уже проверен на āsīt.

     ИСПРАВЛЕНО (заход 31, «в одной из первых версий предлагала букву для
     замены поднимать в отстойник вверх, а уничтожающуюся — спускать в
     такой же отстойник вниз»). Оценила критично по трём пунктам — идея
     оказалась сильнее заходов 27 и 30 (равномерное сжатие, потом
     сплющивание-«лужица», оба отвергнуты): направление становится
     СМЫСЛОВЫМ, не декоративным — вверх (см. split) означает «превращается,
     что-то продолжается в новой форме» (E→A+Y), вниз — «пропадает без
     следа» (чистая элизия). Одна и та же механика для обоих направлений
     (rise→hold→fade, буквально та же, что у split), только знак `y` у
     holdOffset отрицательный. z у holdOffset — ОТ камеры (не к ней, как у
     E) — по смыслу «тонет, удаляется», и практически: снизу кадра меньше
     запаса, чем сверху (заход 25 сдвинул камеру вверх ради подъёма E) —
     посчитано реальной проекционной математикой камеры перед тем, как
     менять числа, не на глаз.
     { type:'elide', at, start, riseDur=1300, holdOpacity=0.5, holdDur=800,
       fadeDur=1100, holdOffset={x:0,y:-2.4,z:-0.4} } */
  function applyElide(op, elapsed) {
    if (elapsed < op.start) return;
    const cube = cubes[op.at];
    if (!cube || op._done) return;
    const riseDur = op.riseDur ?? 1300; // тот же темп, что у split — общий язык, не изобретённый заново
    const holdOpacity = op.holdOpacity ?? 0.5;
    const holdDur = op.holdDur ?? 800;
    const fadeDur = op.fadeDur ?? 1100;
    // ИСПРАВЛЕНО (заход 32, «S наезжает на надпись Правило»): было y:-2.4
    // (зеркально подъёму E) — реальный запас до края кадра снизу оказался
    // впятеро меньше, чем у E сверху (0.038 против 0.075 в NDC), потому что
    // камера заранее сдвинута вверх ради отстойника E (заход 25). y:-1.8
    // даёт запас 0.204 — с той же математикой, посчитано, не подобрано на глаз.
    const holdOffset = op.holdOffset ?? { x: 0, y: -1.8, z: -0.4 };
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
        spawnPulseRing(frontAnchor(cube.mesh), 900, GROUP_RGB);
        delete cubes[op.at];
      }
    }
  }

  // stepDelay слегка увеличен (было 150) — по обратной связи финал должен
  // идти ПЛАВНО, не спеша; цвет меняется РОВНО на вершине волны (t=0.5).
  //
  // РЕШЕНО (заход 11, «повыше и как-то интереснее, может более упруго»).
  // Раньше — одна плоская симметричная синусоида на всю длительность
  // (bounceH=0.12, вверх-вниз с одной и той же скоростью, никакой
  // «пружинности»). Предложила и сделала двойной прыжок: основной высокий
  // взлёт (t 0–0.6, амплитуда 0.32 — почти втрое выше) и заметно меньший
  // довдох сразу следом (t 0.6–1.0, ~30% от основной высоты) — та же
  // логика «удар, потом меньший отзвук», что уже используется в паузе
  // перед split (два убывающих импульса) — общий язык движка для
  // «пружинистости», не новый изобретённый жест. Обе половины стыкуются
  // без разрыва (обе синусоиды дают 0 на границе t=0.6).
  function applySettle(op, elapsed) {
    const stepDelay = op.stepDelay ?? 180;
    const bounceDur = op.bounceDur ?? 600;
    const bounceH = op.bounceH ?? 0.32; // было 0.12
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
  function applyDim(op, elapsed) {
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

  function frame(now) {
    const elapsed = now - t0;
    Object.values(cubes).forEach(cube => {
      if (!cube._fallDone) {
        cube.mesh.position.y = fallY(elapsed, cube);
        if (elapsed >= cube._fallStart + cube._fallDur) cube._fallDone = true;
      }
    });
    ops.forEach(op => {
      if (op.type === 'influence') applyInfluence(op, elapsed);
      else if (op.type === 'approach') applyApproach(op, elapsed);
      else if (op.type === 'transform') applyTransform(op, elapsed);
      else if (op.type === 'split') applySplit(op, elapsed);
      else if (op.type === 'arrive') applyArrive(op, elapsed);
      else if (op.type === 'merge') applyMerge(op, elapsed);
      else if (op.type === 'elide') applyElide(op, elapsed);
      else if (op.type === 'settle') applySettle(op, elapsed);
      else if (op.type === 'dim') applyDim(op, elapsed);
    });
    applyStepDim(elapsed);
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
      padding:8px 4px 2px; flex:0 0 auto; }
    /* РЕШЕНО (заход 10, «не прозрачный фон»): раньше неактивный чип был почти
       невидимым (rgba(255,255,255,.06)) — теперь сплошной тёмный фон, читается
       как отдельный элемент интерфейса в любом состоянии, не только активном. */
    .slot-step-chip { font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px;
      letter-spacing:.02em; padding:5px 12px; border-radius:999px;
      background:#3A3E48; color:rgba(230,225,210,.55);
      border:1px solid rgba(255,255,255,.12); transition:all .35s ease; }
    /* ЗАХОД 26 — чипы теперь кликабельны (перезапуск ролика сразу с этого
       шага), лёгкая hover-подсказка, чтобы это читалось. */
    .slot-step-chip:hover { filter: brightness(1.18); transform: translateY(-1px); }
    /* ИСПРАВЛЕНО (заход 15, «ждала наличие цвета у фона плашек — сейчас нет
       фона, цветная рамка»). Раньше цвет фона был ТОЛЬКО у .active — как
       только шаг заканчивался, чип возвращался к нейтральному тёмному фону
       и терял цвет совсем, оставалась только тонкая нейтральная рамка. Это
       была ошибка модели: цвет — ПОСТОЯННЫЙ признак принадлежности («это
       грамматика» / «это правило N»), не индикатор «сейчас идёт». Теперь
       цвет — прямо на классе is-grammar/is-rule, всегда; .active добавляет
       СВЕЧЕНИЕ (сейчас именно этот шаг играет), не единственный источник
       цвета. */
    /* ИСПРАВЛЕНО (заход 32, «просила раз десять — ввести слово Шаг перед
       названием» — текст УЖЕ был капитализирован с захода 26 («Шаг N.
       Слово»), но text-transform:lowercase здесь молча перебивал это
       визуально обратно в нижний регистр на экране. Просьба не была
       проигнорирована — CSS откатывал результат позже в конвейере
       рендеринга, отсюда и повторявшееся расхождение между тем, что было
       в коде, и тем, что было видно.) */
    .slot-step-chip.is-grammar { background:#CDA84E; color:#2A2D35; }
    .slot-step-chip.is-rule { font-variant-numeric: tabular-nums;
      background:var(--rule-chip-color, #5B7EAE); color:#0F2547; }
    .slot-step-chip.active { border-color:transparent;
      box-shadow: 0 0 0 2px rgba(255,255,255,.55), 0 0 10px 2px rgba(255,255,255,.28); }
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
       умолчанию — серебряный (см. SILVER_COLOR/SILVER_RGB), для мест, где
       инлайн не задан (пауза-осознание перед split, см. заход 8 — было
       золотым, читалось как та же ошибка «Е становится оранжевым»). */
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
    /* Рамка-подчёркивание под группой-нимиттой (заход 9) — нейтральный
       GROUP_COLOR, не фонетический; opacity управляется из JS покадрово
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
    /* ПЕРЕНЕСЕНО (заход 12) из test-slot-engine.html — единственный стиль,
       остававшийся вне движка, до сих пор жил в каждой HTML-странице
       примера отдельно. Риск был реальный: новый пример (например āsīt),
       забыв скопировать этот блок, получил бы полностью невидимые
       бегущие волны influence — без единой ошибки в консоли, молча.
       Теперь здесь, как и всё остальное — новому примеру ничего копировать
       не нужно. Цвет border ставится инлайном из spawnWave (по умолчанию
       серебряный, см. SILVER_COLOR/SILVER_RGB) — то, что ниже, только
       фолбэк на случай, если стиль применится на долю кадра раньше инлайна. */
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
