# Hunter Clash

A turn-based mobile (portrait) hunt-and-push strategy game for the web. Blue (you) vs Red (computer).

Each turn has two states:

1. **Hunt** – drag to aim and release one bouncing arrow. It bounces 5 times, taking a bite of meat out of every animal it hits. With a clear line it can hit the enemy castle too.
2. **Attack** – spend meat on cards and drag them onto the board:
   - **Warriors / Archers** – drop on the left or right lane, anywhere up to your forward-most checkpoint.
   - **Hunter** – drop in your part of the centre field. Shoots the closest animal ahead and advances as it kills.
   - **Wall** – drop in your part of the centre field to block enemy arrows and hunters.
   - **Guard Tower** – drop on a checkpoint you have captured.

Destroy the enemy castle to win.

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
js/cards.js       cards, deck and placement rules
js/ai.js          computer opponent
js/render.js      canvas rendering
js/sprites.js     procedural sprite drawing
js/input.js       aiming and card drag-and-drop
js/ui.js          HUD, panel and overlays
js/fx.js          particles and floating text
js/audio.js       synthesised sound effects
js/utils.js       math helpers
```
