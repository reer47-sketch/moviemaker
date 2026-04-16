-- Shared drafts (recipe app → moviemaker 연동용, 24시간 후 만료)
create table if not exists public.shared_drafts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  script text not null,
  scenes jsonb not null,
  key_phrase text not null default '',
  character_description text not null default '',
  moods text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.shared_drafts enable row level security;
create policy "Anyone can insert shared_drafts" on public.shared_drafts for insert with check (true);
create policy "Anyone can read shared_drafts" on public.shared_drafts for select using (true);

-- Videos table
create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  topic text not null,
  script text,
  scenes jsonb,
  audio_url text,
  image_urls text[],
  video_url text,
  subtitled_video_url text,
  status text not null default 'pending'
    check (status in (
      'pending', 'generating_script', 'generating_voice',
      'generating_images', 'rendering', 'adding_subtitles',
      'completed', 'failed'
    )),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger videos_updated_at
  before update on public.videos
  for each row execute function update_updated_at();

-- RLS
alter table public.videos enable row level security;

-- Anyone can insert (for now — no auth required)
create policy "Anyone can insert videos"
  on public.videos for insert
  with check (true);

-- Anyone can read their own or anonymous videos
create policy "Anyone can read videos"
  on public.videos for select
  using (true);

-- Anyone can update (for status updates from API)
create policy "Service role can update videos"
  on public.videos for update
  using (true);

-- Storage bucket for media files
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict do nothing;

create policy "Anyone can upload media"
  on storage.objects for insert
  with check (bucket_id = 'media');

create policy "Media files are public"
  on storage.objects for select
  using (bucket_id = 'media');
