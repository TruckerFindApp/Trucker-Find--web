(function (root) {
  'use strict';
  let client, refresh, busy = false, mode = 'signin', lastEmail = '';
  const el = id => document.getElementById(id);
  const ready = action => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', action, {once:true}) : action();
  function message(text, error = false) {
    el('authStatus').textContent = text;
    el('authStatus').classList.toggle('auth-error', error);
  }
  function show(next = 'signin', text = '') {
    if (busy) return;
    mode = next === 'signup' ? 'signup' : 'signin';
    const titles = {signin:'Sign in', signup:'Create account'};
    el('authTitle').textContent = titles[mode];
    el('authNameRow').hidden = mode !== 'signup';
    el('authEmailRow').hidden = false;
    el('authPasswordRow').hidden = false;
    el('authConfirmRow').hidden = mode !== 'signup';
    el('authEmail').required = true;
    el('authPassword').required = true;
    el('authConfirm').required = mode === 'signup';
    el('authName').disabled = mode !== 'signup';
    el('authEmail').disabled = false;
    el('authPassword').disabled = false;
    el('authConfirm').disabled = mode !== 'signup';
    el('authPassword').minLength = mode === 'signin' ? 1 : 8;
    el('authPassword').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    el('authPassword').value = ''; el('authConfirm').value = '';
    el('authEmail').value = lastEmail;
    el('authSubmit').textContent = mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN';
    el('authSubmit').disabled = false;
    el('authDialog').showModal();
    message(text || (mode === 'signup' ? 'Use at least 8 characters for your password. Keep it somewhere safe.' : ''));
    el('authEmail').focus();
  }

  function errorMessage(error) {
    if (error.code === 'email_not_confirmed') return 'This account is not ready to sign in. Please contact Trucker Find support.';
    if (error.status === 429 || /rate|too many/i.test(error.message || '')) return 'Too many requests. Please wait a few minutes before trying again.';
    if (error.code === 'invalid_credentials') return 'Email or password is incorrect. Please try again.';
    return error.message || 'Unable to connect. Please try again.';
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !el('authForm').reportValidity()) return;
    const email = el('authEmail').value.trim();
    const password = el('authPassword').value;
    if (mode === 'signup' && password !== el('authConfirm').value) { message('The passwords do not match.', true); return; }
    lastEmail = email; busy = true;
    el('authForm').setAttribute('aria-busy', 'true');
    document.querySelectorAll('#authDialog button').forEach(button => button.disabled = true);
    message('Please wait…');
    try {
      let result;
      if (mode === 'signup') {
        result = await client.auth.signUp({email,password,options:{data:{name:el('authName').value.trim()}}});
        if (result.error) throw result.error;
        el('authPassword').value = ''; el('authConfirm').value = '';
        message(result.data.session ? 'Account created. You’re signed in.' : 'Unable to finish signing in. Try Sign in if you already have an account.');
        if (result.data.session) await refresh();
      } else {
        result = await client.auth.signInWithPassword({email,password});
        if (result.error) throw result.error;
        el('authPassword').value = '';
        await refresh(); el('authDialog').close();
      }
    } catch (error) { message(errorMessage(error), true); }
    finally {
      busy = false;
      el('authForm').removeAttribute('aria-busy');
      document.querySelectorAll('#authDialog button').forEach(button => button.disabled = false);
    }
  }
  function init(authClient, refreshAccount) {
    client = authClient; refresh = refreshAccount;
    // Subscribe before session initialization completes; keep the callback synchronous.
    client.auth.onAuthStateChange(() => {
      setTimeout(() => ready(() => { Promise.resolve(refresh()).catch(() => {}); }), 0);
    });
    ready(() => {
      el('authForm').addEventListener('submit', submit);
      document.querySelectorAll('[data-auth-mode]').forEach(button => button.addEventListener('click', () => {
        lastEmail = el('authEmail').value.trim(); show(button.dataset.authMode);
      }));
      el('authClose').addEventListener('click', () => el('authDialog').close());
      el('authDialog').addEventListener('cancel', event => { if (busy) event.preventDefault(); });
      el('authDialog').addEventListener('close', () => { el('authPassword').value = ''; el('authConfirm').value = ''; });
    });
  }
  root.TruckerAuth = {init, show, submit};
})(window);
