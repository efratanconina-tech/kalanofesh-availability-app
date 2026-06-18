import type { AppState, AvailabilityBlock, Complex, Lead, LeadOffer, Task } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const SESSION_KEY = 'kalanofesh-supabase-session-v1';

export interface CloudSession {
  accessToken: string;
  refreshToken: string;
  email: string;
}

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function getStoredSession(): CloudSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as CloudSession : null;
  } catch {
    return null;
  }
}

export function saveSession(session: CloudSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

function requireConfig(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Supabase is not configured');
  }

  return { url: SUPABASE_URL, key: SUPABASE_KEY };
}

async function request<T>(path: string, options: RequestInit = {}, session?: CloudSession): Promise<T> {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${session?.accessToken ?? key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export async function signIn(email: string, password: string): Promise<CloudSession> {
  const { url, key } = requireConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('פרטי הכניסה לא נכונים או שהמשתמש עדיין לא נוצר.');
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    user: { email?: string };
  };

  const session: CloudSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    email: data.user.email ?? email,
  };
  saveSession(session);
  return session;
}

export async function fetchCloudState(session: CloudSession): Promise<Partial<AppState>> {
  const [complexes, availabilityBlocks, leads, leadOffers, tasks] = await Promise.all([
    request<ComplexRow[]>('/rest/v1/complexes?select=*&order=name.asc', {}, session),
    request<AvailabilityBlockRow[]>('/rest/v1/availability_blocks?select=*&order=start_date.asc', {}, session),
    request<LeadRow[]>('/rest/v1/leads?select=*&order=created_at.desc', {}, session),
    request<LeadOfferRow[]>('/rest/v1/lead_offers?select=*&order=created_at.desc', {}, session),
    request<TaskRow[]>('/rest/v1/tasks?select=*&order=created_at.desc', {}, session),
  ]);

  return {
    complexes: complexes.map(fromComplexRow),
    availabilityBlocks: availabilityBlocks.map(fromAvailabilityRow),
    leads: leads.map(fromLeadRow),
    leadOffers: leadOffers.map(fromOfferRow),
    tasks: tasks.map(fromTaskRow),
  };
}

export async function insertCloudAvailability(
  session: CloudSession,
  data: Omit<AvailabilityBlock, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<AvailabilityBlock> {
  const rows = await request<AvailabilityBlockRow[]>('/rest/v1/availability_blocks', {
    method: 'POST',
    body: JSON.stringify(toAvailabilityRow(data)),
  }, session);

  return fromAvailabilityRow(rows[0]);
}

export async function insertCloudLead(
  session: CloudSession,
  data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<Lead> {
  const rows = await request<LeadRow[]>('/rest/v1/leads', {
    method: 'POST',
    body: JSON.stringify(toLeadRow(data)),
  }, session);

  return fromLeadRow(rows[0]);
}

export async function insertCloudOffer(
  session: CloudSession,
  data: Omit<LeadOffer, 'id' | 'createdAt'>,
): Promise<LeadOffer> {
  const rows = await request<LeadOfferRow[]>('/rest/v1/lead_offers', {
    method: 'POST',
    body: JSON.stringify(toOfferRow(data)),
  }, session);

  return fromOfferRow(rows[0]);
}

export async function insertCloudTask(
  session: CloudSession,
  data: Omit<Task, 'id' | 'createdAt' | 'status'>,
): Promise<Task> {
  const rows = await request<TaskRow[]>('/rest/v1/tasks', {
    method: 'POST',
    body: JSON.stringify({ ...toTaskRow(data), status: 'open' }),
  }, session);

  return fromTaskRow(rows[0]);
}

export async function updateCloudComplex(session: CloudSession, complex: Complex): Promise<Complex> {
  const rows = await request<ComplexRow[]>(`/rest/v1/complexes?id=eq.${complex.id}`, {
    method: 'PATCH',
    body: JSON.stringify(toComplexRow(complex)),
  }, session);

  return fromComplexRow(rows[0]);
}

export async function updateCloudTaskStatus(session: CloudSession, taskId: string, status: 'open' | 'done'): Promise<void> {
  await request(`/rest/v1/tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }, session);
}

export async function deleteCloudLead(session: CloudSession, leadId: string): Promise<void> {
  await request(`/rest/v1/leads?id=eq.${leadId}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  }, session);
}

interface ComplexRow {
  id: string;
  slug: string;
  name: string;
  area: string;
  city: string;
  rooms: number;
  max_guests: number;
  owner_name?: string | null;
  owner_phone?: string | null;
  cover_image_url?: string | null;
  video_url?: string | null;
  gallery_urls?: string | null;
  sales_note?: string | null;
  internal_notes?: string | null;
  shabbat_notes?: string | null;
  active: boolean;
}

interface AvailabilityBlockRow {
  id: string;
  complex_id: string;
  start_date: string;
  end_date: string;
  status: AvailabilityBlock['status'];
  lead_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadRow {
  id: string;
  customer_name: string;
  customer_phone: string;
  start_date?: string | null;
  end_date?: string | null;
  parsha?: string | null;
  guests: number;
  area_preference: string;
  vacation_type: string;
  budget?: string | null;
  notes?: string | null;
  status: Lead['status'];
  assigned_to?: string | null;
  created_at: string;
  updated_at: string;
}

interface LeadOfferRow {
  id: string;
  lead_id: string;
  complex_id: string;
  status: LeadOffer['status'];
  note?: string | null;
  created_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  lead_id?: string | null;
  complex_id?: string | null;
  due_date: string;
  status: Task['status'];
  assigned_to?: string | null;
  created_at: string;
}

function fromComplexRow(row: ComplexRow): Complex {
  return {
    id: row.id,
    name: row.name,
    area: row.area,
    city: row.city,
    rooms: row.rooms,
    maxGuests: row.max_guests,
    ownerName: row.owner_name ?? undefined,
    ownerPhone: row.owner_phone ?? undefined,
    coverImageUrl: row.cover_image_url ?? undefined,
    videoUrl: row.video_url ?? undefined,
    galleryUrls: row.gallery_urls ?? undefined,
    salesNote: row.sales_note ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    shabbatNotes: row.shabbat_notes ?? undefined,
    active: row.active,
  };
}

function fromAvailabilityRow(row: AvailabilityBlockRow): AvailabilityBlock {
  return {
    id: row.id,
    complexId: row.complex_id,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    leadId: row.lead_id ?? undefined,
    customerName: row.customer_name ?? undefined,
    customerPhone: row.customer_phone ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromLeadRow(row: LeadRow): Lead {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    parsha: row.parsha ?? undefined,
    guests: row.guests,
    areaPreference: row.area_preference,
    vacationType: row.vacation_type,
    budget: row.budget ?? undefined,
    notes: row.notes ?? undefined,
    status: row.status,
    assignedTo: row.assigned_to ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromOfferRow(row: LeadOfferRow): LeadOffer {
  return {
    id: row.id,
    leadId: row.lead_id,
    complexId: row.complex_id,
    status: row.status,
    note: row.note ?? undefined,
    createdAt: row.created_at,
  };
}

function fromTaskRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    leadId: row.lead_id ?? undefined,
    complexId: row.complex_id ?? undefined,
    dueDate: row.due_date,
    status: row.status,
    assignedTo: row.assigned_to ?? undefined,
    createdAt: row.created_at,
  };
}

function toAvailabilityRow(data: Omit<AvailabilityBlock, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    complex_id: data.complexId,
    start_date: data.startDate,
    end_date: data.endDate,
    status: data.status,
    lead_id: data.leadId,
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    note: data.note,
  };
}

function toComplexRow(data: Complex) {
  return {
    name: data.name,
    area: data.area,
    city: data.city,
    rooms: data.rooms,
    max_guests: data.maxGuests,
    owner_name: data.ownerName,
    owner_phone: data.ownerPhone,
    cover_image_url: data.coverImageUrl,
    video_url: data.videoUrl,
    gallery_urls: data.galleryUrls,
    sales_note: data.salesNote,
    internal_notes: data.internalNotes,
    shabbat_notes: data.shabbatNotes,
    active: data.active,
  };
}

function toLeadRow(data: Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    customer_name: data.customerName,
    customer_phone: data.customerPhone,
    start_date: data.startDate,
    end_date: data.endDate,
    parsha: data.parsha,
    guests: data.guests,
    area_preference: data.areaPreference,
    vacation_type: data.vacationType,
    budget: data.budget,
    notes: data.notes,
    status: data.status,
    assigned_to: data.assignedTo,
  };
}

function toOfferRow(data: Omit<LeadOffer, 'id' | 'createdAt'>) {
  return {
    lead_id: data.leadId,
    complex_id: data.complexId,
    status: data.status,
    note: data.note,
  };
}

function toTaskRow(data: Omit<Task, 'id' | 'createdAt' | 'status'>) {
  return {
    title: data.title,
    lead_id: data.leadId,
    complex_id: data.complexId,
    due_date: data.dueDate,
    assigned_to: data.assignedTo,
  };
}
