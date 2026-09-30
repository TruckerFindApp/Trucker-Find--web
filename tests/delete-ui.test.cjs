const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'../delete-account.js'),'utf8');
function setup(options={}){
 const nodes={},calls=[];let account='owner';
 const get=id=>nodes[id]??={value:'',disabled:false,textContent:'',addEventListener(){},focus(){},showModal(){this.open=true;},close(){this.open=false;},reportValidity(){return true;}};
 const client={auth:{getUser:async()=>({data:{user:options.noUser?null:{id:account,email:'test@example.com'}}}),signOut:async()=>calls.push('signout')},functions:{invoke:async(name,args)=>{calls.push({name,args});return options.response||{data:{deleted:true}};}}};
 const window={TruckerAuth:{show:()=>calls.push('signin')}};
 vm.runInNewContext(source,{window,document:{getElementById:get}});
 window.TruckerDelete.init(client,async()=>calls.push('deleted'));
 return {api:window.TruckerDelete,get,calls,changeAccount(){account='other';},submit:()=>window.TruckerDelete.submit({preventDefault(){}})};
}
test('signed-out users must sign in before deletion',async()=>{const t=setup({noUser:true});await t.api.show();assert.deepEqual(t.calls,['signin']);});
test('confirmation is required without network deletion',async()=>{const t=setup();await t.api.show();t.get('deleteConfirm').value='delete';await t.submit();assert.equal(t.calls.length,0);});
test('switching accounts cancels deletion',async()=>{const t=setup();await t.api.show();t.changeAccount();t.get('deleteConfirm').value='DELETE';await t.submit();assert.equal(t.calls.length,0);assert.match(t.get('deleteStatus').textContent,/session changed/);});
test('successful deletion clears password and signed-in state',async()=>{const t=setup();await t.api.show();t.get('deleteConfirm').value='DELETE';t.get('deletePassword').value='password';await t.submit();assert.equal(t.calls[0].name,'delete-account');assert.equal(t.calls[0].args.body.userId,undefined);assert.deepEqual(t.calls.slice(1),['signout','deleted']);assert.equal(t.get('deletePassword').value,'');assert.equal(t.get('deleteDialog').open,false);});
test('failure leaves account signed in and allows retry',async()=>{const t=setup({response:{error:{context:{json:async()=>({error:'Password could not be verified.'})}}}});await t.api.show();t.get('deleteConfirm').value='DELETE';await t.submit();assert.equal(t.calls.length,1);assert.match(t.get('deleteStatus').textContent,/Password/);assert.equal(t.get('deleteDialog').open,true);assert.equal(t.get('deleteSubmit').disabled,false);});
test('unconfirmed response never claims deletion succeeded',async()=>{const t=setup({response:{data:{}}});await t.api.show();t.get('deleteConfirm').value='DELETE';await t.submit();assert.equal(t.calls.length,1);assert.match(t.get('deleteStatus').textContent,/not confirmed/);});
