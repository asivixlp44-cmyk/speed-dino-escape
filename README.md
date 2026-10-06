# Speed Dino Escape

A multiplayer "+1 Speed" escape game for the browser, built with **Three.js** and **Colyseus** for Bloxity. You ride a blocky dino, every step gives +1 Speed, and you escape a giant T-Rex through six stages. It clones the Roblox game *+1 Speed Dino Escape* (see `reference/Gameplay.mp4`).

It shares its engine with Speed Football Scape and Speed Fish Escape: the same server, Bloxity integration and effects, with a jungle theme, dinos and the reference's HUD.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js game client (`src/main.js`, `world.js`, `dino.js`, `engine.js`, `ui.js`, `audio.js`) |
| `server/` | Colyseus 0.18 server: the `speed` room, player profiles, leaderboards, Bux webhook |
| `shared/` | Game data and formulas used by both sides (`config.js`) |

## Run it locally

Needs Node 20 or newer.

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:2567
```

For development, run `npm run dev:server` and `npm run dev:client` in two terminals, then open the Vite URL (http://localhost:5173). In dev the client connects to the server on port 2567; set `VITE_SERVER_URL` to point it somewhere else.

## Gameplay

- **You ride a dino.** Every step gives +1 Speed, plus your dino's bonus (`+2/Speed` up to `+6K/Speed`). Speed is also XP: Level 0 needs 15, then 30 / 45 / 60 (as in the reference) and steeper after that, up to Level 40. Each level adds +1 walking speed ("Level Up! (0->1) New walking speed: 16->17"). A blue "👟+1" pops up beside you as Speed comes in.
- **HUD** (from the reference): Shop / Rebirth / AURAS / FREE on the left (Daily, Friends, Avatar and Auto Train beside them), the purple **Troll Menu!** at the top, Custom Speed and the rainbow **2X Speed** pass on the right, the Level bar with **+10K / +100K / +1M** Speed buttons at the bottom, and the trophy Wins count with **Friend Boost** bottom-left.
- **Lobby**: a red carpet down the middle to the Stage 1 gate, yellow studded paths, tan dotted sandstone walls with blocky trees on top, clouds in a bright sky.
  - Left: the **DINO SHOP** ("Buy Dino For Speed Boosts!"). Front row: Green Raptor, Bonk Pachy (3 Wins), Stegosaurus (20), Triceratops (100), Ankylosaurus (500), Dilophosaurus ("Cheap Dino", 9 Bux) and the OP Dino Dragon (Bux). Raised back row: Spinosaurus (1K), Parasaurolophus (5K), Brachiosaurus (25K), Pterodactyl (100K), T-Rex (500K), Indominus Rex (2.5M) and Galaxy Rex (15M). Step onto a red pad to buy or ride.
  - Right: the **TREADMILLS** ("Get Speed While Offline!"): three x1, x3, x9 (pass) and x25 (pass). Leave the game on a treadmill and it keeps earning: on your next visit you get a quarter of the Speed it would have made, for up to 8 hours.
  - Also: TOP WINS / TOP SPEED boards, the "Keep playing" hut (free x2 Speed Boost after 15 minutes), the Fossil Chest (free Speed and Wins once a day), the Baby T-Rex egg (hatches after 20 minutes of play), +Speed and +Wins pads, and an Update poster.
- **Course**, six stages; 1-3 follow the reference, 4-6 are our own in the same style:
  1. DINO RUN: the red carpet between sandstone walls. Black thorn marks on the carpet are spike traps that glow red and fire on the server clock; neighbouring traps fire half a cycle apart.
  2. GRASS STEPS: green grass terraces stepping up and down between lavender checker walls, with gaps to jump. Falling off is a KO.
  3. T-REX CHASE!: grey stone ramps over a chasm while a giant dark T-Rex with glowing eyes runs after you, roaring and breathing fire. It races in when far behind, then creeps up a little faster than you walk; a red screen edge and "T-REX 15m BEHIND!" warn you. Sprint to stay ahead.
  4. VOLCANO: basalt stepping stones over lava with lava columns. Meteors rain down: a red shadow grows where one will land.
  5. PTERO SKIES: a plank bridge in the clouds. Wild pterodactyls swoop across it on the server clock and dip to rider height mid-bridge; jump to clear them.
  6. DINO KING!: a golden temple hall with torches, walls to jump and lava channels, chased by the crowned Dino King. The finish has a giant gold trophy.
- Blue sneakers on the course give +1 Speed. Each stage ends on a landing with a "+N Wins / Return!" pad (+1 / +2 / +5 / +15 / +40 / +100) and a "x2 Wins!" pad.
- Getting caught shows the reference's **Revive** card ("You were caught! You reached Stage N!"): revive where you fell for 9 Bux with a few seconds of shield, or ✕ / wait 10 s to go back to the lobby.
- **Daily Reward** pops up when you join: seven cards (+20 Speed, +100 Wins, +10K Speed, +1K Wins, +100K Speed, +10K Wins, 2 Rebirths), a day track, CLAIM REWARD and the time left. Missing a day resets the streak.
- **Rebirth** at Level 25: level back to 0, +50% to all Speed earned and +10 walking speed per rebirth.
- **Troll Menu** (Bux): Dino Stampede (shake everyone), Slow Everyone, Shrink Everyone, Fling Everyone! and Send All to Lobby. Effects hit every other player in the server, with a banner naming the buyer.
- **Friend Boost**: +10% Speed for each Bloxity friend in the same server, up to +50%. The server only counts names that are actually in the room.
- Auras, FREE playtime rewards, Store, Friends, Avatar and Auto Train work as in the other games.
- Soundtrack: an original, code-generated 116 BPM jungle-adventure track (tribal toms, marimba, plucked bass, a whistle flute and bird calls) plus T-Rex roars and heavy dino footsteps. No audio files.

## Controls

| Action | Keyboard / mouse | Controller |
|---|---|---|
| Move | WASD / arrows | Left stick |
| Camera | Drag, wheel to zoom | Right stick, D-pad up/down to zoom |
| Jump | Space | A |
| Sprint | Hold Shift | Hold RT, LT or L3 |
| Interact | E | X |

Phones get an on-screen joystick with JUMP and SPRINT buttons.

## How multiplayer works

- Everyone joins one shared `speed` room (up to 24 players), which covers the lobby and all six stages.
- **Client-side:** movement and physics. Other players are drawn with interpolation, riding their own dinos.
- **Server-side:** everything that changes progress: Speed from running (treadmills, dino bonus, multipliers), pickups, Wins pads, dino unlocks, auras, rebirths, FREE / Daily / offline rewards, Friend Boost and purchases.
- Spike traps, meteors and pterodactyls run on the server clock, so all players see the same timing. Each player's chaser is local.
- Progress is saved per browser (a random id in localStorage) or per Bloxity account. On Legion it lives in MongoDB (`MONGODB_URI`); locally in `server/data/profiles.json`. Each browser also keeps a signed backup (`server/src/saves.js`, key `SAVE_SECRET`) that a restarted file-mode server restores.

## Bloxity

- `GAME_SLUG` in `client/src/bloxity.js` defaults to `speed-dino-escape`; it must match the slug of the game in bloxity.io Manage Games.
- Every price is in **Bux**. Store items map to SKUs (`SKUS` in `shared/config.js`), including the five `troll_*` products; create them in the game's IAP catalog. Without a catalog the game runs in demo mode, where purchases are free.
- Set `LEGION_WEBHOOK_SECRET` on the server to switch to Bux mode; `POST /api/legion-webhook` then grants purchases.
- The top-left of the screen is left empty for the Bloxity overlay, and there is no start menu.

## Deploy (Bloxity hosting)

Every push to `main` (prod) or `dev` runs `.github/workflows/deploy.yml`:

1. Builds the server image from `server/Dockerfile` and pushes it to `ghcr.io/asivixlp44-cmyk/speed-dino-escape-server`.
2. Tells Legion (`legion.bloxity.io/v1/apps/speed-dino-escape/deploy`) to roll it out.
3. Builds the client with `VITE_BLOXITY_GAME_ID` and uploads it to the Bloxity hosting API.

Play at https://speed-dino-escape.play.bloxity.io (prod) or https://speed-dino-escape.dev.play.bloxity.io (dev).

One-time setup:

- Create the app `speed-dino-escape` on hosting.bloxity.io (Legion has no create-on-deploy).
- Create the game in bloxity.io Manage Games with the slug `speed-dino-escape`, plus the SKUs.
- Repo secret: `LEGION_DEPLOY_TOKEN` (from hosting.bloxity.io).
