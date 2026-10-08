-- Run once in this project's Supabase SQL Editor. Each account owns one snapshot.
create table if not exists public.workout_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.workout_sync enable row level security;
drop policy if exists "Own workout data" on public.workout_sync;
create policy "Own workout data" on public.workout_sync for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.workout_sync from anon;
grant select, insert, update on public.workout_sync to authenticated;
-- Atomic compare-and-swap prevents two devices silently overwriting each other.
create or replace function public.save_workout(expected_revision bigint, new_payload jsonb, expected_user uuid)
returns bigint language plpgsql security invoker set search_path = public as $$
declare next_revision bigint;
begin
  if auth.uid() is null or auth.uid() <> expected_user then raise exception 'Account changed; sign in again'; end if;
  if expected_revision = 0 then
    insert into public.workout_sync(user_id, payload) values(auth.uid(), new_payload)
      on conflict do nothing returning revision into next_revision;
  else
    update public.workout_sync set payload = new_payload, revision = revision + 1, updated_at = now()
      where user_id = auth.uid() and revision = expected_revision returning revision into next_revision;
  end if;
  if next_revision is null then raise exception 'Another device changed the data. Retry sync.'; end if;
  return next_revision;
end $$;
revoke all on function public.save_workout(bigint,jsonb,uuid) from public, anon;
grant execute on function public.save_workout(bigint,jsonb,uuid) to authenticated;
