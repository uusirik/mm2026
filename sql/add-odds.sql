-- Lisää kertoimet matches-tauluun
-- Aja Supabase SQL Editorissa

alter table matches add column if not exists odds_home numeric;
alter table matches add column if not exists odds_draw numeric;
alter table matches add column if not exists odds_away numeric;
alter table matches add column if not exists odds_updated_at timestamptz;
