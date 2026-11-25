/* Dots and Boxes UI: start-up. Loaded last. */
(function (D) {
  'use strict';

  D.prefs.syncUI();
  D.setup.show();

  // Read-only view of the game for automated tests and the browser console.
  window.DotsAndBoxesApp = {
    get game() { return D.state.game; },
    get players() { return D.state.players; },
    get replaying() { return !!D.state.replay; },
    settings: D.settings
  };
})(window.DAB);
