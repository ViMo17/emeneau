// Пример «agni- + guṇa + -as → agnayas» для правила 3 (внутренние сандхи · гласные).
// Модуль mount()/unmount() — встраивается в контейнер #anim-tiles тренажёра v19.
// Логика анимации не менялась при переносе — изменены только точки входа/выхода
// (создание DOM внутри container вместо document.getElementById, отмена rAF и
// resize-подписки в unmount(), общая утилизация геометрий/материалов через traverse).
import * as THREE from 'three';
import { CW, buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from '../lib/chalk-module.js';

export function mount(container) {
/* ═══════════════════════════ НОВОЕ: СЦЕНА / РАСКАДРОВКА ═══════════════════════════ */

container.innerHTML = `
  <div class="eff-stage">
    <div class="eff-viewport"></div>
    <div class="eff-labels"></div>
  </div>
  <div class="eff-caption"><span class="eff-caption-text">&nbsp;</span></div>
  <div class="eff-legend">
    <span><i style="background:#A8D878"></i> a, g, a (vel)</span>
    <span><i style="background:#7DCFCA"></i> i, e, y (pal)</span>
    <span><i style="background:#E8A8C0"></i> n, s (den)</span>
    <span><i style="background:#E8C860"></i> под гуной</span>
  </div>
`;
const stageEl = container.querySelector('.eff-stage');
const viewportEl = container.querySelector('.eff-viewport');
const labelsEl = container.querySelector('.eff-labels');
const captionTextEl = container.querySelector('.eff-caption-text');
// Подсвечиваем ячейки ЕДИНСТВЕННОЙ таблицы гуна/вриддхи (панель алфавита справа) —
// свою копию таблицы внутри анимации не строим, чтобы не дублировать и не расходиться в стилях.
const cellWI  = document.getElementById('main-cell-w-i');
const cellGE  = document.getElementById('main-cell-g-e');
const cellRWI = cellWI; // строка "слаб" в таблице теперь одна на обе ветки (гуна и полугласный)
const cellRGYA = document.getElementById('main-cell-rg-ya');


const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewportEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const camBase = new THREE.Vector3(0, 1.5, 8.6);
camera.position.copy(camBase);
camera.lookAt(0, -0.35, 0);

const ambient = new THREE.AmbientLight(0xFFF6F8, 0.42);
scene.add(ambient);
const fill = new THREE.DirectionalLight(0xE4E6FF, 0.20);
fill.position.set(6, 3, 7);
scene.add(fill);
const key = new THREE.DirectionalLight(0xFFFCF8, 0.85);
key.position.set(-3, 10, 6);
scene.add(key);

/* мягкое пятно-подложка под рядом кубиков, чтобы сцена не «висела в пустоте» */
function makeGroundTexture(){
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S/2, S*0.34, 0, S/2, S*0.34, S*0.62);
  g.addColorStop(0,   'rgba(80,84,98,0.55)');
  g.addColorStop(0.55,'rgba(60,64,78,0.28)');
  g.addColorStop(1,   'rgba(54,58,68,0)');
  ctx.fillStyle = g; ctx.fillRect(0,0,S,S);
  const tx = new THREE.CanvasTexture(cv);
  tx.encoding = THREE.sRGBEncoding;
  return tx;
}
const groundMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 8),
  new THREE.MeshBasicMaterial({ map: makeGroundTexture(), transparent:true, depthWrite:false, fog:false })
);
groundMesh.rotation.x = -Math.PI/2;
groundMesh.position.set(0, -1.62, -0.6);
scene.add(groundMesh);

const shadowTex = makeShadowBlobTexture();

/* ── буквы слова, слоты, цвета ──
   Все кубики одного размера. Цвет кодирует роль:
   зелёный — основа agni-, персиковый — окончание -as, жёлтый — только
   краткое i (сигнал «эта буква под наблюдением, вот-вот изменится»).
   Как только i гунируется в e, кубик переключается на бирюзовый — тот же
   цвет, что у y и у нового a: e физически «состоит» из a+y, и это видно
   по цвету ещё до того, как оно на них распадётся. */
const CUBE_SIZE = 1.0;
const FLOOR_Y = -1.05;
const REST_Y = FLOOR_Y + CUBE_SIZE/2;
const SLOT = 1.05; // расстояние между слотами
function slotX(i){ return (i - 3) * SLOT; }

// Единая палитра приложения (та же, что у панели алфавита справа и таблицы Гуна/Вриддхи):
// .vel #A8D878 · .pal #7DCFCA · .ret #C5B0D8 · .den #E8A8C0 · .lab #F0BF88
// Гладкая заливка без мела — цвет идёт напрямую, без компенсирующей математики.
const COL_STEM   = 0xA8D878; // agni- — official .vel
const COL_GUNA   = 0xE8C860; // «под гуной» — тот же золотой, что .gv-active
const COL_ENDING = 0xF0BF88; // -as — official .lab
const COL_NEW    = 0x7DCFCA; // e / a(новое) / y — official .pal
const COL_DEN    = 0xE8A8C0; // s — official .den (было ошибочно зелёным на фазе 4, см. ниже)
// Финальный «цвет готовности», фаза 5 — новый стандарт для всех примеров:
// тёплый почти-белый, вне цветового круга категорий, не конфликтует ни с
// .vel/.pal/.ret/.den/.lab, ни с золотым пульсом. Не зелёный — зелёный это
// цвет .vel, уже занят (и именно поэтому старое схождение «в зелёный» ниже
// было неточным для s/y, см. правки в makeDualCube-вызовах).
// Тёплый бежевый, не почти-белый — первая версия (F4F0E6) на экране
// читалась как белый, не как «бежевый, ничей».
const READY_COLOR = 0xDECDAF;

function makeShadowFor(){
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 20),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent:true, depthWrite:false, fog:false })
  );
  shadow.rotation.x = -Math.PI/2;
  shadow.position.set(0, FLOOR_Y + 0.01, 0.05);
  scene.add(shadow);
  return shadow;
}

function makeCube(color, seed, glyph){
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const mats = buildChalkMaterials(color, seed*97+13, glyph);
  const matsReady = buildChalkMaterials(READY_COLOR, seed*97+13, glyph); // фаза 5
  mats.forEach(m => { m.transparent = true; });
  matsReady.forEach(m => { m.transparent = true; });
  const mesh = new THREE.Mesh(geo, mats);
  scene.add(mesh);
  return { mesh, shadow: makeShadowFor(), matsDefault: mats, matsReady };
}

// i живёт в трёх состояниях одной геометрии: сначала оно просто зелёное
// (agni — цельное слово), затем желтеет от импульса (сигнал «гуна начата»),
// затем становится бирюзовым уже как e. Три готовых набора материалов,
// переключаемых целиком — без перерисовки текстуры на лету.
function makeTriCube(colorA, glyphA, colorB, glyphB, colorC, glyphC, seed){
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const matsA = buildChalkMaterials(colorA, seed*97+13, glyphA);
  const matsB = buildChalkMaterials(colorB, seed*97+14, glyphB);
  const matsC = buildChalkMaterials(colorC, seed*97+15, glyphC);
  const matsBlank = buildChalkMaterials(colorC, seed*97+16, null); // на время оборота — без буквы, уже в целевом цвете
  // e (matsC) блёкнет во время "отстойника" — включаем прозрачность заранее
  // на всех наборах, чтобы переключение материала не сбрасывало её.
  [matsA, matsB, matsC, matsBlank].forEach(mats => mats.forEach(m => { m.transparent = true; }));
  const mesh = new THREE.Mesh(geo, matsA);
  scene.add(mesh);
  return { mesh, shadow: makeShadowFor(), matsA, matsB, matsC, matsBlank };
}

function setCubeOpacity(mats, val){
  mats.forEach(m => { m.opacity = val; });
}

// Притенение неактивных букв — экстраполировано с правила 71 (тот же приём,
// та же величина: настоящая opacity 0.22, как в alphabet-highlight-concept.html,
// не цвет). cubes.ie сюда НЕ включаю — у него уже своя opacity-хореография
// для угасания в «отстойнике» (setCubeOpacity выше), два источника прозрачности
// на одном кубике будут конфликтовать.
const DIMMED_OPACITY = 0.22;
function dimCube(cube, mix){
  const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
  mats.forEach(m => { m.transparent = true; m.opacity = THREE.MathUtils.lerp(DIMMED_OPACITY, 1, mix); });
}

// два состояния цвета на одной геометрии и одной букве — для тех кубиков,
// что в конце ролика возвращаются к своему истинному цвету алфавита (не все
// изначально его носят — a2/s стартуют цветом «-as», но a2 по факту гласная
// a = vel, а s — зубной = den, не vel; см. фикс ниже в определении cubes).
function makeDualCube(colorA, colorB, glyph, seed){
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const matsA = buildChalkMaterials(colorA, seed*97+13, glyph);
  const matsB = buildChalkMaterials(colorB, seed*97+14, glyph);
  const matsReady = buildChalkMaterials(READY_COLOR, seed*97+15, glyph); // фаза 5
  [matsA, matsB, matsReady].forEach(mats => mats.forEach(m => { m.transparent = true; }));
  const mesh = new THREE.Mesh(geo, matsA);
  scene.add(mesh);
  return { mesh, shadow: makeShadowFor(), matsA, matsB, matsReady };
}

// порядок в покое: a-g-n-[пусто]-y-a-s — «e» в этот ряд не входит, оно улетает;
// на его место (слот 3) прилетает отдельный новый кубик aNew
const cubes = {
  a1:   { ...makeCube(COL_STEM, 1, 'a'),  slot:0, word:'stem'   },
  g:    { ...makeCube(COL_STEM, 2, 'g'),  slot:1, word:'stem'   },
  n:    { ...makeCube(COL_DEN,  3, 'n'),  slot:2, word:'stem'   }, // n = зубной носовой = den, было ошибочно vel с самого начала
  ie:   { ...makeTriCube(COL_NEW,'i', COL_GUNA,'i', COL_NEW,'e', 4), slot:3, word:'stem' }, // i и e — оба нёбные (место не меняется при гуне), было зелёное i → жёлтое → бирюзовое e; теперь бирюзовое i (верно) → жёлтое → бирюзовое e
  aNew: { ...makeDualCube(COL_NEW, COL_STEM, 'a', 8),   slot:3, word:'new'    }, // прилетает из алфавита взамен e; a = vel, верно
  y:    { ...makeDualCube(COL_NEW, COL_NEW,  'y', 5),   slot:4, word:'new'    }, // y = pal с самого начала — было ошибочно уходило в vel на фазе 4, теперь остаётся собой
  a2:   { ...makeDualCube(COL_STEM, COL_STEM, 'a', 6), slot:5, word:'ending' }, // a = vel с самого начала (было тан-«группа окончания», теперь верный алфавитный цвет с кадра 1)
  s:    { ...makeDualCube(COL_DEN,  COL_DEN,  's', 7), slot:6, word:'ending' }, // s = den с самого начала (было тан-«группа окончания», теперь верный алфавитный цвет с кадра 1)
};

// точки «за кадром», откуда прилетают a и y — сторона алфавитной панели.
// Разнесены немного, чтобы два пути не сливались в один.
const SRC_Y = { x:7.6, y:4.8,  z:-2.2 };
const SRC_A = { x:4.6, y:5.4,  z:-1.4 };

// «отстойник» для e: вверх-влево от своего слота, чуть ближе к камере —
// туда оно поднимается и там блёкнет, пока идёт замена на a+y.
const HOLD_E = { x: slotX(3) - 1.6, y: REST_Y + 1.6, z: 0.4 };

const tagGuna   = document.createElement('div'); tagGuna.className='tag-float';   tagGuna.textContent='гуна: i → e';        labelsEl.appendChild(tagGuna);
const tagAlpha  = document.createElement('div'); tagAlpha.className='tag-float';  tagAlpha.textContent='y ← из алфавита';   labelsEl.appendChild(tagAlpha);
const tagAlphaA = document.createElement('div'); tagAlphaA.className='tag-float'; tagAlphaA.textContent='a ← из алфавита';  labelsEl.appendChild(tagAlphaA);
const tagAlphaE = document.createElement('div'); tagAlphaE.className='tag-float'; tagAlphaE.textContent='e уходит';         labelsEl.appendChild(tagAlphaE);

// «дальнодействие»: волна-пульс бежит от as к i, пока они ещё в 1 кубике друг от друга
function spawnWave(fromVec3, toVec3, dur){
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
  setTimeout(()=>ring.remove(), dur + 80);
}

/* ── таймлайн (мс от старта воспроизведения) ──
   Оба слова с самого начала падают на расстояние «1 кубик» друг от друга.
   На этой дистанции — дальнодействие на i (зелёное, ещё просто часть agni-),
   волна долетает — i желтеет, запускается гунирование i→e. Короткая пауза —
   и as делает шаг вплотную к e: настоящий контакт, запускающий подстановку.
   По контакту e поднимается вверх-влево и блёкнет — «уходит с дороги»,
   ожидая замены, — и повисает там на 2–3 сек, пока a и y прилетают из
   алфавита и занимают её место в строке: одновременно видно неактуальное e
   (в стороне, полупрозрачное) и актуальные a+y (в строке, чёткие). Лишь
   потом e окончательно растворяется, а as, подтолкнутое прилётом y,
   возвращается на дистанцию в 1 кубик. */
const T = {
  // все тайминги ×2 — по тому же решению, что и для правила 71
  stemStart: 0, stemStagger: 260, stemDur: 1300,
  endStart: 2600, endStagger: 300, endDur: 1300,

  influenceStart: 5200, influenceDur: 1300,

  gunaStart: 7100, gunaDur: 1400,

  approach2Start: 9100, approach2Dur: 1100,

  substStart: 10200,
  riseDur: 1000,

  arrivalStart: 11900,
  yInDur: 1500,
  aInOffset: 240, aInDur: 1300,

  pushStart: 13500, pushDur: 860,      // сдвинут за завершение обоих прилётов (было 12400 — начинался на ~1000мс раньше,
                                        // чем aNew/y долетают, три одновременных анимации с разными easing = «дрожание»

  fadeStart: 15200, fadeDur: 900,

  settleStart: 16500, settleDur: 1700,
  readyStart: 19000, readyDur: 1700,   // фаза 5 — новая: волна докрашивает в READY_COLOR
  total: 21200,
};
const NEAR_OFFSET = 0;      // "1 кубик от соседа" — расстояние по умолчанию между блоками
const TOUCH_SHIFT = SLOT;   // вплотную к e = сдвиг на 1 слот влево от NEAR
const WAVE_TRAVEL_MS = 1100; // ×2, время в пути одной волны-пульса от as до i

function clamp01(t){ return Math.max(0, Math.min(1, t)); }
function lerp(a,b,t){ return a+(b-a)*t; }
function easeOutCubic(t){ return 1-Math.pow(1-t,3); }
function easeOutBounce(t){
  const n1=7.5625,d1=2.75;
  if(t<1/d1) return n1*t*t;
  if(t<2/d1) return n1*(t-=1.5/d1)*t+0.75;
  if(t<2.5/d1) return n1*(t-=2.25/d1)*t+0.9375;
  return n1*(t-=2.625/d1)*t+0.984375;
}

let captionTimeoutId = null;
function setCaption(html){
  const el = captionTextEl;
  clearTimeout(captionTimeoutId); // отменяем предыдущий отложенный показ — иначе он может
                                   // «выстрелить» уже после сброса и перезаписать пустую подпись
  el.style.opacity = 0;
  captionTimeoutId = setTimeout(()=>{ el.innerHTML = html; el.style.opacity = 1; }, 180);
}

let playT0 = null;
let flags = {};

function resetScene(){
  flags = {};
  clearTimeout(captionTimeoutId); // та же защита: сброс сцены отменяет любую подпись «в пути»
  captionTextEl.style.opacity = 1;
  captionTextEl.innerHTML = '&nbsp;';
  [tagGuna, tagAlpha, tagAlphaA, tagAlphaE].forEach(t=>t.classList.remove('show'));
  labelsEl.querySelectorAll('.impact-ring, .wave-ring').forEach(n=>n.remove());
  [cellWI, cellGE, cellRWI, cellRGYA].forEach(el=>el?.classList.remove('gv-active'));
  [cubes.a1, cubes.g, cubes.n, cubes.s].forEach(c => dimCube(c, 1)); // сброс притенения перед новым проигрыванием

  for (const key of ['a1','g','n','ie']){
    const c = cubes[key];
    c.mesh.position.set(slotX(c.slot), 6 + Math.random()*2, 0);
    c.mesh.rotation.set(0,0,0);
  }
  ['a1','g','n'].forEach(key => { cubes[key].mesh.material = cubes[key].matsDefault; }); // сброс фазы 5
  cubes.ie.mesh.material = cubes.ie.matsA; // обратно к бирюзовому i (нёбный, верный алфавитный цвет)
  [cubes.ie.matsA, cubes.ie.matsB, cubes.ie.matsC].forEach(mats => setCubeOpacity(mats, 1));

  for (const key of ['a2','s']){
    const c = cubes[key];
    c.mesh.position.set(slotX(c.slot) + NEAR_OFFSET, 6 + Math.random()*2, 0);
    c.mesh.rotation.set(0,0,0);
    c.mesh.material = c.matsA;
  }

  cubes.y.mesh.position.set(SRC_Y.x, SRC_Y.y, SRC_Y.z);
  cubes.y.mesh.rotation.set(0,0,0);
  cubes.y.mesh.material = cubes.y.matsA;
  cubes.y.mesh.visible = false;
  cubes.aNew.mesh.position.set(SRC_A.x, SRC_A.y, SRC_A.z);
  cubes.aNew.mesh.rotation.set(0,0,0);
  cubes.aNew.mesh.material = cubes.aNew.matsA;
  cubes.aNew.mesh.visible = false;
}

function fallY(fromY, toY, elapsed, start, dur){
  const t = clamp01((elapsed-start)/dur);
  if (elapsed < start) return fromY;
  return fromY + (toY-fromY)*easeOutBounce(t);
}

function update(elapsed){
  const ie = cubes.ie;

  // ── падение agni (a g n i), слоты неизменны на весь ролик ──
  ['a1','g','n','ie'].forEach((key,idx)=>{
    const c = cubes[key];
    const start = T.stemStart + idx*T.stemStagger;
    const y = fallY(7, REST_Y, elapsed, start, T.stemDur);
    c.mesh.position.y = y;
  });

  // ── падение as (a s), сразу на дистанцию «1 кубик» от i — сближать
  // отдельным движением больше не нужно ──
  ['a2','s'].forEach((key,idx)=>{
    const c = cubes[key];
    const start = T.endStart + idx*T.endStagger;
    const y = fallY(7, REST_Y, elapsed, start, T.endDur);
    c.mesh.position.y = y;
    if (elapsed < T.approach2Start){
      c.mesh.position.x = slotX(c.slot) + NEAR_OFFSET;
    }
  });

  // подписи после приземления
  if (!flags.stemLanded && elapsed >= T.stemStart + 3*T.stemStagger + T.stemDur){
    flags.stemLanded = true;
    setCaption('agni-');
  }
  if (!flags.endLanded && elapsed >= T.endStart + T.endStagger + T.endDur){
    flags.endLanded = true;
    setCaption('agni- <span style="opacity:.55">+</span> as');
  }

  // ── ШАГ 2: дальнодействие. as ещё не касается i — до него докатываются
  // волны-пульсы, а лёгкая дрожь i показывает, что оно их «чувствует».
  // Как только первая волна долетает — i желтеет: это сигнал «гуна начата».
  // Пока волна в пути, i остаётся зелёным — оно ещё просто часть agni-. ──
  if (elapsed >= T.influenceStart && elapsed <= T.influenceStart + T.influenceDur){
    [0, 440, 880].forEach((offset, i) => {
      const key = 'wave' + i;
      if (!flags[key] && elapsed >= T.influenceStart + offset){
        flags[key] = true;
        spawnWave(
          cubes.a2.mesh.position.clone().add(new THREE.Vector3(0,0.1,0)),
          ie.mesh.position.clone().add(new THREE.Vector3(0,0.1,0)),
          WAVE_TRAVEL_MS
        );
      }
    });
    const t = clamp01((elapsed - T.influenceStart)/T.influenceDur);
    ie.mesh.rotation.z = Math.sin(elapsed*0.0125) * 0.05 * Math.sin(t*Math.PI);
  }
  if (!flags.turnYellow && elapsed >= T.influenceStart + WAVE_TRAVEL_MS){
    flags.turnYellow = true;
    ie.mesh.material = ie.matsB; // зелёное i → жёлтое i: волна долетела, гуна запускается
  }
  if (elapsed > T.influenceStart + T.influenceDur){
    if (elapsed < T.gunaStart) ie.mesh.rotation.z = 0;
  }

  // ── ШАГ 3: гунирование i → e. Подскок + один оборот по часовой стрелке;
  // в середине движения кубик переключается с жёлтого (i) на бирюзовый (e).
  // На время оборота i отъезжает чуть вправо — слева впритык стоит n
  // (зазор 0.05), а по диагонали куб «выступает» дальше своей плоской
  // грани и на повороте задевал бы соседа. ──
  if (elapsed >= T.gunaStart && elapsed <= T.gunaStart + T.gunaDur){
    if (!flags.gunaTagShown){
      flags.gunaTagShown = true;
      ie.mesh.rotation.z = 0;
      tagGuna.classList.add('show');
      cellWI?.classList.add('gv-active');
      cellGE?.classList.add('gv-active');
      ie.mesh.material = ie.matsBlank; // с началом оборота буква пропадает — не мелькает жёлтая i
    }
    const t = clamp01((elapsed - T.gunaStart)/T.gunaDur);
    const clearance = Math.sin(t*Math.PI) * 0.35;
    ie.mesh.position.x = slotX(ie.slot) + clearance;
    ie.mesh.position.y = REST_Y + Math.sin(t*Math.PI) * 0.34;
    ie.mesh.rotation.y = CW * easeOutCubic(t) * Math.PI * 2;
    // e наносится рано — почти сразу после начала оборота, и едет
    // вместе с гранью через всё оставшееся вращение
    if (!flags.gunaLabelSwap && t >= 0.15){
      flags.gunaLabelSwap = true;
      ie.mesh.material = ie.matsC; // пусто → бирюзовое e (тот же цвет, что y)
    }
  }
  if (elapsed > T.gunaStart + T.gunaDur && elapsed < T.approach2Start){
    // на последнем кадре оборота t редко попадает ровно в 1 — снимаем
    // накопленную погрешность явно, чтобы куб не «застывал» под углом
    ie.mesh.rotation.y = 0;
    ie.mesh.position.x = slotX(ie.slot);
  }
  if (elapsed > T.gunaStart + T.gunaDur){
    if (!flags.gunaTagHide){ flags.gunaTagHide = true; tagGuna.classList.remove('show'); }
    if (elapsed < T.substStart){
      cellWI?.classList.remove('gv-active');
      cellGE?.classList.remove('gv-active');
    }
  }

  // ── ШАГ 4: as делает второй, короткий шаг — вплотную к e. Это уже
  // настоящий контакт: по прибытии запускается сама подстановка. ──
  if (elapsed >= T.approach2Start && elapsed < T.pushStart){
    const t = clamp01((elapsed - T.approach2Start)/T.approach2Dur);
    const te = easeOutCubic(t);
    ['a2','s'].forEach(key=>{
      const c = cubes[key];
      const from = slotX(c.slot) + NEAR_OFFSET;
      const to = slotX(c.slot) - TOUCH_SHIFT;
      c.mesh.position.x = lerp(from, to, te);
    });
  }

  // ── ШАГ 5: по контакту — вся подстановка разом. e поднимается вверх-влево
  // и блёкнет, «уходя с дороги» и ожидая замены; там, полупрозрачное, оно
  // повисает на 2–3 сек, пока a и y прилетают из алфавита и встают в строку.
  // Всё это время видно ОБА состояния сразу: неактуальное e в стороне и
  // актуальные a+y на месте — это и есть замена, зафиксированная взглядом. ──
  if (elapsed >= T.substStart){
    if (!flags.substHl){
      flags.substHl = true;
      cellRWI?.classList.add('gv-active');
      cellRGYA?.classList.add('gv-active');
    }

    // e поднимается вверх-влево, блёкнет до полупрозрачности
    const tr = clamp01((elapsed - T.substStart)/T.riseDur);
    if (tr > 0){
      const tre = easeOutCubic(tr);
      ie.mesh.position.set(
        lerp(slotX(ie.slot), HOLD_E.x, tre),
        lerp(REST_Y, HOLD_E.y, tre),
        lerp(0, HOLD_E.z, tre)
      );
      // (без наклона — зависает строго горизонтально)
      setCubeOpacity(ie.matsC, lerp(1, 0.55, tre));
      if (!flags.eTagShown){ flags.eTagShown = true; tagAlphaE.classList.add('show'); }
      if (!flags.eTagHide && tr >= 0.9){ flags.eTagHide = true; tagAlphaE.classList.remove('show'); }
      if (!flags.holdCaption && tr >= 1){
        flags.holdCaption = true;
        setCaption('e <span style="opacity:.5">заменяется на</span> a + y');
      }
    }

    // пока висит в стороне — едва заметное покачивание, чтобы не выглядело "зависшим насмерть"
    if (elapsed >= T.substStart + T.riseDur && elapsed < T.fadeStart){
      const idle = (elapsed - (T.substStart + T.riseDur)) * 0.0022;
      ie.mesh.position.y = HOLD_E.y + Math.sin(idle) * 0.06;
    }

    // новое a прилетает
    if (elapsed >= T.arrivalStart + T.aInOffset){
      cubes.aNew.mesh.visible = true;
      const ta = clamp01((elapsed - (T.arrivalStart + T.aInOffset))/T.aInDur);
      const tae = easeOutCubic(ta);
      const arcA = Math.sin(ta*Math.PI) * 0.9;
      cubes.aNew.mesh.position.set(
        lerp(SRC_A.x, slotX(cubes.aNew.slot), tae),
        lerp(SRC_A.y, REST_Y, tae) + arcA,
        lerp(SRC_A.z, 0, tae)
      );
      if (!flags.aTagShown){ flags.aTagShown = true; tagAlphaA.classList.add('show'); }
      if (!flags.aTagHide && ta >= 0.85){ flags.aTagHide = true; tagAlphaA.classList.remove('show'); }
    }

    // y прилетает
    if (elapsed >= T.arrivalStart){
      cubes.y.mesh.visible = true;
      const ty = clamp01((elapsed - T.arrivalStart)/T.yInDur);
      const tye = easeOutCubic(ty);
      const arcY = Math.sin(ty*Math.PI) * 1.3;
      cubes.y.mesh.position.set(
        lerp(SRC_Y.x, slotX(cubes.y.slot), tye),
        lerp(SRC_Y.y, REST_Y, tye) + arcY,
        lerp(SRC_Y.z, 0, tye)
      );
      if (!flags.flyTagShown){ flags.flyTagShown = true; tagAlpha.classList.add('show'); }
      if (!flags.flyTagHide && ty >= 0.85){ flags.flyTagHide = true; tagAlpha.classList.remove('show'); }
    }

    // финальное растворение e — только теперь, после долгой паузы для сравнения
    if (elapsed >= T.fadeStart){
      const tf = clamp01((elapsed - T.fadeStart)/T.fadeDur);
      setCubeOpacity(ie.matsC, lerp(0.55, 0, tf));
    }
  }

  // ── as отодвигается назад: y на подлёте «отталкивает» его к дистанции в 1 кубик ──
  if (elapsed >= T.pushStart){
    const t = clamp01((elapsed - T.pushStart)/T.pushDur);
    const te = easeOutCubic(t);
    ['a2','s'].forEach(key=>{
      const c = cubes[key];
      const from = slotX(c.slot) - TOUCH_SHIFT;
      const to = slotX(c.slot) + NEAR_OFFSET;
      c.mesh.position.x = lerp(from, to, te);
    });
  }

  // ── итог: слово собрано. Импульс-волна пробегает по всей строке слева
  // направо — каждый кубик коротко подпрыгивает, когда волна его проходит,
  // и четыре пришедших не-зелёными в этот миг зеленеют. Вращения здесь нет:
  // оборот зарезервирован под преобразования, а тут просто «замок защёлкнулся»
  // и слово стало однородным. ──
  if (!flags.finalCaption && elapsed >= T.settleStart){
    flags.finalCaption = true;
    setCaption('agnayas <span class="gloss">«огни» · N. pl. m.</span>');
  }
  // слева направо в порядке строки; matsB есть только у пришедших не-зелёными
  const LOCK_WAVE = [
    { cube: cubes.a1 }, { cube: cubes.g }, { cube: cubes.n },
    { cube: cubes.aNew }, { cube: cubes.y }, { cube: cubes.a2 }, { cube: cubes.s },
  ];
  const LOCK_STEP = 150;   // ×2, сдвиг импульса от кубика к кубику
  const LOCK_HOP  = 520;  // ×2, длительность подскока одного кубика
  // снятие затенения / переход к истинному алфавитному цвету — БЕЗ бегущей
  // волны, все семь кубиков разом (было — волна с подскоком, читалось как
  // «дрожание»; убрано по запросу, волна остаётся только у фазы 5 ниже)
  if (elapsed >= T.settleStart && !flags.settled){
    flags.settled = true;
    LOCK_WAVE.forEach(({cube}) => { if (cube.matsB) cube.mesh.material = cube.matsB; });
  }
  if (elapsed > T.settleStart + T.settleDur){
    cellRWI?.classList.remove('gv-active');
    cellRGYA?.classList.remove('gv-active');
  }

  // фаза 5 — «слово готово»: отдельная волна ПОСЛЕ оседания (не вместе с ним),
  // докрашивает весь ряд в READY_COLOR. Та же геометрия волны, что и LOCK_WAVE
  // выше, просто сдвинута на T.readyStart и с другой целью свапа материала.
  LOCK_WAVE.forEach(({cube}, i) => {
    const start = T.readyStart + i*LOCK_STEP;
    if (elapsed >= start && elapsed <= start + LOCK_HOP){
      const t = clamp01((elapsed - start)/LOCK_HOP);
      cube.mesh.position.y = REST_Y + Math.sin(t*Math.PI) * 0.12;
      const key = 'ready' + i;
      if (!flags[key] && t >= 0.4){
        flags[key] = true;
        if (cube.matsReady) cube.mesh.material = cube.matsReady;
      }
    }
  });

  // притенение фона: a1/g/n/s гаснут вскоре после начала влияния (as → i),
  // держат внимание на активной паре (a2=nimitta, ie=sthānin), возвращаются
  // к полной яркости синхронно с LOCK_WAVE выше — тем же движением, что подскок
  // притенение фона: a1/g/n/s гаснут вскоре после начала влияния (as → i),
  // держат внимание на активной паре (a2=nimitta, ie=sthānin), возвращаются
  // к полной яркости все разом при снятии затенения (без волны, см. выше)
  const DIM_RAMP = 700;
  const DIM_BG = [cubes.a1, cubes.g, cubes.n, cubes.s];
  DIM_BG.forEach((cube) => {
    let mix = 1;
    if (elapsed >= T.influenceStart) mix = 1 - clamp01((elapsed - T.influenceStart) / DIM_RAMP);
    if (elapsed >= T.settleStart) mix = clamp01((elapsed - T.settleStart) / T.settleDur);
    dimCube(cube, mix);
  });
}

function project(vec3){
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const v = vec3.clone().project(camera);
  return { x: (v.x*0.5+0.5)*w, y: (-v.y*0.5+0.5)*h };
}

function updateTags(){
  const off = new THREE.Vector3(0, CUBE_SIZE*0.5+0.35, 0);
  const p1 = project(cubes.ie.mesh.position.clone().add(off));
  tagGuna.style.left = p1.x + 'px';
  tagGuna.style.top = p1.y + 'px';
  const p2 = project(cubes.y.mesh.position.clone().add(off));
  tagAlpha.style.left = p2.x + 'px';
  tagAlpha.style.top = p2.y + 'px';
  const p3 = project(cubes.aNew.mesh.position.clone().add(off));
  tagAlphaA.style.left = p3.x + 'px';
  tagAlphaA.style.top = p3.y + 'px';
  const p4 = project(cubes.ie.mesh.position.clone().add(off));
  tagAlphaE.style.left = p4.x + 'px';
  tagAlphaE.style.top = p4.y + 'px';
}

function updateShadows(){
  for (const key of Object.keys(cubes)){
    const c = cubes[key];
    c.shadow.visible = c.mesh.visible;
    c.shadow.position.x = c.mesh.position.x + 0.08;
    c.shadow.position.z = c.mesh.position.z + 0.05;
    const heightAbove = Math.max(0, c.mesh.position.y - FLOOR_Y);
    const heightK = Math.max(0.35, 1 - heightAbove*0.14);
    const matOpacity = Array.isArray(c.mesh.material) ? c.mesh.material[0].opacity : 1;
    c.shadow.scale.setScalar(heightK);
    c.shadow.material.opacity = heightK * matOpacity;
  }
}

const BASE_FOV = 32;       // минимальный fov — используется как пол на случай очень широких контейнеров
const HALF_WORLD_W = 4.2;  // половина ширины сцены, которая обязана быть видна:
                            // 7 кубиков по SLOT=1.05 (=6.3) + по полкубика по краям (+1.0) + запас
const HALF_WORLD_H = 2.3;  // половина высоты сцены относительно точки взгляда камеры (-0.35):
                            // кубик e подскакивает до HOLD_E.y≈1.05, снизу пол на REST_Y≈-0.55 — плюс запас

function resize(){
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  if (w === 0 || h === 0) return; // контейнер временно скрыт (display:none) — размера ещё нет
  renderer.setSize(w, h, false);
  const aspect = w/h;
  camera.aspect = aspect;
  // Раньше здесь боролись только за ширину — из-за этого на широких контейнерах (как в v19)
  // камера отъезжала намного дальше, чем нужно по высоте, и кубики выглядели мелкими посреди
  // пустого пространства. Теперь считаем оба ограничения и берём то, что жёстче для текущих
  // пропорций: на широкой сцене это высота (кубики заполняют её, по бокам естественные поля),
  // на узкой — по-прежнему ширина (ничего не обрезается).
  const fovForHeight = THREE.MathUtils.radToDeg(2 * Math.atan(HALF_WORLD_H / camBase.z));
  const fovForWidth  = THREE.MathUtils.radToDeg(2 * Math.atan(HALF_WORLD_W / (camBase.z * aspect)));
  camera.fov = Math.max(BASE_FOV, fovForHeight, fovForWidth);
  camera.updateProjectionMatrix();
}
// ResizeObserver вместо window.resize — реагирует и на изменение окна,
// и на изменение самого контейнера (например смену раскладки соседних панелей v19)
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(stageEl);

let rafId = null;
function frame(now){
  rafId = requestAnimationFrame(frame);
  if (playT0 !== null){
    const elapsed = now - playT0;
    update(Math.min(elapsed, T.total + 200));
  }
  camera.position.copy(camBase);
  updateTags();
  updateShadows();
  renderer.render(scene, camera);
}

function play(){
  resetScene();
  playT0 = performance.now();
}

resize();
resetScene();
rafId = requestAnimationFrame(frame);
const startTimeoutId = setTimeout(play, 400);

function unmount(){
  resizeObserver.disconnect();
  if (rafId !== null) cancelAnimationFrame(rafId);
  clearTimeout(startTimeoutId);
  clearTimeout(captionTimeoutId);

  // общая утилизация: обходим сцену и освобождаем всё, что держит GPU-память
  // (геометрии, текстуры каждого материала, сами материалы)
  scene.traverse(obj => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => {
        ['map','bumpMap','roughnessMap'].forEach(k => { if (m[k]) m[k].dispose(); });
        m.dispose();
      });
    }
  });
  renderer.dispose();
  container.innerHTML = '';
}

return { replay: play, unmount };
}
