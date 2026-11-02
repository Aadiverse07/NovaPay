/* Visible recovery state for a confirmed account whose workspace cannot be restored. */
(function () {
  var auth = window.NovaPayAuth;
  var panel = document.getElementById('workspace-required');
  var button = document.getElementById('workspace-create');
  if (!auth || !panel || !button) return;
  function showIfRequired() {
    var state = auth.workspaceState || (auth.workspaceError ? 'unavailable' : 'ready');
    panel.hidden = ['missing', 'transient', 'unavailable'].indexOf(state) === -1;
    if (panel.hidden) return;
    var heading = panel.querySelector('h2'), message = panel.querySelector('p');
    if (state === 'missing') {
      if (heading) heading.textContent = 'Create your workspace';
      if (message) message.textContent = 'Your email is verified, but no organization workspace is available yet.';
      button.textContent = 'Create your workspace';
    } else {
      if (heading) heading.textContent = state === 'transient' ? 'Server busy, retrying…' : 'Workspace unavailable';
      if (message) message.textContent = state === 'transient' ? 'Your saved workspace could not be checked. Retry; existing organization access will be restored automatically.' : 'Your workspace could not be verified. Retry when the service is available.';
      button.textContent = 'Retry';
    }
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
        : auth.workspaceState === 'transient' ? 'Server busy, retrying… Your last known organization is kept. Try again shortly.'
          : 'Workspace setup could not finish. Check your connection and try again.';
      button.disabled = false;
      button.textContent = auth.workspaceState === 'missing' ? 'Create your workspace' : 'Retry';
    });
  });
  auth.ready.then(showIfRequired);
  document.addEventListener('novapay:auth', showIfRequired);
}());
