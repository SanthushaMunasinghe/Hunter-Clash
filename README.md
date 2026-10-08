# Hunter Clash

A turn-based mobile (portrait) hunt-and-push strategy game for the web. Blue (you) vs Red (computer).

Each turn has two states:

1. **Hunt** – the card panel slides away; drag in the strip under your castle to pull back, then release. Every arrow you own is loosed at once, side by side along that line and fanning out very slightly. An arrow bounces off the field edge (up to 5 times) and is spent on the first animal it hits. When the volley lands, each of your squads strikes whatever is in reach, steps forward if the way is clear, and strikes again where it stops.
2. **Spend** – each turn deals you four different cards out of six. Playing one draws a new card into its place straight away, so you can keep spending while the meat lasts. Drag one onto the board:
   - **Warriors**, **Archers**, **Giant** – onto either road.
   - **Tower** – onto a checkpoint you hold.
   - **+1 Arrow**, **+Damage** – onto your own castle.

The deal is random but weighted. Early on it is mostly Warriors, Archers and the two upgrades. Giants and Towers become common from about turn 6, and an upgrade turns up less the more of it you own (+1 Arrow is rare once you have three). Any card can still appear on any turn, and a hand always has Warriors or Archers in it. The odds are the `DEAL` table in `js/config.js`.

## Hunting

The herd is small, about six animals. A kill comes back two rounds later.

The number over an animal is its health and its meat in one. An arrow takes its damage off that number and you bank exactly as much, so `12 DMG` means +12 meat per arrow that lands (or whatever the animal has left). While you aim, the damage per arrow is shown over your castle, with `X2`, `X3`... when the volley has more than one arrow.

- **Quick prey** (rabbit, deer, stag; gold number) is the exception: any hit takes all of it. It keeps to the middle of the field, far from both castles, moves fast, and the aim preview does not lead it for you.
- **Slow prey** (sheep, cow, bull, bear, dino) lasts several hits. The cheapest kinds graze nearest the castles; richer ones hold more meat and roam further out.
- Nothing ever stands still.
- Richer prey arrives every 5 turns: cow on 6, bull and deer on 11, bear on 16, dino and stag on 21.

**+1 Arrow** adds an arrow to every volley. **+Damage** adds 5 hunting damage (you start on 12), so every arrow brings in more. Both get dearer each time you buy them. Meat spent here is meat not spent on troops, so a greedy hunter can be rushed.

## Troops

| | What it is for | Weakness |
|---|---|---|
| **Warriors** | The all-round fighter: 36 health, fells warriors or giants in two blows | None in particular |
| **Archers** | Hit 2 slots ahead, so they add damage from behind a front-liner | Die to a single blow from any squad |
| **Giant** | Breaking guard towers: 2 blows | Slower and dearer than warriors, and no better in a fight |
| **Tower** | Blocks the road. Warriors and archers together need 6 blows to break it | Giants |

Nothing hits further than 2 slots, towers and castle guards included, so only the front of a column fights. Archers stop as soon as an enemy is in range. A column sorts itself as it marches: giants lead, warriors follow, archers bring up the rear. A giant or warrior moving up swaps places with any lower-ranked friend in its way, pushing them back a slot; that uses up its normal step, it gets no extra movement for it. A squad strikes whenever a step ends with an enemy in reach, including the free step it takes when you place it.

## Lanes

Each road is a row of 25 slots with 5 checkpoints, 4 open slots between neighbours. The slot beside each castle is that team's home slot: nobody else may stand there, so you can always deploy at your own gate.

Checkpoints belong to whoever's front line has reached them, and troops can be dropped on any free slot from your gate up to the furthest checkpoint you hold. Lose the units holding the line and the checkpoints go with them.

A castle has 100 health and its own guards, who shoot whatever reaches the gate. Pushes are meant to arrive, land a hit or two and die, so keep sending waves. An arrow that reaches the enemy castle only chips 1 off it. The lanes decide the match.

A castle that falls loses the match on the spot. Otherwise matches are capped at 25 turns, and if both castles are still standing it goes on points (the star in the HUD): your castle's remaining health plus 10 for every checkpoint you hold at that moment. Holding all ten checkpoints is worth as much as an untouched castle, so it pays to end the match with your troops alive and forward. Level points go to the healthier castle, then to more meat. The weights are `POINTS` in `js/config.js`.

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
