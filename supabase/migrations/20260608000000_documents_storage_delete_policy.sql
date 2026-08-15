create policy "Board can delete documents from storage"
on storage.objects for delete
using (
  bucket_id = 'documents'
  and exists (select 1 from profiles where id = auth.uid() and role = 'board' and status = 'approved')
);
