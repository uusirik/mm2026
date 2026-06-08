-- Jatkosarjaottelut — aja Supabase SQL Editorissa
-- Lisää tbd-sarakkeen ja jatkosarjaottelut

alter table public.matches add column if not exists tbd boolean default false;

insert into public.matches (id, group_name, home, away, kickoff, tbd) values
-- Viimeinen 32
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
-- Viimeinen 16
('R16_1','R16','TBD','TBD','2026-07-06T18:00:00Z',true),
('R16_2','R16','TBD','TBD','2026-07-06T21:00:00Z',true),
('R16_3','R16','TBD','TBD','2026-07-07T18:00:00Z',true),
('R16_4','R16','TBD','TBD','2026-07-07T21:00:00Z',true),
('R16_5','R16','TBD','TBD','2026-07-08T18:00:00Z',true),
('R16_6','R16','TBD','TBD','2026-07-08T21:00:00Z',true),
('R16_7','R16','TBD','TBD','2026-07-09T18:00:00Z',true),
('R16_8','R16','TBD','TBD','2026-07-09T21:00:00Z',true),
-- Puolivälierät
('QF_1','QF','TBD','TBD','2026-07-11T18:00:00Z',true),
('QF_2','QF','TBD','TBD','2026-07-11T21:00:00Z',true),
('QF_3','QF','TBD','TBD','2026-07-12T18:00:00Z',true),
('QF_4','QF','TBD','TBD','2026-07-12T21:00:00Z',true),
-- Välierät
('SF_1','SF','TBD','TBD','2026-07-15T19:00:00Z',true),
('SF_2','SF','TBD','TBD','2026-07-16T19:00:00Z',true),
-- Pronssiottelu
('3P','3P','TBD','TBD','2026-07-18T19:00:00Z',true),
-- Finaali
('FIN','FIN','TBD','TBD','2026-07-19T19:00:00Z',true)
on conflict (id) do nothing;
