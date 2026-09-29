(function (root) {
  'use strict';
  const HOME = 'https://truckerfindapp.github.io/Trucker-Find--web/';
  const incoming = new URLSearchParams(root.location.hash.slice(1));
  const incomingType = incoming.get('type');
  const incomingError = incoming.has('error') || incoming.has('error_code');
  const intent = new URLSearchParams(root.location.search).get('auth');
  let client, refresh, recoveryUser = null, busy = false, mode = 'signin', lastEmail = '';
  const el = id => document.getElementById(id);
  const ready = action => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', action, {once:true}) : action();
  function message(text, error = false) {
    el('authStatus').textContent = text;
    el('authStatus').classList.toggle('auth-error', error);
  }
  function show(next = 'signin', text = '') {
    if (busy) return;
    mode = next;
    const titles = {signin:'Sign in', signup:'Create account', forgot:'Forgot password', resend:'Resend confirmation', update:'Choose a new password'};
    el('authTitle').textContent = titles[mode];
    el('authNameRow').hidden = mode !== 'signup';
    el('authEmailRow').hidden = mode === 'update';
    el('authPasswordRow').hidden = !['signin','signup','update'].includes(mode);
    el('authConfirmRow').hidden = !['signup','update'].includes(mode);
    el('authEmail').required = mode !== 'update';
    el('authPassword').required = ['signin','signup','update'].includes(mode);
    el('authConfirm').required = ['signup','update'].includes(mode);
    el('authName').disabled = mode !== 'signup';
    el('authEmail').disabled = mode === 'update';
    el('authPassword').disabled = !['signin','signup','update'].includes(mode);
    el('authConfirm').disabled = !['signup','update'].includes(mode);
    el('authPassword').minLength = mode === 'signin' ? 1 : 8;
    el('authPassword').autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    el('authPassword').value = ''; el('authConfirm').value = '';
    el('authEmail').value = lastEmail;
    el('authSubmit').textContent = {signin:'SIGN IN',signup:'CREATE ACCOUNT',forgot:'EMAIL RESET LINK',resend:'RESEND CONFIRMATION',update:'SAVE NEW PASSWORD'}[mode];
    el('authSubmit').disabled = mode === 'update' && !recoveryUser;
    el('authDialog').showModal();
    message(text || (mode === 'signup' ? 'Confirm your email before signing in. Use at least 8 characters for your password.' : mode === 'forgot' ? 'We’ll email a link so you can choose a new password.' : mode === 'update' ? 'Use at least 8 characters. This changes your Trucker Find password.' : ''));
    (mode === 'update' ? el('authPassword') : el('authEmail')).focus();
  }
  function cleanCallback() {
    if (intent || incomingType || incomingError) root.history.replaceState(null, '', root.location.pathname);
  }
  function errorMessage(error) {
    if (error.code === 'email_not_confirmed') return 'Confirm your email before signing in. Use Resend confirmation if you need another email.';
    if (error.status === 429 || /rate|too many/i.test(error.message || '')) return 'Too many requests. Please wait a few minutes before trying again.';
    if (error.code === 'invalid_credentials') return 'Email or password is incorrect. Try again or choose Forgot password.';
    return error.message || 'Unable to connect. Please try again.';
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || !el('authForm').reportValidity()) return;
    const email = el('authEmail').value.trim();
    const password = el('authPassword').value;
    if (['signup','update'].includes(mode) && password !== el('authConfirm').value) { message('The passwords do not match.', true); return; }
    if (mode === 'update' && !recoveryUser) { message('Open a valid password-reset link from your email first.', true); return; }
    lastEmail = email; busy = true;
    el('authForm').setAttribute('aria-busy', 'true');
    document.querySelectorAll('#authDialog button').forEach(button => button.disabled = true);
    message('Please wait…');
    try {
      let result;
      if (mode === 'forgot') {
        result = await client.auth.resetPasswordForEmail(email, {redirectTo: HOME + '?auth=recovery'});
        if (result.error) throw result.error;
        message('If an account exists for this email, a password-reset link has been sent. Check your inbox and spam folder.');
      } else if (mode === 'resend') {
        result = await client.auth.resend({type:'signup',email,options:{emailRedirectTo:HOME + '?auth=confirmed'}});
        if (result.error) throw result.error;
        message('If this account needs confirmation, a new confirmation link has been sent. Check your inbox and spam folder.');
      } else if (mode === 'signup') {
        result = await client.auth.signUp({email,password,options:{data:{name:el('authName').value.trim()},emailRedirectTo:HOME + '?auth=confirmed'}});
        if (result.error) throw result.error;
        el('authPassword').value = ''; el('authConfirm').value = '';
        message(result.data.session ? 'Account created. You’re signed in.' : 'Check your email for a confirmation link before signing in. Already registered? Sign in or reset your password.');
        if (result.data.session) await refresh();
      } else if (mode === 'update') {
        const account = await client.auth.getUser();
        if (account.error || !account.data.user || account.data.user.id !== recoveryUser) throw new Error('This reset session is no longer valid. Request a new reset link.');
        result = await client.auth.updateUser({password});
        if (result.error) throw result.error;
        recoveryUser = null; cleanCallback();
        el('authPassword').value = ''; el('authConfirm').value = '';
        await client.auth.signOut({scope:'local'});
        busy = false;
        show('signin', 'Password updated. Sign in with your new password. If you reset it in your browser, return to the Android app and sign in there too.');
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
      if (mode === 'update' && !recoveryUser) el('authSubmit').disabled = true;
    }
  }
  function init(authClient, refreshAccount) {
    client = authClient; refresh = refreshAccount;
    // Subscribe before session initialization completes; keep the callback synchronous.
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') recoveryUser = session?.user?.id || null;
      if (event === 'SIGNED_OUT') recoveryUser = null;
      setTimeout(() => ready(() => {
        if (event === 'PASSWORD_RECOVERY') {
          cleanCallback(); show('update');
        } else if (event === 'INITIAL_SESSION' && (incomingError || ((intent === 'recovery' || incomingType === 'recovery') && !recoveryUser))) {
          cleanCallback();
          show(intent === 'confirmed' ? 'resend' : 'forgot', 'This email link is expired or invalid. Request a new email link.');
        } else if (event === 'SIGNED_IN' && incomingType === 'signup' && !incomingError) {
          cleanCallback(); show('signin', 'Email confirmed. You can now sign in to Trucker Find on your phone.');
        }
        Promise.resolve(refresh()).catch(() => {});
      }), 0);
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
