# Hunter Clash

A turn-based mobile (portrait) hunt-and-push strategy game for the web. Blue (you) vs Red (computer).

Each turn has two states:

1. **Hunt** – drag to aim (pull back like a slingshot, or push toward the target) and release one bouncing arrow. It bounces 5 times, taking a bite of meat out of every animal it hits. When the arrow lands, your troops march a step and strike whatever they reach, towers shoot and hunters walk.
2. **Attack** – spend meat on cards. There are four, and each can be played once a turn. Drag one onto the board:
   - **Warriors** – hit hard at close range and walk past friendly archers to meet the enemy head on.
   - **Archers** – stop as soon as an enemy is in range and shoot from there. Fragile.
   - **Guard Tower** – goes on a checkpoint you hold. Barely scratches anyone, but the enemy has to break it to pass.
   - **Hunter Tower** – goes in your part of the centre field and never moves. Shoots an enemy hunter tower or the enemy castle if one is in range (for little damage); otherwise hunts animals in range and banks the meat.

## Lanes

Each road is a row of 25 slots with 5 checkpoints, 4 open slots between neighbours. The slot beside each castle is that team's home slot: nobody else may stand there, so you can always deploy at your own gate.

Checkpoints belong to whoever's front line has reached them, and troops can be dropped on any free slot from your gate up to the furthest checkpoint you hold. Lose the units holding the line and the checkpoints go with them.

A castle has 100 health and its own guards, who shoot whatever reaches the gate. Pushes are meant to arrive, land a hit or two and die, so keep sending waves. The hunting arrow only does 5 to a castle; the lanes decide the match.

## Centre field

You start with a strip by your castle to build hunter towers on. Holding a checkpoint on either road opens the field up level with that checkpoint. Once a tower stands somewhere it keeps that ground, even if the checkpoint is lost, until the tower falls.

The herd is fixed at the start. Killed animals come back three rounds later, a couple at a time, so meat gets scarcer the harder both sides hunt.

Matches are capped at 25 turns. If both castles are still standing, the healthier one wins (then checkpoints held, then meat).

## Opponents

Noob, Recruit, Veteran, Ace and Legend, picked on the menu before a match. They differ only in how well they aim and think; every unit stat and price is the same for both sides. A fresh page load always starts on Noob, whose first turn shows a drag-to-aim demo.

All numbers (unit stats, prices, AI levels) live in `js/config.js`.

## Run locally

No build step. The game uses ES modules, so it needs to be served over HTTP:

```bash
python3 -m http.server 8123
```

Then open <http://localhost:8123>.

## Deploy to GitHub Pages

Push to `main`, then in the repository go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, and select `main` / `(root)`.

## Structure

```
index.html        page shell, HUD and card panel markup
css/style.css     layout and UI styling
js/main.js        boot, resize, main loop
js/config.js      balance and layout constants
js/board.js       field, lane and checkpoint geometry
js/game.js        match state and turn flow
js/arrow.js       bouncing arrow physics and shot simulation
js/animals.js     animal spawning and wandering
js/rules.js       who may stand, move and build where; the lane step
js/cards.js       dealing hands and playing cards
js/ai.js          computer opponent
js/render.js      canvas rendering
js/sprites.js     procedural sprite drawing
js/input.js       aiming and card drag-and-drop
js/ui.js          HUD, panel and overlays
js/fx.js          particles and floating text
js/audio.js       synthesised sound effects
js/utils.js       math helpers
```
