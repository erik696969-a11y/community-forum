import { supabase } from './supabaseClient';

// Generates a short-lived signed URL for a file in a private bucket.
// Works client-side because the request is made with the current user's
// own session - Supabase checks the storage RLS policy (approved members
// only) before issuing the signed URL.
export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error || !data) return null;
  return data.signedUrl;
}

// Same as above, but forces the browser to download the file (instead of
// trying to preview it inline) using Supabase's built-in `download` option.
export async function getSignedDownloadUrl(bucket, path, filename, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn, { download: filename || true });
  if (error || !data) return null;
  return data.signedUrl;
}
