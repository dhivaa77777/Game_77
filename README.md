# Dots and Boxes

The classic pencil-and-paper game in the browser. Plain HTML, CSS and JavaScript, with no build step, libraries or server.

**To play:** open `index.html` in any modern browser. It works straight from the file system and offline.

## Features

- **2–4 players** with custom names and colours. Any player can be a human or a computer player.
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

```
index.html          page markup
css/style.css       styles and themes
js/engine.js        game rules (no DOM; also runs in Node)
js/ai.js            computer players (no DOM; also runs in Node)
js/app.js           user interface
tests/engine-ai.test.js
```

## Tests

```
node tests/engine-ai.test.js
```

The tests play hundreds of random games on many board sizes with 2–4 players. After every move they check box ownership, scores, the extra-turn rule, double boxes, duplicate lines, the end of the game and undo. They also check that every computer move is legal, and that Hard beats Medium and Medium beats Easy.
