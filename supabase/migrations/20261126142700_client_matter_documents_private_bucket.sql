-- Keep the customer matter document bucket private in every environment.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-matter-documents', 'client-matter-documents', false, null, null)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
