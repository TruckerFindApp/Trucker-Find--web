import { createClient } from 'npm:@supabase/supabase-js@2';

const origin = 'https://truckerfindapp.github.io';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
  'Vary': 'Origin',
};
const reply = (status: number, error?: string) => new Response(JSON.stringify(error ? {error} : {deleted:true}), {status, headers});

Deno.serve(async (req: Request) => {
  if (req.headers.get('origin') && req.headers.get('origin') !== origin) return reply(403, 'Origin not allowed.');
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers});
  if (req.method !== 'POST') return reply(405, 'Use POST.');
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return reply(401, 'Sign in again before deleting your account.');
  const options = {auth:{persistSession:false, autoRefreshToken:false, detectSessionInUrl:false}};
  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options);
  try {
    // Look up the live account: a signed JWT alone may outlive account deletion.
    const {data:{user}, error:authError} = await admin.auth.getUser(token);
    if (authError || !user?.email) return reply(401, 'Sign in again before deleting your account.');
    let body;
    try { body = await req.json(); } catch { return reply(400, 'Invalid request.'); }
    if (body?.confirmation !== 'DELETE' || typeof body.password !== 'string' || !body.password || body.password.length > 4096) {
      return reply(400, 'Enter your password and type DELETE to confirm.');
    }
    // Use a separate client so password verification cannot replace the admin session.
    const verifier = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options);
    const verified = await verifier.auth.signInWithPassword({email:user.email, password:body.password});
    if (verified.error || verified.data.user?.id !== user.id) {
      return reply(verified.error?.status === 429 ? 429 : 403, 'Password could not be verified. Check it and try again.');
    }
    await verifier.auth.signOut({scope:'local'});
    // User IDs from the request body are never used to select records.
    const bucket = admin.storage.from('profile-photos');
    for (;;) {
      const {data:files,error} = await bucket.list(user.id, {limit:100});
      if (error) throw error;
      if (!files?.length) break;
      if (files.some(file => !file.id)) throw new Error('Unexpected photo folder');
      const removed = await bucket.remove(files.map(file => `${user.id}/${file.name}`));
      if (removed.error) throw removed.error;
    }
    const saved = await admin.from('saved_places').delete().eq('user_id', user.id);
    if (saved.error) throw saved.error;
    const profile = await admin.from('profiles').delete().eq('id', user.id);
    if (profile.error) throw profile.error;
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error) throw deleted.error;
    return reply(200);
  } catch {
    // Never log passwords, bearer tokens, profile data, or raw provider errors.
    return reply(500, 'Deletion did not finish. Some data may already be removed. Please try again or contact support.');
  }
});
