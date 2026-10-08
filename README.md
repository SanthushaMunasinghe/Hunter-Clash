# Hunter Clash

A turn-based mobile (portrait) hunt-and-push strategy game for the web. Blue (you) vs Red (computer).

Each turn has two states:

1. **Hunt** – the card panel slides away; drag in the strip under your castle to pull back, then release. Every arrow you own flies down that line, one after another. An arrow bounces off the field edge (up to 5 times) and is spent on the first animal it hits. When the volley lands, your troops march a step and strike whatever they reach.
2. **Spend** – six cards, each playable once a turn. Drag one onto the board:
   - **Warriors**, **Archers**, **Giant** – onto either road.
   - **Tower** – onto a checkpoint you hold.
   - **+1 Arrow**, **+Damage** – onto your own castle.

## Hunting

The herd is small, about six animals. A kill comes back two rounds later.

- **Quick prey** (rabbit, deer, stag; gold number) dies to any hit and pays its whole bounty at once, but it moves fast and the aim preview does not lead it for you.
- **Slow prey** (sheep, cow, bull, bear, dino) is easy to hit and pays a share of its bounty per hit, in proportion to hunting damage.
- Richer prey arrives every 5 turns: cow on 6, bull and deer on 11, bear on 16, dino and stag on 21.

**+1 Arrow** adds an arrow to every volley. **+Damage** adds 5 hunting damage, so slow prey pays more per hit. Both get dearer each time you buy them. Meat spent here is meat not spent on troops, so a greedy hunter can be rushed.

## Troops

| | Good against | Weak against |
|---|---|---|
| **Warriors** | Archers (once they reach them); hold their own against giants | Archer fire on the way in |
| **Archers** | Giants (two volleys); anything, from 4 slots away | Everything that reaches them |
| **Giant** | Towers (one blow); soaks up warriors | Archers, castle guards |
| **Tower** | Stalls warriors and archers for a turn | Giants |

Archers stop as soon as an enemy is in range. Warriors and giants walk past friendly archers to meet the enemy head on. Squads strike the turn they arrive.

## Lanes

Each road is a row of 25 slots with 5 checkpoints, 4 open slots between neighbours. The slot beside each castle is that team's home slot: nobody else may stand there, so you can always deploy at your own gate.

Checkpoints belong to whoever's front line has reached them, and troops can be dropped on any free slot from your gate up to the furthest checkpoint you hold. Lose the units holding the line and the checkpoints go with them.

A castle has 100 health and its own guards, who shoot whatever reaches the gate. Pushes are meant to arrive, land a hit or two and die, so keep sending waves. The hunting arrow only does 5 to a castle; the lanes decide the match.

Matches are capped at 25 turns. If both castles are still standing, the healthier one wins (then checkpoints held, then meat).

## Opponents

Noob, Recruit, Veteran, Ace and Legend, picked on the menu before a match. They differ only in how well they aim and think; every unit stat and price is the same for both sides. A fresh page load always starts on Noob, whose first turn shows a drag-to-aim demo.

All numbers (unit stats, prices, prey, AI levels) live in `js/config.js`.

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
js/arrow.js       arrow physics and volley simulation
js/animals.js     the herd: spawning, wandering, new prey
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
