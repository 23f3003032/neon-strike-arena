(() => {
const $ = id => document.getElementById(id);
const socket = io({transports:["websocket","polling"]});
let myId=null, roomCode=null, state=null, phase="home", aim={x:600,y:380}, keys=new Set(), pointerFire=false, mobileFire=false, paused=false, pauseStarted=0, moveStick={x:0,y:0}, aimStick={x:0,y:0}, lastInput=0, toastTimer=null, shieldReadyAt=0, soundOn=false, audioCtx=null, feedItems=[], soloMode=false, soloLast=0, soloLastShot=0, soloStarted=0, soloDifficulty="NORMAL", soloLevel=1, soloSpawned=0, soloWaveSize=0, soloNextSpawn=0, soloIntermissionUntil=0, soloBotSerial=0;
const canvas=$("arena"), ctx=canvas.getContext("2d");
const screens={home:$("home"),lobby:$("lobby"),game:$("game")};
function showScreen(name){Object.values(screens).forEach(s=>s.classList.add("hidden"));screens[name].classList.remove("hidden");phase=name;if(name==="home"&&soundOn)startTheme();}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("show"),2400);}
function setError(id,msg){$(id).textContent=msg||"";}
function emitAck(event,payload){return new Promise(resolve=>socket.emit(event,payload,resolve));}
function name(){return $("playerName").value.trim().slice(0,16)||"PLAYER";}
function enterLobby(data){roomCode=data.code;myId=data.playerId;$("lobbyCode").textContent=roomCode;$("footerRoom").textContent="ROOM "+roomCode;showScreen("lobby");setError("homeError","");}
socket.on("connect",()=>{$("connection").textContent="CONNECTED";$("connection").style.color="var(--green)";});
socket.on("disconnect",()=>{$("connection").textContent="RECONNECTING";$("connection").style.color="var(--danger)";toast("Connection lost. Reconnecting…");});
socket.on("welcome",d=>{myId=d.id;});
socket.on("state",s=>{state=s;if(!roomCode)roomCode=s.code;if(s.phase==="lobby"&&phase==="home")showScreen("lobby");if(s.phase==="playing"&&phase!=="game"){showScreen("game");$("gameOverlay").classList.add("hidden");}renderState(s);});
socket.on("roundStarted",d=>{paused=false;$("pauseOverlay").classList.add("hidden");$("pauseBtn").textContent="PAUSE";showScreen("game");$("gameOverlay").classList.add("hidden");$("roundNo").textContent="ROUND "+String(d.round).padStart(2,"0");addFeed("MATCH STARTED — SURVIVE THE CHAOS");beep(660,.12);});
socket.on("roundEnd",d=>{const mine=d.leaderboard.find(p=>p.id===myId);$("resultTitle").textContent=d.winner?.name===name()?"VICTORY":"MATCH OVER";$("resultSub").textContent=d.winner?`${d.winner.name} takes the arena with ${d.winner.score} points.`:"No winner this round."; $("resultScores").innerHTML=d.leaderboard.slice(0,5).map((p,i)=>`<div class="result-row"><span>${i+1}. ${escapeHtml(p.name)}</span><strong>${p.score}</strong></div>`).join("");$("againBtn").style.display=state?.hostId===myId?"flex":"none";$("gameOverlay").classList.remove("hidden");addFeed("ROUND COMPLETE");});
socket.on("elimination",d=>{addFeed(`<span class="feed-kill">${escapeHtml(d.by)}</span> eliminated ${escapeHtml(d.victim)}`);if(d.victim===name())beep(140,.3);else beep(480,.07);});
socket.on("toast",msg=>toast(msg));
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("editNameBtn").addEventListener("click",async()=>{
  const field=$("lobbyPlayerName");
  const newName=field.value.trim().slice(0,16);
  if(!newName){$("nameError").textContent="Enter a player name.";return;}
  $("editNameBtn").disabled=true;
  const r=await emitAck("changeName",{name:newName});
  $("editNameBtn").disabled=false;
  if(r?.ok){
    $("playerName").value=r.name;
    field.value=r.name;
    $("nameError").textContent="Name updated successfully!";
  }else{
    $("nameError").textContent=r?.error||"Could not update name.";
  }
});

$("createBtn").addEventListener("click",async()=>{setError("homeError","");$("createBtn").disabled=true;const r=await emitAck("createRoom",{name:name()});$("createBtn").disabled=false;if(r?.ok)enterLobby(r);else setError("homeError",r?.error||"Could not create room.");});
$("soloBtn").addEventListener("click",()=>startSolo());
function makeSoloBot(level){
 const colors=["#ff5cf4","#ffbd59","#9c8cff","#ff6b8b","#5effb1"];
 const names=["GLITCH","VANTA","BYTE","PHANTOM","ZERO","NOVA","STATIC","PIXEL"];
 const angle=Math.random()*Math.PI*2;
 return {id:"bot-"+(soloBotSerial++),name:names[Math.floor(Math.random()*names.length)],x:Math.max(45,Math.min(1155,600+Math.cos(angle)*380)),y:Math.max(45,Math.min(715,380+Math.sin(angle)*280)),hp:Math.min(100,65+level*5),score:0,kills:0,alive:true,color:colors[Math.floor(Math.random()*colors.length)],shield:false,bot:true,fireAt:Date.now()+2500+Math.random()*1800,level};
}
function spawnSoloBot(){if(!state)return;state.players.push(makeSoloBot(soloLevel));soloSpawned++;}
function startSolo(){
 soloMode=true;roomCode=null;myId="solo-player";shieldReadyAt=0;feedItems=[];soloStarted=Date.now();soloLast=soloStarted;soloLastShot=0;soloLevel=1;soloSpawned=0;soloBotSerial=0;soloWaveSize=2;soloNextSpawn=soloStarted;soloIntermissionUntil=0;
 const me={id:myId,name:name(),x:600,y:380,hp:100,score:0,kills:0,alive:true,color:"#6ef3ff",shield:false};
 state={code:"SOLO",phase:"playing",hostId:myId,players:[me],bullets:[],hazards:[{id:"solo-hazard",x:600,y:380,r:34,angle:0,warning:false}],pickups:[],now:Date.now(),endsAt:soloStarted+900000,arena:{w:1200,h:760},leaderboard:[]};
 spawnSoloBot();spawnSoloBot();soloNextSpawn=soloStarted+4500;
 $("roundNo").textContent="LEVEL 01";$("timerLabel").textContent="LEVEL SURVIVAL";$("leaderTitle").textContent="ARENA RANKING";$("againBtn").style.display="flex";$("lobbyBtn").textContent="BACK TO HOME";$("gameOverlay").classList.add("hidden");showScreen("game");addFeed("LEVEL 1 // TWO SCOUT BOTS DEPLOYED");beep(660,.14);renderState(state);
}
$("joinBtn").addEventListener("click",async()=>{setError("homeError","");const code=$("roomCode").value.trim().toUpperCase();if(code.length!==5){setError("homeError","Enter the 5-character room code.");return;}const r=await emitAck("joinRoom",{code,name:name()});if(r?.ok)enterLobby(r);else setError("homeError",r?.error||"Could not join room.");});
$("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5));
$("copyCodeBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(roomCode);toast("ROOM CODE COPIED");}catch{toast("ROOM CODE: "+roomCode);}});
$("startBtn").addEventListener("click",async()=>{setError("lobbyError","");const r=await emitAck("startRound");if(r&&!r.ok)setError("lobbyError",r.error);});
$("againBtn").addEventListener("click",()=>{if(soloMode){startSolo();return;}socket.emit("playAgain");});
$("lobbyBtn").addEventListener("click",()=>{if(soloMode){soloMode=false;state=null;$("gameOverlay").classList.add("hidden");showScreen("home");$("lobbyBtn").textContent="BACK TO LOBBY";return;}if(state?.phase==="results"){showScreen("lobby");$("gameOverlay").classList.add("hidden");}else toast("Wait for the round to finish.");});
$("shieldBtn").addEventListener("click",activateShield);$("mobileShield").addEventListener("click",activateShield);
function activateShield(){socket.emit("useAbility");shieldReadyAt=Date.now()+12000;beep(820,.08);}
function renderState(s){
 if(s.code!==roomCode)roomCode=s.code;
 if(s.phase==="lobby"){showScreen("lobby");$("lobbyCode").textContent=s.code;$("playerCount").textContent=String(s.players.length).padStart(2,"0")+" / 08";$("startBtn").style.display=s.hostId===myId?"flex":"none";$("playerList").innerHTML=s.players.map((p,i)=>`<div class="player-card"><div class="player-avatar" style="color:${p.color}">${escapeHtml(p.name.slice(0,1).toUpperCase())}</div><div style="min-width:0"><b>${escapeHtml(p.name)}</b><small>${p.id===s.hostId?"ROOM HOST":"OPERATOR "+String(i+1).padStart(2,"0")}</small></div>${p.id===myId?'<span class="you-tag">YOU</span>':""}</div>`).join("");}
 if(s.phase==="playing"){showScreen("game");const me=s.players.find(p=>p.id===myId);if(me){$("healthText").textContent=Math.ceil(me.hp)+"%";$("healthBar").style.width=me.hp+"%";$("healthBar").style.background=me.hp<30?"linear-gradient(90deg,#ff5e7e,#ff9d7c)":"linear-gradient(90deg,#60f2b2,#c4ff83)";$("kills").textContent=String(me.kills).padStart(2,"0");$("score").textContent=String(me.score).padStart(4,"0");$("operatorState").textContent=me.alive?"ACTIVE":"ELIMINATED";$("operatorState").className=me.alive?"state-alive":"state-dead";}const sec=Math.max(0,Math.ceil((s.endsAt-Date.now())/1000));$("timer").textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0");$("leaderboard").innerHTML=s.leaderboard.map((p,i)=>`<div class="leader-row"><span class="leader-rank">${String(i+1).padStart(2,"0")}</span><span class="leader-name">${escapeHtml(p.name)}${p.id===myId?" (YOU)":""}</span><span class="leader-score">${p.score}</span></div>`).join("");const left=Math.max(0,shieldReadyAt-Date.now());$("shieldCooldown").textContent=left?" "+Math.ceil(left/1000)+"s":"READY";$("shieldBtn").disabled=!!left;draw(s);}
}
function addFeed(html){feedItems.unshift(html);feedItems=feedItems.slice(0,7);$("feed").innerHTML=feedItems.map(x=>`<p>› ${x}</p>`).join("");}
let musicTimer=null,musicStep=0,lastGunSound=0;
function audio(){audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();return audioCtx;}
function tone(freq,dur,type="sine",volume=.035,when=0){if(!soundOn)return;try{const a=audio(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,a.currentTime+when);g.gain.setValueAtTime(.0001,a.currentTime+when);g.gain.exponentialRampToValueAtTime(volume,a.currentTime+when+.015);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+when+dur);o.connect(g);g.connect(a.destination);o.start(a.currentTime+when);o.stop(a.currentTime+when+dur+.03);}catch{}}
function beep(freq,dur){tone(freq,dur,"sine",.035);}
function gunSound(){const n=Date.now();if(n-lastGunSound<115)return;lastGunSound=n;tone(150,.075,"sawtooth",.055);tone(65,.09,"triangle",.05,.015);tone(950,.035,"square",.012);}
function startTheme(){if(musicTimer)clearInterval(musicTimer);musicStep=0;const notes=[110,164.81,220,164.81,130.81,196,261.63,196];musicTimer=setInterval(()=>{if(!soundOn||!audioCtx||phase!=="home")return;const n=notes[musicStep++%notes.length];tone(n,.32,"triangle",.018);tone(n*2,.16,"sine",.008,.06);if(musicStep%4===0)tone(55,.18,"sine",.025);},360);}
$("soundBtn").addEventListener("click",()=>{soundOn=!soundOn;$("soundBtn").textContent=soundOn?"♫ SOUND ON":"♫ SOUND OFF";$("soundBtn").classList.toggle("sound-on",soundOn);if(soundOn){audio();beep(520,.08);startTheme();}else if(musicTimer){clearInterval(musicTimer);musicTimer=null;}});
function draw(s){
 const w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);ctx.fillStyle="#080e1c";ctx.fillRect(0,0,w,h);
 ctx.strokeStyle="#14243a";ctx.lineWidth=1;for(let x=0;x<w;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
 ctx.strokeStyle="#3b6176";ctx.lineWidth=3;ctx.strokeRect(10,10,w-20,h-20);ctx.strokeStyle="#1d4d63";ctx.lineWidth=1;ctx.strokeRect(18,18,w-36,h-36);
 // Animated concentric danger field
 const t=Date.now()/1000;ctx.save();ctx.translate(w/2,h/2);ctx.rotate(t*.08);ctx.strokeStyle="#ff56d81d";ctx.lineWidth=2;ctx.setLineDash([12,18]);for(let r=95;r<520;r+=70){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}ctx.restore();ctx.setLineDash([]);
 for(const hz of s.hazards||[]){ctx.save();ctx.translate(hz.x,hz.y);ctx.rotate(hz.angle||0);ctx.strokeStyle=hz.warning?"#ffbd59":"#ff5578";ctx.lineWidth=3;ctx.shadowBlur=hz.warning?12:22;ctx.shadowColor=ctx.strokeStyle;ctx.beginPath();ctx.arc(0,0,hz.r,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(-hz.r-8,0);ctx.lineTo(hz.r+8,0);ctx.moveTo(0,-hz.r-8);ctx.lineTo(0,hz.r+8);ctx.stroke();if(hz.warning){ctx.font="bold 12px monospace";ctx.fillStyle="#ffbd59";ctx.textAlign="center";ctx.fillText("DANGER",0,-hz.r-12);}ctx.restore();}
 for(const it of s.pickups||[]){ctx.save();ctx.translate(it.x,it.y);ctx.shadowBlur=18;ctx.shadowColor=it.kind==="heal"?"#b8ff72":"#63f4ff";ctx.fillStyle=it.kind==="heal"?"#b8ff72":"#63f4ff";ctx.rotate(t);ctx.fillRect(-9,-9,18,18);ctx.fillStyle="#07111c";ctx.font="bold 13px monospace";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(it.kind==="heal"?"+":"»",0,0);ctx.restore();}
 for(const b of s.bullets||[]){ctx.beginPath();ctx.strokeStyle=b.color;ctx.lineWidth=4;ctx.shadowBlur=15;ctx.shadowColor=b.color;ctx.moveTo(b.x-b.vx*.025,b.y-b.vy*.025);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.shadowBlur=0;}
 for(const p of s.players||[]){
  ctx.save();ctx.translate(p.x,p.y);ctx.globalAlpha=p.alive?1:.24;
  // Aim each human operator's rifle toward the player (or the mouse for YOU).
  const target=p.id===myId?aim:(s.players.find(q=>q.id===myId)||{x:p.x+1,y:p.y});
  const facing=Math.atan2(target.y-p.y,target.x-p.x);ctx.rotate(facing);
  const suit=p.id===myId?"#203c52":"#273044", trim=p.color||"#ff5cf4";
  ctx.shadowBlur=16;ctx.shadowColor=trim;
  // Boots and legs
  ctx.fillStyle="#101827";ctx.strokeStyle="#71869b";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.roundRect(-10,3,8,17,3);ctx.roundRect(3,3,8,17,3);ctx.fill();ctx.stroke();
  ctx.fillStyle="#080e18";ctx.fillRect(-12,16,11,5);ctx.fillRect(2,16,11,5);
  // Tactical torso and shoulder plates
  ctx.fillStyle=suit;ctx.strokeStyle=trim;ctx.lineWidth=2;
  ctx.beginPath();ctx.roundRect(-12,-12,24,23,6);ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle="#53677b";ctx.fillRect(-7,-8,14,3);ctx.fillRect(-6,0,12,3);
  // Arms reaching forward to hold the weapon
  ctx.strokeStyle="#b7c7d5";ctx.lineWidth=5;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(7,-7);ctx.lineTo(13,-2);ctx.lineTo(19,-1);ctx.moveTo(7,6);ctx.lineTo(13,3);ctx.lineTo(19,2);ctx.stroke();
  // Human head, neck, helmet and luminous visor
  ctx.fillStyle="#c58f70";ctx.beginPath();ctx.arc(0,-17,7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle="#26384c";ctx.strokeStyle=trim;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(0,-19,7,Math.PI,Math.PI*2);ctx.lineTo(7,-17);ctx.lineTo(-7,-17);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle=trim;ctx.fillRect(2,-19,5,2);
  // Clearly visible futuristic rifle held in both hands
  ctx.fillStyle="#0a1019";ctx.strokeStyle="#91a8bc";ctx.lineWidth=1.2;
  ctx.beginPath();ctx.roundRect(13,-4,23,7,2);ctx.fill();ctx.stroke();
  ctx.fillStyle=trim;ctx.fillRect(27,-3,8,2);ctx.fillStyle="#526579";ctx.fillRect(17,3,4,6);ctx.fillRect(17,-6,13,2);
  ctx.fillStyle="#d8f6ff";ctx.fillRect(35,-2,3,2);
  ctx.restore();
  // Shield ring and readable name/health stay upright
  ctx.save();ctx.translate(p.x,p.y);if(p.shield){ctx.beginPath();ctx.strokeStyle="#9c8cff";ctx.lineWidth=3;ctx.shadowBlur=14;ctx.shadowColor="#9c8cff";ctx.arc(0,0,28,0,Math.PI*2);ctx.stroke();}
  ctx.shadowBlur=0;ctx.fillStyle="#e8f3ff";ctx.font="11px monospace";ctx.textAlign="center";ctx.fillText(p.name+(p.id===myId?" ◂":""),0,-34);
  ctx.fillStyle="#28364e";ctx.fillRect(-18,25,36,4);ctx.fillStyle=p.hp<30?"#ff5e7e":"#b8ff72";ctx.fillRect(-18,25,36*Math.max(0,p.hp)/100,4);ctx.restore();
 }
 // Crosshair tracks aim position
 ctx.save();ctx.translate(aim.x,aim.y);ctx.strokeStyle="#d9fcff";ctx.lineWidth=1.5;ctx.shadowBlur=8;ctx.shadowColor="#63f4ff";ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.moveTo(-15,0);ctx.lineTo(-5,0);ctx.moveTo(5,0);ctx.lineTo(15,0);ctx.moveTo(0,-15);ctx.lineTo(0,-5);ctx.moveTo(0,5);ctx.lineTo(0,15);ctx.stroke();ctx.restore();
}
function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*canvas.width,y:(e.clientY-r.top)/r.height*canvas.height};}
canvas.addEventListener("pointermove",e=>{aim=canvasPoint(e);});canvas.addEventListener("pointerdown",e=>{if(e.pointerType==="mouse"){pointerFire=true;aim=canvasPoint(e);canvas.setPointerCapture(e.pointerId);}});window.addEventListener("pointerup",()=>pointerFire=false);canvas.addEventListener("contextmenu",e=>e.preventDefault());
window.addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();
  const target=e.target;
  const typing=target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT","TEXTAREA","SELECT"].includes(target.tagName));

  if(typing) return;

  if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) e.preventDefault();
  keys.add(k);
  if(k===" "&&!e.repeat) mobileFire=true;
});
window.addEventListener("keyup",e=>{
  const k=e.key.toLowerCase();
  keys.delete(k);
  if(k===" ") mobileFire=false;
});window.addEventListener("blur",()=>{keys.clear();pointerFire=false;mobileFire=false;});
const dirs={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};document.querySelectorAll("[data-dir]").forEach(btn=>{const k=btn.dataset.dir;const down=e=>{e.preventDefault();keys.add("mobile-"+k);};const up=e=>{e.preventDefault();keys.delete("mobile-"+k);};btn.addEventListener("pointerdown",down);btn.addEventListener("pointerup",up);btn.addEventListener("pointercancel",up);btn.addEventListener("pointerleave",up);});
$("mobileFire").addEventListener("pointerdown",e=>{e.preventDefault();mobileFire=true;});["pointerup","pointercancel","pointerleave"].forEach(ev=>$("mobileFire").addEventListener(ev,()=>mobileFire=false));

function setPaused(value){
 if(!state || state.phase!=="playing")return;
 if(value===paused)return;
 paused=value;
 if(paused){
  pauseStarted=Date.now();
  pointerFire=false;mobileFire=false;keys.clear();
  $("pauseOverlay").classList.remove("hidden");
  $("pauseBtn").textContent="RESUME";
  toast(soloMode?"GAME PAUSED":"LOCAL PAUSE — MATCH CONTINUES");
 }else{
  if(soloMode&&state)state.endsAt+=Date.now()-pauseStarted;
  $("pauseOverlay").classList.add("hidden");
  $("pauseBtn").textContent="PAUSE";
  lastInput=Date.now();
 }
}

function setupStick(id,knobId,onChange){
 const pad=$(id),knob=$(knobId);
 if(!pad||!knob)return;
 let active=false,pointerId=null;
 const reset=()=>{
  active=false;pointerId=null;
  knob.style.transform="translate(0px,0px)";
  onChange(0,0);
 };
 pad.addEventListener("pointerdown",e=>{
  e.preventDefault();active=true;pointerId=e.pointerId;
  pad.setPointerCapture(pointerId);
  update(e);
 });
 function update(e){
  if(!active||e.pointerId!==pointerId)return;
  const r=pad.getBoundingClientRect();
  const radius=Math.max(15,r.width*.34);
  let x=(e.clientX-(r.left+r.width/2))/radius;
  let y=(e.clientY-(r.top+r.height/2))/radius;
  const length=Math.hypot(x,y);
  if(length>1){x/=length;y/=length;}
  onChange(x,y);
  knob.style.transform=`translate(${x*radius*.72}px,${y*radius*.72}px)`;
 }
 pad.addEventListener("pointermove",update);
 pad.addEventListener("pointerup",e=>{if(e.pointerId===pointerId)reset();});
 pad.addEventListener("pointercancel",reset);
 pad.addEventListener("lostpointercapture",reset);
}

setupStick("moveStick","moveKnob",(x,y)=>{moveStick={x,y};});
setupStick("aimStick","aimKnob",(x,y)=>{
 aimStick={x,y};
 if(Math.hypot(x,y)>.12){
  const me=state?.players?.find(p=>p.id===myId);
  if(me){
   aim.x=Math.max(0,Math.min(1200,me.x+x*450));
   aim.y=Math.max(0,Math.min(760,me.y+y*450));
  }
 }
});

$("pauseBtn").addEventListener("click",()=>setPaused(!paused));
$("resumeBtn").addEventListener("click",()=>setPaused(false));
$("pauseRestartBtn").addEventListener("click",()=>{
 if(soloMode){paused=false;startSolo();}
 else toast("Multiplayer matches can be replayed after the round ends.");
});
$("pauseHomeBtn").addEventListener("click",()=>{
 paused=false;pointerFire=false;mobileFire=false;keys.clear();
 if(!soloMode&&roomCode)socket.emit("leaveRoom");
 soloMode=false;state=null;roomCode=null;myId=null;
 $("pauseOverlay").classList.add("hidden");
 $("gameOverlay").classList.add("hidden");
 $("footerRoom").textContent="NO ACTIVE ROOM";
 showScreen("home");
});

function updateSolo(now,x,y,fire){
 if(!soloMode||!state||state.phase!=="playing")return;
 const dt=Math.min(.06,Math.max(0,(now-soloLast)/1000));soloLast=now;
 const me=state.players[0];if(!me.alive)return;
 me.x=Math.max(22,Math.min(1178,me.x+x*220*dt));me.y=Math.max(22,Math.min(738,me.y+y*220*dt));
 if(fire&&now-soloLastShot>175){const dx=aim.x-me.x,dy=aim.y-me.y,len=Math.hypot(dx,dy)||1;if(len>8){state.bullets.push({id:"s"+now,owner:me.id,x:me.x,y:me.y,vx:dx/len*620,vy:dy/len*620,life:1100,color:me.color});soloLastShot=now;gunSound();}}
 const activeBots=state.players.slice(1).filter(b=>b.alive);
 for(const bot of activeBots){
  const dx=me.x-bot.x,dy=me.y-bot.y,dist=Math.hypot(dx,dy)||1;
  const approach=dist>260?1:dist<145?-.65:.15;
  bot.x=Math.max(22,Math.min(1178,bot.x+(dx/dist*approach*82+Math.sin(now/650+Number(bot.id.slice(-1)))*24)*dt));bot.y=Math.max(22,Math.min(738,bot.y+(dy/dist*approach*82+Math.cos(now/750+Number(bot.id.slice(-1)))*24)*dt));
  if(now>bot.fireAt&&dist<620){const bx=dx/dist,by=dy/dist;state.bullets.push({id:"b"+now+bot.id,owner:bot.id,x:bot.x,y:bot.y,vx:bx*245+(Math.random()-.5)*125,vy:by*245+(Math.random()-.5)*125,life:1500,color:bot.color});bot.fireAt=now+1900+Math.random()*1100;}
 }
 // Deploy reinforcements gradually; never overwhelm the player with the whole wave.
 const activeCap=Math.min(4,2+Math.floor((soloLevel-1)/3));
 if(soloSpawned<soloWaveSize&&now>=soloNextSpawn&&activeBots.length<activeCap){spawnSoloBot();soloNextSpawn=now+3500+Math.random()*1200;addFeed("REINFORCEMENT DEPLOYED");}
 // A cleared wave starts the next level after a short breather.
 if(soloSpawned>=soloWaveSize&&activeBots.length===0&&!soloIntermissionUntil){soloIntermissionUntil=now+3500;me.hp=Math.min(100,me.hp+35);me.score+=100;addFeed("LEVEL CLEARED // +100 BONUS // REPAIR +35");beep(880,.18);}
 if(soloIntermissionUntil&&now>=soloIntermissionUntil){soloLevel++;soloWaveSize=Math.min(2+soloLevel,12);soloSpawned=0;soloIntermissionUntil=0;soloNextSpawn=now;$("roundNo").textContent="LEVEL "+String(soloLevel).padStart(2,"0");addFeed("LEVEL "+soloLevel+" // NEW WAVE INCOMING");beep(660,.12);}

 for(const b of state.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt*1000;const target=b.owner===me.id?state.players.slice(1).find(p=>p.alive&&Math.hypot(p.x-b.x,p.y-b.y)<19):(Math.hypot(me.x-b.x,me.y-b.y)<18?me:null);if(target&&b.life>0){b.life=0;target.hp-=b.owner===me.id?42:8;if(target.hp<=0){target.hp=0;target.alive=false;if(target.id===me.id){addFeed("YOU WERE ELIMINATED");beep(130,.3);}else{me.kills++;me.score+=150;addFeed('<span class="feed-kill">ELIMINATION</span> '+escapeHtml(target.name));beep(720,.1);}}else if(target.id===me.id)beep(190,.05);}}
 state.bullets=state.bullets.filter(b=>b.life>0&&b.x>0&&b.y>0&&b.x<1200&&b.y<760);
 for(const h of state.hazards){h.angle+=dt;if(Math.hypot(me.x-h.x,me.y-h.y)<h.r+12){me.hp-=8*dt;if(me.hp<=0){me.hp=0;me.alive=false;}}}
 const remaining=Math.max(0,Math.ceil((state.endsAt-now)/1000));
 state.leaderboard=state.players.slice().sort((a,b)=>b.score-a.score).map(p=>({id:p.id,name:p.name,score:p.score,kills:p.kills,alive:p.alive}));
 if(!me.alive||remaining===0){state.phase="results";const winner=state.players.slice().sort((a,b)=>b.score-a.score)[0];$("resultTitle").textContent=me.alive?"SURVIVOR":"MATCH OVER";$("resultSub").textContent=me.alive?`YOU REACHED LEVEL ${soloLevel}. THE ARENA REMEMBERS.`:"YOUR SIGNAL HAS BEEN LOST."; $("resultScores").innerHTML=state.leaderboard.map((p,i)=>`<div class="result-row"><span>${i+1}. ${escapeHtml(p.name)}</span><strong>${p.score}</strong></div>`).join("");$("againBtn").style.display="flex";$("gameOverlay").classList.remove("hidden");addFeed("SOLO MATCH COMPLETE");}
 renderState(state);
}
function inputLoop(){const now=Date.now();if(now-lastInput>50&&state?.phase==="playing"){let x=moveStick.x,y=moveStick.y;if(keys.has("w")||keys.has("arrowup")||keys.has("mobile-up"))y--;if(keys.has("s")||keys.has("arrowdown")||keys.has("mobile-down"))y++;if(keys.has("a")||keys.has("arrowleft")||keys.has("mobile-left"))x--;if(keys.has("d")||keys.has("arrowright")||keys.has("mobile-right"))x++;x=Math.max(-1,Math.min(1,x));y=Math.max(-1,Math.min(1,y));if(x&&y){x*=.7071;y*=.7071;}if(!paused){if(soloMode)updateSolo(now,x,y,pointerFire||mobileFire||keys.has(" "));else {socket.emit("input",{x:0+x,y:0+y,aimX:aim.x,aimY:aim.y,fire:pointerFire||mobileFire});if(pointerFire||mobileFire)gunSound();}}else if(!soloMode){socket.emit("input",{x:0,y:0,aimX:aim.x,aimY:aim.y,fire:false});}lastInput=now;}requestAnimationFrame(inputLoop);}requestAnimationFrame(inputLoop);
})();