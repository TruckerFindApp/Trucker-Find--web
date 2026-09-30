const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/delete-account/index.ts'),'utf8').replace(/^import .*;\n/,''));
function setup(options={}){
 let handler,listed=false;const calls=[];
 const admin={auth:{getUser:async()=>options.noUser?{data:{user:null},error:{}}:{data:{user:{id:'owner',email:'test@example.com'}},error:null},admin:{deleteUser:async id=>{calls.push(['account',id]);return {error:options.deleteError?{}:null};}}},storage:{from:()=>({list:async()=>{if(listed)return {data:[],error:null};listed=true;return {data:[{id:'photo',name:'profile.jpg'}],error:null};},remove:async names=>{calls.push(['photos',names]);return {error:options.storageError?{}:null};}})},from:table=>({delete:()=>({eq:async(key,value)=>{calls.push([table,key,value]);return {error:null};}})})};
 const verifier={auth:{signInWithPassword:async()=>options.wrongPassword?{data:{user:null},error:{status:400}}:{data:{user:{id:options.otherUser?'other':'owner'}},error:null},signOut:async()=>({error:null})}};
 vm.runInNewContext(source,{Request,Response,JSON,Deno:{env:{get:key=>key},serve:fn=>handler=fn},createClient:(_url,key)=>key==='SUPABASE_SERVICE_ROLE_KEY'?admin:verifier});
 return {calls,run:body=>handler(new Request('https://test/delete-account',{method:'POST',headers:{Authorization:'Bearer test','Content-Type':'application/json'},body:JSON.stringify(body??{password:'test-pass',confirmation:'DELETE',userId:'victim'})})),handler};
}
test('rejects missing authentication',async()=>{const t=setup();const r=await t.handler(new Request('https://test',{method:'POST'}));assert.equal(r.status,401);assert.equal(t.calls.length,0);});
test('rejects deleted or invalid session',async()=>{const t=setup({noUser:true});assert.equal((await t.run()).status,401);assert.equal(t.calls.length,0);});
test('requires exact confirmation',async()=>{const t=setup();assert.equal((await t.run({password:'pass',confirmation:'yes'})).status,400);assert.equal(t.calls.length,0);});
test('wrong password cannot remove data',async()=>{const t=setup({wrongPassword:true});assert.equal((await t.run()).status,403);assert.equal(t.calls.length,0);});
test('different reauthenticated identity cannot remove data',async()=>{const t=setup({otherUser:true});assert.equal((await t.run()).status,403);assert.equal(t.calls.length,0);});
test('deletes only verified owner, storage before account',async()=>{const t=setup();assert.equal((await t.run()).status,200);assert.deepEqual(JSON.parse(JSON.stringify(t.calls)),[['photos',['owner/profile.jpg']],['saved_places','user_id','owner'],['profiles','id','owner'],['account','owner']]);});
test('storage failure stops database and account deletion',async()=>{const t=setup({storageError:true});assert.equal((await t.run()).status,500);assert.equal(t.calls.length,1);});
test('account failure never reports success',async()=>{const t=setup({deleteError:true});const r=await t.run();assert.equal(r.status,500);assert.equal((await r.json()).deleted,undefined);});
