// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — базовый слой: константы, токенизатор, цвета, плавность.
// Часть модульного разбиения slot-engine.js (Стадия 5 профессионализации) —
// см. slot-engine.js (точка входа, реэкспортирует все модули) и CLAUDE.md.
// Ничего не импортирует — чистые функции и константы, без THREE/DOM.
// ═══════════════════════════════════════════════════════════════════════════

export const N_SLOTS = 10;
export const CUBE_SIZE = 1.1;
export const SLOT = 1.2;
// Вертикальный "мировой" полу-размер кадра — ОБЩИЙ для всех примеров без
// исключения. Портировано дословно из старых (до общего движка) файлов
// rule3-agnayas.js/rule71-vak-asti.js (там — HALF_WORLD_H), сохраняет тот
// же "характер" камеры, к которому был построен весь визуальный язык —
// то, что делает кубик одного и того же размера между примерами при
// обычной ширине окна (см. halfWorldW/computeFitFov ниже — переменная
// часть кадра, своя под каждый пример, включается только когда мешает).
export const HALF_WORLD_H = 2.3;
// Скорость оборота трансформации — мс на один оборот. Было 1400 (взято из
// T.gunaDur rule3-agnayas.js) — по прямому замечанию пользователя после
// живой проверки agnayas: слишком быстро, «нельзя быстро понять, что
// происходит». Увеличено до 2000 (≈43% медленнее) — первая обоснованная
// прикидка, не финальное число: скорость — визуальное ощущение, а не то,
// что можно проверить численно, ждёт визуального подтверждения на
// СЛЕДУЮЩЕЙ проверке agnayas. ОДНА константа на гунацию И вриддхи —
// вриддхи (spinTurns:2) автоматически получает ту же угловую скорость,
// вдвое дольше по времени (2000×2=4000мс), не отдельно настраиваемое
// число: тот же принцип, каким прямо попросил пользователь («возьми эту
// замедленную скорость и распространи её на вриддхи»).
export const MS_PER_360 = 2000;
export const READY_COLOR = 0xDECDAF; // тот же тёплый бежевый, что и в rule3-agnayas.js
// Золотой (SIGNAL_COLOR) — вриддхи: transform с spinTurns:2, signal:'gold'
// (matsGold, slot-engine-cube.js), её сигнал/кольца золотые — отличие от
// «рядовой» гуны цветовое. Для обычной гуны (и «вот-вот изменится» по
// умолчанию) — SILVER_COLOR, металлический холодный оттенок, не
// пересекается ни с одной категорией алфавитной палитры (vel/pal/ret/den/
// lab) и с READY_COLOR.
export const SIGNAL_COLOR = 0xE8C860; // вриддхи — плоская заливка пока (металлик отложен, см. chalk-module.js)
export const SILVER_COLOR = 0xCDD3D9; // «под влиянием/вот-вот изменится» по умолчанию — металлический блеск
export const SILVER_RGB = '205,211,217'; // тот же тон в rgb-строке — для DOM-колец (spawnWave/spawnPulseRing)
export const GOLD_RGB = '232,200,96'; // тот же тон, что SIGNAL_COLOR, в rgb-строке — для колец вриддхи
// Сустейн-кольца и рамка-подчёркивание группы источников тонируются в ОДИН
// нейтральный цвет (не в собственный фонетический цвет каждого кубика) —
// синхронная группа должна читаться как единое целое, не как несколько
// разных событий рядом. Перекрашивать сами КУБИКИ в общий цвет — вне
// обсуждения (цвет кубика = место образования звука, не роль в слове),
// правило касается только временных индикаторов группы. Цвет — тёплый,
// вне фонетической палитры, не пересекается ни с READY_COLOR, ни с
// SILVER_COLOR, ни с зарезервированным золотом.
export const GROUP_COLOR = 0xE2D9BE;
export const GROUP_RGB = '226,217,190';
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
  // Вриддхи — 720° (вдвое больше гуны, та же ступень огласовки, но выше),
  // signal:'gold' (matsGold, slot-engine-cube.js) — решено и реализовано.
  vrddhi: { spinTurns: 2, signal: 'gold' },
};

/* ═══════════════════ ТОКЕНИЗАТОР ═══════════════════
   Один кубик = один звук. Придыхательные и дифтонги — двухбуквенные в IAST,
   но один звук, один кубик, не разбиваются. Согласный без гласной после него —
   голая буква. Гласная после согласного — всегда отдельный кубик. */
const TWO_CHAR = new Set([
  'kh','gh','ch','jh','ṭh','ḍh','th','dh','ph','bh',
  'ai','au'
]);
const ONE_CHAR = new Set('āīūṛṝḷaeiou' + 'kgṅcjñṭḍṇtdnpbmyrlvśṣsh' + 'ṃḥ');

/** @param {string} word @returns {string[]} */
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
/** @param {number} i @returns {number} */
export function slotX(i) { return (i - (N_SLOTS - 1) / 2) * SLOT; }

/* Единственный источник формулы центрирования — и для centerSlots (автор
   вручную центрирует N букв), и для layoutWords в slot-engine-generate.js
   (несколько слов подряд + зазоры между ними, span считается снаружи). */
/** @param {number} span @returns {number} */
export function centeredStart(span) { return Math.floor((N_SLOTS - span) / 2); }

/* Утилита для автора данных — считает, с какого слота центрировать N букв,
   ПЕРЕД тем как вручную прописывать initial. Не используется в рантайме. */
/** @param {string[]} letters @param {number|null} [startAt] @returns {import('./slot-engine-types.js').InitialItem[]} */
export function centerSlots(letters, startAt = null) {
  const n = letters.length;
  const start = startAt !== null ? startAt : centeredStart(n);
  return letters.map((tr, i) => ({ slot: start + i, tr }));
}

/* Половина мирового габарита ряда по ширине — робастно к нецентрированной
   раскладке (берёт максимум |левого края| и |правого края| от x=0, не
   totalSpan/2 — та формула молча предполагает симметрию и недооценивает
   нужный отступ у смещённых примеров, см. CLAUDE.md про пересчёт камеры).
   margin — запас сверх самих кубиков (0.55 — то же число, что было в
   старых rule3-agnayas.js/rule71-vak-asti.js). */
/** @param {number} minSlot @param {number} maxSlot @param {number} [margin] @returns {number} */
export function halfWorldW(minSlot, maxSlot, margin = 0.55) {
  const leftEdge = slotX(minSlot) - CUBE_SIZE / 2;
  const rightEdge = slotX(maxSlot) + CUBE_SIZE / 2;
  return Math.max(Math.abs(leftEdge), Math.abs(rightEdge)) + margin;
}

// ОБЩАЯ для всех примеров ширина — кубик должен быть ОДНОГО размера во
// всех примерах при любой ширине окна, не только на широком экране, эталон
// размера задаёт максимально заполненный случай (сейчас это rule70/
// taddhiraṇyam, который занимает весь стенд, 0..N_SLOTS-1). НЕ считается
// заново под каждый пример (halfWorldW(minSlot,maxSlot) выше остаётся
// доступна как раздельная утилита) — используется ОДНА и та же константа
// всегда, ровно так же, как HALF_WORLD_H, вместе они и дают неизменный
// "характер" камеры.
export const HALF_WORLD_W_MAX = halfWorldW(0, N_SLOTS - 1);

/* Адаптивный FOV. HALF_WORLD_H и (обычно) hw=HALF_WORLD_W_MAX — ОБА общие
   константы, не зависят от того, какой пример сейчас показан: при
   обычном/широком окне они определяют camera.fov ОДИНАКОВЫЙ у всех
   примеров без исключения (см. CLAUDE.md — прямое требование, кубик
   одного размера везде, эталон — максимально заполненный случай).
   При сужении окна FOV растёт для всех примеров ОДИНАКОВО (общие входные
   числа → общий результат) — целиком сцена масштабируется как одно целое,
   ни один пример не мельчает и не крупнеет относительно другого. baseFov —
   нижняя граница (тот же 32°, что был раньше жёстко зашит в
   PerspectiveCamera). Принимает `hw` параметром, не жёстко HALF_WORLD_W_MAX
   изнутри — чистая функция, testable отдельно от константы. */
/** @param {number} aspect @param {number} camZ @param {number} hw @param {number} [baseFov] @returns {number} */
export function computeFitFov(aspect, camZ, hw, baseFov = 32) {
  const fovForHeight = 2 * Math.atan(HALF_WORLD_H / camZ) * 180 / Math.PI;
  const fovForWidth = 2 * Math.atan(hw / (camZ * aspect)) * 180 / Math.PI;
  return Math.max(baseFov, fovForHeight, fovForWidth);
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

/** @param {string} tr @returns {number} */
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
/** @param {number} hex @returns {string} строка "R,G,B" — тот же тон, заметно светлее */
export function ringColorFrom(hex) {
  const [h, s, l] = hexToHsl(hex);
  return hslToRgbStr(h, Math.min(1, s + 0.25), Math.min(0.86, l + 0.22)); // тот же тон, заметно светлее
}

/** @param {number} t @returns {number} t, ограниченный диапазоном [0,1] */
export function clamp01(t) { return Math.max(0, Math.min(1, t)); }
/** @param {number} a @param {number} b @param {number} t @returns {number} */
export function lerp(a, b, t) { return a + (b - a) * t; }
/** @param {number} t @returns {number} */
export function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
// добавлено (плавность): мягкий разгон И торможение — там, где раньше
// движение стартовало сразу на полной скорости (easeOutCubic в t=0 имеет
// не нулевую производную, отсюда «рывок» в начале хода).
/** @param {number} t @returns {number} */
export function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
// медленный старт, ускоряющееся исчезновение — читается как растворение
// (elide), не механическое схлопывание.
/** @param {number} t @returns {number} */
export function easeInCubic(t) { return t * t * t; }
/** @param {number} t @returns {number} */
export function easeOutBack(t) { const s = 2.4; return 1 + s * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); }
// НАСТОЯЩАЯ 0→1 функция с перелётом-и-пружинкой (стандартная формула
// Пеннера, c1/c3 — РАЗНЫЕ коэффициенты). НЕ то же самое, что easeOutBack
// выше — та спроектирована специально под связку `shift*(1-te)` в
// applyApproach (там f(0)=1, f(1)=1, горб посередине — не 0→1 прогресс) и
// для прямого lerp(from,to,t) не годится (реальный найденный баг при
// разработке applyBud: клон мгновенно оказывался в точке назначения на
// t=0, потому что easeOutBack(0)=1, а не 0). Эта функция — для любого
// будущего места, где нужен настоящий 0→1 прогресс с лёгким перелётом.
/** @param {number} t @returns {number} */
export function easeOutBackProgress(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
/** @param {number} t @returns {number} */
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
/** @param {number} t @returns {number} */
export function easeFall(t) { return easeOutBounce(t); }

// setOpacity — общая THREE-утилита (duck-typed, THREE сама не импортируется):
// mesh.material бывает как одним материалом, так и массивом (BoxGeometry,
// 6 граней) — единое место, не дублируется в каждой apply*-функции.
/** @param {import('three').Mesh} mesh @param {number} val */
export function setOpacity(mesh, val) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(m => { m.opacity = val; });
}
