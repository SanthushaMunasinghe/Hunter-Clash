# Hunter Clash

A turn-based mobile (portrait) hunt-and-push strategy game for the web. Blue (you) vs Red (computer).

Each turn runs in four steps:

1. **Hunt** – the card panel slides away. Press in the strip below your castle and slide left or right: the shot starts out aimed straight up the field and swings the opposite way to your finger. Let go to shoot. Every arrow you own is loosed at once, side by side along that line and fanning out very slightly. An arrow bounces off the field edge (up to 5 times) and stops in the first animal it hits, unless it kills it with damage to spare.
2. **Castle defends** – your castle fires 5 arrows down a road at the enemy's front row, but only once that row has come right up to your home rows. Each of your guard towers shoots one arrow at a front row within 4 slots. A castle arrow kills a warrior or an archer outright.
3. **Spend** – each turn deals you four different cards out of six. Playing one draws a new card into its place straight away, so you can keep spending while the meat lasts. Drag one onto the board:
   - **Warriors**, **Archers**, **Giant** – onto the left or right side of the board, to send them down that road.
   - **Tower** – onto a checkpoint you hold.
   - **+1 Arrow**, **+Damage** – onto your own castle.
4. **End turn** – nothing on the roads fights until you press END TURN. Then, on each road, your front row strikes whatever it can reach, the rows of archers behind it shoot if they are in range, and the column marches.

The deal is random but weighted. Warriors, Archers and the two upgrades all turn up about equally often, however many upgrades you have bought. Giants become common from about turn 6. The Tower is a little rarer and is only dealt once you hold two checkpoints on one road. +1 Arrow stops being dealt once you have three arrows. A hand always has Warriors or Archers in it. The odds are the `DEAL` table in `js/config.js`.

## Hunting

The herd is small, about six animals. A kill comes back two rounds later.

The number over an animal is its health and its meat in one. An arrow takes its damage off that number and you bank exactly as much (or whatever the animal has left). An arrow that kills an animal with damage to spare flies straight on through it with what is left, and can go through several; the aim preview shows that stretch as a fainter line. The damage of your whole volley, every arrow added up, is always shown at the foot of your castle (`24 DMG`), and turns green with the new figure while you hold an upgrade card over the castle.

- **Quick prey** (rabbit, deer, stag; gold number under a red target mark) is the exception: any hit takes all of it, and it carries a big bounty for its size (36, 56 and 84). It keeps to the middle of the field, far from both castles, moves fast, and the aim preview does not lead it for you.
- **Slow prey** (sheep, cow, bull, bear, dino) lasts several hits. The cheapest kinds graze nearest the castles; richer ones hold more meat and roam further out.
- Nothing ever stands still.
- Richer prey arrives every 5 turns: cow on 6, bull and deer on 11, bear on 16, dino and stag on 21.

**+1 Arrow** adds a smaller arrow to every volley, flying beside the full one and doing half its damage (three arrows is the most you can have). It always costs 40. **+Damage** adds to the full arrow (you start on 12), and half as much to each smaller one. Its price doubles each time you buy it and it gives 2 more than the time before: +2 for 10, +4 for 20, +6 for 40, +8 for 80, and so on. Each upgrade card says what it adds. Meat spent here is meat not spent on troops, so a greedy hunter can be rushed.

## Troops

A troop card sends single units: three warriors, three archers or one giant to start with. Troop cards grow with your hunting. Once the damage of your whole volley is double the opening volley (24) every troop card costs double and sends 5 warriors or archers, or 2 giants. At triple (36) it costs triple and sends 8, or 3 giants. The line on the card (`5 UNITS`) shows what it sends. Once your cards have grown, the hand dealt at the start of a turn still sometimes has a small troop card in it, at the opening size and price (3 units for 20), so you are not priced out of sending anything: about one hand in three has one. While the enemy's front row is within 6 slots of your home rows nearly every hand has one and most have two. Cards drawn during a turn are always full size. Both sides play by this; the table is `MUSTER` in `js/config.js`. They step out of the home platform by your gate and walk up to join your column on that road.

| | What it is for | Weakness |
|---|---|---|
| **Warriors** | The all-round fighter: 12 health, and two blows fell another warrior | None in particular |
| **Archers** | Hit 4 slots ahead, so they still reach the fight from three rows behind the front | Die to any blow |
| **Giant** | Leads the front row and takes the first blows: 36 health in two spaces. Every swing lands on two enemies at once, and it breaks a guard tower in 2 blows | Dear |
| **Tower** | Blocks the road and shoots one arrow a turn at the enemy's front row | Giants |

**Rows.** A column stands in rows, one slot apart. A row is 5 spaces of one class: warriors (1 space) and giants (2 spaces, always in the middle) share rows, archers keep to rows of their own. Melee always hold the front, and the front row is led by one giant if you have one, with warriors filling the rest of it: five warriors make room for a giant by two of them dropping back a row. More giants only come up to the front when there are not the warriors to fill it, so with no warriors the giants hold the front themselves. Everyone else falls in behind in the order you sent them, each into the first row of its class that has room, or into a new row at the back. The formation is redone whenever units are added, fall or march, and the column closes up on its front line.

**Placing.** The first row on an empty road forms up on your nearest checkpoint (or on the furthest one a guard tower of yours holds). After that, new units never move the front line; they fall in behind it. Only when the column already reaches back to your gate are new units allowed to push it forward a slot, and the enemy can block that: with the enemy in the way and no room behind, the road is full. The three rows from your platform to your first checkpoint are yours alone, though, so even with the enemy camped outside you can always field three rows there.

**Fighting** happens only when a side ends its turn:

1. The front row strikes the nearest enemy thing in its reach: the enemy's front row, a guard tower, or the castle behind the enemy gate.
2. Each row of archers behind it that is in range shoots as well.
3. The column marches up to 5 slots, the distance from one checkpoint to the next, halting as soon as its front row has something to hit.
4. If that march brings it up to the enemy castle, it strikes the castle there and then, with every unit in reach that has not already struck this turn. Arriving in front of enemy troops earns no such blow.

A volley is aimed at the enemy's front row as it stands. Its blows are shared out so none lands on a unit already finished, but blows left over once that row has fallen are lost.

## Lanes

Each road is a row of 25 slots with 5 checkpoints, 4 open slots between neighbours. The three slots nearest each castle, from its platform to its first checkpoint, are that side's home rows (tinted its colour, with a dashed line across the road at the end of them): the enemy cannot step onto them.

Checkpoints belong to whoever's front line has reached them. Lose the units holding the line and the checkpoints go with them.

A castle has 100 health. Attackers halt at the line outside its home rows and besiege it from there: the castle counts as standing on the last home row, so warriors at the line strike it and archers count their range to that row, not to the walls. The castle only shoots back at a front row that has reached the line, and then its 5 arrows will empty a front row of warriors, so a siege needs depth: fresh rows to step up, a giant in front to soak up arrows, archers shooting from behind. Defenders standing on the last home row shield the castle. Archers at the head of a column stop 4 slots short of that row and shoot from there, out of the castle's reach, so they have to be driven off with troops. An arrow from a hunt that reaches the enemy castle only chips 1 off it.

A castle that falls loses the match on the spot. Otherwise matches are capped at 25 turns, and if both castles are still standing the one with more health left wins. Level health goes to the side holding more checkpoints, then to more meat.

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
