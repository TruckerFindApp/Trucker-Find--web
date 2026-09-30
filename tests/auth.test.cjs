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

test('signup signs in immediately without email redirect',async()=>{
 const t=setup({response:{data:{session:{user:{id:'u1'}}},error:null}});t.api.show('signup');t.get('authEmail').value='driver@example.com';t.get('authPassword').value=t.get('authConfirm').value='test-password';await t.submit();
 assert.equal(t.calls[0][0],'signup');assert.equal(t.calls[0][1].options.emailRedirectTo,undefined);assert.match(t.get('authStatus').textContent,/signed in/);assert.equal(t.get('authPassword').value,'');
});
test('mismatched passwords never call authentication API',async()=>{const t=setup();t.api.show('signup');t.get('authPassword').value='new-pass';t.get('authConfirm').value='different';await t.submit();assert.equal(t.calls.length,0);});
test('failed sign-in never creates an account or offers email reset',async()=>{const t=setup({response:{error:{code:'invalid_credentials'}}});t.api.show('signin');await t.submit();assert.equal(t.calls[0][0],'signin');assert.equal(t.calls.length,1);assert.match(t.get('authStatus').textContent,/incorrect/);assert.doesNotMatch(t.get('authStatus').textContent,/forgot|reset/i);});
test('retired email modes fall back to password sign-in',async()=>{for(const mode of ['forgot','resend','update']){const t=setup();t.api.show(mode);assert.equal(t.get('authTitle').textContent,'Sign in');await t.submit();assert.equal(t.calls[0][0],'signin');}});
test('missing signup session does not claim success or ask for email',async()=>{const t=setup();t.api.show('signup');await t.submit();assert.match(t.get('authStatus').textContent,/Unable to finish/);assert.doesNotMatch(t.get('authStatus').textContent,/Check your email|Account created/);});
test('sign-in success closes dialog and clears password',async()=>{const t=setup();t.api.show();t.get('authPassword').value='test-password';await t.submit();assert.equal(t.get('authDialog').open,false);assert.equal(t.get('authPassword').value,'');});
