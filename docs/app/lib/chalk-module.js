// Общий меловой модуль — процедурная текстура/геометрия для кубиков.
// Извлечено без изменений из rule-guna-agnayas.html (проверенный рабочий рецепт).
// Используется всеми анимациями-примерами через mount()/unmount().
import * as THREE from 'three';

// Направление вращения для всех «оборотных» эффектов — по часовой стрелке
// (подтверждено на демо ассимиляции). Если понадобится — меняется одной строкой.
const CW = -1;

const P = {
  texDepth:    0.55,
  bevelRound:  0.55,
  gradSharp:   0.30,
  cornerIrreg: 0.40,
  powderAcc:   0.40,
  surfSmooth:  0.35,
};

function hash(x,y){let n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n);}
function smoothNoise(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const ux=fx*fx*(3-2*fx),uy=fy*fy*(3-2*fy);
  return hash(ix,iy)+(hash(ix+1,iy)-hash(ix,iy))*ux+(hash(ix,iy+1)-hash(ix,iy))*uy+(hash(ix+1,iy+1)-hash(ix+1,iy)-hash(ix,iy+1)+hash(ix,iy))*ux*uy;
}
function fbm(x,y,oct){let v=0,a=0.5,f=1;for(let i=0;i<oct;i++){v+=a*smoothNoise(x*f,y*f);a*=0.5;f*=2.1;}return v;}
function mkRng(seed){
  let s=(seed*6364136+1013904223)|0;
  return ()=>{s=(Math.imul(s,1664525)+1013904223)|0;return((s>>>0)%100000)/100000;};
}

function paintChalkFace(sz, baseHex, faceName, seed, variant) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const ctx = cv.getContext('2d');
  const rand = mkRng(seed);

  const texDepth   = P.texDepth;
  const surfSmooth = P.surfSmooth;
  const powderAcc  = P.powderAcc;
  const gradSharp  = P.gradSharp;

  const BR = ((baseHex>>16)&0xFF)/255;
  const BG = ((baseHex>>8)&0xFF)/255;
  const BB = (baseHex&0xFF)/255;
  const wMix = 0.22;
  const CR = BR + (1-BR)*wMix;
  const CG = BG + (1-BG)*wMix;
  const CB = BB + (1-BB)*wMix;

  const NOISE_SZ = 256;
  const noiseCv = document.createElement('canvas');
  noiseCv.width = noiseCv.height = NOISE_SZ;
  const nctx = noiseCv.getContext('2d');
  const nimg = nctx.createImageData(NOISE_SZ, NOISE_SZ);
  const ndat = nimg.data;
  const poreFreq = 20 + (1-surfSmooth)*16;
  const poreAmp  = 0.018 * texDepth;

  for(let y=0;y<NOISE_SZ;y++){
    for(let x=0;x<NOISE_SZ;x++){
      const u=x/NOISE_SZ, v=y/NOISE_SZ;
      const lo = 0.95 + 0.09*fbm(u*2.4+seed*0.4, v*2.4+seed*0.6, 3)*texDepth - 0.045;
      const mi = 0.97 + 0.04*fbm(u*9+seed*1.1, v*9+seed*1.6, 2)*texDepth - 0.02;
      const pore = smoothNoise(u*poreFreq+seed*3.1, v*poreFreq+seed*2.7);
      const poreDip = pore < 0.30 ? -poreAmp*(1-(pore/0.30)) : 0;
      const gr = 0.97 + 0.03*(rand()-0.5)*2.6*(1-surfSmooth*0.5);
      let bright = Math.max(0.84, Math.min(1.04, lo*mi*gr + poreDip));
      bright = 0.97 + (bright-0.97)*1.05;
      const warmShift = (u - 0.5) * gradSharp * 0.04;
      const r = Math.min(1, CR * bright + warmShift*0.01);
      const g = Math.min(1, CG * bright);
      const b = Math.min(1, CB * bright - warmShift*0.008);
      const i=(y*NOISE_SZ+x)*4;
      ndat[i]  =Math.round(Math.max(0,r)*255);
      ndat[i+1]=Math.round(Math.max(0,g)*255);
      ndat[i+2]=Math.round(Math.max(0,b)*255);
      ndat[i+3]=255;
    }
  }
  nctx.putImageData(nimg, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(noiseCv, 0, 0, NOISE_SZ, NOISE_SZ, 0, 0, sz, sz);

  const nScratch = Math.round(2 + (1-surfSmooth)*2);
  for(let k=0;k<nScratch;k++){
    const yPos = sz*(0.05 + k/(nScratch)*0.92 + (rand()-0.5)*0.025);
    const isLight = rand() > 0.45;
    const alpha = (0.008 + rand()*0.010) * (1 - surfSmooth*0.4);
    const col = isLight ? `rgba(255,255,255,${alpha})` : `rgba(20,15,18,${alpha*0.8})`;
    ctx.save();
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.5 + rand()*0.7;
    ctx.beginPath();
    ctx.moveTo(-2, yPos);
    const cp1x = sz*(0.2+rand()*0.25), cp2x = sz*(0.6+rand()*0.25);
    const waviness = (1-surfSmooth)*6;
    ctx.bezierCurveTo(cp1x, yPos+(rand()-0.5)*waviness, cp2x, yPos+(rand()-0.5)*waviness, sz+2, yPos+(rand()-0.5)*waviness*0.5);
    ctx.stroke();
    ctx.restore();
  }

  const bevelW = sz * (0.06 + powderAcc * 0.10);
  const bevelAlpha = 0.04 + powderAcc * 0.07;
  function paintNoisyBevel(gradFn) {
    const bsz = Math.max(64, Math.round(sz/4));
    const scale = sz/bsz;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = bsz;
    const tctx = tmp.getContext('2d');
    const tdat = tctx.createImageData(bsz, bsz);
    const dd = tdat.data;
    for(let y=0;y<bsz;y++){
      for(let x=0;x<bsz;x++){
        const a = gradFn(x*scale,y*scale);
        const i=(y*bsz+x)*4;
        if(a<=0){ dd[i+3]=0; continue; }
        const n = 0.75 + 0.3*smoothNoise(x*scale*0.06+seed*5, y*scale*0.06+seed*4);
        dd[i]=255; dd[i+1]=255; dd[i+2]=255;
        dd[i+3]=Math.round(Math.max(0,Math.min(255, a*255*n)));
      }
    }
    tctx.putImageData(tdat,0,0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp,0,0,bsz,bsz,0,0,sz,sz);
  }
  paintNoisyBevel((x,y)=> y<bevelW ? bevelAlpha*(1-y/bevelW) : 0);
  paintNoisyBevel((x,y)=> y>sz-bevelW ? bevelAlpha*((y-(sz-bevelW))/bevelW) : 0);
  paintNoisyBevel((x,y)=> x<bevelW ? bevelAlpha*(1-x/bevelW) : 0);
  paintNoisyBevel((x,y)=> x>sz-bevelW ? bevelAlpha*((x-(sz-bevelW))/bevelW) : 0);

  const corners = [[0,0],[sz,0],[0,sz],[sz,sz]];
  const cornerR = bevelW * 1.0;
  const cornerAlpha = bevelAlpha * 0.5;
  for(const [cx,cy] of corners){
    const g = ctx.createRadialGradient(cx,cy,0, cx,cy,Math.max(1.5,cornerR));
    g.addColorStop(0, `rgba(255,255,255,${cornerAlpha})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,sz,sz);
  }

  const cornerIrreg = P.cornerIrreg;
  const nChips = Math.round(cornerIrreg * 4);
  for(let k=0;k<nChips;k++){
    const cornerIdx = Math.floor(rand()*4);
    const [ccx, ccy] = corners[cornerIdx];
    const dirX = ccx === 0 ? 1 : -1;
    const dirY = ccy === 0 ? 1 : -1;
    const chipDist = bevelW * (0.2 + rand()*0.7);
    const jitter = bevelW * 0.3;
    const chipX = ccx + dirX*chipDist*(0.4+rand()*0.6) + (rand()-0.5)*jitter;
    const chipY = ccy + dirY*chipDist*(0.4+rand()*0.6) + (rand()-0.5)*jitter;
    const chipR = Math.max(1.5, 1.5 + rand()*4*cornerIrreg);
    const chipAlpha = 0.05 + rand()*0.06*cornerIrreg;
    const g = ctx.createRadialGradient(chipX,chipY,0, chipX,chipY,chipR);
    g.addColorStop(0, `rgba(35,22,28,${chipAlpha})`);
    g.addColorStop(1, 'rgba(35,22,28,0)');
    ctx.fillStyle=g;
    ctx.save();
    ctx.translate(chipX,chipY);
    ctx.rotate(rand()*Math.PI);
    ctx.scale(1, 0.5+rand()*0.5);
    ctx.beginPath();
    ctx.arc(0,0,chipR,0,Math.PI*2);
    ctx.restore();
    ctx.fill();
  }

  for(let z=0;z<2;z++){
    const cx=0.2+rand()*0.6, cy=0.2+rand()*0.6;
    const r=(0.20+rand()*0.12)*sz;
    const warm=rand()>0.5;
    const col=warm?`rgba(235,215,180,0.035)`:`rgba(190,210,235,0.035)`;
    const grd=ctx.createRadialGradient(cx*sz,cy*sz,0,cx*sz,cy*sz,r);
    grd.addColorStop(0,col); grd.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=grd; ctx.fillRect(0,0,sz,sz);
  }

  {
    const lighten=(v)=>v+(1-v)*0.40, deepen=(v)=>v*0.80;
    const cL=[lighten(BR),lighten(BG),lighten(BB)].map(v=>Math.round(Math.max(0,Math.min(1,v))*255));
    const cD=[deepen(BR),deepen(BG),deepen(BB)].map(v=>Math.round(Math.max(0,Math.min(1,v))*255));
    const ang = rand()*Math.PI*2;
    const dx = Math.cos(ang)*sz*0.7, dy = Math.sin(ang)*sz*0.7;
    const cx0=sz/2-dx, cy0=sz/2-dy, cx1=sz/2+dx, cy1=sz/2+dy;
    const dgrad = ctx.createLinearGradient(cx0,cy0,cx1,cy1);
    dgrad.addColorStop(0, `rgba(${cL[0]},${cL[1]},${cL[2]},0.16)`);
    dgrad.addColorStop(1, `rgba(${cD[0]},${cD[1]},${cD[2]},0.16)`);
    ctx.fillStyle = dgrad;
    ctx.fillRect(0,0,sz,sz);
  }

  return cv;
}

function makeGrainGrayscale(cv) {
  const sz = cv.width;
  const out = document.createElement('canvas');
  out.width = out.height = sz;
  const octx = out.getContext('2d');
  octx.filter = 'grayscale(1) contrast(1.05)';
  octx.drawImage(cv, 0, 0);
  return out;
}

function paintGlyph(cv, ch) {
  const sz = cv.width;
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = `700 ${Math.round(sz*0.58)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, sz/2, sz/2);
  ctx.restore();
}

function buildChalkMaterials(baseColor, seed, glyph) {
  const SZ = 512;
  const faceInfo = [
    {name:'side',   variant:0},
    {name:'side',   variant:1},
    {name:'top',    variant:0},
    {name:'bottom', variant:2},
    {name:'front',  variant:2, isFace:true},
    {name:'front',  variant:3},
  ];
  return faceInfo.map((fi,idx)=>{
    const cv = paintChalkFace(SZ, baseColor, fi.name, seed+idx*179+31, fi.variant);
    // grain (bump/roughness) is derived from the CLEAN chalk surface, before
    // any glyph is stamped on — so the letter reads as flat matte ink, not
    // as a weird bump on the stone.
    const grainCv = makeGrainGrayscale(cv);
    const bumpTex = new THREE.CanvasTexture(grainCv);
    bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping;
    const roughTex = new THREE.CanvasTexture(grainCv);
    roughTex.wrapS = roughTex.wrapT = THREE.RepeatWrapping;

    if (fi.isFace && glyph) paintGlyph(cv, glyph);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: bumpTex,
      bumpScale: 0.0025,
      roughnessMap: roughTex,
      roughness: 0.97,
      metalness: 0.0,
      envMapIntensity: 0,
      fog: false,
    });
  });
}

function makeChalkGeo(W, H, D, seed) {
  const br = P.bevelRound;
  const chamfer = 0.020 + br * 0.040;
  const noiseAmt = 0.002 + P.cornerIrreg * 0.005;

  const geo = new THREE.BoxGeometry(W,H,D, 24,24,24);
  const pos = geo.attributes.position;
  for(let v=0;v<pos.count;v++){
    let x=pos.getX(v), y=pos.getY(v), z=pos.getZ(v);
    const hW=W/2, hH=H/2, hD=D/2;
    const ox=Math.abs(x)-(hW-chamfer), oy=Math.abs(y)-(hH-chamfer), oz=Math.abs(z)-(hD-chamfer);
    if(ox>0 && oy>0 && oz>0){
      const cL=Math.sqrt(ox*ox+oy*oy+oz*oz);
      const ex=cL-chamfer;
      if(ex>0){
        const pull = 0.50 + br*0.18;
        x -= (ox/cL*Math.sign(x))*ex*pull;
        y -= (oy/cL*Math.sign(y))*ex*pull;
        z -= (oz/cL*Math.sign(z))*ex*pull;
      }
    } else if(ox>0 && oy>0){
      const eL=Math.sqrt(ox*ox+oy*oy);
      const ex=eL-chamfer;
      if(ex>0){
        x -= (ox/eL*Math.sign(x))*ex*(0.55+br*0.20);
        y -= (oy/eL*Math.sign(y))*ex*(0.55+br*0.20);
      }
    } else if(ox>0 && oz>0){
      const eL=Math.sqrt(ox*ox+oz*oz);
      const ex=eL-chamfer;
      if(ex>0){
        x -= (ox/eL*Math.sign(x))*ex*(0.55+br*0.20);
        z -= (oz/eL*Math.sign(z))*ex*(0.55+br*0.20);
      }
    } else if(oy>0 && oz>0){
      const eL=Math.sqrt(oy*oy+oz*oz);
      const ex=eL-chamfer;
      if(ex>0){
        y -= (oy/eL*Math.sign(y))*ex*(0.55+br*0.20);
        z -= (oz/eL*Math.sign(z))*ex*(0.55+br*0.20);
      }
    }
    const nv=(fbm(x*14+seed, y*14+seed*1.3, 4)-0.5)*noiseAmt;
    pos.setXYZ(v, x+nv, y+nv*0.35, z+nv);
  }
  pos.needsUpdate=true;
  geo.computeVertexNormals();
  const norm = geo.attributes.normal;
  for(let v=0;v<norm.count;v++){
    const nx=norm.getX(v), ny=norm.getY(v), nz=norm.getZ(v);
    const jx=(fbm(nx*30+seed,ny*30+seed*1.7,2)-0.5)*0.05;
    const jy=(fbm(ny*30+seed*1.3,nz*30+seed*2.1,2)-0.5)*0.05;
    const jz=(fbm(nz*30+seed*1.9,nx*30+seed*0.7,2)-0.5)*0.05;
    const len=Math.hypot(nx+jx,ny+jy,nz+jz)||1;
    norm.setXYZ(v,(nx+jx)/len,(ny+jy)/len,(nz+jz)/len);
  }
  norm.needsUpdate=true;
  return geo;
}

function makeShadowBlobTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  g.addColorStop(0,   'rgba(0,0,0,0.45)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,S,S);
  const tx = new THREE.CanvasTexture(cv);
  tx.encoding = THREE.sRGBEncoding;
  return tx;
}

export { CW, P, hash, smoothNoise, fbm, mkRng, paintChalkFace, makeGrainGrayscale, paintGlyph, buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture };
