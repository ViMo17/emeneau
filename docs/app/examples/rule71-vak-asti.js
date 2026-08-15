// Пример «vāk asti → vāg asti» для правила 71 (внешние сандхи · взрывные,
// озвончение по звонкости соседа). Первый пример ВНЕШНИХ сандхи в тренажёре —
// пилот для класса "два слова, граница между ними не схлопывается".
// Механика поворота (двухсторонняя покраска торцевых граней, смена материала
// на t=0.15 от начала оборота, пока видимая грань ещё пустая) перенесена из
// раннего прототипа docs/effects/rule-assimilation-varga-t-d.html (t→d) —
// тот же класс эффекта, что и здесь (k→g), проверено по коду, не по памяти.
import * as THREE from 'three';
import { CW, paintGlyph, buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture } from '../lib/chalk-module.js';

export function mount(container) {

container.innerHTML = `
  <div class="eff-stage">
    <div class="eff-viewport"></div>
    <div class="eff-labels"></div>
  </div>
  <div class="eff-caption"><span class="eff-caption-text">&nbsp;</span></div>
  <div class="eff-legend">
    <span><i style="background:#A8D878"></i> vāk / a (vel)</span>
    <span><i style="background:#F0BF88"></i> v (lab)</span>
    <span><i style="background:#E8A8C0"></i> s, t (den)</span>
    <span><i style="background:#7DCFCA"></i> i (pal)</span>
  </div>
`;
const stageEl = container.querySelector('.eff-stage');
const viewportEl = container.querySelector('.eff-viewport');
const labelsEl = container.querySelector('.eff-labels');
const captionTextEl = container.querySelector('.eff-caption-text');
// В отличие от agnayas (внутренние сандхи, гуна/вриддхи) это внешние сандхи —
// таблица гуна/вриддхи тут ни при чём, подсвечивать нечего.

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewportEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();

// Камера — те же camBase/lookAt, что в rule3-agnayas.js. Не подбирала заново:
// одинаковый камера-«характер» на разных примерах — это и есть кубик
// одинакового размера между примерами, к которому шли с самого начала.
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

/* ── буквы, слоты, цвета ──
   Единая палитра приложения — та же, что у панели алфавита справа:
   .vel #A8D878 · .pal #7DCFCA · .ret #C5B0D8 · .den #E8A8C0 · .lab #F0BF88.
   k и g — оба vel (место образования не меняется, меняется только звонкость),
   поэтому цвет sthānin-кубика не меняется вообще, меняется только буква. */
const CUBE_SIZE = 1.0;
const FLOOR_Y = -1.05;
const REST_Y = FLOOR_Y + CUBE_SIZE/2;
const SLOT = 1.05;          // между буквами внутри слова — как в rule3-agnayas.js
const WORD_GAP = 1.0;       // === граница слова === доп. полный кубик, НЕ схлопывается
                             // ни до, ни после перехода (в отличие от внутренних сандхи)

const COL_VEL = 0xA8D878, COL_LAB = 0xF0BF88, COL_DEN = 0xE8A8C0, COL_PAL = 0x7DCFCA;
// Финальный «цвет готовности» — новый стандарт для всех примеров впредь:
// тёплый почти-белый, сознательно вне цветового круга категорий (vel/pal/
// ret/den/lab), поэтому не конфликтует ни с одной из них. Не зелёный —
// зелёный это цвет .vel, уже занят.
const READY_COLOR = 0xF4F0E6;

// Затемнение неактивных букв: MeshStandardMaterial.color умножается на карту
// текстуры — можно приглушить кубик, просто перекрасив .color в серый тон,
// Приглушение — НЕ цвет (как было раньше), а настоящая прозрачность: точно
// то же значение, что и в alphabet-highlight-concept.html (.dimmed{opacity:.22}),
// который вы прислали как эталон. mix=1 — обычный вид, mix=0 → opacity=0.22.
const DIMMED_OPACITY = 0.22;
function tintCube(cube, mix){
  const mats = Array.isArray(cube.mesh.material) ? cube.mesh.material : [cube.mesh.material];
  const op = THREE.MathUtils.lerp(DIMMED_OPACITY, 1, mix);
  mats.forEach(m => { m.transparent = true; m.opacity = op; });
}

function slotX(i, wordBreakAfter){
  // wordBreakAfter — индекс последней буквы первого слова (после неё встаёт WORD_GAP)
  const raw = i <= wordBreakAfter ? i*SLOT : i*SLOT + WORD_GAP;
  return raw;
}
// v(0) ā(1) k(2) | a(3) s(4) t(5) i(6) — разрыв после индекса 2
const RAW = [0,1,2,3,4,5,6].map(i => slotX(i, 2));
const CENTER = (RAW[0] + RAW[6]) / 2;
const X = RAW.map(x => x - CENTER);

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
  const matsReady = buildChalkMaterials(READY_COLOR, seed*97+13, glyph); // фаза 5 — «слово готово»
  const mesh = new THREE.Mesh(geo, mats);
  scene.add(mesh);
  return { mesh, shadow: makeShadowFor(), matsDefault: mats, matsReady };
}
// sthānin (k→g): два готовых набора материалов на одной геометрии + пустой
// на время оборота. Портировано из rule-assimilation-varga-t-d.html: буква
// красится на ОБЕИХ торцевых гранях (это делает сам buildChalkMaterials),
// поэтому неважно, какая грань окажется к зрителю после разворота на 180°.
// sthānin для НАСТОЯЩЕГО поворота на 180° (как в эталоне-ассимиляции: t↔d,
// буква и цвет нанесены сразу на ОБЕ торцевые грани, целиком, заранее) —
// buildChalkMaterials красит только одну грань (idx4), для 180° этого
// недостаточно (см. историю правок), поэтому здесь свой билдер граней,
// тот же paintGlyph, что и в chalk-module.js, просто на обе грани разом.
function buildDualFaceMaterials(hex, glyph){
  const SZ = 256;
  return [0,1,2,3,4,5].map(idx => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = SZ;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#' + hex.toString(16).padStart(6,'0');
    ctx.fillRect(0,0,SZ,SZ);
    if ((idx === 4 || idx === 5) && glyph) paintGlyph(cv, glyph);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({ map:tex, roughness:0.55, metalness:0, envMapIntensity:0, fog:false, transparent:true });
  });
}
function makeSwapCube(color, glyphFrom, glyphTo, seed){
  const geo = makeChalkGeo(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE, seed);
  const matsFrom  = buildDualFaceMaterials(color, glyphFrom);
  const matsBlank = buildDualFaceMaterials(color, null);
  const matsTo    = buildDualFaceMaterials(color, glyphTo);
  const matsReady = buildDualFaceMaterials(READY_COLOR, glyphTo); // фаза 5 — уже после превращения, буква glyphTo
  const mesh = new THREE.Mesh(geo, matsFrom);
  scene.add(mesh);
  return { mesh, shadow: makeShadowFor(), matsFrom, matsBlank, matsTo, matsReady };
}

const cubes = {
  v:  { ...makeCube(COL_LAB, 1, 'v'), slot:0 },
  aa: { ...makeCube(COL_VEL, 2, 'ā'), slot:1 },
  k:  { ...makeSwapCube(COL_VEL, 'k', 'g', 3), slot:2, isSthanin:true },
  a:  { ...makeCube(COL_VEL, 4, 'a'), slot:3, isNimitta:true },
  s:  { ...makeCube(COL_DEN, 5, 's'), slot:4 },
  t:  { ...makeCube(COL_DEN, 6, 't'), slot:5 },
  i:  { ...makeCube(COL_PAL, 7, 'i'), slot:6 },
};
const ORDER = ['v','aa','k','a','s','t','i'];

// nimitta (a) получает перерисовываемую переднюю грань вместо статичной —
// на ней и рисуется кольцо-пульс. Остальные 5 граней куба — обычные.
const aPulseFace = buildPulseFace(COL_VEL, 'a');
cubes.a.mesh.material[4].map?.dispose();
cubes.a.mesh.material[4].dispose();
cubes.a.mesh.material[4] = aPulseFace.material;
cubes.a.pulseFace = aPulseFace;

const tagSthanin = document.createElement('div'); tagSthanin.className='tag-float'; tagSthanin.textContent='sthānin · k → g'; labelsEl.appendChild(tagSthanin);
const tagNimitta = document.createElement('div'); tagNimitta.className='tag-float'; tagNimitta.textContent='nimitta · звонкая a'; labelsEl.appendChild(tagNimitta);

// Цвет кольца — не хардкод (.impact-ring в общем CSS даёт бежевый ringOut),
// а от собственного тона nimitta: тот же hue, светлота и насыщенность подняты.
// Один и тот же приём годится для любой категории (vel/pal/ret/den/lab),
// не только под конкретный пример.
function hexToHsl(hex){
  const r=((hex>>16)&255)/255, g=((hex>>8)&255)/255, b=(hex&255)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  let h,s,l=(max+min)/2;
  if(max===min){h=s=0;} else {
    const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){case r:h=(g-b)/d+(g<b?6:0);break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}
    h/=6;
  }
  return [h,s,l];
}
function hslToRgbStr(h,s,l){
  let r,g,b;
  if(s===0){r=g=b=l;} else {
    const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
    const q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
    r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
  }
  return `${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)}`;
}
function ringColorFrom(hex){
  const [h,s,l] = hexToHsl(hex);
  return hslToRgbStr(h, Math.min(1,s+0.25), Math.min(0.86,l+0.22)); // тот же тон, заметно светлее
}

// ЭТО и есть нужный алгоритм — перенесено дословно из
// rule-assimilation-varga-t-d.html (buildPulseFace/redrawPulseFace): кольцо
// рисуется НА текстуре грани самой nimitta, центр = центр буквы, не летает
// по экрану как DOM-элемент (то, что было раньше — .impact-ring — не то же
// самое, спутала два разных механизма). Упрощено под текущий плоский рендер
// (без старой меловой bump/roughness карты — она уже выведена из проекта).
function buildPulseFace(hex, glyph){
  const SZ = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + hex.toString(16).padStart(6,'0');
  ctx.fillRect(0,0,SZ,SZ);
  const baseCv = document.createElement('canvas');
  baseCv.width = baseCv.height = SZ;
  baseCv.getContext('2d').drawImage(cv,0,0); // чистая заливка, эталон для перерисовки каждый кадр
  if (glyph) paintGlyph(cv, glyph);
  const tex = new THREE.CanvasTexture(cv);
  tex.encoding = THREE.sRGBEncoding;
  const material = new THREE.MeshStandardMaterial({ map:tex, roughness:0.55, metalness:0, envMapIntensity:0, fog:false });
  return { material, canvas:cv, baseCanvas:baseCv, glyph };
}
// radiusFrac — доля от полуширины грани (0..1); null — чистое состояние без кольца
function redrawPulseFace(pf, radiusFrac, alpha, ringRgb){
  const sz = pf.canvas.width;
  const ctx = pf.canvas.getContext('2d');
  ctx.clearRect(0,0,sz,sz);
  ctx.drawImage(pf.baseCanvas,0,0);
  if (radiusFrac !== null){
    const cx=sz/2, cy=sz/2, r=Math.max(1, radiusFrac*(sz/2));
    ctx.save();
    ctx.filter = `blur(${sz*0.024}px)`;
    ctx.strokeStyle = `rgba(${ringRgb},${alpha})`;
    ctx.lineWidth = sz*0.05;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
    ctx.restore();
  }
  if (pf.glyph) paintGlyph(pf.canvas, pf.glyph);
  pf.material.map.needsUpdate = true;
}
const PULSE_PERIOD = 3400; // = ×2 от периода в оригинале (было 1700)

// Второй, отдельный слой влияния — бегущие кольца dh→t (в оригинале — DOM
// .wave-ring с --dx/--dy, отдельно от кольца-пульса на грани). Работают
// ОБА слоя одновременно, не один вместо другого — это я упустила раньше.
// .wave-ring уже есть в общем CSS хоста (используется под правило 3), но
// там цвет захардкожен золотым под agnayas — здесь переопределяю инлайном
// под тон nimitta, тем же ringColorFrom().
function spawnWave(fromVec3, toVec3, dur, rgbStr){
  const pA = project(fromVec3.clone().add(new THREE.Vector3(0,0.1,0)));
  const pB = project(toVec3.clone().add(new THREE.Vector3(0,0.1,0)));
  const ring = document.createElement('div');
  ring.className = 'wave-ring';
  ring.style.left = pA.x + 'px';
  ring.style.top = pA.y + 'px';
  ring.style.setProperty('--dx', (pB.x - pA.x) + 'px');
  ring.style.setProperty('--dy', (pB.y - pA.y) + 'px');
  ring.style.setProperty('--wave-dur', dur + 'ms');
  ring.style.borderColor = `rgba(${rgbStr},0.9)`;
  ring.style.boxShadow = `0 0 10px 1px rgba(${rgbStr},0.35)`;
  labelsEl.appendChild(ring);
  setTimeout(()=>ring.remove(), dur + 80);
}

/* ── таймлайн ──
   Оба слова падают сразу в конечные позиции, разрыв WORD_GAP виден с самого
   начала и остаётся видимым всегда (это внешние сандхи — слова не сливаются
   в одно). Пауза — затем две волны-пульса a → k (дальнодействие через
   разрыв). Поворот k: материал сразу пустеет (буква пропадает, ещё не видно
   какая — грань пуста), на t=0.15 от начала оборота подставляется набор с g
   (ПРОВЕРЕНО по коду прототипа: не «3/4 осталось», а именно 0.15). Затем
   единая волна-оседание по всему ряду — WORD_GAP не схлопывается никогда. */
const T = {
  // все тайминги ×2 — по просьбе, быстрая анимация не давала сосредоточиться
  fallStart: 0, fallStagger: 180, fallDur: 1300,
  rolesStart: 3000,
  influenceStart: 4200, influenceDur: 1120,   // = ×2 от проверенных значений оригинала (было 560)
  turnStart: 7200, turnDur: 3000,
  settleStart: 10800, settleDur: 1600,
  readyStart: 13000, readyDur: 1300,          // фаза 5 — новая: волна докрашивает в READY_COLOR
  total: 15300,
};
const SWAP_AT = 0.15; // = проверенное значение из rule-assimilation-varga-t-d.html; работает
                       // теперь, когда обе торцевые грани куба несут одну и ту же букву

function clamp01(t){ return Math.max(0, Math.min(1, t)); }
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
  clearTimeout(captionTimeoutId);
  el.style.opacity = 0;
  captionTimeoutId = setTimeout(()=>{ el.innerHTML = html; el.style.opacity = 1; }, 180);
}

let playT0 = null;
let flags = {};

function resetScene(){
  flags = {};
  clearTimeout(captionTimeoutId);
  captionTextEl.style.opacity = 1;
  captionTextEl.innerHTML = '&nbsp;';
  [tagSthanin, tagNimitta].forEach(t=>t.classList.remove('show'));
  redrawPulseFace(cubes.a.pulseFace, null, 0, ringColorFrom(COL_VEL)); // чистая грань перед новым проигрыванием
  labelsEl.querySelectorAll('.wave-ring').forEach(n=>n.remove());
  ORDER.forEach(key => tintCube(cubes[key], 1)); // сброс приглушения перед новым проигрыванием

  ORDER.forEach((key,i) => {
    const c = cubes[key];
    c.mesh.position.set(X[i], 6 + Math.random()*2, 0);
    c.mesh.rotation.set(0,0,0);
    c._y0 = c.mesh.position.y; // стартовая высота падения фиксируется сразу здесь, не в update()
    if (c.matsDefault) c.mesh.material = c.matsDefault; // сброс фазы 5 перед новым проигрыванием
  });
  cubes.k.mesh.material = cubes.k.matsFrom;
}

function update(elapsed){
  ORDER.forEach((key,i) => {
    const c = cubes[key];
    const start = T.fallStart + i*T.fallStagger;
    const t = clamp01((elapsed - start) / T.fallDur);
    if (elapsed < start) return;
    c.mesh.position.y = THREE.MathUtils.lerp(c._y0, REST_Y, easeOutBounce(t));
  });

  // роли: бейджи появляются, влияние начинается
  if (elapsed >= T.rolesStart && !flags.roles){
    flags.roles = true;
    tagSthanin.classList.add('show');
    tagNimitta.classList.add('show');
  }

  // влияние: непрерывный пульс-кольцо НА грани самой nimitta (не бегущие
  // круги по экрану) — портировано из rule-assimilation-varga-t-d.html:
  // радиус растёт от четверти грани до края, зациклено, с мягким
  // sin-конвертом на вход/выход каждого цикла; гаснет в момент, когда
  // sthānin реально сменил букву (см. блок поворота ниже, flags.swapped).
  const pulseActive = elapsed >= T.rolesStart && !flags.pulseStopped;
  if (pulseActive){
    const cyclePos = ((elapsed - T.rolesStart) % PULSE_PERIOD) / PULSE_PERIOD;
    const radiusFrac = THREE.MathUtils.lerp(0.25, 1.0, cyclePos);
    const envelope = Math.sin(cyclePos * Math.PI);
    redrawPulseFace(cubes.a.pulseFace, radiusFrac, 0.85 * envelope, ringColorFrom(COL_VEL));
  }

  // второй слой влияния — бегущие кольца a → k (см. комментарий у spawnWave)
  if (elapsed >= T.influenceStart && elapsed <= T.influenceStart + T.influenceDur + 520){
    [0, 520].forEach((off, wi) => { // ×2 от офсета оригинала (было 260)
      const fkey = 'wave'+wi;
      if (!flags[fkey] && elapsed >= T.influenceStart + off){
        flags[fkey] = true;
        spawnWave(cubes.a.mesh.position, cubes.k.mesh.position, T.influenceDur, ringColorFrom(COL_VEL));
      }
    });
  }

  // поворот k: настоящий 180° по часовой, буква/цвет наносятся рано и целиком
  // (t=0.15), едут с гранью до конца поворота — как в эталоне-ассимиляции
  // (t→d). Обе торцевые грани несут одну и ту же букву (buildDualFaceMaterials
  // выше), поэтому неважно, какая из них окажется к зрителю после разворота.
  if (elapsed >= T.turnStart && elapsed <= T.turnStart + T.turnDur){
    if (!flags.blanked){ flags.blanked = true; cubes.k.mesh.material = cubes.k.matsBlank; }
    const t = clamp01((elapsed - T.turnStart) / T.turnDur);
    cubes.k.mesh.rotation.y = CW * easeOutCubic(t) * Math.PI; // 180°, как в эталоне (не 360°)
    cubes.k.mesh.position.y = REST_Y + Math.sin(t*Math.PI)*0.16;
    if (!flags.swapped && t >= SWAP_AT){
      flags.swapped = true;
      flags.pulseStopped = true;
      cubes.k.mesh.material = cubes.k.matsTo;
      tagSthanin.classList.remove('show');
      tagNimitta.classList.remove('show');
      redrawPulseFace(cubes.a.pulseFace, null, 0, ringColorFrom(COL_VEL)); // погасить кольцо чисто, без обрыва на середине цикла
    }
  } else if (elapsed > T.turnStart + T.turnDur){
    cubes.k.mesh.rotation.y = 0;
    cubes.k.mesh.position.y = REST_Y;
  }

  // оседание — единая волна по всему ряду; WORD_GAP не схлопывается никогда
  if (elapsed >= T.settleStart){
    const t = clamp01((elapsed - T.settleStart) / T.settleDur);
    ORDER.forEach((key, idx) => {
      const c = cubes[key];
      const wavePos = t * (ORDER.length + 3) - 2;
      const d = wavePos - idx;
      const bounce = (d > 0 && d < 1.4) ? Math.sin(d/1.4*Math.PI) * 0.18 : 0;
      c.mesh.position.y = REST_Y + bounce;
    });
    if (t >= 1 && !flags.captioned){
      flags.captioned = true;
      setCaption('<b>k</b> перед звонкой (гласной <b>a</b>) → <b>g</b> — правило 71');
    }
  }

  // фаза 5 — «слово готово»: отдельная волна (после оседания, не вместе с ним)
  // докрашивает весь ряд в READY_COLOR — единый нейтральный цвет, ни с чем не
  // связанный. WORD_GAP по-прежнему не схлопывается, оба слова красятся заодно.
  if (elapsed >= T.readyStart){
    const t = clamp01((elapsed - T.readyStart) / T.readyDur);
    ORDER.forEach((key, idx) => {
      const c = cubes[key];
      const wavePos = t * (ORDER.length + 3) - 2;
      const d = wavePos - idx;
      const bounce = (d > 0 && d < 1.4) ? Math.sin(d/1.4*Math.PI) * 0.14 : 0;
      c.mesh.position.y = REST_Y + bounce;
      const rkey = 'ready'+idx;
      if (!flags[rkey] && d >= 0.5){ // свап материала в момент, когда волна уже накрыла кубик
        flags[rkey] = true;
        c.mesh.material = c.matsReady;
      }
    });
  }

  // приглушение неактивных букв: внимание должно идти на пару nimitta/sthānin,
  // пока решается переход. Активные (a, k/g) — всегда полный цвет. Остальные
  // гаснут вскоре после появления бейджей ролей и разгораются обратно вместе
  // с волной оседания — тем же движением, что и подскок, не отдельным шагом.
  const DIM_RAMP = 700; // ×2
  ORDER.forEach((key, idx) => {
    const c = cubes[key];
    if (c.isNimitta || c.isSthanin) { tintCube(c, 1); return; }
    let mix = 1;
    if (elapsed >= T.rolesStart) mix = 1 - clamp01((elapsed - T.rolesStart) / DIM_RAMP);
    if (elapsed >= T.settleStart) {
      const t = clamp01((elapsed - T.settleStart) / T.settleDur);
      const wavePos = t * (ORDER.length + 3) - 2;
      const d = wavePos - idx;
      if (d >= 1.4) mix = 1;
      else if (d > 0) mix = Math.max(mix, d/1.4);
    }
    tintCube(c, mix);
  });
}

function updateShadows(){
  ORDER.forEach(key => {
    const c = cubes[key];
    c.shadow.position.x = c.mesh.position.x + 0.08;
    c.shadow.position.z = c.mesh.position.z + 0.05;
    const heightAbove = Math.max(0, c.mesh.position.y - FLOOR_Y);
    const heightK = Math.max(0.35, 1 - heightAbove*0.14);
    c.shadow.scale.setScalar(heightK);
    c.shadow.material.opacity = heightK;
  });
}

function project(vec3){
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  const v = vec3.clone().project(camera);
  return { x: (v.x*0.5+0.5)*w, y: (-v.y*0.5+0.5)*h };
}
function updateTags(){
  const off = new THREE.Vector3(0, CUBE_SIZE*0.5+0.35, 0);
  const pk = project(cubes.k.mesh.position.clone().add(off));
  tagSthanin.style.left = pk.x+'px'; tagSthanin.style.top = pk.y+'px';
  const pa = project(cubes.a.mesh.position.clone().add(off));
  tagNimitta.style.left = pa.x+'px'; tagNimitta.style.top = pa.y+'px';
}

// Камера: тот же HALF_WORLD_H, что в rule3-agnayas.js — намеренно, для
// одинакового размера кубика между примерами. HALF_WORLD_W посчитан от
// реальной раскладки этого примера (7 букв + разрыв на границе слова),
// не подобран на глаз.
const BASE_FOV = 32;
const totalSpan = X[X.length-1] - X[0] + CUBE_SIZE;
const HALF_WORLD_W = totalSpan/2 + 0.55;
const HALF_WORLD_H = 2.3; // = rule3-agnayas.js, сознательно не пересчитывала

function resize(){
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  if (w === 0 || h === 0) return;
  renderer.setSize(w, h, false);
  const aspect = w/h;
  camera.aspect = aspect;
  const fovForHeight = THREE.MathUtils.radToDeg(2 * Math.atan(HALF_WORLD_H / camBase.z));
  const fovForWidth  = THREE.MathUtils.radToDeg(2 * Math.atan(HALF_WORLD_W / (camBase.z * aspect)));
  camera.fov = Math.max(BASE_FOV, fovForHeight, fovForWidth);
  camera.updateProjectionMatrix();
}
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
  updateShadows(); // безусловно, каждый кадр — не только пока playT0 задан (см. ниже, почему)
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
