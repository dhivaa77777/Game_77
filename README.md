# Dots and Boxes

The classic pencil-and-paper game in the browser. Plain HTML, CSS and JavaScript, with no build step, libraries or server.

**To play:** open `index.html` in any modern browser. It works straight from the file system and offline.

## How a game is set up

1. **Board:** choose the number of dots across and down (2–20 each, square or rectangular). A live preview shows the grid and how many boxes it makes.
2. **Players:** choose 2, 3 or 4 players and type their names. Each player gets a colour and a **symbol**. The symbol is filled in from the name (Ravi → **R**). If two names start with the same letter, two letters are used (Alice, Amir → **Al**, **Am**). You can type your own letter or emoji instead. When a player joins the four dots around a box, the box fills with their colour and symbol.

Every player is a person by default (pass-and-play on one device). Any player can be switched to a computer opponent.

## Features

- **2–4 players** with names, colours and symbols. Any player can be a person or the computer.
- **Computer opponents** at three levels:
  - *Easy*: makes mistakes.
  - *Medium*: never gives away a box it doesn't have to.
  - *Hard*: plays real endgame strategy. It splits the board into chains and loops, picks the cheapest one to give away, opens 2-box chains in the middle, and uses the "all-but-two" double-cross to keep control. It also looks ahead to win the opening phase.
- **Any board from 2×2 to 20×20 dots**, square or rectangular, with presets.
- **Undo / redo:** against the computer, undo takes back the computer's replies too. **Hints** come from the Hard computer.
- **Turn timer** (optional): if time runs out, a move is made for you.
- **Assist mode:** highlights boxes you can take and warns before you give one away.
- **Replay** a finished game move by move. **Copy the result** to share it.
- **Auto-save:** reload the page or come back later and resume the game.
- **Statistics:** games, wins, ties, average and best scores per player.
- **Light, dark and paper themes**, sound effects, vibration on phones, animations and confetti. Each can be turned off.
- **Responsive and accessible:** mouse, touch and full keyboard play, plus screen-reader announcements.

## Keyboard

| Key | Action |
| --- | --- |
| Arrow keys | Move between dots (board focused) |
| Shift + arrow, or Enter then arrow | Draw a line |
| Ctrl/⌘ + Z / Ctrl + Y | Undo / redo |
| H | Hint |
| P | Pause the computer |
| M | Mute |
| F | Full screen |
| ? | Rules |

## Files

Plain `<script>` tags (not ES modules), so the game still opens straight from the file system. Each file is small and has one job.

```
index.html              page markup, loads the files below in order

css/
  base.css              design tokens, light/dark/paper themes, buttons, form controls
  setup.css             setup screen: steps, board preview, player rows
  game.css              game screen: top bar, scoreboard, status, move history, replay bar
  board.css             the SVG board: dots, lines, boxes, animations
  dialogs.css           dialogs, results, statistics, toast, confetti

js/
  engine.js             game rules (pure logic, no DOM, also runs in Node)
  ai/
    model.js            fast flat-array board model the AI can change and undo
    chains.js           finds chains/loops and solves the endgame
    ai.js               move choice for Easy / Medium / Hard
  ui/                   (all share the window.DAB namespace)
    core.js             constants, helpers, storage; loaded first
    settings.js         settings, themes, settings dialog
    feedback.js         sound, vibration, toast, screen-reader messages, confetti
    dialogs.js          dialog open/close, confirm prompt, rules text
    state.js            current game state, save/resume, statistics
    board.js            board drawing (incremental) and mouse/touch/keyboard input
    hud.js              scoreboard, status, score bar, move history, button states
    game.js             turns, computer moves, timer, undo/redo, hint, toolbar, shortcuts
    results.js          results dialog, replay, statistics dialog
    setup.js            two-step setup, player symbols, resume card, animated logo
    main.js             start-up; loaded last

tests/engine-ai.test.js
```

### Performance

The board is updated incrementally. Each game builds the dots and tap areas once. After every move, only the line and boxes that changed are added or removed; nothing is redrawn from scratch. On a 20×20 board late in the game, a move takes about 3 ms (it was about 10 ms when the whole board was redrawn).

## Tests

```
node tests/engine-ai.test.js
```

The tests play hundreds of random games on many board sizes with 2–4 players. After every move they check box ownership, scores, the extra-turn rule, double boxes, duplicate lines, the end of the game and undo. They also check that every computer move is legal, and that Hard beats Medium and Medium beats Easy.
