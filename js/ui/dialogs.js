/* Dots and Boxes UI: dialogs.
 * Opening a dialog pauses the game flow (computer moves, turn timer); closing resumes it.
 * Also provides a promise-based confirm() and fills in the rules text.
 */
(function (D) {
  'use strict';

  const { $ } = D;

  const isOpen = () => !!document.querySelector('dialog[open]');

  function open(dlg) {
    D.game.pauseFlow();
    if (!dlg.open) dlg.showModal();
  }

  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('close', () => setTimeout(D.game.resumeFlow, 0));
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
    // Clicking the backdrop closes informational dialogs (not the confirm prompt).
    if (d.id !== 'confirmDialog') d.addEventListener('click', e => { if (e.target === d) d.close(); });
  });

  const confirmDialog = $('confirmDialog');
  function confirm(title, msg, okLabel) {
    return new Promise(resolve => {
      $('confirmTitle').textContent = title;
      $('confirmMsg').textContent = msg;
      $('confirmOk').textContent = okLabel;
      confirmDialog.returnValue = '';
      confirmDialog.addEventListener('close', () => resolve(confirmDialog.returnValue === 'ok'), { once: true });
      open(confirmDialog);
    });
  }

  // Same rules text on the setup page and in the in-game dialog.
  const tpl = $('rulesTpl');
  $('setupRules').appendChild(tpl.content.cloneNode(true));
  $('rulesDialogBody').appendChild(tpl.content.cloneNode(true));

  D.dialogs = { isOpen, open, confirm };
})(window.DAB);
