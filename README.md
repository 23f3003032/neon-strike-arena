# NEON STRIKE — Chaos Royale

A browser-based real-time multiplayer arcade arena built with Node.js, Express, Socket.IO, HTML Canvas and responsive CSS.

## Features
- **Single-player Bot Battle**: fight five AI-controlled opponents with movement, pursuit, dodging and aimed shots; solo scoring and results
- **Synthesized audio**: procedural home-screen electronic theme, gunfire, hit and match tones using Web Audio (no extra sound files); enable sound with the header toggle
- Enhanced animated neon home screen and glowing solo-mode button
- Private 5-character room codes; create or join a room
- Up to 8 players per room; host-controlled round start
- Server-authoritative movement, projectiles, health, eliminations and scores
- Hazards, repair pickups, overdrive pickups and temporary phase shield
- Live leaderboard, combat feed, round results and rematch
- Keyboard + mouse controls and on-screen mobile controls
- Basic disconnect handling and Socket.IO reconnection
- Health endpoint at `/health`

## Requirements
- Node.js 18 or newer
- npm
- Internet connection for Google Fonts (game still works if fonts are unavailable)

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000 in two separate browser windows/devices. Create a room in one and join with the 5-character code in the other. For separate physical devices, both need to reach a deployed server or your computer's reachable LAN IP. `localhost` on a phone means the phone itself, not your computer.

## Deploy to Render
1. Push this folder to a GitHub repository.
2. In Render, create **New + → Web Service** and connect that repository.
3. Set **Build Command** to `npm install`.
4. Set **Start Command** to `npm start`.
5. Choose a Node runtime and deploy. Render sets `PORT` automatically.
6. Open the service URL on two devices and test private-room creation/joining.

Any Node host that supports persistent WebSocket connections can work. If scaling to multiple server instances, add a Socket.IO adapter such as the Redis adapter and shared room/state coordination; this starter is a single-process game server.

## Single-player mode
Click **SINGLE PLAYER — VS BOTS** on the home screen. No room code or internet connection is required for solo play after the page loads. Use the same movement and aim/fire controls as multiplayer. The sound toggle must be clicked once because browsers require a user gesture before audio can play. The soundtrack and effects are synthesized in-browser, so there are no third-party sound assets to download.

## Controls
- Move: `W A S D` or arrow keys
- Aim: move mouse over arena
- Fire: hold left mouse button
- Phase shield: click the shield button
- Mobile: use the on-screen direction pad, FIRE, and SHIELD buttons

## Smoke test checklist
- [ ] Open `/health`; response should be JSON with `ok: true`
- [ ] Create a room; a 5-character code appears
- [ ] Join from a second browser using the code
- [ ] Host starts match with at least 2 players
- [ ] Movement, aiming, shots, health and score update on both clients
- [ ] Pickups and hazards appear during play
- [ ] Shield cooldown appears and shield prevents damage temporarily
- [ ] Match ends and leaderboard is displayed
- [ ] Refresh/disconnect one client and verify Socket.IO reconnects
- [ ] Try desktop and mobile-sized viewports

## Honest limitations / competition hardening
This is a playable starter, not a production-scale or anti-cheat-certified game. State runs in one Node process; active matches are lost if the service restarts. The game has no persistent accounts, matchmaking queue, database-backed global leaderboard, rate limiting, moderation, or multi-instance adapter. Add those before advertising support for large public tournaments. Server-side validation is present for room membership and movement bounds, but more rigorous abuse protection and automated gameplay tests are recommended. Test with real devices and the target deployment before competition submission.

## Project layout
```
server.js
public/
  index.html
  style.css
  game.js
package.json
README.md
```
