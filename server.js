const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;
app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true, game: "NEON STRIKE" }));

const rooms = new Map();
const ARENA = { w: 1200, h: 760 };
const MAX_PLAYERS = 8;
const TICK_MS = 50;
const ROUND_MS = 150000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const randCode = () => Array.from({length: 5}, () => ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)]).join("");
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const safeName = s => String(s || "PLAYER").replace(/[<>]/g, "").trim().slice(0, 16) || "PLAYER";
const publicPlayer = p => ({ id:p.id, name:p.name, x:p.x, y:p.y, hp:p.hp, score:p.score, kills:p.kills, alive:p.alive, color:p.color, shield:p.shield > 0 });

function makeRoom(code, hostId) {
  return { code, hostId, phase:"lobby", players:new Map(), bullets:[], hazards:[], pickups:[], nextSpawn:Date.now()+2500, startedAt:0, endsAt:0, lastTick:Date.now(), round:0 };
}
function spawnPlayer(p, room) {
  const angle = Math.random()*Math.PI*2, radius = 170+Math.random()*100;
  p.x = clamp(ARENA.w/2 + Math.cos(angle)*radius, 40, ARENA.w-40);
  p.y = clamp(ARENA.h/2 + Math.sin(angle)*radius, 40, ARENA.h-40);
}
function snapshot(room) {
  return { code:room.code, phase:room.phase, hostId:room.hostId, players:[...room.players.values()].map(publicPlayer),
    bullets:room.bullets, hazards:room.hazards, pickups:room.pickups, now:Date.now(), endsAt:room.endsAt, arena:ARENA,
    leaderboard:[...room.players.values()].sort((a,b)=>b.score-a.score).map(p=>({id:p.id,name:p.name,score:p.score,kills:p.kills,alive:p.alive})) };
}
function broadcast(room) { io.to(room.code).emit("state", snapshot(room)); }
function endRound(room) {
  if (room.phase !== "playing") return;
  room.phase = "results";
  const alive = [...room.players.values()].filter(p=>p.alive);
  if (alive.length === 1) alive[0].score += 100;
  const ranked = [...room.players.values()].sort((a,b)=>b.score-a.score);
  io.to(room.code).emit("roundEnd", { winner:ranked[0] ? {name:ranked[0].name,score:ranked[0].score} : null, leaderboard:ranked.map(publicPlayer) });
}
function startRound(room) {
  if (room.players.size < 2) return false;
  room.phase="playing"; room.round++; room.startedAt=Date.now(); room.endsAt=room.startedAt+ROUND_MS;
  room.bullets=[]; room.hazards=[]; room.pickups=[];
  for (const p of room.players.values()) { p.hp=100; p.alive=true; p.shield=0; p.speedBoost=0; p.lastShot=0; p.lastMove=Date.now(); spawnPlayer(p,room); }
  room.hazards.push({id:crypto.randomUUID(),x:ARENA.w/2,y:ARENA.h/2,r:42,angle:0,warning:false});
  io.to(room.code).emit("roundStarted", {duration:ROUND_MS, round:room.round});
  return true;
}
function leaveRoom(socket) {
  const code = socket.data.room; if (!code) return;
  const room = rooms.get(code); socket.leave(code); socket.data.room=null;
  if (!room) return;
  room.players.delete(socket.id);
  if (!room.players.size) { rooms.delete(code); return; }
  if (room.hostId===socket.id) room.hostId=room.players.keys().next().value;
  if (room.phase==="playing" && [...room.players.values()].filter(p=>p.alive).length<=1) endRound(room);
  broadcast(room);
}

io.on("connection", socket => {
  socket.emit("welcome", {id:socket.id, arena:ARENA});
  socket.on("changeName", ({name}={}, ack=()=>{}) => {
    const room = rooms.get(socket.data.room);
    const player = room?.players.get(socket.id);
    if (!player) return ack?.({ok:false,error:"Join a room first."});
    player.name = safeName(name);
    broadcast(room);
    ack?.({ok:true,name:player.name});
  });

  socket.on("createRoom", ({name}={}, ack=()=>{}) => {
    leaveRoom(socket);
    let code; do { code=randCode(); } while(rooms.has(code));
    const room=makeRoom(code,socket.id);
    const player={id:socket.id,name:safeName(name),x:ARENA.w/2,y:ARENA.h/2,hp:100,score:0,kills:0,alive:true,color:["#6ef3ff","#ff5cf4","#b8ff65","#ffbd59","#9c8cff","#ff6b8b","#5effb1","#ffd9f2"][rooms.size%8],shield:0,speedBoost:0,lastShot:0,input:{x:0,y:0},lastMove:Date.now()};
    room.players.set(socket.id,player); rooms.set(code,room); socket.join(code); socket.data.room=code;
    ack({ok:true,code,playerId:socket.id}); broadcast(room);
  });
  socket.on("joinRoom", ({code,name}={}, ack=()=>{}) => {
    code=String(code||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5);
    const room=rooms.get(code);
    if (!room) return ack({ok:false,error:"Room not found. Check the 5-character code."});
    if (room.phase==="playing") return ack({ok:false,error:"This round is already running. Join the next round."});
    if (room.players.size>=MAX_PLAYERS) return ack({ok:false,error:"Room is full (8 players maximum)."});
    leaveRoom(socket);
    const p={id:socket.id,name:safeName(name),x:ARENA.w/2,y:ARENA.h/2,hp:100,score:0,kills:0,alive:true,color:["#6ef3ff","#ff5cf4","#b8ff65","#ffbd59","#9c8cff","#ff6b8b","#5effb1","#ffd9f2"][room.players.size%8],shield:0,speedBoost:0,lastShot:0,input:{x:0,y:0},lastMove:Date.now()};
    room.players.set(socket.id,p); socket.join(code); socket.data.room=code;
    ack({ok:true,code,playerId:socket.id}); broadcast(room);
  });
  socket.on("startRound", ack=>{ const room=rooms.get(socket.data.room); if (!room) return; if(room.hostId!==socket.id) return ack?.({ok:false,error:"Only the room host can start."}); if(!startRound(room)) return ack?.({ok:false,error:"Need at least 2 players to start."}); ack?.({ok:true}); broadcast(room); });
  socket.on("input", input=>{ const room=rooms.get(socket.data.room); const p=room?.players.get(socket.id); if(!p||room.phase!=="playing"||!p.alive)return; p.input={x:clamp(Number(input?.x)||0,-1,1),y:clamp(Number(input?.y)||0,-1,1),aimX:clamp(Number(input?.aimX)||0,0,ARENA.w),aimY:clamp(Number(input?.aimY)||0,0,ARENA.h),fire:!!input?.fire}; });
  socket.on("useAbility",()=>{const room=rooms.get(socket.data.room);const p=room?.players.get(socket.id);if(!p||room.phase!=="playing"||!p.alive)return;if(p.abilityReady>Date.now())return;p.shield=2200;p.abilityReady=Date.now()+12000;socket.emit("toast","PHASE SHIELD ACTIVATED");});
  socket.on("playAgain",()=>{const room=rooms.get(socket.data.room);if(!room||room.phase!=="results"||room.hostId!==socket.id)return;for(const p of room.players.values()){p.score=0;p.kills=0;}startRound(room);broadcast(room);});
  socket.on("leaveRoom",()=>leaveRoom(socket));
  socket.on("disconnect",()=>leaveRoom(socket));
});

setInterval(()=>{
  const now=Date.now();
  for(const room of rooms.values()){
    if(room.phase!=="playing"){ if(room.phase==="lobby") broadcast(room); continue; }
    const dt=Math.min(.1,(now-room.lastTick)/1000); room.lastTick=now;
    for(const p of room.players.values()){
      if(!p.alive)continue;
      const speed=p.speedBoost>now?300:220;
      p.x=clamp(p.x+p.input.x*speed*dt,22,ARENA.w-22);
      p.y=clamp(p.y+p.input.y*speed*dt,22,ARENA.h-22);
      if(p.input.fire && now-p.lastShot>260 && p.input.aimX!==undefined){
        const dx=p.input.aimX-p.x,dy=p.input.aimY-p.y,len=Math.hypot(dx,dy)||1;
        if(len>10){room.bullets.push({id:crypto.randomUUID(),owner:p.id,x:p.x,y:p.y,vx:dx/len*540,vy:dy/len*540,life:1200,color:p.color});p.lastShot=now;}
      }
    }
    for(const b of room.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt*1000;}
    room.bullets=room.bullets.filter(b=>b.life>0&&b.x>0&&b.y>0&&b.x<ARENA.w&&b.y<ARENA.h);
    for(const b of [...room.bullets]){
      for(const p of room.players.values()){
        if(!p.alive||p.id===b.owner)continue;
        if(Math.hypot(p.x-b.x,p.y-b.y)<20){
          const idx=room.bullets.findIndex(x=>x.id===b.id);if(idx>=0)room.bullets.splice(idx,1);
          if(p.shield>now){break;}
          p.hp-=25;
          if(p.hp<=0){p.hp=0;p.alive=false;const attacker=room.players.get(b.owner);if(attacker){attacker.kills++;attacker.score+=150;}p.score+=Math.max(0,Math.floor((now-room.startedAt)/10000));io.to(room.code).emit("elimination",{victim:p.name,by:attacker?.name||"HAZARD"});}
          break;
        }
      }
    }
    if(now>=room.nextSpawn){
      room.nextSpawn=now+5000+Math.random()*2500;
      const kind=Math.random()<.58?"pickup":"hazard";
      if(kind==="pickup")room.pickups.push({id:crypto.randomUUID(),x:80+Math.random()*(ARENA.w-160),y:80+Math.random()*(ARENA.h-160),kind:Math.random()<.5?"heal":"boost",born:now});
      else room.hazards.push({id:crypto.randomUUID(),x:70+Math.random()*(ARENA.w-140),y:70+Math.random()*(ARENA.h-140),r:24,warning:true,born:now});
    }
    room.hazards=room.hazards.filter(h=>now-(h.born||room.startedAt)<6500);
    for(const h of room.hazards){h.angle=(h.angle||0)+dt; if(h.warning && now-(h.born||room.startedAt)>1400)h.warning=false;if(!h.warning){for(const p of room.players.values()){if(p.alive&&Math.hypot(p.x-h.x,p.y-h.y)<h.r+12&&p.shield<=now){p.hp-=18*dt;if(p.hp<=0){p.hp=0;p.alive=false;}}}}}
    for(const item of [...room.pickups]){for(const p of room.players.values()){if(p.alive&&Math.hypot(p.x-item.x,p.y-item.y)<30){if(item.kind==="heal")p.hp=Math.min(100,p.hp+35);else p.speedBoost=now+5000;p.score+=25;room.pickups=room.pickups.filter(x=>x.id!==item.id);io.to(room.code).emit("toast",`${p.name} collected ${item.kind==="heal"?"REPAIR":"OVERDRIVE"}`);break;}}}
    if(room.players.size>=2&&[...room.players.values()].filter(p=>p.alive).length<=1)endRound(room);
    else if(now>=room.endsAt)endRound(room);
    broadcast(room);
  }
},TICK_MS);

server.listen(PORT,()=>console.log(`NEON STRIKE running on port ${PORT}`));