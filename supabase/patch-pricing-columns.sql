alter table public.complexes add column if not exists price_weekday text;
alter table public.complexes add column if not exists price_shabbat text;
alter table public.complexes add column if not exists price_weekend text;
alter table public.complexes add column if not exists price_bein_hazmanim text;
alter table public.complexes add column if not exists price_holiday text;
alter table public.complexes add column if not exists price_notes text;

notify pgrst, 'reload schema';
