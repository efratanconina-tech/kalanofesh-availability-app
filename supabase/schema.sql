create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'staff' check (role in ('admin', 'staff')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.complexes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  area text not null,
  city text not null,
  rooms integer not null default 0,
  max_guests integer not null default 0,
  owner_name text,
  owner_phone text,
  cover_image_url text,
  video_url text,
  gallery_urls text,
  sales_note text,
  internal_notes text,
  shabbat_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.complexes add column if not exists cover_image_url text;
alter table public.complexes add column if not exists video_url text;
alter table public.complexes add column if not exists gallery_urls text;
alter table public.complexes add column if not exists sales_note text;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  start_date date,
  end_date date,
  parsha text,
  guests integer not null default 0,
  area_preference text not null default 'לא משנה',
  vacation_type text not null default 'שבת חתן',
  budget text,
  notes text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'waiting', 'closed', 'irrelevant')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_dates_valid check (end_date >= start_date)
);

alter table public.leads alter column start_date drop not null;
alter table public.leads alter column end_date drop not null;
alter table public.leads add column if not exists parsha text;
alter table public.leads drop constraint if exists leads_dates_valid;
alter table public.leads add constraint leads_dates_valid check (end_date is null or start_date is null or end_date >= start_date);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  complex_id uuid not null references public.complexes(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'booked' check (status in ('available', 'booked', 'tentative', 'offered', 'check', 'maintenance')),
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text,
  customer_phone text,
  commission_amount text,
  commission_paid boolean not null default false,
  invoice_sent boolean not null default false,
  invoice_status text not null default 'not_sent' check (invoice_status in ('not_sent', 'sent', 'end_of_stay')),
  note text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_dates_valid check (end_date >= start_date)
);

alter table public.availability_blocks drop constraint if exists availability_dates_valid;
alter table public.availability_blocks add constraint availability_dates_valid check (end_date >= start_date);

alter table public.availability_blocks add column if not exists commission_amount text;
alter table public.availability_blocks add column if not exists commission_paid boolean not null default false;
alter table public.availability_blocks add column if not exists invoice_sent boolean not null default false;
alter table public.availability_blocks add column if not exists invoice_status text not null default 'not_sent';
alter table public.availability_blocks drop constraint if exists availability_blocks_invoice_status_check;
alter table public.availability_blocks add constraint availability_blocks_invoice_status_check
  check (invoice_status in ('not_sent', 'sent', 'end_of_stay'));

create table if not exists public.lead_offers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  complex_id uuid not null references public.complexes(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'interested', 'rejected', 'closed')),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  lead_id uuid references public.leads(id) on delete set null,
  complex_id uuid references public.complexes(id) on delete set null,
  due_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'done')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists availability_blocks_complex_dates_idx
  on public.availability_blocks (complex_id, start_date, end_date);

create index if not exists leads_status_dates_idx
  on public.leads (status, start_date, end_date);

alter table public.profiles enable row level security;
alter table public.complexes enable row level security;
alter table public.leads enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.lead_offers enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "active users can read profiles" on public.profiles;
drop policy if exists "active users can read complexes" on public.complexes;
drop policy if exists "active users can manage complexes" on public.complexes;
drop policy if exists "active users can manage leads" on public.leads;
drop policy if exists "active users can manage availability" on public.availability_blocks;
drop policy if exists "active users can manage offers" on public.lead_offers;
drop policy if exists "active users can manage tasks" on public.tasks;

create policy "active users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "active users can read complexes"
  on public.complexes for select
  to authenticated
  using (true);

create policy "active users can manage complexes"
  on public.complexes for all
  to authenticated
  using (true)
  with check (true);

create policy "active users can manage leads"
  on public.leads for all
  to authenticated
  using (true)
  with check (true);

create policy "active users can manage availability"
  on public.availability_blocks for all
  to authenticated
  using (true)
  with check (true);

create policy "active users can manage offers"
  on public.lead_offers for all
  to authenticated
  using (true)
  with check (true);

create policy "active users can manage tasks"
  on public.tasks for all
  to authenticated
  using (true)
  with check (true);


delete from public.complexes
where slug in ('bresheet', 'pninat-hagalil');

insert into public.complexes (slug, name, area, city, rooms, max_guests, internal_notes, shabbat_notes, cover_image_url, video_url, gallery_urls)
values
  ('boutique-hamayan', 'בוטיק המעיין', 'ירושלים והסביבה', 'גבעת זאב', 25, 100, 'מתאים במיוחד לשבת חתן וקבוצות גדולות. לבדוק נגישות לפי הרכב האורחים.', 'אולם אוכל מרכזי, מתאים לשומרי שבת, יציאה מאוחרת לפי תאריך.', null, null, null),
  ('achuzah-bahar', 'אחוזה בהר', 'צפון', 'ראש פינה', 15, 50, 'חזק לשבע ברכות ושבתות חתן בינוניות.', 'בית כנסת קרוב, מטבח מהדרין, לבדוק מחיר חגים.', null, null, null),
  ('achuzat-harim', 'אחוזת הרים', 'צפון', 'לא ידוע', 0, 0, '', '', '/media/complexes/achuzat-harim/cover.jpg', '/media/complexes/achuzat-harim/video-tour.mp4', '/media/complexes/achuzat-harim/cover.jpg'),
  ('icon', 'אייקון', 'מרכז', 'ראשון לציון', 19, 80, 'עירוני ויוקרתי, מתאים לקבוצות שרוצות אולם גדול.', 'פלטה ומיחם, לבדוק פרטי שבת נוספים לפי לקוח.', null, null, null)
on conflict (slug) do update set
  name = excluded.name,
  area = excluded.area,
  city = excluded.city,
  rooms = excluded.rooms,
  max_guests = excluded.max_guests,
  internal_notes = excluded.internal_notes,
  shabbat_notes = excluded.shabbat_notes,
  cover_image_url = excluded.cover_image_url,
  video_url = excluded.video_url,
  gallery_urls = excluded.gallery_urls,
  updated_at = now();

insert into public.availability_blocks (id, complex_id, start_date, end_date, status, note)
select block_id, complexes.id, start_date, end_date, status, note
from public.complexes
cross join (
  values
    ('00000000-0000-4000-8000-000000000201'::uuid, '2026-06-21'::date, '2026-06-26'::date, 'booked', 'תפוס בימי חול עד כ״ט תמוז לא כולל'),
    ('00000000-0000-4000-8000-000000000202'::uuid, '2026-06-28'::date, '2026-07-03'::date, 'booked', 'תפוס בימי חול עד כ״ט תמוז לא כולל'),
    ('00000000-0000-4000-8000-000000000203'::uuid, '2026-07-05'::date, '2026-07-10'::date, 'booked', 'תפוס בימי חול עד כ״ט תמוז לא כולל'),
    ('00000000-0000-4000-8000-000000000204'::uuid, '2026-07-12'::date, '2026-07-14'::date, 'booked', 'תפוס בימי חול עד כ״ט תמוז לא כולל'),
    ('00000000-0000-4000-8000-000000000205'::uuid, '2026-06-19'::date, '2026-06-21'::date, 'booked', 'תפוס בשבתות עד פרשת דברים לא כולל'),
    ('00000000-0000-4000-8000-000000000206'::uuid, '2026-06-26'::date, '2026-06-28'::date, 'booked', 'תפוס בשבתות עד פרשת דברים לא כולל'),
    ('00000000-0000-4000-8000-000000000207'::uuid, '2026-07-03'::date, '2026-07-05'::date, 'booked', 'תפוס בשבתות עד פרשת דברים לא כולל'),
    ('00000000-0000-4000-8000-000000000208'::uuid, '2026-07-10'::date, '2026-07-12'::date, 'booked', 'תפוס בשבתות עד פרשת דברים לא כולל'),
    ('00000000-0000-4000-8000-000000000209'::uuid, '2026-07-24'::date, '2026-07-26'::date, 'booked', 'תפוס בשבתות אחרי דברים עד פרשת כי תבוא לא כולל'),
    ('00000000-0000-4000-8000-000000000210'::uuid, '2026-07-31'::date, '2026-08-02'::date, 'booked', 'תפוס בשבתות אחרי דברים עד פרשת כי תבוא לא כולל'),
    ('00000000-0000-4000-8000-000000000211'::uuid, '2026-08-07'::date, '2026-08-09'::date, 'booked', 'תפוס בשבתות אחרי דברים עד פרשת כי תבוא לא כולל'),
    ('00000000-0000-4000-8000-000000000212'::uuid, '2026-08-14'::date, '2026-08-16'::date, 'booked', 'תפוס בשבתות אחרי דברים עד פרשת כי תבוא לא כולל'),
    ('00000000-0000-4000-8000-000000000213'::uuid, '2026-08-21'::date, '2026-08-23'::date, 'booked', 'תפוס בשבתות אחרי דברים עד פרשת כי תבוא לא כולל'),
    ('00000000-0000-4000-8000-000000000214'::uuid, '2026-10-16'::date, '2026-10-18'::date, 'booked', 'תפוס בשבת בראשית'),
    ('00000000-0000-4000-8000-000000000215'::uuid, '2026-11-20'::date, '2026-11-22'::date, 'booked', 'תפוס בשבת תולדות')
) as blocks(block_id, start_date, end_date, status, note)
where complexes.slug = 'boutique-hamayan'
on conflict (id) do update set
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  note = excluded.note,
  updated_at = now();
