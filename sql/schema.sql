-- MM 2026 Veikkaus — täydellinen Supabase-schema
-- Aja Supabase SQL Editorissa (Database → SQL Editor → New query)
-- Voidaan ajaa uudelleen — IF NOT EXISTS / OR REPLACE estää duplikaatit

-- ─── Taulut ───────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  created_at timestamptz default now()
);

create table if not exists public.matches (
  id text primary key,
  group_name text not null,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  tbd boolean default false,
  result text check (result in ('1','x','2')),
  home_goals integer,
  away_goals integer,
  extra_time boolean default false,
  odds_home numeric,
  odds_draw numeric,
  odds_away numeric,
  odds_updated_at timestamptz,
  live_clock text,
  live_period integer,
  live_events jsonb
);

create table if not exists public.bets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles on delete cascade not null,
  match_id text references public.matches on delete cascade not null,
  prediction text not null check (prediction in ('1','x','2')),
  home_goals integer not null check (home_goals >= 0),
  away_goals integer not null check (away_goals >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, match_id)
);

-- ─── Pistetaulukko ────────────────────────────────────────────────────────────
create or replace view public.leaderboard as
select
  p.id as user_id,
  p.display_name,
  count(b.id) filter (where b.id is not null) as bets_placed,
  coalesce(sum(
    case
      when b.prediction = m.result
        and b.home_goals = m.home_goals
        and b.away_goals = m.away_goals
        and m.extra_time = false
      then 4
      when b.prediction = m.result
        and (b.home_goals = m.home_goals or b.away_goals = m.away_goals)
        and not (b.home_goals = m.home_goals and b.away_goals = m.away_goals)
        and m.extra_time = false
      then 3
      when b.prediction = m.result
        and not (b.home_goals = m.home_goals and b.away_goals = m.away_goals)
        and m.extra_time = false
      then 2
      when b.prediction != m.result
        and (b.home_goals = m.home_goals or b.away_goals = m.away_goals)
        and m.extra_time = false
      then 1
      when b.prediction = m.result
        and b.home_goals = m.home_goals
        and b.away_goals = m.away_goals
        and m.extra_time = true
      then 3
      when b.prediction != m.result
        and m.extra_time = true
        and m.result in ('1','2')
        and b.prediction = 'x'
      then 2
      when m.extra_time = true
        and b.prediction = m.result
      then 1
      else 0
    end
  ), 0) as total_points,
  count(b.id) filter (
    where b.prediction = m.result
      and b.home_goals = m.home_goals
      and b.away_goals = m.away_goals
  ) as exact_results
from public.profiles p
left join public.bets b on b.user_id = p.id
left join public.matches m on m.id = b.match_id and m.result is not null
group by p.id, p.display_name
order by total_points desc, exact_results desc;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.matches  enable row level security;
alter table public.bets     enable row level security;

-- Profiilit
drop policy if exists "Profiilit julkisesti luettavissa"  on public.profiles;
drop policy if exists "Profiilit kirjautuneille"          on public.profiles;
drop policy if exists "Käyttäjä muokkaa omaa profiiliaan" on public.profiles;
drop policy if exists "Käyttäjä luo oman profiilinsa"     on public.profiles;

create policy "Profiilit kirjautuneille"          on public.profiles for select using (auth.uid() is not null);
create policy "Käyttäjä muokkaa omaa profiiliaan" on public.profiles for update using (auth.uid() = id);
create policy "Käyttäjä luo oman profiilinsa"     on public.profiles for insert with check (auth.uid() = id);

-- Ottelut (kirjautuneet lukee, vain service_role kirjoittaa)
drop policy if exists "Ottelut julkisesti luettavissa" on public.matches;
drop policy if exists "Ottelut kirjautuneille"         on public.matches;
create policy "Ottelut kirjautuneille" on public.matches for select using (auth.uid() is not null);

-- Veikkaukset
drop policy if exists "Veikkaukset julkisesti luettavissa" on public.bets;
drop policy if exists "Veikkaukset kirjautuneille"         on public.bets;
drop policy if exists "Käyttäjä luo veikkauksen"           on public.bets;
drop policy if exists "Käyttäjä muokkaa omaa veikkaustaan" on public.bets;

create policy "Veikkaukset kirjautuneille"         on public.bets for select using (auth.uid() is not null);
create policy "Käyttäjä luo veikkauksen"           on public.bets for insert with check (auth.uid() = user_id);
create policy "Käyttäjä muokkaa omaa veikkaustaan" on public.bets for update using (auth.uid() = user_id);

-- ─── Trigger: luo profiili automaattisesti rekisteröinnin yhteydessä ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      split_part(new.email, '@', 1),
      'Käyttäjä'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Otteludata ───────────────────────────────────────────────────────────────
-- Käytä ON CONFLICT DO NOTHING jotta uudelleenajo ei kaada
insert into public.matches (id, group_name, home, away, kickoff) values
('A1','A','Meksiko','Etelä-Afrikka','2026-06-11T19:00:00Z'),
('A2','A','Etelä-Korea','Tšekki','2026-06-12T02:00:00Z'),
('B1','B','Kanada','Bosnia & Hertsegovina','2026-06-12T19:00:00Z'),
('D1','D','USA','Paraguay','2026-06-13T01:00:00Z'),
('B2','B','Qatar','Sveitsi','2026-06-13T19:00:00Z'),
('C1','C','Brasilia','Marokko','2026-06-13T22:00:00Z'),
('C2','C','Haiti','Skotlanti','2026-06-14T01:00:00Z'),
('D2','D','Australia','Turkki','2026-06-14T04:00:00Z'),
('E1','E','Saksa','Curaçao','2026-06-14T17:00:00Z'),
('F1','F','Alankomaat','Japani','2026-06-14T20:00:00Z'),
('E2','E','Norsunluurannikko','Ecuador','2026-06-14T23:00:00Z'),
('F2','F','Ruotsi','Tunisia','2026-06-15T02:00:00Z'),
('H1','H','Espanja','Kap Verde','2026-06-15T16:00:00Z'),
('G1','G','Belgia','Egypti','2026-06-15T19:00:00Z'),
('H2','H','Saudi-Arabia','Uruguay','2026-06-15T22:00:00Z'),
('G2','G','Iran','Uusi-Seelanti','2026-06-16T01:00:00Z'),
('I1','I','Ranska','Senegal','2026-06-16T19:00:00Z'),
('I2','I','Irak','Norja','2026-06-16T22:00:00Z'),
('J1','J','Argentiina','Algeria','2026-06-17T01:00:00Z'),
('J2','J','Itävalta','Jordania','2026-06-17T04:00:00Z'),
('K1','K','Portugali','Kongon DT','2026-06-17T17:00:00Z'),
('L1','L','Englanti','Kroatia','2026-06-17T20:00:00Z'),
('L2','L','Ghana','Panama','2026-06-17T23:00:00Z'),
('K2','K','Uzbekistan','Kolumbia','2026-06-18T02:00:00Z'),
('A3','A','Tšekki','Etelä-Afrikka','2026-06-18T16:00:00Z'),
('B3','B','Sveitsi','Bosnia & Hertsegovina','2026-06-18T19:00:00Z'),
('B4','B','Kanada','Qatar','2026-06-18T22:00:00Z'),
('A4','A','Meksiko','Etelä-Korea','2026-06-19T01:00:00Z'),
('D3','D','USA','Australia','2026-06-19T19:00:00Z'),
('C3','C','Skotlanti','Marokko','2026-06-19T22:00:00Z'),
('C4','C','Brasilia','Haiti','2026-06-20T00:30:00Z'),
('D4','D','Turkki','Paraguay','2026-06-20T03:00:00Z'),
('F3','F','Alankomaat','Ruotsi','2026-06-20T17:00:00Z'),
('E3','E','Saksa','Norsunluurannikko','2026-06-20T20:00:00Z'),
('E4','E','Ecuador','Curaçao','2026-06-21T00:00:00Z'),
('F4','F','Tunisia','Japani','2026-06-21T04:00:00Z'),
('H3','H','Espanja','Saudi-Arabia','2026-06-21T16:00:00Z'),
('G3','G','Belgia','Iran','2026-06-21T19:00:00Z'),
('H4','H','Uruguay','Kap Verde','2026-06-21T22:00:00Z'),
('G4','G','Uusi-Seelanti','Egypti','2026-06-22T01:00:00Z'),
('J3','J','Argentiina','Itävalta','2026-06-22T17:00:00Z'),
('I3','I','Ranska','Irak','2026-06-22T21:00:00Z'),
('I4','I','Norja','Senegal','2026-06-23T00:00:00Z'),
('J4','J','Jordania','Algeria','2026-06-23T03:00:00Z'),
('K3','K','Portugali','Uzbekistan','2026-06-23T17:00:00Z'),
('L3','L','Englanti','Ghana','2026-06-23T20:00:00Z'),
('L4','L','Panama','Kroatia','2026-06-23T23:00:00Z'),
('K4','K','Kolumbia','Kongon DT','2026-06-24T02:00:00Z'),
('B5','B','Sveitsi','Kanada','2026-06-24T19:00:00Z'),
('B6','B','Bosnia & Hertsegovina','Qatar','2026-06-24T19:00:00Z'),
('C5','C','Skotlanti','Brasilia','2026-06-24T22:00:00Z'),
('C6','C','Marokko','Haiti','2026-06-24T22:00:00Z'),
('A5','A','Tšekki','Meksiko','2026-06-25T01:00:00Z'),
('A6','A','Etelä-Afrikka','Etelä-Korea','2026-06-25T01:00:00Z'),
('E5','E','Curaçao','Norsunluurannikko','2026-06-25T20:00:00Z'),
('E6','E','Ecuador','Saksa','2026-06-25T20:00:00Z'),
('F5','F','Japani','Ruotsi','2026-06-25T23:00:00Z'),
('F6','F','Tunisia','Alankomaat','2026-06-25T23:00:00Z'),
('D5','D','Turkki','USA','2026-06-26T02:00:00Z'),
('D6','D','Paraguay','Australia','2026-06-26T02:00:00Z'),
('I5','I','Norja','Ranska','2026-06-26T19:00:00Z'),
('I6','I','Senegal','Irak','2026-06-26T19:00:00Z'),
('H5','H','Kap Verde','Saudi-Arabia','2026-06-27T00:00:00Z'),
('H6','H','Uruguay','Espanja','2026-06-27T00:00:00Z'),
('G5','G','Egypti','Iran','2026-06-27T03:00:00Z'),
('G6','G','Uusi-Seelanti','Belgia','2026-06-27T03:00:00Z'),
('L5','L','Panama','Englanti','2026-06-27T21:00:00Z'),
('L6','L','Kroatia','Ghana','2026-06-27T21:00:00Z'),
('K5','K','Kolumbia','Portugali','2026-06-27T23:30:00Z'),
('K6','K','Kongon DT','Uzbekistan','2026-06-27T23:30:00Z'),
('J5','J','Algeria','Itävalta','2026-06-28T02:00:00Z'),
('J6','J','Jordania','Argentiina','2026-06-28T02:00:00Z')
on conflict (id) do nothing;

-- ─── Jatkopelit (TBD — täytetään fetch-results.js:n kautta ESPN:stä) ──────────
insert into public.matches (id, group_name, home, away, kickoff, tbd) values
('R32_01','R32','TBD','TBD','2026-06-29T18:00:00Z',true),
('R32_02','R32','TBD','TBD','2026-06-29T21:00:00Z',true),
('R32_03','R32','TBD','TBD','2026-06-30T01:00:00Z',true),
('R32_04','R32','TBD','TBD','2026-06-30T18:00:00Z',true),
('R32_05','R32','TBD','TBD','2026-06-30T21:00:00Z',true),
('R32_06','R32','TBD','TBD','2026-07-01T01:00:00Z',true),
('R32_07','R32','TBD','TBD','2026-07-01T18:00:00Z',true),
('R32_08','R32','TBD','TBD','2026-07-01T21:00:00Z',true),
('R32_09','R32','TBD','TBD','2026-07-02T01:00:00Z',true),
('R32_10','R32','TBD','TBD','2026-07-02T18:00:00Z',true),
('R32_11','R32','TBD','TBD','2026-07-02T21:00:00Z',true),
('R32_12','R32','TBD','TBD','2026-07-03T01:00:00Z',true),
('R32_13','R32','TBD','TBD','2026-07-03T18:00:00Z',true),
('R32_14','R32','TBD','TBD','2026-07-03T21:00:00Z',true),
('R32_15','R32','TBD','TBD','2026-07-04T01:00:00Z',true),
('R32_16','R32','TBD','TBD','2026-07-04T18:00:00Z',true),
('R16_1','R16','TBD','TBD','2026-07-06T18:00:00Z',true),
('R16_2','R16','TBD','TBD','2026-07-06T21:00:00Z',true),
('R16_3','R16','TBD','TBD','2026-07-07T18:00:00Z',true),
('R16_4','R16','TBD','TBD','2026-07-07T21:00:00Z',true),
('R16_5','R16','TBD','TBD','2026-07-08T18:00:00Z',true),
('R16_6','R16','TBD','TBD','2026-07-08T21:00:00Z',true),
('R16_7','R16','TBD','TBD','2026-07-09T18:00:00Z',true),
('R16_8','R16','TBD','TBD','2026-07-09T21:00:00Z',true),
('QF_1','QF','TBD','TBD','2026-07-11T18:00:00Z',true),
('QF_2','QF','TBD','TBD','2026-07-11T21:00:00Z',true),
('QF_3','QF','TBD','TBD','2026-07-12T18:00:00Z',true),
('QF_4','QF','TBD','TBD','2026-07-12T21:00:00Z',true),
('SF_1','SF','TBD','TBD','2026-07-15T19:00:00Z',true),
('SF_2','SF','TBD','TBD','2026-07-16T19:00:00Z',true),
('3P','3P','TBD','TBD','2026-07-18T19:00:00Z',true),
('FIN','FIN','TBD','TBD','2026-07-19T19:00:00Z',true)
on conflict (id) do nothing;
