/* Visible recovery state for a confirmed account whose workspace cannot be restored. */
(function () {
  var auth = window.NovaPayAuth;
  var panel = document.getElementById('workspace-required');
  var button = document.getElementById('workspace-create');
  if (!auth || !panel || !button) return;
  function showIfRequired() {
    panel.hidden = !auth.workspaceError;
  }
  button.addEventListener('click', function () {
    button.disabled = true;
    button.textContent = 'Setting up…';
    auth.currentSession().then(function (session) {
      if (!session) throw new Error('Your session expired. Sign in again.');
      return auth.ensureWorkspace(session);
    }).then(function () {
      panel.hidden = true;
      window.location.reload();
    }).catch(function (error) {
      var code = String(error && error.code || '').toLowerCase();
      panel.querySelector('p').textContent = code === 'email_not_confirmed'
        ? 'Verify your email before creating a workspace.'
        : 'Workspace setup could not finish. Check your connection and try again.';
      button.disabled = false;
      button.textContent = 'Try again';
    });
  });
  auth.ready.then(showIfRequired);
  document.addEventListener('novapay:auth', showIfRequired);
}());
