const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict'), test=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'../auth.js'),'utf8');
function setup(options={}) {
 const nodes={};
 const get=id=>nodes[id]??=( {value:'',disabled:false,hidden:false,textContent:'',classList:{toggle(){}},setAttribute(){},removeAttribute(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},reportValidity(){return true;}} );
 const timers=[],calls=[];let callback;
 const response=options.response||{data:{session:null},error:null};
 const auth={onAuthStateChange(cb){callback=cb;},
 signUp:async arg=>{calls.push(['signup',arg]);return response;},
 signInWithPassword:async arg=>{calls.push(['signin',arg]);return response;},
 resetPasswordForEmail:async (...args)=>{calls.push(['reset',...args]);return response;},
 resend:async arg=>{calls.push(['resend',arg]);return response;},
 updateUser:async arg=>{calls.push(['update',arg]);return response;},
 signOut:async()=>{calls.push(['signout']);return {error:null};},
 getUser:async()=>({data:{user:{id:options.currentUser||'u1'}},error:null})};
 const window={location:{hash:options.hash||'',search:options.search||'',pathname:'/Trucker-Find--web/'},history:{replaceState(){calls.push(['clean']);}}};
 const context=vm.createContext({window,document:{readyState:'complete',getElementById:get,querySelectorAll(){return [];}},URLSearchParams,setTimeout(fn){timers.push(fn);}});
 vm.runInContext(source,context);window.TruckerAuth.init({auth},async()=>{});
 const flush=async()=>{while(timers.length)await timers.shift()();await Promise.resolve();};
 return {api:window.TruckerAuth,get,calls,flush,emit:async(event,session)=>{callback(event,session);await flush();},submit:()=>window.TruckerAuth.submit({preventDefault(){}})};
}
test('signup sends confirmation redirect and never exposes password in feedback',async()=>{
 const t=setup();t.api.show('signup');t.get('authEmail').value='driver@example.com';t.get('authPassword').value=t.get('authConfirm').value='test-password';await t.submit();
 assert.equal(t.calls[0][0],'signup');assert.equal(t.calls[0][1].options.emailRedirectTo,'https://truckerfindapp.github.io/Trucker-Find--web/?auth=confirmed');assert.match(t.get('authStatus').textContent,/Check your email/);assert.equal(t.get('authPassword').value,'');
});
test('forgot password sends recovery URL and uses non-enumerating feedback',async()=>{
 const t=setup();t.api.show('forgot');t.get('authEmail').value='driver@example.com';await t.submit();assert.equal(t.calls[0][0],'reset');assert.match(t.calls[0][2].redirectTo,/auth=recovery$/);assert.match(t.get('authStatus').textContent,/If an account exists/);
});
test('resend targets signup confirmation',async()=>{const t=setup();t.api.show('resend');await t.submit();assert.equal(t.calls[0][1].type,'signup');});
test('mismatched passwords never call authentication API',async()=>{const t=setup();t.api.show('signup');t.get('authPassword').value='new-pass';t.get('authConfirm').value='different';await t.submit();assert.equal(t.calls.length,0);});
test('direct update view cannot change password without recovery event',async()=>{const t=setup();t.api.show('update');await t.submit();assert.ok(!t.calls.some(x=>x[0]==='update'));assert.equal(t.get('authSubmit').disabled,true);});
test('recovery received before initial session remains in password screen',async()=>{
 const t=setup({hash:'#type=recovery',search:'?auth=recovery'});await t.emit('PASSWORD_RECOVERY',{user:{id:'u1'}});await t.emit('INITIAL_SESSION',{user:{id:'u1'}});assert.equal(t.get('authTitle').textContent,'Choose a new password');
 t.get('authPassword').value=t.get('authConfirm').value='new-password';await t.submit();assert.ok(t.calls.some(x=>x[0]==='update'));assert.match(t.get('authStatus').textContent,/Password updated/);
});
test('recovery cannot update a different signed-in account',async()=>{const t=setup({currentUser:'u2'});await t.emit('PASSWORD_RECOVERY',{user:{id:'u1'}});t.get('authPassword').value=t.get('authConfirm').value='new-password';await t.submit();assert.ok(!t.calls.some(x=>x[0]==='update'));assert.match(t.get('authStatus').textContent,/no longer valid/);});
test('expired recovery link opens request-new-link flow',async()=>{const t=setup({hash:'#error=access_denied&error_code=otp_expired',search:'?auth=recovery'});await t.emit('INITIAL_SESSION',null);assert.equal(t.get('authTitle').textContent,'Forgot password');assert.match(t.get('authStatus').textContent,/expired/);});
test('expired confirmation offers resend rather than password reset',async()=>{const t=setup({hash:'#error=access_denied',search:'?auth=confirmed'});await t.emit('INITIAL_SESSION',null);assert.equal(t.get('authTitle').textContent,'Resend confirmation');});
test('failed sign-in never creates an account',async()=>{const t=setup({response:{error:{code:'invalid_credentials'}}});t.api.show('signin');await t.submit();assert.equal(t.calls[0][0],'signin');assert.ok(!t.calls.some(x=>x[0]==='signup'));assert.match(t.get('authStatus').textContent,/incorrect/);});
test('unconfirmed email explains confirmation requirement',async()=>{const t=setup({response:{error:{code:'email_not_confirmed'}}});t.api.show('signin');await t.submit();assert.match(t.get('authStatus').textContent,/Confirm your email/);});
test('email-send failure is shown instead of false success',async()=>{const t=setup({response:{error:{message:'Email service unavailable'}}});t.api.show('forgot');await t.submit();assert.equal(t.get('authStatus').textContent,'Email service unavailable');});
