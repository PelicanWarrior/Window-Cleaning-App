-- Run this in Supabase SQL Editor
-- Stores captions for landing page screenshots.

create table if not exists public."PictureCaptions" (
  picture_key text primary key,
  caption text not null default '',
  display_order integer not null default 999,
  updated_at timestamptz not null default now()
);

alter table public."PictureCaptions"
  add column if not exists display_order integer not null default 999;

alter table public."PictureCaptions" enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'PictureCaptions'
      and policyname = 'Picture captions are readable by everyone'
  ) then
    create policy "Picture captions are readable by everyone"
      on public."PictureCaptions"
      for select
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'PictureCaptions'
      and policyname = 'Picture captions writable by authenticated users'
  ) then
    create policy "Picture captions writable by authenticated users"
      on public."PictureCaptions"
      for all
      using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end
$$;

insert into public."PictureCaptions" (picture_key, caption, display_order)
values
  ('Picture 1.png', 'Picture 1 preview', 1),
  ('Picture 2.png', 'Picture 2 preview', 2),
  ('Picture 3.png', 'Picture 3 preview', 3),
  ('Picture 4.png', 'Picture 4 preview', 4),
  ('Picture 5.png', 'Picture 5 preview', 5)
on conflict (picture_key) do nothing;

update public."PictureCaptions" as captions
set display_order = seed.display_order
from (
  values
    ('Picture 1.png', 1),
    ('Picture 2.png', 2),
    ('Picture 3.png', 3),
    ('Picture 4.png', 4),
    ('Picture 5.png', 5)
) as seed(picture_key, display_order)
where captions.picture_key = seed.picture_key
  and captions.display_order = 999;
