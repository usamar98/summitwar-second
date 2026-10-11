-- Run after the main migration. Uploads are performed by the authenticated server
-- route with MIME magic checks. Public clients may read, but may not write.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-media','product-media',true,31457280,array['image/png','image/jpeg','image/webp','video/mp4','video/webm'])
on conflict(id) do update set public=true,file_size_limit=31457280,allowed_mime_types=excluded.allowed_mime_types;
create policy "Public product media reads" on storage.objects for select to anon,authenticated using(bucket_id='product-media');
