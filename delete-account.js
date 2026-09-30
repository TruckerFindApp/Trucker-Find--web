(function(root){
  'use strict';
  let client, onDeleted, busy=false, accountId=null;
  const el=id=>document.getElementById(id);
  function status(text){el('deleteStatus').textContent=text;}
  async function show(){
    if(busy)return;
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user){root.TruckerAuth.show('signin','Sign in to delete your account.');return;}
    accountId=user.id;
    el('deleteEmail').textContent=user.email;
    el('deletePassword').value='';el('deleteConfirm').value='';status('');
    el('deleteDialog').showModal();el('deletePassword').focus();
  }
  async function submit(event){
    event.preventDefault();
    if(busy||!el('deleteForm').reportValidity())return;
    if(el('deleteConfirm').value!=='DELETE'){status('Type DELETE exactly to confirm.');return;}
    busy=true;
    el('deleteSubmit').disabled=true;el('deleteCancel').disabled=true;
    status('Deleting your account. Please keep this screen open…');
    try{
      const {data:{user},error}=await client.auth.getUser();
      if(error||!user||user.id!==accountId)throw new Error('Your account session changed. Close this window and sign in again.');
      const result=await client.functions.invoke('delete-account',{body:{password:el('deletePassword').value,confirmation:'DELETE'}});
      if(result.error){
        let detail='Deletion could not be completed. Please try again.';
        try{const response=await result.error.context.json();if(response.error)detail=response.error;}catch{}
        throw new Error(detail);
      }
      if(result.data?.deleted!==true)throw new Error('Deletion was not confirmed. Please try again.');
      // Account deletion succeeds independently of local sign-out or UI refresh.
      try{await client.auth.signOut({scope:'local'});}catch{}
      el('deleteDialog').close();
      await onDeleted();
    }catch(error){status(error.message||'Unable to connect. Please try again.');}
    finally{busy=false;el('deletePassword').value='';el('deleteSubmit').disabled=false;el('deleteCancel').disabled=false;}
  }
  function init(authClient,deleted){
    client=authClient;onDeleted=deleted;
    el('deleteForm').addEventListener('submit',submit);
    el('deleteCancel').addEventListener('click',()=>{if(!busy)el('deleteDialog').close();});
    el('deleteDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    el('deleteDialog').addEventListener('close',()=>{el('deletePassword').value='';el('deleteConfirm').value='';});
  }
  root.TruckerDelete={init,show,submit};
})(window);
