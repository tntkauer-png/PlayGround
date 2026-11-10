(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const $ = id => document.getElementById(id);
  const ui = {distance:$('distance'),coins:$('coins'),chargeFill:$('chargeFill'),chargeText:$('chargeText'),chargeHint:$('chargeHint'),powerIndicator:$('powerIndicator'),powerIcon:$('powerIcon'),powerName:$('powerName'),toast:$('toast'),start:$('startScreen'),pause:$('pauseScreen'),over:$('gameOverScreen')};
  const C = {cyan:'#5af4e5',lime:'#d8ff69',pink:'#ff5da8',orange:'#ffb55d',ink:'#07141d'};
  let W=0,H=0,dpr=1,last=0,raf=0,toastTimer=0;
  let state='ready',items=[],travel=0,spawnAt=24,score=0,shards=0,best=Number(localStorage.getItem('neonrun-best')||0);
  let speed=17,lane=1,targetLane=1,jumpY=0,jumpV=0,sliding=0,phase=0,charge=0,shield=0,magnet=0,chrono=0,shake=0,flash=0,elapsed=0;
  const laneX=[-1.62,0,1.62];
  const rand=(a,b)=>a+Math.random()*(b-a);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  addEventListener('resize',resize,{passive:true});resize();
  function project(x,z,y=0){const horizon=H*.475,scale=(H*.76)/(z+14);return {x:W*.5+x*scale,y:horizon+scale*(2.45-y),s:scale};}
  function poly(points,fill,stroke=null,width=1){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
  function line(a,b,color,width=1){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function glow(color,blur){ctx.shadowColor=color;ctx.shadowBlur=blur;}
  function noGlow(){ctx.shadowBlur=0;}
  function drawBackground(t){
    const sky=ctx.createLinearGradient(0,0,0,H*.65);sky.addColorStop(0,'#0a1a29');sky.addColorStop(.55,'#16303b');sky.addColorStop(1,'#42605e');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    const horizon=H*.475;ctx.fillStyle='#102530';ctx.beginPath();ctx.moveTo(0,horizon+6);
    for(let x=0;x<=W+40;x+=40){const bh=18+((Math.sin(x*.027)+Math.cos(x*.011))*10+15);ctx.lineTo(x,horizon-bh);ctx.lineTo(x+13,horizon-bh);ctx.lineTo(x+13,horizon+6);}
    ctx.lineTo(W,horizon+20);ctx.lineTo(0,horizon+20);ctx.fill();
    const v={x:W*.5,y:horizon+7};const sideGradL=ctx.createLinearGradient(0,0,W*.35,0);sideGradL.addColorStop(0,'#0a1922');sideGradL.addColorStop(1,'#172d34');const sideGradR=ctx.createLinearGradient(W,0,W*.65,0);sideGradR.addColorStop(0,'#0a1922');sideGradR.addColorStop(1,'#172d34');
    poly([{x:0,y:H*.1},{x:W*.17,y:H*.13},v,{x:W*.25,y:H},{x:0,y:H}],sideGradL);poly([{x:W,y:H*.1},{x:W*.83,y:H*.13},v,{x:W*.75,y:H},{x:W,y:H}],sideGradR);
    for(let i=0;i<7;i++){const x=i*W/6;line({x,y:H*.12},{x:W*.5+(x-W*.5)*.11,y:horizon+8},'rgba(125,190,183,.12)',1);}line({x:0,y:H*.14},{x:W,y:H*.14},'rgba(167,213,201,.15)',2);
    for(let side of [-1,1]){const a=project(side*5.05,0),b=project(side*5.05,100);line(a,b,'rgba(87,245,222,.3)',Math.max(1,a.s*.035));for(let z=8;z<100;z+=13){const p=project(side*5.05,z);ctx.fillStyle='rgba(90,244,229,.5)';ctx.fillRect(p.x-p.s*.07,p.y-p.s*.055,p.s*.14,p.s*.07);}}
    if(W>500){ctx.save();ctx.globalAlpha=.72;glow(C.cyan,11);ctx.strokeStyle='rgba(90,244,229,.48)';ctx.lineWidth=1;ctx.strokeRect(W*.438,horizon-22,W*.124,17);noGlow();ctx.fillStyle='#a5fff0';ctx.font=`700 ${Math.max(7,W*.009)}px monospace`;ctx.textAlign='center';ctx.fillText('LAST TRAIN  /  00:09',W*.5,horizon-10);ctx.restore();}
  }
  function drawTrack(){
    const near=project(0,0),far=project(0,145),nearL=project(-4.9,0),nearR=project(4.9,0),farL=project(-4.9,145),farR=project(4.9,145);poly([farL,farR,nearR,nearL],'#1b3035');
    const edgeL=project(-5.3,0),edgeLF=project(-5.3,145),edgeR=project(5.3,0),edgeRF=project(5.3,145);poly([edgeLF,farL,nearL,edgeL],'#273b3b');poly([farR,edgeRF,edgeR,nearR],'#273b3b');
    for(let x of [-3.65,-2.72,-.68,.68,2.72,3.65]){const a=project(x,0),b=project(x,145);line(a,b,x%2===0?'rgba(147,201,187,.36)':'rgba(119,163,153,.22)',Math.max(1,a.s*(x%2===0?.045:.025)));}
    const offset=travel%3.1;for(let z=2.2-offset;z<145;z+=3.1){if(z<0)continue;const l=project(-3.9,z),r=project(3.9,z),d=project(0,z),thick=Math.max(1.2,d.s*.09);line(l,r,'rgba(7,16,19,.72)',thick);}
    for(let x of [-.81,.81]){for(let z=4-(travel%12);z<130;z+=12){if(z<0)continue;const a=project(x,z),b=project(x,z-5);line(a,b,'rgba(94,149,140,.19)',Math.max(1,a.s*.02));}}
    const gl=ctx.createLinearGradient(0,H*.57,0,H);gl.addColorStop(0,'rgba(45,180,167,0)');gl.addColorStop(1,'rgba(45,180,167,.13)');ctx.fillStyle=gl;ctx.fillRect(0,H*.56,W,H*.44);
  }
  function rounded(x,y,w,h,r,fill,stroke){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
  function drawShard(item,p){const bob=Math.sin(elapsed*5+item.seed)*p.s*.07,x=p.x,y=p.y-p.s*.62+bob,sz=p.s*.18;ctx.save();ctx.translate(x,y);ctx.rotate(elapsed*1.6+item.seed);glow(C.lime,13);poly([{x:0,y:-sz},{x:sz*.72,y:0},{x:0,y:sz},{x:-sz*.72,y:0}],C.lime,'rgba(255,255,255,.8)',1);noGlow();ctx.restore();}
  function drawPower(item,p){const s=p.s,x=p.x,y=p.y-s*.8,rad=Math.max(5,s*.22),t=elapsed*2+item.seed;ctx.save();ctx.translate(x,y);glow(item.color,16);ctx.strokeStyle=item.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,0,rad*(1+Math.sin(t)*.12),0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(8,24,31,.9)';ctx.beginPath();ctx.arc(0,0,rad*.72,0,Math.PI*2);ctx.fill();ctx.fillStyle=item.color;ctx.font=`bold ${Math.max(9,rad*1.1)}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(item.kind==='magnet'?'M':item.kind==='shield'?'S':'T',0,1);noGlow();ctx.restore();}
  function drawHazard(item,p){
    const s=p.s,x=p.x,y=p.y;ctx.save();
    if(item.kind==='crate'){const w=s*.82,h=s*.72,top=s*.18,left=x-w/2,right=x+w/2,bottom=y-2;poly([{x:left,y:bottom-h},{x:left+top,y:bottom-h-top},{x:right+top*.55,y:bottom-h-top},{x:right,y:bottom-h}],'#d8733e','#ffb36c',1);poly([{x:left,y:bottom-h},{x:right,y:bottom-h},{x:right,y:bottom},{x:left,y:bottom}],'#994b38','#ff9c5e',1);poly([{x:right,y:bottom-h},{x:right+top*.55,y:bottom-h-top},{x:right+top*.55,y:bottom-top},{x:right,y:bottom}],'#683e3a','#d98656',1);line({x:left+s*.12,y:bottom-h*.5},{x:right-s*.12,y:bottom-h*.5},'rgba(255,215,165,.65)',Math.max(1,s*.04));}
    else if(item.kind==='gate'){const w=s*1.15,h=s*.92,base=y-2;rounded(x-w/2,base-h,w,h*.23,2,'#d54670','#ff8daa');rounded(x-w*.43,base-h*.77,w*.14,h*.74,2,'#9b3456','#ff6f9c');rounded(x+w*.29,base-h*.77,w*.14,h*.74,2,'#9b3456','#ff6f9c');for(let k=-2;k<=2;k++){const bx=x+k*w*.17;line({x:bx,y:base-h*.69},{x:bx,y:base-h*.08},'rgba(255,215,224,.7)',Math.max(1,s*.025));}glow(C.pink,8);line({x:x-w*.42,y:base-h*.08},{x:x+w*.42,y:base-h*.08},'#ff9fbc',Math.max(1,s*.04));noGlow();}
    else{const w=s*1.12,h=s*1.55,base=y-1;poly([{x:x-w*.5,y:base},{x:x-w*.5,y:base-h*.78},{x:x-w*.34,y:base-h},{x:x+w*.34,y:base-h},{x:x+w*.5,y:base-h*.78},{x:x+w*.5,y:base}],'#24545c','#61c9c0',1.2);rounded(x-w*.34,base-h*.72,w*.68,h*.36,4,'#102b36','#5ff4e4');ctx.fillStyle='rgba(141,254,232,.62)';for(let i=0;i<3;i++)ctx.fillRect(x-w*.25+i*w*.22,base-h*.68,w*.09,h*.25);ctx.fillStyle='#ebff78';ctx.fillRect(x-w*.31,base-h*.13,w*.11,Math.max(2,s*.06));ctx.fillRect(x+w*.2,base-h*.13,w*.11,Math.max(2,s*.06));}
    ctx.restore();
  }
  function drawItems(){for(const item of items.slice().sort((a,b)=>b.z-a.z)){if(item.z>145||item.z< -4)continue;const p=project(laneX[item.lane],item.z);if(item.kind==='shard')drawShard(item,p);else if(['magnet','shield','chrono'].includes(item.kind))drawPower(item,p);else drawHazard(item,p);}}
  function drawRunner(){
    const xWorld=-1.62+lane*1.62;const base=project(xWorld,0),p=project(xWorld,0,jumpY),s=p.s;
    const x=base.x,y=p.y,sc=s/48,run=Math.sin(elapsed*13), crouch=sliding>0?1:0;
    // soft foot shadow remains on the rails while hopping
    ctx.save();ctx.globalAlpha=clamp(1-jumpY*.27,.26,.7);ctx.fillStyle='#061117';ctx.beginPath();ctx.ellipse(base.x,base.y-2,s*.32,s*.095,0,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.save();ctx.translate(x,y);ctx.scale(sc,sc);if(crouch)ctx.translate(0,13);
    if(phase>0){ctx.globalAlpha=.42;glow(C.cyan,19);ctx.strokeStyle=C.cyan;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-42,25,48,0,0,Math.PI*2);ctx.stroke();noGlow();ctx.globalAlpha=.42;}
    const swing=sliding>0?0:run*9;
    // legs and hi-top runners
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.strokeStyle='#182a36';ctx.lineWidth=8;line({x:-6,y:-20},{x:-8+swing*.5,y:-4},ctx.strokeStyle,8);line({x:7,y:-20},{x:7-swing*.5,y:-5},ctx.strokeStyle,8);
    ctx.strokeStyle='#eff9ed';line({x:-8+swing*.5,y:-5},{x:-3+swing*.5,y:-2},ctx.strokeStyle,6);line({x:7-swing*.5,y:-5},{x:12-swing*.5,y:-2},ctx.strokeStyle,6);
    ctx.strokeStyle=C.pink;line({x:-8+swing*.5,y:-1},{x:-1+swing*.5,y:-1},ctx.strokeStyle,2);line({x:7-swing*.5,y:-1},{x:14-swing*.5,y:-1},ctx.strokeStyle,2);
    // body jacket, angled while moving
    ctx.save();ctx.rotate(targetLane>lane?-.08:targetLane<lane?.08:run*.025);
    poly([{x:-12,y:-52},{x:-9,y:-68},{x:0,y:-72},{x:10,y:-67},{x:14,y:-51},{x:9,y:-27},{x:-10,y:-27}],phase>0?'#64eee0':'#1ba99f','#a2fff0',1);
    poly([{x:-2,y:-66},{x:2,y:-66},{x:3,y:-31},{x:-3,y:-31}], '#d8ff69');
    // arms pump with the run cycle
    ctx.strokeStyle='#e99b75';ctx.lineWidth=6;
    line({x:-10,y:-61},{x:-16-run*3,y:-46+run*4},ctx.strokeStyle,6);line({x:11,y:-60},{x:17+run*3,y:-47-run*4},ctx.strokeStyle,6);
    ctx.strokeStyle='#168c87';ctx.lineWidth=7;line({x:-10,y:-59},{x:-15-run*3,y:-45+run*4},ctx.strokeStyle,7);line({x:11,y:-58},{x:16+run*3,y:-46-run*4},ctx.strokeStyle,7);
    ctx.restore();
    // face, dark swept hair and visor
    ctx.fillStyle='#df9877';ctx.beginPath();ctx.ellipse(0,-79,9,10,0,0,Math.PI*2);ctx.fill();
    poly([{x:-9,y:-82},{x:-7,y:-91},{x:2,y:-94},{x:10,y:-89},{x:8,y:-84},{x:1,y:-86},{x:-3,y:-81}], '#15242e');
    rounded(-8,-81,16,5,2,'#0e2931','#5af4e5');ctx.fillStyle=C.lime;ctx.fillRect(4,-80,2,2);
    // scarf trail
    ctx.fillStyle=phase>0?'rgba(90,244,229,.75)':'#ff5da8';poly([{x:-6,y:-67},{x:-16-run*3,y:-64},{x:-22-run*7,y:-69},{x:-15-run*4,y:-60},{x:-5,y:-61}],ctx.fillStyle);
    if(shield>0){ctx.globalAlpha=.45+.15*Math.sin(elapsed*8);ctx.strokeStyle=C.lime;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-47,27,51,0,0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function showToast(text){ui.toast.textContent=text;ui.toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>ui.toast.classList.remove('show'),1050);}
  function updateHud(){
    const meters=Math.floor(travel*1.6);ui.distance.textContent=String(meters).padStart(5,'0');ui.coins.textContent=String(shards).padStart(2,'0');
    ui.chargeFill.style.width=`${charge}%`;ui.chargeText.textContent=`${Math.floor(charge)}%`;
    ui.chargeHint.textContent=charge>=100?'F / ✦ TO PHASE BURST':'COLLECT SHARDS TO CHARGE';ui.chargeHint.style.color=charge>=100?C.lime:'';
    const power=phase>0?['✦','PHASING']:shield>0?['⬡','SHIELD']:magnet>0?['⌁','SHARD MAGNET']:chrono>0?['◷','TIME DILATION']:null;
    ui.powerIndicator.classList.toggle('active',!!power);if(power){ui.powerIcon.textContent=power[0];ui.powerName.textContent=power[1];}
  }
  function addItem(kind,laneIndex,dist){items.push({kind,lane:laneIndex,distance:dist,seed:rand(0,10),color:kind==='magnet'?C.cyan:kind==='shield'?C.lime:C.pink});}
  function spawnPack(at){
    const order=Math.floor(at/20), safe=Math.floor(rand(0,3));
    // One opening lane per wave; paired hazards teach fast lane changes without dead ends.
    const lanes=[0,1,2].filter(l=>l!==safe), hazard=['crate','gate','train'][order%3];
    addItem(hazard,lanes[0],at);if(order>2&&Math.random()<.38)addItem(order%2?'crate':'gate',lanes[1],at);
    const trailLane=safe;
    for(let i=0;i<5;i++)addItem('shard',trailLane,at+2.7+i*2.7);
    // occasional trail bends into the adjacent safe lane
    if(order%4===2){for(let i=0;i<3;i++)addItem('shard',safe===1?2:1,at+14+i*2.6);}
    if(order>1&&order%4===0)addItem(['magnet','shield','chrono'][Math.floor(rand(0,3))],safe,at+8);
  }
  function jump(){if(state!=='running'||jumpY>0.02||sliding>0)return;jumpV=8.5;showToast('HOP!');}
  function slide(){if(state!=='running'||jumpY>0.12)return;sliding=.62;}
  function move(dir){if(state!=='running')return;targetLane=clamp(targetLane+dir,0,2);}
  function activatePhase(){if(state!=='running')return;if(charge>=100){charge=0;phase=2.7;showToast('PHASE BURST');}else showToast('PHASE NEEDS 100%');}
  function collect(item){
    if(item.kind==='shard'){shards++;charge=clamp(charge+7.5,0,100);score+=10;}
    else if(item.kind==='magnet'){magnet=8;showToast('SHARD MAGNET');}
    else if(item.kind==='shield'){shield=1;showToast('ECHO SHIELD');}
    else if(item.kind==='chrono'){chrono=6;showToast('TIME DILATION');}
    item.dead=true;
  }
  function crash(){
    if(phase>0)return;
    if(shield>0){shield=0;showToast('SHIELD BREAK');flash=.35;shake=7;return;}
    state='over';shake=13;flash=.7;const meters=Math.floor(travel*1.6);best=Math.max(best,meters);localStorage.setItem('neonrun-best',String(best));
    $('finalDistance').innerHTML=`${meters}<span>m</span>`;$('finalCoins').textContent=String(shards);$('bestDistance').innerHTML=`${best}<span>m</span>`;
    ui.over.classList.remove('hidden');document.querySelector('.game-shell').classList.remove('running');$('mobileControls').style.display='none';
  }
  function reset(){
    state='running';items=[];travel=0;spawnAt=24;score=0;shards=0;speed=17;lane=1;targetLane=1;jumpY=0;jumpV=0;sliding=0;phase=0;charge=0;shield=0;magnet=0;chrono=0;shake=0;flash=0;elapsed=0;
    ui.start.classList.add('hidden');ui.pause.classList.add('hidden');ui.over.classList.add('hidden');document.querySelector('.game-shell').classList.add('running');$('mobileControls').style.display='';last=performance.now();updateHud();
  }
  function togglePause(){if(state==='running'){state='paused';ui.pause.classList.remove('hidden');document.querySelector('.game-shell').classList.remove('running');}else if(state==='paused'){state='running';ui.pause.classList.add('hidden');document.querySelector('.game-shell').classList.add('running');last=performance.now();}}
  function collide(){
    for(const item of items){if(item.dead)continue;let laneClose=Math.abs(item.lane-lane)<.55;
      if(item.kind==='shard'&&magnet>0&&item.z<15&&item.z>-.2)laneClose=laneClose||Math.abs(item.lane-lane)<1.55;
      if(!laneClose||item.z>1.2||item.z<-.6)continue;
      if(item.kind==='shard'||['magnet','shield','chrono'].includes(item.kind)){collect(item);continue;}
      if(phase>0)continue;
      const safe=item.kind==='crate'?jumpY>.65:item.kind==='gate'?sliding>0:item.kind==='train'?false:false;
      if(!safe){crash();return;}
    }
  }
  function update(dt){
    if(state!=='running')return;elapsed+=dt;const worldScale=chrono>0?.52:1;speed=Math.min(28,17+travel*.018);travel+=speed*dt*worldScale;
    lane+=(targetLane-lane)*Math.min(1,dt*12);if(Math.abs(targetLane-lane)<.012)lane=targetLane;
    if(jumpY>0||jumpV>0){jumpY+=jumpV*dt;jumpV-=22*dt;if(jumpY<=0){jumpY=0;jumpV=0;}}
    sliding=Math.max(0,sliding-dt);phase=Math.max(0,phase-dt);magnet=Math.max(0,magnet-dt);chrono=Math.max(0,chrono-dt);if(shield>0)shield=Math.max(0,shield-dt);
    while(spawnAt<travel+145){spawnPack(spawnAt);spawnAt+=rand(17,24);}
    for(const item of items)item.z=item.distance-travel;
    if(magnet>0){for(const it of items){if(it.kind==='shard'&&it.z<12&&it.z>0&&Math.abs(it.lane-lane)<1.6){it.lane=Math.round(lane);}}}
    collide();items=items.filter(i=>!i.dead&&i.z>-3);
    shake=Math.max(0,shake-dt*28);flash=Math.max(0,flash-dt*1.5);updateHud();
  }
  function render(now){
    const dt=Math.min(.04,(now-last)/1000||0);last=now;
    if(state==='running')update(dt);
    ctx.save();if(shake>0)ctx.translate(rand(-shake,shake),rand(-shake,shake));
    drawBackground(now/1000);drawTrack();drawItems();drawRunner();
    if(phase>0){const g=ctx.createLinearGradient(0,0,W,0);g.addColorStop(0,'rgba(90,244,229,0)');g.addColorStop(.5,`rgba(90,244,229,${.055+.035*Math.sin(elapsed*12)})`);g.addColorStop(1,'rgba(90,244,229,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
    if(flash>0){ctx.fillStyle=`rgba(255,87,135,${flash*.3})`;ctx.fillRect(0,0,W,H);}ctx.restore();
    raf=requestAnimationFrame(render);
  }
  function action(name){if(name==='left')move(-1);else if(name==='right')move(1);else if(name==='jump')jump();else if(name==='slide')slide();else if(name==='phase')activatePhase();}
  $('startBtn').addEventListener('click',reset);$('againBtn').addEventListener('click',reset);$('resumeBtn').addEventListener('click',togglePause);$('pauseBtn').addEventListener('click',togglePause);
  addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();if(['arrowleft','arrowright','arrowup','arrowdown',' ','w','a','s','d'].includes(k))e.preventDefault();
    if(state==='ready'){if(k==='enter'||k===' ')reset();return;}
    if(state==='over'){if(k==='enter'||k===' ')reset();return;}
    if(k==='escape'||k==='p'){togglePause();return;}if(state!=='running')return;
    if(k==='arrowleft'||k==='a')move(-1);else if(k==='arrowright'||k==='d')move(1);else if(k==='arrowup'||k==='w'||k===' ')jump();else if(k==='arrowdown'||k==='s')slide();else if(k==='f'||k==='shift')activatePhase();
  },{passive:false});
  document.querySelectorAll('.mobile-controls button').forEach(button=>{
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);action(button.dataset.action);});
  });
  let touchStart=null;canvas.addEventListener('touchstart',e=>{if(state!=='running'||e.touches.length!==1)return;touchStart={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  canvas.addEventListener('touchend',e=>{if(!touchStart)return;const t=e.changedTouches[0],dx=t.clientX-touchStart.x,dy=t.clientY-touchStart.y;touchStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;if(Math.abs(dx)>Math.abs(dy))move(dx<0?-1:1);else if(dy<0)jump();else slide();},{passive:true});
  updateHud();last=performance.now();raf=requestAnimationFrame(render);
})();
