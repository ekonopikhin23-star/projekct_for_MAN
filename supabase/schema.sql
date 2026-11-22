-- Квіз і карта: чернетка схеми Supabase і політик Row Level Security.
--
-- УВАГА: цей файл складено за кодом (supabase-client.js, auth-ui.js, admin.html),
-- а не вивантажено з працюючої бази. Перед запуском порівняйте його з таблицями,
-- які вже є у вашому проєкті Supabase (Table Editor і Authentication > Policies).
-- Скрипт можна запускати повторно: він створює об'єкти лише за потреби
-- й перестворює політики з тими самими назвами.

-- ---------------------------------------------------------------------------
-- Таблиці
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text check (username is null or char_length(username) between 2 and 30),
  github_login text check (github_login is null or char_length(github_login) <= 39),
  avatar_url   text,
  role         text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at   timestamptz not null default now()
);

create table if not exists public.packs (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 40),
  description      text check (description is null or char_length(description) <= 120),
  icon             text,
  color            text check (color is null or color ~* '^#[0-9a-f]{6}$'),
  kind             text not null check (kind in ('theme', 'map')),
  question_count   integer not null default 0 check (question_count >= 0),
  data             jsonb not null,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  created_at       timestamptz not null default now()
);

create index if not exists packs_status_created_idx on public.packs (status, created_at);

create table if not exists public.pack_likes (
  id         uuid primary key default gen_random_uuid(),
  pack_id    uuid not null references public.packs (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (pack_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Допоміжні функції
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_moderator()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator', 'admin'));
$$;

-- Профіль створюється автоматично під час реєстрації.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, github_login, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'user_name', split_part(new.email, '@', 1)),
    case when new.raw_app_meta_data ->> 'provider' = 'github'
         then new.raw_user_meta_data ->> 'user_name' end,
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Роль змінює лише адміністратор (або SQL-редактор, де auth.uid() порожній).
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Змінювати роль може лише адміністратор';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles   enable row level security;
alter table public.packs      enable row level security;
alter table public.pack_likes enable row level security;

-- profiles: імена авторів видно всім, редагувати можна лише свій профіль.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- packs: гості бачать лише схвалені пакети; автор бачить свої; модератор бачить усі.
drop policy if exists "packs_select" on public.packs;
create policy "packs_select" on public.packs
  for select using (status = 'approved' or author_id = auth.uid() or public.is_moderator());

-- Новий пакет завжди створюється зі статусом pending від імені автора.
drop policy if exists "packs_insert_own" on public.packs;
create policy "packs_insert_own" on public.packs
  for insert to authenticated
  with check (author_id = auth.uid() and status = 'pending');

-- Автор може правити свій пакет, поки той не схвалений; після правки він знову pending.
drop policy if exists "packs_update_own_unapproved" on public.packs;
create policy "packs_update_own_unapproved" on public.packs
  for update to authenticated
  using (author_id = auth.uid() and status in ('pending', 'rejected'))
  with check (author_id = auth.uid() and status = 'pending');

-- Модератор і адміністратор схвалюють та відхиляють пакети.
drop policy if exists "packs_update_moderator" on public.packs;
create policy "packs_update_moderator" on public.packs
  for update to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

drop policy if exists "packs_delete_own_or_moderator" on public.packs;
create policy "packs_delete_own_or_moderator" on public.packs
  for delete to authenticated
  using (author_id = auth.uid() or public.is_moderator());

-- pack_likes: кожен бачить і змінює лише свої лайки.
drop policy if exists "likes_select_own" on public.pack_likes;
create policy "likes_select_own" on public.pack_likes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "likes_insert_own" on public.pack_likes;
create policy "likes_insert_own" on public.pack_likes
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "likes_delete_own" on public.pack_likes;
create policy "likes_delete_own" on public.pack_likes
  for delete to authenticated using (user_id = auth.uid());
