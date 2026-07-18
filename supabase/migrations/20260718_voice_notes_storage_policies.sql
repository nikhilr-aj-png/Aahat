begin;

update storage.buckets
set public = true,
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'audio/mpeg','audio/mp3','audio/mp4','audio/wav','audio/ogg','audio/webm','audio/x-m4a'
    ]
where id = 'voice-notes';

drop policy if exists "voice_notes_public_read" on storage.objects;
drop policy if exists "voice_notes_owner_insert" on storage.objects;
drop policy if exists "voice_notes_owner_update" on storage.objects;
drop policy if exists "voice_notes_owner_delete" on storage.objects;

create policy "voice_notes_public_read"
on storage.objects for select to public
using (bucket_id = 'voice-notes');

create policy "voice_notes_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "voice_notes_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "voice_notes_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'voice-notes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;