(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const shell = document.getElementById('shell');
  const $ = id => document.getElementById(id);
  const ui = {distance:$('distance'),coins:$('coins'),chargeFill:$('chargeFill'),chargeText:$('chargeText'),chargeHint:$('chargeHint'),powerIndicator:$('powerIndicator'),powerIcon:$('powerIcon'),powerName:$('powerName'),toast:$('toast'),start:$('startScreen'),pause:$('pauseScreen'),over:$('gameOverScreen'),startBest:$('startBest'),muteBtn:$('muteBtn'),phaseBtn:document.querySelector('[data-action="phase"]')};
  const C = {cyan:'#5af4e5',lime:'#d8ff69',pink:'#ff5da8',orange:'#ffb55d',ink:'#07141d'};

  /* ---------------- audio (synth, no assets) ---------------- */
  const AudioFX = {
    ctx:null, muted:false,
    ensure(){
      if(!this.ctx){const AC = window.AudioContext||window.webkitAudioContext;if(AC){try{this.ctx=new AC();}catch(e){this.ctx=null;}}}
      if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
      return !!this.ctx;
    },
    tone(freq,dur,{type='sine',gain=.16,sweep=0,delay=0}={}){
      if(this.muted||!this.ctx)return;
      const c=this.ctx,t=c.currentTime+delay,o=c.createOscillator(),g=c.createGain();
      o.type=type;o.frequency.setValueAtTime(Math.max(20,freq),t);
      if(sweep)o.frequency.exponentialRampToValueAtTime(Math.max(20,sweep),t+dur);
      g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(gain,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
      o.connect(g).connect(c.destination);o.start(t);o.stop(t+dur+.03);
    },
    noise(dur,{gain=.22,cut=900,delay=0}={}){
      if(this.muted||!this.ctx)return;
      const c=this.ctx,t=c.currentTime+delay,n=Math.max(1,Math.floor(c.sampleRate*dur)),buf=c.createBuffer(1,n,c.sampleRate),d=buf.getChannelData(0);
      for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
      const src=c.createBufferSource();src.buffer=buf;
      const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=cut;
      const g=c.createGain();g.gain.value=gain;
      src.connect(f).connect(g).connect(c.destination);src.start(t);
    }
  };
  function sfx(name,arg=0){
    if(AudioFX.muted||!AudioFX.ensure())return;
    switch(name){
      case 'jump': AudioFX.tone(300,.15,{type:'square',gain:.1,sweep:660});break;
      case 'slide': AudioFX.noise(.2,{gain:.12,cut:700});break;
      case 'shard': {const f=500*Math.pow(1.06,arg%10);AudioFX.tone(f,.1,{type:'triangle',gain:.12,sweep:f*1.8});break;}
      case 'power': AudioFX.tone(440,.1,{type:'square',gain:.1});AudioFX.tone(660,.12,{type:'square',gain:.1,delay:.08});AudioFX.tone(880,.2,{type:'square',gain:.09,delay:.16});break;
      case 'phase': AudioFX.tone(120,.5,{type:'sawtooth',gain:.13,sweep:900});AudioFX.noise(.4,{gain:.09,cut:2400});break;
      case 'deny': AudioFX.tone(150,.13,{type:'square',gain:.09,sweep:85});break;
      case 'break': AudioFX.noise(.3,{gain:.18,cut:1600});AudioFX.tone(700,.18,{type:'square',gain:.09,sweep:220});break;
      case 'crash': AudioFX.noise(.6,{gain:.28,cut:500});AudioFX.tone(180,.5,{type:'sawtooth',gain:.16,sweep:48});break;
      case 'start': AudioFX.tone(330,.09,{type:'square',gain:.09});AudioFX.tone(495,.09,{type:'square',gain:.09,delay:.1});AudioFX.tone(660,.2,{type:'square',gain:.11,delay:.2});break;
    }
  }
  function buzz(ms){try{navigator.vibrate&&navigator.vibrate(ms);}catch(e){}}

  /* ---------------- state ---------------- */
  let W=0,H=0,dpr=1,last=0,raf=0,toastTimer=0,ambient=0;
  let state='ready',items=[],travel=0,spawnAt=24,score=0,shards=0,best=Number(localStorage.getItem('neonrun-best')||0);
  let speed=17,lane=1,targetLane=1,jumpY=0,jumpV=0,sliding=0,phase=0,charge=0,shield=0,magnet=0,chrono=0,shake=0,flash=0,elapsed=0;
  let particles=[],rings=[],popups=[],trail=[],squash=0;
  let shardStreak=0,frameAvg=16,lowFx=false;
  const laneX=[-1.62,0,1.62];
  const rand=(a,b)=>a+Math.random()*(b-a);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  /* ---------------- backdrop (seeded, rebuilt on resize) ---------------- */
  let stars=[],skyFar=[],skyNear=[],streakAngles=[];
  function sr(seed){return()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};}
  function makeWins(r,n){const ws=[];for(let i=0;i<n;i++)ws.push({x:.1+r()*.78,y:.06+r()*.82,lit:r()<.5,a:.35+r()*.65});return ws;}
  function buildBackdrop(){
    const r=sr(7);
    stars=Array.from({length:85},()=>({x:r(),y:r()*.6,s:.6+r()*1.7,p:r()*6.28}));
    skyFar=[];let x=0;
    while(x<1.9){const w=.05+r()*.09;skyFar.push({x,w,h:.1+r()*.17,seed:r()*100,win:makeWins(r,5),sign:null});x+=w+r()*.03;}
    skyNear=[];x=0;
    while(x<1.9){const w=.08+r()*.14;const sign=r()<.55?{u:.15+r()*.5,c:r()<.5?C.pink:C.cyan,w:.28+r()*.4,fl:r()<.28}:null;skyNear.push({x,w,h:.16+r()*.3,seed:r()*100,win:makeWins(r,8),sign});x+=w+r()*.045;}
    streakAngles=Array.from({length:16},(_,i)=>(i/16)*Math.PI*2+rand(-.08,.08));
  }

  /* ---------------- canvas ---------------- */
  function resize(){
    const r=canvas.getBoundingClientRect();W=r.width;H=r.height;
    dpr=Math.min(devicePixelRatio||1,W<520?2:1.75);
    canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    buildBackdrop();
  }
  addEventListener('resize',resize,{passive:true});resize();

  const horizon=()=>H*.46;
  function project(x,z,y=0){const hz=horizon(),scale=(H*.78)/(z+14);return {x:W*.5+x*scale,y:hz+scale*(2.45-y),s:scale};}
  function poly(points,fill,stroke=null,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
  function line(a,b,color,width=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function glow(color,blur){if(!lowFx){ctx.shadowColor=color;ctx.shadowBlur=blur;}}
  function noGlow(){ctx.shadowBlur=0;}
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}

  /* ---------------- background ---------------- */
  function drawSkyline(list,par,color,loop,alpha){
    const hz=horizon();
    for(const b of list){
      const sx=((b.x*loop - travel*par)%loop+loop)%loop - W*.38;
      const bw=b.w*loop,bh=b.h*H,top=hz-bh;
      if(sx+bw<0||sx>W)continue;
      ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.fillRect(sx,top,bw,bh+6);
      ctx.fillStyle='#ffd98a';
      for(const w of b.win){
        if(!w.lit)continue;
        ctx.globalAlpha=alpha*w.a*.55;
        ctx.fillRect(sx+w.x*bw,top+w.y*bh,Math.max(1,bw*.05),Math.max(1,bh*.028));
      }
      if(b.sign){
        const s=b.sign,sw=s.w*bw,sh=Math.max(4,bh*.055),ssx=sx+s.u*bw,sy=top+bh*.16;
        ctx.globalAlpha=alpha*(s.fl?(.3+.7*Math.abs(Math.sin(ambient*2.6+b.seed))):.85);
        glow(s.c,10);ctx.fillStyle=s.c;ctx.fillRect(ssx,sy,sw,sh);noGlow();
      }
      ctx.globalAlpha=1;
    }
  }
  function drawBackground(){
    const hz=horizon();
    const sky=ctx.createLinearGradient(0,0,0,hz*1.05);
    sky.addColorStop(0,'#150d2b');sky.addColorStop(.4,'#2b1d4d');sky.addColorStop(.7,'#1c4f58');sky.addColorStop(1,'#3fa08f');
    ctx.fillStyle=sky;ctx.fillRect(0,0,W,hz+10);
    for(const s of stars){
      ctx.globalAlpha=.2+.55*Math.abs(Math.sin(ambient*.9+s.p));
      ctx.fillStyle='#cfeee8';ctx.fillRect(s.x*W,s.y*hz,s.s,s.s);
    }
    ctx.globalAlpha=1;
    const mx=W*.79,my=H*.14,mr=Math.min(W,H)*.05;
    const mg=ctx.createRadialGradient(mx,my,mr*.3,mx,my,mr*3.4);
    mg.addColorStop(0,'rgba(214,255,244,.45)');mg.addColorStop(1,'rgba(214,255,244,0)');
    ctx.fillStyle=mg;ctx.beginPath();ctx.arc(mx,my,mr*3.4,0,6.283);ctx.fill();
    ctx.fillStyle='#eafff6';ctx.beginPath();ctx.arc(mx,my,mr,0,6.283);ctx.fill();
    ctx.fillStyle='rgba(150,195,185,.45)';
    ctx.beginPath();ctx.arc(mx-mr*.3,my-mr*.15,mr*.22,0,6.283);ctx.fill();
    ctx.beginPath();ctx.arc(mx+mr*.25,my+mr*.3,mr*.14,0,6.283);ctx.fill();
    const loop=W*1.75;
    drawSkyline(skyFar,7,'#0d0f24',loop,.95);
    drawSkyline(skyNear,17,'#0e0a1c',loop,1);
    const hzglow=ctx.createLinearGradient(0,hz-H*.1,0,hz+4);
    hzglow.addColorStop(0,'rgba(38,130,124,0)');hzglow.addColorStop(1,'rgba(70,190,170,.22)');
    ctx.fillStyle=hzglow;ctx.fillRect(0,hz-H*.1,W,H*.1+6);
    const v={x:W*.5,y:hz+6};
    const gl=ctx.createLinearGradient(0,0,W*.35,0);gl.addColorStop(0,'#0b1a22');gl.addColorStop(1,'#152b31');
    const gr=ctx.createLinearGradient(W,0,W*.65,0);gr.addColorStop(0,'#0b1a22');gr.addColorStop(1,'#152b31');
    poly([{x:0,y:H*.3},{x:W*.17,y:H*.33},v,{x:W*.24,y:H},{x:0,y:H}],gl);
    poly([{x:W,y:H*.3},{x:W*.83,y:H*.33},v,{x:W*.76,y:H},{x:W,y:H}],gr);
    for(let side of[-1,1]){
      const a=project(side*5.05,0),b=project(side*5.05,120);
      line(a,b,'rgba(87,245,222,.28)',Math.max(1,a.s*.035));
      for(let z=8;z<120;z+=13){const p=project(side*5.05,z);ctx.fillStyle='rgba(90,244,229,.45)';ctx.fillRect(p.x-p.s*.07,p.y-p.s*.055,p.s*.14,p.s*.07);}
    }
  }

  /* ---------------- track ---------------- */
  function drawTrack(){
    const NEAR=-10.5;
    const nearL=project(-4.9,NEAR),farL=project(-4.9,150),nearR=project(4.9,NEAR),farR=project(4.9,150);
    poly([farL,farR,nearR,nearL],'#101d22');
    const eL=project(-5.35,NEAR),eLF=project(-5.35,150),eR=project(5.35,NEAR),eRF=project(5.35,150);
    poly([eLF,farL,nearL,eL],'#1b2b2e');poly([farR,eRF,eR,nearR],'#1b2b2e');
    const off=travel%1.7;
    for(let z=1.7-off;z<95;z+=1.7){
      if(z<.2)continue;
      const l=project(-4.4,z),r=project(4.4,z),th=Math.max(1.1,l.s*.075);
      line(l,r,'rgba(4,10,12,.75)',th);
    }
    for(const lx of laneX)for(const dx of[-.52,.52]){
      const a=project(lx+dx,NEAR),b=project(lx+dx,150);
      line(a,b,'rgba(120,180,175,.12)',Math.max(1,a.s*.05));
      line(a,b,'rgba(205,240,233,.24)',Math.max(1,a.s*.018));
    }
    for(const bx of[-.81,.81]){
      const step=2.6,o=travel%step;
      for(let z=step-o;z<110;z+=step){
        if(z<0)continue;
        const a=project(bx,z),b=project(bx,z+1.05);
        glow(C.cyan,6);line(a,b,'rgba(90,244,229,.4)',Math.max(1,a.s*.03));noGlow();
      }
    }
    for(const lx of laneX){
      const step=4.2,o=travel%step;
      for(let z=step-o;z<80;z+=step){
        if(z<0)continue;
        const a=project(lx,z),b=project(lx,z+.9);
        line(a,b,'rgba(180,255,240,.1)',Math.max(1,a.s*.05));
      }
    }
    // lamp posts
    for(let side of[-1,1])for(let z=6-(travel%14);z<110;z+=14){
      if(z<0)continue;
      const b=project(side*5.15,z),tp=project(side*5.15,z,3.6);
      const a=clamp((110-z)/90,0,1)*.9;
      ctx.globalAlpha=a;
      line(b,tp,'rgba(150,190,185,.5)',Math.max(1,b.s*.05));
      glow(C.cyan,9);ctx.fillStyle=C.cyan;ctx.beginPath();ctx.arc(tp.x,tp.y,Math.max(1.5,b.s*.09),0,6.283);ctx.fill();noGlow();
      const gp=project(side*4.1,z);
      ctx.fillStyle='rgba(90,244,229,.07)';ctx.beginPath();ctx.ellipse(gp.x,gp.y,b.s*.7,b.s*.16,0,0,6.283);ctx.fill();
      ctx.globalAlpha=1;
    }
    // overhead gantries
    for(let z=38-(travel%45);z<120;z+=45){
      if(z<0)continue;
      const a=clamp((120-z)/80,0,1)*.85;
      const tl=project(-5,z,4.5),tr=project(5,z,4.5),bl=project(-5,z),br=project(5,z);
      ctx.globalAlpha=a;
      line(bl,tl,'rgba(120,160,155,.55)',Math.max(1,bl.s*.06));
      line(br,tr,'rgba(120,160,155,.55)',Math.max(1,br.s*.06));
      glow(C.pink,8);line(tl,tr,'rgba(255,93,168,.4)',Math.max(1,tl.s*.05));noGlow();
      for(let k=-3;k<=3;k++){
        const lp=project(k*1.5,z,4.5);
        ctx.fillStyle=k%2?C.cyan:C.lime;
        ctx.fillRect(lp.x-Math.max(1,lp.s*.03),lp.y-Math.max(1,lp.s*.03),Math.max(2,lp.s*.06),Math.max(2,lp.s*.06));
      }
      ctx.globalAlpha=1;
    }
    const gl=ctx.createLinearGradient(0,H*.6,0,H);
    gl.addColorStop(0,'rgba(45,180,167,0)');gl.addColorStop(1,'rgba(45,180,167,.07)');
    ctx.fillStyle=gl;ctx.fillRect(0,H*.6,W,H*.4);
    const fade=ctx.createLinearGradient(0,H*.72,0,H);
    fade.addColorStop(0,'rgba(4,13,19,0)');fade.addColorStop(1,'rgba(4,13,19,.82)');
    ctx.fillStyle=fade;ctx.fillRect(0,H*.72,W,H*.28);
  }

  /* ---------------- items ---------------- */
  function drawShard(item,p){
    const bob=Math.sin(ambient*5+item.seed)*p.s*.07,x=p.x,y=p.y-p.s*.62+bob,sz=p.s*.18;
    ctx.save();ctx.translate(x,y);ctx.rotate(ambient*1.6+item.seed);
    glow(C.lime,13);
    poly([{x:0,y:-sz},{x:sz*.72,y:0},{x:0,y:sz},{x:-sz*.72,y:0}],C.lime,'rgba(255,255,255,.85)',1);
    noGlow();
    ctx.fillStyle='rgba(255,255,255,.75)';ctx.beginPath();ctx.arc(-sz*.2,-sz*.25,sz*.16,0,6.283);ctx.fill();
    ctx.restore();
    if(!lowFx&&item.z<28&&Math.random()<.03)spawnParticle(x+rand(-sz,sz),y+rand(-sz,sz),rand(-8,8),rand(-30,-10),rand(.3,.6),'rgba(216,255,105,.9)',rand(1,2),0);
  }
  function drawPower(item,p){
    const s=p.s,x=p.x,y=p.y-s*.8,rad=Math.max(5,s*.22),t=ambient*2+item.seed;
    ctx.save();ctx.translate(x,y);
    glow(item.color,16);
    ctx.strokeStyle=item.color;ctx.lineWidth=1.5;
    ctx.beginPath();ctx.arc(0,0,rad*(1+Math.sin(t)*.12),0,Math.PI*2);ctx.stroke();
    ctx.fillStyle='rgba(8,24,31,.9)';ctx.beginPath();ctx.arc(0,0,rad*.72,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=item.color;ctx.font=`bold ${Math.max(9,rad*1.1)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(item.kind==='magnet'?'M':item.kind==='shield'?'S':'T',0,1);
    const oa=t*3;
    ctx.beginPath();ctx.arc(Math.cos(oa)*rad*1.55,Math.sin(oa)*rad*.62,Math.max(1.5,rad*.15),0,Math.PI*2);ctx.fill();
    noGlow();ctx.restore();
  }
  function drawHazard(item,p){
    const s=p.s,x=p.x,y=p.y;ctx.save();
    if(item.kind==='crate'){
      const w=s*.82,h=s*.72,top=s*.18,left=x-w/2,right=x+w/2,bottom=y-2;
      poly([{x:left,y:bottom-h},{x:left+top,y:bottom-h-top},{x:right+top*.55,y:bottom-h-top},{x:right,y:bottom-h}],'#d8733e','#ffb36c',1);
      poly([{x:left,y:bottom-h},{x:right,y:bottom-h},{x:right,y:bottom},{x:left,y:bottom}],'#994b38','#ff9c5e',1);
      poly([{x:right,y:bottom-h},{x:right+top*.55,y:bottom-h-top},{x:right+top*.55,y:bottom-top},{x:right,y:bottom}],'#683e3a','#d98656',1);
      line({x:left+s*.12,y:bottom-h*.5},{x:right-s*.12,y:bottom-h*.5},'rgba(255,215,165,.65)',Math.max(1,s*.04));
      line({x:left+s*.28,y:bottom-h*.85},{x:left+s*.4,y:bottom-h*.1},'rgba(30,15,10,.4)',Math.max(1,s*.03));
    }
    else if(item.kind==='gate'){
      const w=s*1.15,h=s*.92,base=y-2;
      rounded(x-w/2,base-h,w,h*.23,2,'#d54670','#ff8daa');rounded(x-w*.43,base-h*.77,w*.14,h*.74,2,'#9b3456','#ff6f9c');rounded(x+w*.29,base-h*.77,w*.14,h*.74,2,'#9b3456','#ff6f9c');
      for(let k=-2;k<=2;k++){const bx=x+k*w*.17;line({x:bx,y:base-h*.69},{x:bx,y:base-h*.08},'rgba(255,215,224,.7)',Math.max(1,s*.025));}
      glow(C.pink,8);line({x:x-w*.42,y:base-h*.08},{x:x+w*.42,y:base-h*.08},'#ff9fbc',Math.max(1,s*.04));noGlow();
    }
    else{
      const w=s*1.12,h=s*1.55,base=y-1;
      poly([{x:x-w*.5,y:base},{x:x-w*.5,y:base-h*.78},{x:x-w*.34,y:base-h},{x:x+w*.34,y:base-h},{x:x+w*.5,y:base-h*.78},{x:x+w*.5,y:base}],'#24545c','#61c9c0',1.2);
      rounded(x-w*.34,base-h*.72,w*.68,h*.36,4,'#102b36','#5ff4e4');
      const flick=.45+.3*Math.sin(ambient*7+item.seed*3);
      ctx.fillStyle=`rgba(141,254,232,${flick})`;
      for(let i=0;i<3;i++)ctx.fillRect(x-w*.25+i*w*.22,base-h*.68,w*.09,h*.25);
      glow(C.lime,10);
      ctx.fillStyle='#ebff78';
      ctx.fillRect(x-w*.31,base-h*.13,w*.11,Math.max(2,s*.06));
      ctx.fillRect(x+w*.2,base-h*.13,w*.11,Math.max(2,s*.06));
      noGlow();
      glow('#fff3c0',12);
      ctx.fillStyle='rgba(255,240,190,.85)';
      ctx.beginPath();ctx.arc(x-w*.28,base+2,Math.max(1.5,s*.05),0,6.283);ctx.fill();
      ctx.beginPath();ctx.arc(x+w*.28,base+2,Math.max(1.5,s*.05),0,6.283);ctx.fill();
      noGlow();
    }
    ctx.restore();
  }
  function drawItems(){
    const list=items.slice().sort((a,b)=>b.z-a.z);
    for(const item of list){
      if(item.z>150||item.z<-4)continue;
      const p=project(laneX[item.lane],item.z);
      ctx.globalAlpha=clamp((150-item.z)/60,0,1);
      if(item.kind==='shard')drawShard(item,p);
      else if(item.kind==='magnet'||item.kind==='shield'||item.kind==='chrono')drawPower(item,p);
      else drawHazard(item,p);
    }
    ctx.globalAlpha=1;
  }

  /* ---------------- runner ---------------- */
  function drawRunner(){
    const xWorld=-1.62+lane*1.62;
    const base=project(xWorld,0),p=project(xWorld,0,jumpY),s=p.s;
    const x=base.x,y=p.y,sc=s/48,run=Math.sin(elapsed*13),crouch=sliding>0?1:0;
    ctx.save();ctx.globalAlpha=clamp(1-jumpY*.27,.26,.7);ctx.fillStyle='#061117';ctx.beginPath();ctx.ellipse(base.x,base.y-2,s*.32,s*.095,0,0,Math.PI*2);ctx.fill();ctx.restore();
    if(phase>0){
      for(const g of trail){
        const a=(1-(elapsed-g.t)/.28)*.28;
        if(a<=0)continue;
        ctx.globalAlpha=a;ctx.fillStyle=C.cyan;
        ctx.beginPath();ctx.ellipse(g.x,g.y-42*g.sc,13*g.sc,34*g.sc,0,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }
    ctx.save();ctx.translate(x,y);
    const squish=1-.3*(squash/.18);
    ctx.scale(sc,sc*squish);
    if(crouch)ctx.translate(0,13);
    if(phase>0){ctx.globalAlpha=.42;glow(C.cyan,19);ctx.strokeStyle=C.cyan;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-42,25,48,0,0,Math.PI*2);ctx.stroke();noGlow();ctx.globalAlpha=.42;}
    const swing=sliding>0?0:run*9;
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='#182a36';ctx.lineWidth=8;line({x:-6,y:-20},{x:-8+swing*.5,y:-4},ctx.strokeStyle,8);line({x:7,y:-20},{x:7-swing*.5,y:-5},ctx.strokeStyle,8);
    ctx.strokeStyle='#eff9ed';line({x:-8+swing*.5,y:-5},{x:-3+swing*.5,y:-2},ctx.strokeStyle,6);line({x:7-swing*.5,y:-5},{x:12-swing*.5,y:-2},ctx.strokeStyle,6);
    ctx.strokeStyle=C.pink;line({x:-8+swing*.5,y:-1},{x:-1+swing*.5,y:-1},ctx.strokeStyle,2);line({x:7-swing*.5,y:-1},{x:14-swing*.5,y:-1},ctx.strokeStyle,2);
    ctx.save();ctx.rotate(targetLane>lane?-.08:targetLane<lane?.08:run*.025);
    poly([{x:-12,y:-52},{x:-9,y:-68},{x:0,y:-72},{x:10,y:-67},{x:14,y:-51},{x:9,y:-27},{x:-10,y:-27}],phase>0?'#64eee0':'#1ba99f','#a2fff0',1);
    poly([{x:-2,y:-66},{x:2,y:-66},{x:3,y:-31},{x:-3,y:-31}],'#d8ff69');
    ctx.strokeStyle='#e99b75';ctx.lineWidth=6;
    line({x:-10,y:-61},{x:-16-run*3,y:-46+run*4},ctx.strokeStyle,6);line({x:11,y:-60},{x:17+run*3,y:-47-run*4},ctx.strokeStyle,6);
    ctx.strokeStyle='#168c87';ctx.lineWidth=7;line({x:-10,y:-59},{x:-15-run*3,y:-45+run*4},ctx.strokeStyle,7);line({x:11,y:-58},{x:16+run*3,y:-46-run*4},ctx.strokeStyle,7);
    ctx.restore();
    ctx.fillStyle='#df9877';ctx.beginPath();ctx.ellipse(0,-79,9,10,0,0,Math.PI*2);ctx.fill();
    poly([{x:-9,y:-82},{x:-7,y:-91},{x:2,y:-94},{x:10,y:-89},{x:8,y:-84},{x:1,y:-86},{x:-3,y:-81}],'#15242e');
    rounded(-8,-81,16,5,2,'#0e2931','#5af4e5');ctx.fillStyle=C.lime;ctx.fillRect(4,-80,2,2);
    ctx.fillStyle=phase>0?'rgba(90,244,229,.75)':'#ff5da8';poly([{x:-6,y:-67},{x:-16-run*3,y:-64},{x:-22-run*7,y:-69},{x:-15-run*4,y:-60},{x:-5,y:-61}],ctx.fillStyle);
    if(shield>0){ctx.globalAlpha=.45+.15*Math.sin(ambient*8);ctx.strokeStyle=C.lime;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-47,27,51,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
  }

  /* ---------------- fx ---------------- */
  function spawnParticle(x,y,vx,vy,life,color,size,grav=0){
    const max=lowFx?60:170;
    if(particles.length<max)particles.push({x,y,vx,vy,life,max:life,color,size,grav});
  }
  function spawnBurst(x,y,color,n,power=1){
    const count=lowFx?Math.ceil(n*.5):n;
    for(let i=0;i<count;i++){
      const a=rand(0,6.283),sp=rand(40,190)*power;
      spawnParticle(x,y,Math.cos(a)*sp,Math.sin(a)*sp-60*power,rand(.35,.8),color,rand(1.5,3.5),220);
    }
  }
  function spawnRing(x,y,color,vr=280){if(rings.length<8)rings.push({x,y,r:6,vr,alpha:.85,color,width:3});}
  function spawnPopup(x,y,text,color){popups.push({x,y,text,color,life:.95});}
  function drawFxLayers(){
    for(const p of particles){ctx.globalAlpha=clamp(p.life/p.max,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x-p.size/2,p.y-p.size/2,p.size,p.size);}
    ctx.globalAlpha=1;
    for(const r of rings){ctx.globalAlpha=clamp(r.alpha,0,1);ctx.strokeStyle=r.color;ctx.lineWidth=r.width;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,6.283);ctx.stroke();}
    ctx.globalAlpha=1;
    for(const p of popups){
      ctx.globalAlpha=clamp(p.life/.95,0,1);
      glow(p.color,8);ctx.fillStyle=p.color;
      ctx.font=`700 ${Math.max(13,W*.02)}px 'Barlow Condensed',monospace`;ctx.textAlign='center';
      ctx.fillText(p.text,p.x,p.y);noGlow();
    }
    ctx.globalAlpha=1;
  }
  function drawStreaks(){
    const intensity=clamp((speed-18)/10,0,1)+(phase>0?.7:0)-(chrono>0?.35:0);
    if(intensity<=.03)return;
    const vp={x:W*.5,y:horizon()};
    for(let i=0;i<(lowFx?7:16);i++){
      const ang=streakAngles[i];
      const ph=(ambient*2.2+i*.61)%1;
      const r0=H*(.08+ph*.5),r1=r0+H*(.05+.09*ph);
      ctx.globalAlpha=clamp(intensity,0,1)*.2*(1-ph);
      ctx.strokeStyle=i%3?C.cyan:'#ffffff';
      line({x:vp.x+Math.cos(ang)*r0,y:vp.y+Math.sin(ang)*r0},{x:vp.x+Math.cos(ang)*r1,y:vp.y+Math.sin(ang)*r1},ctx.strokeStyle,Math.max(1,W*.0015));
    }
    ctx.globalAlpha=1;
  }

  /* ---------------- hud ---------------- */
  function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1050);}
  function updateHud(){
    const meters=Math.floor(travel*1.6);
    ui.distance.textContent=String(meters).padStart(5,'0');
    ui.coins.textContent=String(shards).padStart(2,'0');
    ui.chargeFill.style.width=`${charge}%`;
    ui.chargeText.textContent=`${Math.floor(charge)}%`;
    ui.chargeHint.textContent=charge>=100?'TAP ✦ / F — PHASE':'COLLECT SHARDS';
    ui.chargeHint.style.color=charge>=100?C.lime:'';
    ui.phaseBtn.classList.toggle('charged',charge>=100&&state==='running');
    const power=phase>0?['✦','PHASING']:shield>0?['⬡','SHIELD']:magnet>0?['⌁','MAGNET']:chrono>0?['◷','SLOW-MO']:null;
    ui.powerIndicator.classList.toggle('active',!!power);
    if(power){ui.powerIcon.textContent=power[0];ui.powerName.textContent=power[1];}
  }

  /* ---------------- items & spawning ---------------- */
  function addItem(kind,laneIndex,dist){items.push({kind,lane:laneIndex,distance:dist,seed:rand(0,10),color:kind==='magnet'?C.cyan:kind==='shield'?C.lime:C.pink});}
  function spawnPack(at){
    const order=Math.floor(at/20),safe=order===0?1:Math.floor(rand(0,3));
    const lanes=[0,1,2].filter(l=>l!==safe),hazard=['crate','gate','train'][order%3];
    addItem(hazard,lanes[0],at);
    if(order>2&&Math.random()<.38)addItem(order%2?'crate':'gate',lanes[1],at);
    for(let i=0;i<5;i++)addItem('shard',safe,at+2.7+i*2.7);
    if(order%4===2){for(let i=0;i<3;i++)addItem('shard',safe===1?2:1,at+14+i*2.6);}
    if(order>1&&order%4===0)addItem(['magnet','shield','chrono'][Math.floor(rand(0,3))],safe,at+8);
  }

  /* ---------------- actions ---------------- */
  function jump(){
    if(state!=='running'||jumpY>.02||sliding>0)return;
    jumpV=8.5;sfx('jump');showToast('HOP!');
  }
  function slide(){if(state!=='running'||jumpY>.12)return;sliding=.62;sfx('slide');}
  function move(dir){if(state!=='running')return;targetLane=clamp(targetLane+dir,0,2);}
  function activatePhase(){
    if(state!=='running')return;
    if(charge>=100){
      charge=0;phase=2.7;shardStreak=0;
      const p=project(-1.62+lane*1.62,0,jumpY);
      spawnRing(p.x,p.y-30,C.cyan,420);
      spawnPopup(p.x,p.y-70,'PHASE BURST',C.cyan);
      showToast('PHASE BURST');sfx('phase');buzz(24);
    }else{sfx('deny');showToast('PHASE NEEDS 100%');}
  }
  function collect(item){
    if(item.kind==='shard'){
      shards++;shardStreak++;charge=clamp(charge+7.5,0,100);score+=10;
      const p=project(laneX[item.lane],item.z);
      spawnBurst(p.x,p.y-p.s*.6,C.lime,7,.7);
      sfx('shard',shardStreak);
    }
    else if(item.kind==='magnet'){magnet=8;showToast('SHARD MAGNET');sfx('power');buzz(15);}
    else if(item.kind==='shield'){shield=1;showToast('ECHO SHIELD');sfx('power');buzz(15);}
    else if(item.kind==='chrono'){chrono=6;showToast('TIME DILATION');sfx('power');buzz(15);}
    if(item.kind!=='shard'){
      const p=project(laneX[item.lane],item.z);
      spawnBurst(p.x,p.y-p.s*.8,item.color,14,1);
      spawnPopup(p.x,p.y-p.s*1.4,item.kind==='magnet'?'MAGNET':item.kind==='shield'?'SHIELD':'SLOW-MO',item.color);
    }
    item.dead=true;
  }
  function crash(){
    if(phase>0)return;
    if(shield>0){
      shield=0;showToast('SHIELD BREAK');flash=.35;shake=7;
      const p=project(-1.62+lane*1.62,0,jumpY);
      spawnRing(p.x,p.y-40,C.lime,360);
      spawnBurst(p.x,p.y-40,C.lime,16,1);
      sfx('break');buzz(30);return;
    }
    state='over';shake=13;flash=.7;
    const p=project(-1.62+lane*1.62,0,jumpY);
    spawnRing(p.x,p.y-40,C.pink,420);
    spawnRing(p.x,p.y-40,C.orange,260);
    spawnBurst(p.x,p.y-40,C.pink,22,1.3);
    spawnBurst(p.x,p.y-40,C.orange,14,1.1);
    const meters=Math.floor(travel*1.6);
    best=Math.max(best,meters);localStorage.setItem('neonrun-best',String(best));
    $('finalDistance').innerHTML=`${meters}<span>m</span>`;
    $('finalCoins').textContent=String(shards);
    $('bestDistance').innerHTML=`${best}<span>m</span>`;
    ui.over.classList.remove('hidden');
    shell.classList.remove('running');
    sfx('crash');buzz([60,40,80]);
  }
  function reset(){
    state='running';items=[];travel=0;spawnAt=34;score=0;shards=0;speed=17;
    lane=1;targetLane=1;jumpY=0;jumpV=0;sliding=0;phase=0;charge=0;shield=0;magnet=0;chrono=0;shake=0;flash=0;elapsed=0;
    particles=[];rings=[];popups=[];trail=[];squash=0;shardStreak=0;
    ui.start.classList.add('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');
    shell.classList.add('running');
    sfx('start');last=performance.now();updateHud();
  }
  function togglePause(){
    if(state==='running'){state='paused';ui.pause.classList.remove('hidden');shell.classList.remove('running');}
    else if(state==='paused'){state='running';ui.pause.classList.add('hidden');shell.classList.add('running');last=performance.now();}
  }

  /* ---------------- sim ---------------- */
  function collide(){
    for(const item of items){
      if(item.dead)continue;
      let laneClose=Math.abs(item.lane-lane)<.55;
      if(item.kind==='shard'&&magnet>0&&item.z<15&&item.z>-.2)laneClose=laneClose||Math.abs(item.lane-lane)<1.55;
      if(!laneClose||item.z>1.2||item.z<-.6)continue;
      if(item.kind==='shard'||['magnet','shield','chrono'].includes(item.kind)){collect(item);continue;}
      if(phase>0)continue;
      const safe=item.kind==='crate'?jumpY>.65:item.kind==='gate'?sliding>0:false;
      if(!safe){crash();return;}
    }
  }
  function update(dt){
    if(state!=='running')return;
    elapsed+=dt;
    const worldScale=chrono>0?.52:1;
    speed=Math.min(28,17+travel*.018);
    travel+=speed*dt*worldScale;
    lane+=(targetLane-lane)*Math.min(1,dt*12);
    if(Math.abs(targetLane-lane)<.012)lane=targetLane;
    if(jumpY>0||jumpV>0){
      jumpY+=jumpV*dt;jumpV-=22*dt;
      if(jumpY<=0){
        jumpY=0;jumpV=0;squash=.18;
        const p=project(-1.62+lane*1.62,0,0);
        for(let i=0;i<(lowFx?3:7);i++)spawnParticle(p.x+rand(-14,14),p.y-2,rand(-50,50),rand(-70,-10),rand(.25,.5),'rgba(190,235,225,.7)',rand(1.5,3),160);
      }
    }
    squash=Math.max(0,squash-dt);
    sliding=Math.max(0,sliding-dt);phase=Math.max(0,phase-dt);magnet=Math.max(0,magnet-dt);chrono=Math.max(0,chrono-dt);
    if(shield>0)shield=Math.max(0,shield-dt);
    while(spawnAt<travel+150){spawnPack(spawnAt);spawnAt+=rand(17,24);}
    for(const item of items)item.z=item.distance-travel;
    if(magnet>0)for(const it of items){if(it.kind==='shard'&&it.z<12&&it.z>0&&Math.abs(it.lane-lane)<1.6)it.lane=Math.round(lane);}
    collide();
    items=items.filter(i=>!i.dead&&i.z>-3);
    if(phase>0){
      const p=project(-1.62+lane*1.62,0,jumpY);
      trail.push({x:p.x,y:p.y,sc:p.s/48,t:elapsed});
    }
    trail=trail.filter(g=>elapsed-g.t<.28);
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=p.grav*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    for(const r of rings){r.r+=r.vr*dt;r.alpha-=dt*1.8;}
    rings=rings.filter(r=>r.alpha>0);
    for(const p of popups){p.y-=34*dt;p.life-=dt;}
    popups=popups.filter(p=>p.life>0);
    frameAvg=frameAvg*.92+(dt*1000)*.08;
    lowFx=frameAvg>23;
    updateHud();
  }

  /* ---------------- render ---------------- */
  function render(now){
    const dt=Math.min(.04,(now-last)/1000||0);last=now;ambient=now/1000;
    shake=Math.max(0,shake-dt*28);flash=Math.max(0,flash-dt*1.5);
    if(state==='running')update(dt);
    else{frameAvg=frameAvg*.92+(dt*1000)*.08;lowFx=frameAvg>23;}
    ctx.clearRect(0,0,W,H);
    ctx.save();
    if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));
    drawBackground();
    drawTrack();
    drawItems();
    drawRunner();
    drawFxLayers();
    drawStreaks();
    if(phase>0){
      const g=ctx.createLinearGradient(0,0,W,0);
      g.addColorStop(0,'rgba(90,244,229,0)');g.addColorStop(.5,`rgba(90,244,229,${.055+.035*Math.sin(ambient*12)})`);g.addColorStop(1,'rgba(90,244,229,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    }
    if(chrono>0){
      ctx.fillStyle=`rgba(120,180,255,${.04+.02*Math.sin(ambient*6)})`;
      ctx.fillRect(0,0,W,H);
    }
    if(flash>0){ctx.fillStyle=`rgba(255,87,135,${flash*.3})`;ctx.fillRect(0,0,W,H);}
    ctx.restore();
    raf=requestAnimationFrame(render);
  }

  /* ---------------- input ---------------- */
  function action(name){if(name==='left')move(-1);else if(name==='right')move(1);else if(name==='jump')jump();else if(name==='slide')slide();else if(name==='phase')activatePhase();}
  $('startBtn').addEventListener('click',reset);
  $('againBtn').addEventListener('click',reset);
  $('resumeBtn').addEventListener('click',togglePause);
  $('pauseBtn').addEventListener('click',togglePause);
  ui.muteBtn.addEventListener('click',()=>{
    AudioFX.muted=!AudioFX.muted;
    ui.muteBtn.textContent=AudioFX.muted?'🔇':'🔊';
    ui.muteBtn.classList.toggle('off',AudioFX.muted);
  });
  $('fsBtn').addEventListener('click',()=>{
    try{
      if(document.fullscreenElement)document.exitFullscreen();
      else document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen().catch(()=>{});
    }catch(e){}
  });
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowleft','arrowright','arrowup','arrowdown',' ','w','a','s','d'].includes(k))e.preventDefault();
    if(state==='ready'){if(k==='enter'||k===' ')reset();return;}
    if(state==='over'){if(k==='enter'||k===' ')reset();return;}
    if(k==='escape'||k==='p'){togglePause();return;}
    if(k==='m'){AudioFX.muted=!AudioFX.muted;ui.muteBtn.textContent=AudioFX.muted?'🔇':'🔊';return;}
    if(state!=='running')return;
    if(k==='arrowleft'||k==='a')move(-1);
    else if(k==='arrowright'||k==='d')move(1);
    else if(k==='arrowup'||k==='w'||k===' ')jump();
    else if(k==='arrowdown'||k==='s')slide();
    else if(k==='f'||k==='shift')activatePhase();
  },{passive:false});
  document.querySelectorAll('.mobile-controls button').forEach(button=>{
    button.addEventListener('pointerdown',e=>{
      e.preventDefault();e.stopPropagation();
      action(button.dataset.action);
      try{button.setPointerCapture&&button.setPointerCapture(e.pointerId);}catch(err){}
    });
  });
  // touch: swipe to move, tap to hop (chained swipes supported)
  let touch=null;
  shell.addEventListener('pointerdown',e=>{
    if(e.target.closest('button,a'))return;
    if(state!=='running'||e.pointerType==='mouse')return;
    touch={x:e.clientX,y:e.clientY,t:performance.now(),moved:false};
  },{passive:true});
  shell.addEventListener('pointermove',e=>{
    if(!touch||state!=='running')return;
    const dx=e.clientX-touch.x,dy=e.clientY-touch.y;
    if(Math.abs(dx)>26){move(dx<0?-1:1);touch.x=e.clientX;touch.y=e.clientY;touch.moved=true;}
    else if(Math.abs(dy)>26){if(dy<0)jump();else slide();touch.x=e.clientX;touch.y=e.clientY;touch.moved=true;}
  },{passive:true});
  shell.addEventListener('pointerup',e=>{
    if(!touch)return;
    const dur=performance.now()-touch.t;
    const dist=Math.hypot(e.clientX-touch.x,e.clientY-touch.y);
    const moved=touch.moved;
    touch=null;
    if(state!=='running'||moved)return;
    if(dist<24&&dur<300)jump();
  },{passive:true});
  shell.addEventListener('pointercancel',()=>{touch=null;},{passive:true});
  shell.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='running')togglePause();});

  /* ---------------- boot ---------------- */
  window.__nr={get jumpY(){return jumpY;},get sliding(){return sliding;},get lane(){return lane;},get state(){return state;}};
  ui.startBest.innerHTML=`${best}<span>m</span>`;
  updateHud();last=performance.now();raf=requestAnimationFrame(render);
})();
