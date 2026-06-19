import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  BellRing,
  CalendarCheck,
  CalendarDays,
  CalendarX,
  ChevronDown,
  CheckCircle2,
  Cloud,
  ClipboardList,
  Home,
  Image,
  ListChecks,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Trash2,
  Upload,
  Users,
  Video,
} from 'lucide-react';
import type { AppState, AvailabilityBlock, AvailabilityStatus, Complex, InvoiceStatus, Lead, LeadStatus } from './types';
import { createAvailabilityBlock, createLead, createTask, hasDateConflict, loadState, saveState, withoutRemovedComplexes } from './lib/store';
import { HEBREW_WEEKDAYS_SHORT, formatDateLine, formatGregorianDate, formatHebrewDate, getMonthGrid, isPastDate, toYMD, todayYMD } from './lib/dates';
import {
  clearSession,
  deleteCloudAvailability,
  deleteCloudLead,
  fetchCloudState,
  insertCloudComplex,
  getStoredSession,
  insertCloudAvailability,
  insertCloudLead,
  insertCloudTask,
  isCloudConfigured,
  signIn,
  updateCloudAvailability,
  updateCloudComplex,
  updateCloudLead,
  updateCloudTaskStatus,
  type CloudSession,
} from './lib/supabaseRest';

type Tab = 'dashboard' | 'assistant' | 'catalog' | 'lookup' | 'stays' | 'calendar' | 'leads' | 'tasks';
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string };
const APP_VERSION = '2026.06.19.14';

type ParsedStayImport = {
  id: string;
  importType: 'stay' | 'availability';
  sourceLine: string;
  startDate: string;
  endDate: string;
  customerName: string;
  complexId?: string;
  complexName?: string;
  status: AvailabilityStatus;
  amount?: string;
  invoice: boolean;
  invoiceStatus?: InvoiceStatus;
  paid: boolean;
  note?: string;
};

type StayEvent = {
  id: string;
  type: 'arrival' | 'departure';
  date: string;
  reminderDate: string;
  blockId: string;
  complexName: string;
  customerName: string;
  customerPhone?: string;
  commissionAmount?: string;
  commissionPaid?: boolean;
  invoiceSent?: boolean;
  invoiceStatus?: InvoiceStatus;
  status: AvailabilityStatus;
  note?: string;
};

type ArrivalEditDraft = Pick<
  AvailabilityBlock,
  'complexId' | 'startDate' | 'endDate' | 'customerName' | 'customerPhone' | 'commissionAmount' | 'commissionPaid' | 'invoiceStatus' | 'note'
>;

const statusLabels: Record<AvailabilityStatus, string> = {
  available: 'פנוי בוודאות',
  booked: 'תפוס בוודאות',
  tentative: 'בהמתנה',
  offered: 'הוצע',
  check: 'לבדיקה',
  maintenance: 'תחזוקה',
};

const leadStatusLabels: Record<LeadStatus, string> = {
  new: 'חדש',
  in_progress: 'בטיפול',
  waiting: 'מחכה',
  closed: 'נסגר',
  irrelevant: 'לא רלוונטי',
};

const invoiceStatusLabels: Record<InvoiceStatus, string> = {
  not_sent: 'לא נשלחה חשבונית',
  sent: 'נשלחה חשבונית',
  end_of_stay: 'תישלח בסוף השהות',
};

const areaOptions = ['צפון', 'מרכז', 'ירושלים והסביבה', 'דרום'];
const areaPreferenceOptions = ['לא משנה', ...areaOptions];

const parshaByShabbatDate: Record<string, string> = {
  '2026-06-20': 'פרשת חוקת',
  '2026-06-27': 'פרשת בלק',
  '2026-07-04': 'פרשת פינחס',
  '2026-07-11': 'פרשת מטות-מסעי',
  '2026-07-18': 'פרשת דברים',
  '2026-07-25': 'פרשת ואתחנן',
  '2026-08-01': 'פרשת עקב',
  '2026-08-08': 'פרשת ראה',
  '2026-08-15': 'פרשת שופטים',
  '2026-08-22': 'פרשת כי תצא',
  '2026-08-29': 'פרשת כי תבוא',
  '2026-09-05': 'פרשת ניצבים',
  '2026-09-12': 'ראש השנה',
  '2026-09-19': 'פרשת וילך',
  '2026-09-26': 'שבת שובה / פרשת האזינו',
  '2026-10-03': 'חג סוכות',
  '2026-10-10': 'שמיני עצרת / שמחת תורה',
  '2026-10-17': 'פרשת בראשית',
  '2026-10-24': 'פרשת נח',
  '2026-10-31': 'פרשת לך לך',
  '2026-11-07': 'פרשת וירא',
  '2026-11-14': 'פרשת חיי שרה',
  '2026-11-21': 'פרשת תולדות',
  '2026-11-28': 'פרשת ויצא',
  '2026-12-05': 'פרשת וישלח',
  '2026-12-12': 'פרשת וישב',
  '2026-12-19': 'פרשת מקץ',
  '2026-12-26': 'פרשת ויגש',
  '2027-01-02': 'פרשת ויחי',
};

function byDate<T extends { startDate: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.startDate.localeCompare(b.startDate));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dateFromYMD(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function isValidYMD(value?: string): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(dateFromYMD(value).getTime());
}

function getParshaLabel(shabbatDate?: string): string | undefined {
  if (!shabbatDate) return undefined;
  if (shabbatDate < todayYMD()) return undefined;
  return parshaByShabbatDate[shabbatDate];
}

function getStayEvents(state: AppState): StayEvent[] {
  return state.availabilityBlocks
    .filter(block =>
      block.status !== 'available' &&
      Boolean(block.customerName || block.customerPhone || block.leadId) &&
      isValidYMD(block.startDate) &&
      isValidYMD(block.endDate)
    )
    .flatMap(block => {
      const complex = state.complexes.find(item => item.id === block.complexId);
      const customerName = block.customerName || 'לקוח ללא שם';
      const base = {
        blockId: block.id,
        complexName: complex?.name ?? 'מתחם',
        customerName,
        customerPhone: block.customerPhone,
        commissionAmount: block.commissionAmount,
        commissionPaid: block.commissionPaid,
        invoiceSent: block.invoiceSent,
        invoiceStatus: block.invoiceStatus ?? (block.invoiceSent ? 'sent' : 'not_sent'),
        status: block.status,
        note: block.note,
      };

      return [
        {
          ...base,
          id: `${block.id}-arrival`,
          type: 'arrival' as const,
          date: block.startDate,
          reminderDate: toYMD(addDays(dateFromYMD(block.startDate), -3)),
        },
        {
          ...base,
          id: `${block.id}-departure`,
          type: 'departure' as const,
          date: block.endDate,
          reminderDate: toYMD(addDays(dateFromYMD(block.endDate), -3)),
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

function findAvailableComplexes(state: AppState, startDate: string, endDate: string): Complex[] {
  return state.complexes.filter(complex =>
    complex.active &&
    !state.availabilityBlocks.some(block =>
      block.complexId === complex.id &&
      block.status !== 'available' &&
      hasDateConflict(block, startDate, endDate)
    )
  );
}

function getGuestFit(maxGuests: number, requestedGuests: number) {
  if (!requestedGuests || requestedGuests <= 0 || !maxGuests) {
    return { isReasonable: true, label: 'ללא סינון אורחים', score: 0 };
  }

  const lowerTolerance = Math.max(4, Math.ceil(requestedGuests * 0.15));
  const upperLimit = Math.max(requestedGuests + 25, Math.ceil(requestedGuests * 1.8));
  const shortage = requestedGuests - maxGuests;
  const extraCapacity = maxGuests - requestedGuests;

  if (shortage > lowerTolerance) {
    return { isReasonable: false, label: `קטן מדי בכ-${shortage} אורחים`, score: -120 - shortage };
  }

  if (maxGuests > upperLimit) {
    return { isReasonable: false, label: 'גדול מדי לכמות הזו', score: -80 - Math.round((maxGuests - upperLimit) / 5) };
  }

  if (shortage > 0) {
    return { isReasonable: true, label: `גבולי, חסרים כ-${shortage} מקומות`, score: 35 - shortage };
  }

  if (extraCapacity <= Math.max(6, Math.ceil(requestedGuests * 0.25))) {
    return { isReasonable: true, label: 'התאמה קרובה', score: 70 - extraCapacity };
  }

  return { isReasonable: true, label: 'מתאים בטווח סביר', score: 55 - Math.round(extraCapacity / 3) };
}

function getUpcomingShabbatRanges(months = 3): { startDate: string; endDate: string; labelDate: string }[] {
  const today = new Date();
  const until = new Date(today.getFullYear(), today.getMonth() + months, today.getDate());
  const daysUntilFriday = (5 - today.getDay() + 7) % 7;
  let friday = addDays(today, daysUntilFriday);
  const ranges: { startDate: string; endDate: string; labelDate: string }[] = [];

  while (friday <= until) {
    const shabbat = addDays(friday, 1);
    const checkout = addDays(friday, 2);
    ranges.push({
      startDate: toYMD(friday),
      endDate: toYMD(checkout),
      labelDate: toYMD(shabbat),
    });
    friday = addDays(friday, 7);
  }

  return ranges;
}

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

function parseMoneyAmount(value?: string): number {
  const match = value?.match(/\d[\d,.\s]*/);
  if (!match) return 0;
  const normalized = match[0].replace(/[,\s]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoneyAmount(value: number): string {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(value);
}

function splitGallery(value?: string): string[] {
  return (value ?? '')
    .split(/\n|,/)
    .map(part => part.trim())
    .filter(Boolean);
}

function buildLeadShareText(lead: Lead): string {
  return [
    `פנייה: ${lead.customerName}`,
    `טלפון: ${lead.customerPhone}`,
    lead.parsha ? `פרשה: ${lead.parsha}` : lead.startDate ? `תאריכים: ${formatDateLine(lead.startDate, lead.endDate)}` : 'תאריך לא נקבע',
    `אורחים: ${lead.guests}`,
    `סוג נופש: ${lead.vacationType}`,
    `אזור: ${lead.areaPreference}`,
    lead.budget ? `תקציב: ${lead.budget}` : '',
    lead.notes ? `הערות: ${lead.notes}` : '',
    `סטטוס: ${leadStatusLabels[lead.status]}`,
  ].filter(Boolean).join('\n');
}

function createSlug(value: string, existingIds: string[]): string {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[\u0590-\u05ff]+/g, match => Array.from(match).map(char => char.charCodeAt(0).toString(36)).join('-'))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'complex';
  let slug = base;
  let counter = 2;

  while (existingIds.includes(slug)) {
    slug = `${base}-${counter}`;
    counter += 1;
  }

  return slug;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function getComplexMediaUrls(complex: Complex): string[] {
  return [
    complex.coverImageUrl,
    ...splitGallery(complex.galleryUrls),
    complex.videoUrl,
  ].filter((url): url is string => Boolean(url?.trim()));
}

function getExtensionFromMime(mimeType: string): string {
  const [, subtype = 'bin'] = mimeType.split('/');
  return subtype.split('+')[0].replace(/[^a-z0-9]/gi, '') || 'bin';
}

function buildMediaFileName(complex: Complex, mimeType: string, index: number): string {
  return `${createSlug(complex.name, [])}-${index + 1}.${getExtensionFromMime(mimeType)}`;
}

function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [meta, base64 = ''] = dataUrl.split(',');
  const mimeType = meta.match(/^data:([^;]+);base64$/)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mimeType });
}

async function mediaUrlToFile(url: string, complex: Complex, index: number): Promise<File | null> {
  if (url.startsWith('data:')) {
    const mimeType = url.match(/^data:([^;]+);base64,/)?.[1] ?? 'application/octet-stream';
    return dataUrlToFile(url, buildMediaFileName(complex, mimeType, index));
  }

  if (!/^https?:\/\//.test(url)) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') && !blob.type.startsWith('video/')) return null;
    return new File([blob], buildMediaFileName(complex, blob.type, index), { type: blob.type });
  } catch {
    return null;
  }
}

function currentImportYear(): number {
  return new Date().getFullYear();
}

function normalizeImportedYear(year?: number): number {
  if (!year) return currentImportYear();
  if (year < 100) return 2000 + year;
  return year;
}

function normalizeImportedDate(day: number, month: number, year = currentImportYear()): string {
  return toYMD(new Date(year, month - 1, day));
}

function parseDateRangeText(value: string): { startDate: string; endDate: string } | null {
  const compact = value.replace(/\s+/g, '').replace(/\./g, '/');
  const range = compact.match(/^(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{2,4}))?-(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{2,4}))?$/);
  if (range) {
    const startDay = Number(range[1]);
    const startMonth = Number(range[2] ?? range[5]);
    const startYear = normalizeImportedYear(range[3] ? Number(range[3]) : range[6] ? Number(range[6]) : undefined);
    const endDay = Number(range[4]);
    const endMonth = Number(range[5] ?? startMonth);
    const endYear = normalizeImportedYear(range[6] ? Number(range[6]) : startYear);
    if (!startMonth || !endMonth) return null;
    return {
      startDate: normalizeImportedDate(startDay, startMonth, startYear),
      endDate: normalizeImportedDate(endDay, endMonth, endYear),
    };
  }

  const single = compact.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (single) {
    const day = Number(single[1]);
    const month = Number(single[2]);
    const year = normalizeImportedYear(single[3] ? Number(single[3]) : undefined);
    const startDate = normalizeImportedDate(day, month, year);
    return {
      startDate,
      endDate: toYMD(addDays(dateFromYMD(startDate), 1)),
    };
  }

  return null;
}

function extractDateRangeFromLine(line: string): { raw: string; startDate: string; endDate: string } | null {
  const match = line.replace(/\./g, '/').match(/(\d{1,2}(?:\/\d{1,2})?(?:\/\d{2,4})?(?:\s*-\s*\d{1,2}(?:\/\d{1,2})?(?:\/\d{2,4})?)?)/);
  if (!match) return null;
  const range = parseDateRangeText(match[1]);
  return range ? { raw: match[1], ...range } : null;
}

function splitImportLine(line: string): string[] {
  return line
    .split(/\s+-\s+|–|—/)
    .map(part => part.trim())
    .filter(Boolean);
}

function cleanCustomerName(value: string): string {
  return value
    .replace(/\bחשבונית\b/g, '')
    .replace(/\bשולם\b/g, '')
    .replace(/✅/g, '')
    .replace(/\(?\s*הוצאה חשבונית\s*\)?/g, '')
    .replace(/\b\d[\d,]*\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function findComplexInText(text: string, complexes: Complex[]): Complex | undefined {
  const normalized = text.replace(/[׳']/g, '');
  return complexes.find(complex => {
    const name = complex.name.replace(/[׳']/g, '');
    return normalized.includes(name);
  });
}

function parseStayImportList(input: string, state: AppState): ParsedStayImport[] {
  const lines = input
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.endsWith(':'));

  return lines.flatMap(line => {
    const withoutBullet = line.replace(/^[-•*]\s*/, '');
    const dateMatch = withoutBullet.match(/^(\d{1,2}(?:\/\d{1,2})?(?:\s*-\s*\d{1,2}(?:\/\d{1,2})?)?)/);
    if (!dateMatch) return [];

    const range = parseDateRangeText(dateMatch[1]);
    if (!range) return [];

    const rest = withoutBullet.slice(dateMatch[1].length).replace(/^\s*-\s*/, '').trim();
    if (!rest) return [];

    const parts = splitImportLine(rest);
    const amountMatch = rest.match(/\b\d{1,3}(?:,\d{3})+\b|\b\d{3,}\b/);
    const amount = amountMatch?.[0];
    const paid = rest.includes('✅') || /\bשולם\b/.test(rest);
    const invoiceAtEnd = /תישלח\s+חשבונית|חשבונית.*סוף\s+השהות|בסוף\s+השהות.*חשבונית/.test(rest);
    const invoice = !invoiceAtEnd && (/\bחשבונית\b/.test(rest) || /הוצאה חשבונית/.test(rest));
    const invoiceStatus: InvoiceStatus = invoice ? 'sent' : invoiceAtEnd ? 'end_of_stay' : 'not_sent';
    const complex = findComplexInText(rest, state.complexes);
    const parentheticalNotes = Array.from(rest.matchAll(/\(([^)]+)\)/g)).map(match => match[1]);

    const nameCandidates = parts
      .filter(part => !/\bחשבונית\b|הוצאה חשבונית|\bשולם\b|✅/.test(part))
      .filter(part => !/^\d[\d,]*$/.test(part))
      .map(part => complex ? part.replace(complex.name, '').trim() : part)
      .map(cleanCustomerName)
      .filter(Boolean);

    const customerName = nameCandidates[0] || cleanCustomerName(rest) || 'לקוח ללא שם';
    const notes = [
      amount ? `סכום: ${amount}` : '',
      invoiceStatus !== 'not_sent' ? invoiceStatusLabels[invoiceStatus] : '',
      paid ? 'שולם' : '',
      complex ? `מתחם שזוהה: ${complex.name}` : 'לא זוהה מתחם - צריך לבחור ידנית בהמשך',
      ...parentheticalNotes,
      `מקור: ${line}`,
    ].filter(Boolean);

    return [{
      id: crypto.randomUUID(),
      importType: 'stay',
      sourceLine: line,
      startDate: range.startDate,
      endDate: range.endDate,
      customerName,
      complexId: complex?.id,
      complexName: complex?.name,
      status: 'booked',
      amount,
      invoice,
      invoiceStatus,
      paid,
      note: notes.join(' | '),
    }];
  });
}

function parseAvailabilityImportList(input: string, state: AppState): ParsedStayImport[] {
  const lines = input
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const headerIndex = lines.findIndex(line => /פנויות|פנויים|זמינים|זמינות/.test(line));
  if (headerIndex < 0) return [];

  const header = lines[headerIndex];
  const complex = findComplexInText(header, state.complexes);
  if (!complex) return [];

  const headerTail = header.includes(':') ? header.split(':').slice(1).join(':').trim() : '';
  const dateLines = [headerTail, ...lines.slice(headerIndex + 1)].filter(Boolean);

  return dateLines.flatMap(line => {
    const range = extractDateRangeFromLine(line);
    if (!range) return [];

    const noteText = line
      .replace(range.raw, '')
      .replace(/[()]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return [{
      id: crypto.randomUUID(),
      importType: 'availability',
      sourceLine: line,
      startDate: range.startDate,
      endDate: range.endDate,
      customerName: 'פנוי',
      complexId: complex.id,
      complexName: complex.name,
      status: 'available',
      invoice: false,
      paid: false,
      note: [
        'סומן כפנוי מתוך רשימה',
        noteText,
        `מקור: ${line}`,
      ].filter(Boolean).join(' | '),
    }];
  });
}

function parseAssistantImportList(input: string, state: AppState): ParsedStayImport[] {
  const availabilityItems = parseAvailabilityImportList(input, state);
  if (availabilityItems.length) return availabilityItems;
  return parseStayImportList(input, state);
}

function buildComplexShareText(complex: Complex): string {
  const shareableImages = [
    complex.coverImageUrl,
    ...splitGallery(complex.galleryUrls),
  ].filter((url): url is string => Boolean(url && /^https?:\/\//.test(url)));

  return [
    complex.name,
    `${complex.city} | ${complex.area}`,
    `${complex.rooms} חדרים | עד ${complex.maxGuests} אורחים`,
    complex.salesNote,
    complex.shabbatNotes ? `פרטי שבת: ${complex.shabbatNotes}` : '',
    shareableImages.length ? `תמונות: ${shareableImages.join(' | ')}` : '',
    complex.videoUrl ? `וידאו: ${complex.videoUrl}` : '',
  ].filter(Boolean).join('\n');
}

function buildComplexOfferText(complex: Complex, context?: { startDate?: string; endDate?: string; guests?: string; notes?: string }): string {
  return [
    buildComplexShareText(complex),
    context?.startDate && context.endDate ? `תאריכים מבוקשים: ${formatDateLine(context.startDate, context.endDate)}` : '',
    context?.guests ? `כמות אורחים: ${context.guests}` : '',
    context?.notes ? `הערות: ${context.notes}` : '',
  ].filter(Boolean).join('\n');
}

function describeCloudSaveError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? '');
  const message = rawMessage.toLowerCase();

  if (message.includes('invoice_status') || message.includes('end_of_stay') || message.includes('availability_blocks_invoice_status_check')) {
    return 'נשמר מקומית, אבל לא בענן. ב-Supabase צריך להריץ את עדכון החשבוניות שמוסיף invoice_status עם הערך end_of_stay.';
  }

  if (message.includes('commission_amount') || message.includes('commission_paid') || message.includes('invoice_sent')) {
    return 'נשמר מקומית, אבל לא בענן. ב-Supabase חסרים שדות עמלה/חשבונית בטבלת availability_blocks.';
  }

  if (message.includes('availability_dates_valid') || message.includes('end_date') || message.includes('start_date')) {
    return 'נשמר מקומית, אבל לא בענן. ב-Supabase צריך לעדכן את בדיקת התאריכים כך שתאפשר גם כניסה ויציאה באותו יום.';
  }

  if (message.includes('foreign key') || message.includes('complex_id')) {
    return 'נשמר מקומית, אבל לא בענן. נראה שהמתחם שנבחר לא קיים/לא מסונכרן ב-Supabase.';
  }

  if (message.includes('jwt') || message.includes('permission') || message.includes('row-level security') || message.includes('401') || message.includes('403')) {
    return 'נשמר מקומית, אבל לא בענן. צריך להתחבר מחדש או לבדוק הרשאות Supabase.';
  }

  return `נשמר מקומית, אבל לא בענן. הודעת Supabase: ${rawMessage || 'שגיאה לא ידועה'}`;
}

function buildAssistantReply(input: string, state: AppState): string {
  const normalized = input.trim();
  const explicitDate = normalized.match(/\d{4}-\d{2}-\d{2}/)?.[0];

  if (explicitDate) {
    const endDate = toYMD(addDays(new Date(`${explicitDate}T12:00:00`), 1));
    const available = findAvailableComplexes(state, explicitDate, endDate);
    if (!available.length) return `לתאריך ${formatDateLine(explicitDate)} לא מצאתי מתחמים פנויים.`;
    return [
      `לתאריך ${formatDateLine(explicitDate)} מצאתי ${available.length} מתחמים פנויים:`,
      ...available.map(complex => `• ${complex.name} - ${complex.city}, עד ${complex.maxGuests} אורחים`),
    ].join('\n');
  }

  if (normalized.includes('שבת הקרובה') || normalized.includes('שבת קרובה')) {
    const range = getUpcomingShabbatRanges(1)[0];
    if (!range) return 'לא מצאתי שבת קרובה לבדיקה.';
    const available = findAvailableComplexes(state, range.startDate, range.endDate);
    if (!available.length) return `לשבת הקרובה (${formatDateLine(range.labelDate)}) לא מצאתי מתחמים פנויים.`;

    return [
      `לשבת הקרובה (${formatDateLine(range.labelDate)}) מצאתי ${available.length} מתחמים פנויים:`,
      ...available.slice(0, 12).map(complex => `• ${complex.name} - ${complex.city}, עד ${complex.maxGuests} אורחים`),
      available.length > 12 ? `ועוד ${available.length - 12} מתחמים.` : '',
    ].filter(Boolean).join('\n');
  }

  if (normalized.includes('שבת') || normalized.includes('שבתות')) {
    const ranges = getUpcomingShabbatRanges(3)
      .map(range => ({
        ...range,
        available: findAvailableComplexes(state, range.startDate, range.endDate),
      }))
      .filter(range => range.available.length > 0);

    if (!ranges.length) return 'לא מצאתי שבתות עם מתחמים פנויים בשלושת החודשים הקרובים.';

    return [
      'שבתות פנויות בשלושת החודשים הקרובים:',
      ...ranges.slice(0, 12).map(range => {
        const names = range.available.slice(0, 5).map(complex => complex.name).join(', ');
        const extra = range.available.length > 5 ? ` ועוד ${range.available.length - 5}` : '';
        return `• ${formatDateLine(range.labelDate)}: ${range.available.length} פנויים - ${names}${extra}`;
      }),
    ].join('\n');
  }

  if (normalized.includes('פנוי') || normalized.includes('פנויות') || normalized.includes('זמינות')) {
    return 'אפשר לכתוב למשל: "מה פנוי לשבת הקרובה", "רשימת שבתות פנויות לחודשים הקרובים" או "מה פנוי ב-2026-07-10".';
  }

  return 'כרגע אני יודעת לחשב זמינות מתוך הנתונים. נסי לכתוב: "מה פנוי לשבת הקרובה".';
}

async function askGptAssistant(message: string, state: AppState): Promise<string> {
  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, state }),
  });

  if (!response.ok) {
    if (response.status === 501) {
      return 'GPT עדיין לא מחובר. צריך להוסיף ב-Vercel משתנה סביבה בשם OPENAI_API_KEY ואז לעשות Redeploy.';
    }
    if (response.status === 402 || response.status === 429) {
      return 'הגעת למגבלת הקרדיט/תקציב של OpenAI API. צריך לבדוק Billing ו-Usage Limits בחשבון OpenAI Platform.';
    }
    throw new Error(await response.text());
  }

  const data = await response.json() as { text?: string };
  return data.text || 'לא קיבלתי תשובה מ-GPT.';
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>('dashboard');
  const [session, setSession] = useState<CloudSession | null>(() => getStoredSession());
  const [syncStatus, setSyncStatus] = useState('מקומי');

  const persist = (nextState: AppState) => {
    const cleanState = withoutRemovedComplexes(nextState);
    setState(cleanState);
    saveState(cleanState);
  };

  useEffect(() => {
    if (!session) return;

    let active = true;
    setSyncStatus('מסתנכרן...');
    fetchCloudState(session)
      .then(cloudState => {
        if (!active) return;
        const nextState = withoutRemovedComplexes({ ...loadState(), ...cloudState });
        setState(nextState);
        saveState(nextState);
        setSyncStatus('מחובר לענן');
      })
      .catch(() => {
        if (active) setSyncStatus('לא הצליח להסתנכרן');
      });

    return () => {
      active = false;
    };
  }, [session]);

  const totalComplexes = state.complexes.filter(complex => complex.active).length;
  const nextShabbatRange = getUpcomingShabbatRanges(1)[0];
  const nextShabbatParsha = getParshaLabel(nextShabbatRange?.labelDate);
  const nextShabbatAvailable = useMemo(
    () => nextShabbatRange ? findAvailableComplexes(state, nextShabbatRange.startDate, nextShabbatRange.endDate).length : 0,
    [nextShabbatRange, state],
  );
  const upcomingAvailableShabbats = useMemo(
    () => getUpcomingShabbatRanges(3)
      .map(range => ({
        ...range,
        available: findAvailableComplexes(state, range.startDate, range.endDate),
      }))
      .filter(range => range.available.length > 0)
      .slice(0, 8),
    [state],
  );
  const openLeads = state.leads.filter(lead => lead.status !== 'closed' && lead.status !== 'irrelevant');
  const openTasks = state.tasks.filter(task => task.status === 'open');

  return (
    <div className="app-shell">
      <main className="app-frame">
        <header className="topbar">
          <div>
            <p className="eyebrow">אפליקציה פרטית</p>
            <h1 className="title">קלנופש</h1>
            <p className="subtitle">מקור אמת אחד לכם, לבעלך ובהמשך לעובדים. מצב: {syncStatus} · גרסה {APP_VERSION}</p>
          </div>
          <div className="actions">
            {session ? (
              <button
                className="ghost-btn"
                type="button"
                onClick={() => {
                  clearSession();
                  setSession(null);
                  setSyncStatus('מקומי');
                }}
              >
                יציאה
              </button>
            ) : (
              <LoginButton onLogin={setSession} />
            )}
            <button className="ghost-btn" type="button" title="הגדרות">
              <Settings size={18} />
            </button>
          </div>
        </header>

        {tab === 'dashboard' && (
          <Dashboard
            totalComplexes={totalComplexes}
            nextShabbatAvailable={nextShabbatAvailable}
            nextShabbatLabel={nextShabbatRange?.labelDate}
            nextShabbatParsha={nextShabbatParsha}
            openLeads={openLeads.length}
            openTasks={openTasks.length}
            upcomingAvailableCount={upcomingAvailableShabbats.length}
            availableShabbats={upcomingAvailableShabbats}
            onGo={setTab}
            syncStatus={syncStatus}
            connected={Boolean(session)}
          />
        )}

        {!session && isCloudConfigured() && (
          <section className="card" style={{ marginBottom: 12 }}>
            <p className="muted" style={{ margin: 0 }}>
              כדי ששני טלפונים יראו את אותו מידע צריך להתחבר. עד אז אפשר לעבוד מקומית לצורך בדיקה.
            </p>
          </section>
        )}

        {tab === 'assistant' && <AssistantView state={state} persist={persist} session={session} />}
        {tab === 'catalog' && <CatalogView state={state} persist={persist} session={session} />}
        {tab === 'lookup' && <QuickLookup state={state} persist={persist} session={session} />}
        {tab === 'stays' && <StaysView state={state} persist={persist} session={session} />}
        {tab === 'calendar' && <CalendarView state={state} persist={persist} session={session} />}
        {tab === 'leads' && <LeadsView state={state} persist={persist} session={session} />}
        {tab === 'tasks' && <TasksView state={state} persist={persist} session={session} />}
      </main>

      <nav className="tabs" aria-label="ניווט">
        <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<Home size={18} />} label="בית" />
        <TabButton active={tab === 'assistant'} onClick={() => setTab('assistant')} icon={<MessageCircle size={18} />} label="צ׳אט" />
        <TabButton active={tab === 'catalog'} onClick={() => setTab('catalog')} icon={<Building2 size={18} />} label="מתחמים" />
        <TabButton active={tab === 'lookup'} onClick={() => setTab('lookup')} icon={<Search size={18} />} label="בדיקה" />
        <TabButton active={tab === 'stays'} onClick={() => setTab('stays')} icon={<BellRing size={18} />} label="אירוחים" />
        <TabButton active={tab === 'calendar'} onClick={() => setTab('calendar')} icon={<CalendarDays size={18} />} label="לוחות" />
        <TabButton active={tab === 'leads'} onClick={() => setTab('leads')} icon={<Users size={18} />} label="לקוחות" />
        <TabButton active={tab === 'tasks'} onClick={() => setTab('tasks')} icon={<ListChecks size={18} />} label="משימות" />
      </nav>
    </div>
  );
}

function LoginButton({ onLogin }: { onLogin: (session: CloudSession) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!isCloudConfigured()) {
      setError('החיבור לענן לא מוגדר. צריך להוסיף ב-Vercel את VITE_SUPABASE_URL ואת VITE_SUPABASE_ANON_KEY ואז לעשות Redeploy.');
      return;
    }

    if (!email.trim() || !password) {
      setError('צריך למלא אימייל וסיסמה.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const nextSession = await signIn(email, password);
      onLogin(nextSession);
      setOpen(false);
    } catch (event) {
      console.error(event);
      setError('לא הצלחתי להתחבר. בדקי שהמשתמש קיים ב-Supabase Auth, שהסיסמה נכונה, ושמשתני Vercel הוגדרו בפרויקט הזה.');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button className="secondary-btn" type="button" onClick={() => setOpen(true)}>
        כניסה
      </button>
    );
  }

  return (
    <div className="card login-popover">
      <label className="field">
        <span className="label">אימייל</span>
        <input className="input" value={email} onChange={event => setEmail(event.target.value)} />
      </label>
      <label className="field">
        <span className="label">סיסמה</span>
        <input className="input" type="password" value={password} onChange={event => setPassword(event.target.value)} />
      </label>
      {error && <p className="error-text">{error}</p>}
      <div className="actions">
        <button className="primary-btn" type="button" disabled={loading} onClick={submit}>
          {loading ? 'נכנס...' : 'התחבר'}
        </button>
        <button className="ghost-btn" type="button" onClick={() => setOpen(false)}>סגור</button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button className={`tab ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  );
}

function AssistantView({
  state,
  persist,
  session,
}: {
  state: AppState;
  persist: (state: AppState) => void;
  session: CloudSession | null;
}) {
  const [input, setInput] = useState('');
  const [draftItems, setDraftItems] = useState<ParsedStayImport[]>([]);
  const [saving, setSaving] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'כתבי לי מה לבדוק, או הדביקי רשימה. למשל: "רשימת שבתות פנויות לחודשים הקרובים", "שבתות פנויות באחוזה בהר: 17.7.26", או "14-15/7 - נימני - 1,500 ✅".',
    },
  ]);

  const sendMessage = async (text = input) => {
    const question = text.trim();
    if (!question) return;
    const parsedItems = parseAssistantImportList(question, state);
    const availabilityCount = parsedItems.filter(item => item.importType === 'availability').length;
    const stayCount = parsedItems.filter(item => item.importType === 'stay').length;
    const localReply = buildAssistantReply(question, state);
    const shouldAskGpt = !parsedItems.length && localReply.startsWith('כרגע אני יודעת');
    const importReply = parsedItems.length
      ? [
          availabilityCount
            ? `מצאתי ${availabilityCount} תאריכים פנויים לסימון.`
            : `מצאתי ${stayCount} שורות כניסה/אירוח.`,
          `${parsedItems.filter(item => item.complexId).length} עם מתחם מזוהה, ${parsedItems.filter(item => !item.complexId).length} בלי מתחם מזוהה.`,
          'תבדקי את הטיוטה למטה ואז לחצי "שמור פריטים מזוהים".',
        ].join('\n')
      : shouldAskGpt
        ? 'בודקת עם GPT...'
        : localReply;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: question,
    };
    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: importReply,
    };

    if (parsedItems.length) setDraftItems(parsedItems);
    setMessages(current => [...current, userMessage, assistantMessage]);
    setInput('');

    if (shouldAskGpt) {
      try {
        const gptReply = await askGptAssistant(question, state);
        setMessages(current => current.map(message =>
          message.id === assistantMessage.id ? { ...message, text: gptReply } : message
        ));
      } catch {
        setMessages(current => current.map(message =>
          message.id === assistantMessage.id
            ? { ...message, text: 'לא הצלחתי להתחבר ל-GPT כרגע. בדקי שיש OPENAI_API_KEY ב-Vercel ונסי שוב.' }
            : message
        ));
      }
    }
  };

  const saveDraftItems = async () => {
    const readyItems = draftItems.filter(item => item.complexId);
    if (!readyItems.length) return;

    setSaving(true);
    try {
      if (session) {
        const savedBlocks = await Promise.all(readyItems.map(item => insertCloudAvailability(session, {
          complexId: item.complexId!,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status,
          customerName: item.importType === 'stay' ? item.customerName : undefined,
          commissionAmount: item.amount,
          commissionPaid: item.paid,
          invoiceSent: item.invoice,
          invoiceStatus: item.invoiceStatus ?? (item.invoice ? 'sent' : 'not_sent'),
          note: item.note,
        })));

        persist({
          ...state,
          availabilityBlocks: [...state.availabilityBlocks, ...savedBlocks],
        });
      } else {
        const next = readyItems.reduce((currentState, item) => createAvailabilityBlock(currentState, {
          complexId: item.complexId!,
          startDate: item.startDate,
          endDate: item.endDate,
          status: item.status,
          customerName: item.importType === 'stay' ? item.customerName : undefined,
          commissionAmount: item.amount,
          commissionPaid: item.paid,
          invoiceSent: item.invoice,
          invoiceStatus: item.invoiceStatus ?? (item.invoice ? 'sent' : 'not_sent'),
          note: item.note,
        }), state);
        persist(next);
      }

      setMessages(current => [...current, {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `שמרתי ${readyItems.length} פריטים מזוהים בלוח. שורות בלי מתחם מזוהה נשארו בחוץ.`,
      }]);
      setDraftItems([]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid">
      <section className="card assistant-card">
        <div className="item-head">
          <div>
            <h2 className="section-title">צ׳אט ניהול</h2>
            <p className="muted">הצ׳אט קורא את נתוני הזמינות שכבר שמורים באפליקציה ומחזיר תשובות תפעוליות.</p>
          </div>
          <span className="pill check">ניסוי ראשון</span>
        </div>

        <div className="quick-prompts">
          <button className="secondary-btn" type="button" onClick={() => sendMessage('רשימת שבתות פנויות לחודשים הקרובים')}>
            שבתות פנויות
          </button>
          <button className="secondary-btn" type="button" onClick={() => sendMessage('מה פנוי לשבת הקרובה')}>
            מה פנוי לשבת הקרובה
          </button>
          <button className="secondary-btn" type="button" onClick={() => setInput('כניסות לוילות:\n')}>
            הדבקת כניסות
          </button>
        </div>

        <div className="chat-list">
          {messages.map(message => (
            <div className={`chat-message ${message.role}`} key={message.id}>
              <span className="chat-role">{message.role === 'user' ? 'את' : 'העוזר'}</span>
              <p>{message.text}</p>
            </div>
          ))}
        </div>

        <form
          className="chat-form"
          onSubmit={event => {
            event.preventDefault();
            sendMessage();
          }}
        >
          <textarea
            className="input"
            value={input}
            onChange={event => setInput(event.target.value)}
            rows={4}
            placeholder="לדוגמה: מה פנוי לשבת הקרובה, או הדבקת רשימת כניסות"
          />
          <button className="primary-btn" type="submit">
            <Send size={16} /> שלח
          </button>
        </form>

        {draftItems.length > 0 && (
          <div className="import-preview">
            <div className="item-head">
              <div>
                <h3 className="section-title">טיוטת ייבוא מהצ׳אט</h3>
                <p className="muted">כניסות יישמרו כתפוס, ורשימות פנויות יישמרו כפנוי. פריטים בלי מתחם נשארים לבדיקה ידנית.</p>
              </div>
              <span className="pill check">{draftItems.length} שורות</span>
            </div>
            <div className="list">
              {draftItems.map(item => (
                <div className="list-item" key={item.id}>
                  <div className="item-head">
                    <div>
                      <p className="item-title">{item.customerName}</p>
                      <span className="muted">{formatGregorianDate(item.startDate)} - {formatGregorianDate(item.endDate)}</span>
                    </div>
                    <span className={`pill ${item.complexId ? item.status : 'check'}`}>
                      {item.complexName ? `${item.complexName} · ${statusLabels[item.status]}` : 'צריך לבחור מתחם'}
                    </span>
                  </div>
                  <span className="muted">
                    {[item.amount ? `סכום ${item.amount}` : '', item.invoice ? 'חשבונית' : '', item.paid ? 'שולם' : ''].filter(Boolean).join(' · ')}
                  </span>
                  <span className="muted">{item.sourceLine}</span>
                </div>
              ))}
            </div>
            <div className="actions">
              <button className="primary-btn" type="button" disabled={saving || !draftItems.some(item => item.complexId)} onClick={saveDraftItems}>
                {saving ? 'שומר...' : 'שמור פריטים מזוהים'}
              </button>
              <button className="ghost-btn" type="button" onClick={() => setDraftItems([])}>בטל טיוטה</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function CatalogView({ state, persist, session }: { state: AppState; persist: (state: AppState) => void; session: CloudSession | null }) {
  const complexAreaOptions = Array.from(new Set([...areaOptions, ...state.complexes.map(complex => complex.area).filter(Boolean)]));
  const areas = ['הכל', ...complexAreaOptions];
  const [area, setArea] = useState(areas[0] ?? 'הכל');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [selectedOwnerIds, setSelectedOwnerIds] = useState<string[]>([]);
  const [expandedComplexIds, setExpandedComplexIds] = useState<string[]>([]);
  const [bulkOwnerMessage, setBulkOwnerMessage] = useState('שלום, רציתי לבדוק זמינות ומחיר לתאריך הקרוב.');
  const [showNewComplex, setShowNewComplex] = useState(false);
  const [newComplexForm, setNewComplexForm] = useState({
    name: '',
    area: 'צפון',
    city: '',
    rooms: '0',
    maxGuests: '0',
    ownerName: '',
    ownerPhone: '',
  });
  const complexes = useMemo(
    () => state.complexes.filter(complex => complex.active && (area === 'הכל' || complex.area === area)),
    [area, state.complexes],
  );
  const ownerTargets = useMemo(
    () => complexes.filter(complex => normalizePhone(complex.ownerPhone ?? '')),
    [complexes],
  );
  const selectedOwnerTargets = ownerTargets.filter(complex => selectedOwnerIds.includes(complex.id));

  useEffect(() => {
    const availableOwnerIds = new Set(ownerTargets.map(complex => complex.id));
    setSelectedOwnerIds(current => current.filter(id => availableOwnerIds.has(id)));
  }, [ownerTargets]);

  const updateComplex = async (complex: Complex, patch: Partial<Complex>) => {
    const updated = { ...complex, ...patch };
    persist({
      ...state,
      complexes: state.complexes.map(item => item.id === complex.id ? updated : item),
    });

    if (session) {
      try {
        const cloudComplex = await updateCloudComplex(session, updated);
        persist({
          ...state,
          complexes: state.complexes.map(item => item.id === complex.id ? cloudComplex : item),
        });
      } catch {
        // Local save already happened. Cloud sync will be retried by the next save/login.
      }
    }
  };

  const addComplex = async () => {
    if (!newComplexForm.name.trim()) return;
    const complex: Complex = {
      id: createSlug(newComplexForm.name, state.complexes.map(item => item.id)),
      name: newComplexForm.name.trim(),
      area: newComplexForm.area || areaOptions[0],
      city: newComplexForm.city.trim() || 'לא ידוע',
      rooms: Number(newComplexForm.rooms || 0),
      maxGuests: Number(newComplexForm.maxGuests || 0),
      ownerName: newComplexForm.ownerName.trim(),
      ownerPhone: newComplexForm.ownerPhone.trim(),
      active: true,
    };

    if (session) {
      try {
        const cloudComplex = await insertCloudComplex(session, complex);
        persist({ ...state, complexes: [...state.complexes, cloudComplex] });
      } catch {
        persist({ ...state, complexes: [...state.complexes, complex] });
      }
    } else {
      persist({ ...state, complexes: [...state.complexes, complex] });
    }

    setArea('הכל');
    setShowNewComplex(false);
    setNewComplexForm({
      name: '',
      area: 'צפון',
      city: '',
      rooms: '0',
      maxGuests: '0',
      ownerName: '',
      ownerPhone: '',
    });
  };

  const deleteComplex = async (complex: Complex) => {
    const approved = window.confirm(`למחוק את ${complex.name} מרשימת המתחמים? ההזמנות הקיימות יישארו בלוח.`);
    if (!approved) return;
    await updateComplex(complex, { active: false });
  };

  const uploadCoverImage = async (complex: Complex, event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const imageUrl = await readFileAsDataUrl(file);
    await updateComplex(complex, { coverImageUrl: imageUrl });
  };

  const uploadGalleryImages = async (complex: Complex, event: { currentTarget: HTMLInputElement }) => {
    const input = event.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    const nextImages = await Promise.all(files.map(readFileAsDataUrl));
    const currentImages = splitGallery(complex.galleryUrls);
    await updateComplex(complex, { galleryUrls: [...currentImages, ...nextImages].join('\n') });
  };

  const getWhatsappHref = (complex: Complex) => {
    const text = encodeURIComponent(buildComplexShareText(complex));
    const phone = normalizePhone(customerPhone);
    return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  };
  const getMailHref = (complex: Complex) => {
    const subject = encodeURIComponent(`פרטי מתחם: ${complex.name}`);
    const body = encodeURIComponent(buildComplexShareText(complex));
    return `mailto:${customerEmail}?subject=${subject}&body=${body}`;
  };
  const getOwnerBulkWhatsappHref = (complex: Complex) => {
    const phone = normalizePhone(complex.ownerPhone ?? '');
    const text = encodeURIComponent(bulkOwnerMessage.trim() || 'שלום, רציתי לבדוק זמינות.');
    return `https://wa.me/${phone}?text=${text}`;
  };
  const shareComplexMedia = async (complex: Complex) => {
    const mediaUrls = getComplexMediaUrls(complex);
    if (!mediaUrls.length) {
      window.alert('אין עדיין תמונות או סרטונים לשיתוף במתחם הזה.');
      return;
    }

    const shareApi = navigator as Navigator & {
      canShare?: (data: { files?: File[] }) => boolean;
      share?: (data: { title?: string; files?: File[] }) => Promise<void>;
    };
    if (!shareApi.share) {
      window.alert('הדפדפן הזה לא תומך בשיתוף קבצים. נסי לפתוח מהטלפון בדפדפן Chrome/Edge או מתוך האפליקציה המותקנת.');
      return;
    }

    const files = (await Promise.all(mediaUrls.map((url, index) => mediaUrlToFile(url, complex, index))))
      .filter((file): file is File => Boolean(file));

    if (!files.length) {
      window.alert('לא הצלחתי להכין קבצי מדיה לשיתוף. סרטונים חייבים להיות קובץ ישיר, לא קישור ליוטיוב/אתר.');
      return;
    }

    if (shareApi.canShare && !shareApi.canShare({ files })) {
      window.alert('הטלפון או הדפדפן לא מאפשרים שיתוף של הקבצים האלה יחד. אפשר לנסות פחות קבצים או קבצים קטנים יותר.');
      return;
    }

    try {
      await shareApi.share({ title: `מדיה ${complex.name}`, files });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      window.alert('השיתוף לא הושלם. אפשר לנסות שוב עם פחות תמונות/סרטונים.');
    }
  };
  const toggleOwnerSelection = (complexId: string) => {
    setSelectedOwnerIds(current =>
      current.includes(complexId)
        ? current.filter(id => id !== complexId)
        : [...current, complexId]
    );
  };
  const toggleComplexDetails = (complexId: string) => {
    setExpandedComplexIds(current =>
      current.includes(complexId)
        ? current.filter(id => id !== complexId)
        : [...current, complexId]
    );
  };
  const selectAllOwners = () => {
    setSelectedOwnerIds(ownerTargets.map(complex => complex.id));
  };

  return (
    <div className="grid">
      <section className="card">
        <div className="item-head">
          <div>
            <h2 className="section-title">קטלוג מתחמים ללקוח</h2>
            <p className="muted">כאן מרכזים לכל מתחם תמונה, וידאו, טלפון וטקסט קצר לשליחה.</p>
          </div>
          <div className="actions">
            <button className="secondary-btn" type="button" onClick={() => setShowNewComplex(true)}>
              <Plus size={16} /> הוסף מתחם
            </button>
            <span className="pill available">{complexes.length} מתחמים</span>
          </div>
        </div>
        <div className="form-grid" style={{ marginTop: 12 }}>
          <SelectField label="אזור" value={area} options={areas} onChange={setArea} />
          <Field label="מספר לקוח לשליחה" value={customerPhone} onChange={setCustomerPhone} placeholder="05..." />
          <Field label="אימייל לקוח לשליחה" value={customerEmail} onChange={setCustomerEmail} placeholder="name@example.com" />
        </div>

        <div className="bulk-owner-panel">
          <div className="item-head">
            <div>
              <h3 className="section-title">שליחה מרובה לבעלי מתחמים</h3>
              <p className="muted">סמני מתחמים מהרשימה, כתבי הודעה אחת, ואז פתחי WhatsApp לכל בעל מתחם מסומן.</p>
            </div>
            <span className="pill available">{selectedOwnerTargets.length}/{ownerTargets.length} נבחרו</span>
          </div>
          <label className="field">
            <span className="label">הודעה לבעלי המתחמים</span>
            <textarea
              className="input"
              rows={3}
              value={bulkOwnerMessage}
              onChange={event => setBulkOwnerMessage(event.target.value)}
            />
          </label>
          <div className="actions">
            <button className="secondary-btn" type="button" onClick={selectAllOwners} disabled={ownerTargets.length === 0}>
              סמן בעלי טלפון
            </button>
            <button className="ghost-btn" type="button" onClick={() => setSelectedOwnerIds([])} disabled={selectedOwnerIds.length === 0}>
              נקה בחירה
            </button>
          </div>
          {selectedOwnerTargets.length > 0 && (
            <div className="bulk-owner-links">
              {selectedOwnerTargets.map(complex => (
                <a className="primary-btn" href={getOwnerBulkWhatsappHref(complex)} target="_blank" rel="noreferrer" key={`owner-send-${complex.id}`}>
                  <MessageCircle size={16} /> {complex.ownerName || complex.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {showNewComplex && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowNewComplex(false)}>
          <section className="card modal-panel" role="dialog" aria-modal="true" aria-labelledby="new-complex-title" onClick={event => event.stopPropagation()}>
            <div className="item-head">
              <h2 className="section-title" id="new-complex-title">הוסף מתחם</h2>
              <button className="ghost-btn icon-only" type="button" aria-label="סגור" onClick={() => setShowNewComplex(false)}>×</button>
            </div>
            <div className="form-grid" style={{ marginTop: 12 }}>
              <Field label="שם מתחם" value={newComplexForm.name} onChange={value => setNewComplexForm(current => ({ ...current, name: value }))} />
              <SelectField label="אזור" value={newComplexForm.area} options={complexAreaOptions} onChange={value => setNewComplexForm(current => ({ ...current, area: value }))} />
              <Field label="עיר" value={newComplexForm.city} onChange={value => setNewComplexForm(current => ({ ...current, city: value }))} />
              <Field label="חדרים" value={newComplexForm.rooms} type="number" min="0" onChange={value => setNewComplexForm(current => ({ ...current, rooms: value }))} />
              <Field label="מקסימום אורחים" value={newComplexForm.maxGuests} type="number" min="0" onChange={value => setNewComplexForm(current => ({ ...current, maxGuests: value }))} />
              <Field label="שם בעל מתחם" value={newComplexForm.ownerName} onChange={value => setNewComplexForm(current => ({ ...current, ownerName: value }))} />
              <Field label="טלפון בעל מתחם" value={newComplexForm.ownerPhone} onChange={value => setNewComplexForm(current => ({ ...current, ownerPhone: value }))} />
              <div className="actions full">
                <button className="primary-btn" type="button" onClick={addComplex}>
                  <Plus size={16} /> שמור מתחם
                </button>
                <button className="ghost-btn" type="button" onClick={() => setShowNewComplex(false)}>ביטול</button>
              </div>
            </div>
          </section>
        </div>
      )}

      <section className="catalog-grid">
        {complexes.map(complex => {
          const galleryImages = splitGallery(complex.galleryUrls);
          const isExpanded = expandedComplexIds.includes(complex.id);

          return (
          <article className={`card catalog-card ${isExpanded ? 'expanded' : 'collapsed'}`} key={complex.id}>
            <div className="item-head">
              <div>
                <h2 className="section-title">{complex.name}</h2>
                <p className="muted">{complex.city} · {complex.area} · {complex.rooms} חדרים · עד {complex.maxGuests} אורחים</p>
              </div>
              <div className="actions">
                {complex.ownerPhone && (
                  <label className="owner-select">
                    <input
                      type="checkbox"
                      checked={selectedOwnerIds.includes(complex.id)}
                      onChange={() => toggleOwnerSelection(complex.id)}
                    />
                    <span>בחר לשליחה</span>
                  </label>
                )}
                {complex.videoUrl && <a className="ghost-btn icon-only" href={complex.videoUrl} target="_blank" rel="noreferrer" title="פתיחת וידאו"><Video size={18} /></a>}
                <button
                  className="ghost-btn icon-only catalog-toggle"
                  type="button"
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? `סגור פרטי ${complex.name}` : `פתח פרטי ${complex.name}`}
                  title={isExpanded ? 'סגירת פרטים' : 'פתיחת פרטים'}
                  onClick={() => toggleComplexDetails(complex.id)}
                >
                  <ChevronDown size={18} />
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="catalog-details">
                {complex.coverImageUrl ? (
                  <img className="catalog-image" src={complex.coverImageUrl} alt={complex.name} />
                ) : (
                  <div className="catalog-placeholder">
                    <Image size={28} />
                    <span>מקום לתמונה</span>
                  </div>
                )}

                {galleryImages.length > 0 && (
                  <div className="gallery-strip" aria-label={`גלריית תמונות ${complex.name}`}>
                    {galleryImages.slice(0, 6).map((imageUrl, index) => (
                      <img src={imageUrl} alt={`${complex.name} תמונה ${index + 1}`} key={`${complex.id}-gallery-${index}`} />
                    ))}
                  </div>
                )}

                <div className="form-grid">
                  <Field label="שם מתחם" value={complex.name} onChange={value => updateComplex(complex, { name: value })} />
                  <SelectField label="אזור" value={complex.area} options={complexAreaOptions.includes(complex.area) ? complexAreaOptions : [complex.area, ...complexAreaOptions]} onChange={value => updateComplex(complex, { area: value })} />
                  <Field label="עיר" value={complex.city} onChange={value => updateComplex(complex, { city: value })} />
                  <Field label="חדרים" value={String(complex.rooms)} type="number" min="0" onChange={value => updateComplex(complex, { rooms: Number(value || 0) })} />
                  <Field label="מקסימום אורחים" value={String(complex.maxGuests)} type="number" min="0" onChange={value => updateComplex(complex, { maxGuests: Number(value || 0) })} />
                  <Field label="שם בעל מתחם" value={complex.ownerName ?? ''} onChange={value => updateComplex(complex, { ownerName: value })} />
                  <Field label="טלפון בעל מתחם" value={complex.ownerPhone ?? ''} onChange={value => updateComplex(complex, { ownerPhone: value })} />
                  <Field label="קישור תמונה" value={complex.coverImageUrl ?? ''} onChange={value => updateComplex(complex, { coverImageUrl: value })} />
                  <Field label="קישור וידאו" value={complex.videoUrl ?? ''} onChange={value => updateComplex(complex, { videoUrl: value })} />
                  <Field className="full" label="קישורי גלריה" value={complex.galleryUrls ?? ''} onChange={value => updateComplex(complex, { galleryUrls: value })} placeholder="אפשר להדביק כמה קישורים, כל קישור בשורה" />
                  <Field className="full" label="טקסט קצר ללקוח" value={complex.salesNote ?? ''} onChange={value => updateComplex(complex, { salesNote: value })} />
                  <Field className="full" label="הערות פנימיות" value={complex.internalNotes ?? ''} onChange={value => updateComplex(complex, { internalNotes: value })} />
                  <Field className="full" label="פרטי שבת" value={complex.shabbatNotes ?? ''} onChange={value => updateComplex(complex, { shabbatNotes: value })} />
                </div>

                <div className="media-upload-row">
                  <label className="secondary-btn file-btn">
                    <Upload size={16} /> העלאת תמונת שער
                    <input type="file" accept="image/*" onChange={event => uploadCoverImage(complex, event)} />
                  </label>
                  <label className="ghost-btn file-btn">
                    <Image size={16} /> הוספה לגלריה
                    <input type="file" accept="image/*" multiple onChange={event => uploadGalleryImages(complex, event)} />
                  </label>
                  {complex.coverImageUrl && (
                    <button className="ghost-btn" type="button" onClick={() => updateComplex(complex, { coverImageUrl: undefined })}>
                      נקה תמונת שער
                    </button>
                  )}
                  {galleryImages.length > 0 && (
                    <button className="ghost-btn" type="button" onClick={() => updateComplex(complex, { galleryUrls: undefined })}>
                      נקה גלריה
                    </button>
                  )}
                </div>

                <div className="catalog-preview">
                  <p className="muted">{complex.salesNote || complex.shabbatNotes || 'עדיין אין טקסט שיווקי. אפשר לכתוב כאן משפט מכירה קצר.'}</p>
                </div>

                <div className="actions">
                  <button className="secondary-btn" type="button" onClick={() => shareComplexMedia(complex)}>
                    <Share2 size={16} /> שתף מדיה
                  </button>
                  <a className="primary-btn" href={getWhatsappHref(complex)} target="_blank" rel="noreferrer">
                    <Share2 size={16} /> שלח ללקוח
                  </a>
                  <a className="secondary-btn" href={getMailHref(complex)}>
                    שלח במייל
                  </a>
                  {complex.ownerPhone && <a className="secondary-btn" href={`tel:${complex.ownerPhone}`}>שיחה לבעל מתחם</a>}
                  <button className="ghost-btn danger-btn" type="button" onClick={() => deleteComplex(complex)}>
                    <Trash2 size={16} /> מחק מתחם
                  </button>
                </div>
              </div>
            )}
          </article>
          );
        })}
      </section>
    </div>
  );
}

function Dashboard({
  totalComplexes,
  nextShabbatAvailable,
  nextShabbatLabel,
  nextShabbatParsha,
  openLeads,
  openTasks,
  upcomingAvailableCount,
  availableShabbats,
  onGo,
  syncStatus,
  connected,
}: {
  totalComplexes: number;
  nextShabbatAvailable: number;
  nextShabbatLabel?: string;
  nextShabbatParsha?: string;
  openLeads: number;
  openTasks: number;
  upcomingAvailableCount: number;
  availableShabbats: {
    startDate: string;
    endDate: string;
    labelDate: string;
    available: Complex[];
  }[];
  onGo: (tab: Tab) => void;
  syncStatus: string;
  connected: boolean;
}) {
  const nextShabbatDetail = [
    nextShabbatLabel ? formatDateLine(nextShabbatLabel) : undefined,
    nextShabbatParsha,
  ].filter(Boolean).join(' · ');

  return (
    <div className="grid">
      <section className="hero-panel">
        <div>
          <span className={`sync-badge ${connected ? 'online' : ''}`}>
            <Cloud size={14} />
            {syncStatus}
          </span>
          <h2>מה צריך לדעת עכשיו?</h2>
          <p>סך המתחמים, זמינות לשבת הקרובה, פניות פתוחות ומשימות במקום אחד.</p>
        </div>
        <div className="hero-actions">
          <button className="primary-btn" type="button" onClick={() => onGo('lookup')}>בדיקת זמינות</button>
          <button className="secondary-btn" type="button" onClick={() => onGo('calendar')}>סימון תאריך</button>
        </div>
      </section>

      <section className="grid dashboard-grid">
        <Metric label="סה״כ מתחמים" value={totalComplexes} icon={<Home size={16} />} compact />
        <Metric label="פנויים לשבת הקרובה" value={nextShabbatAvailable} icon={<CalendarDays size={18} />} detail={nextShabbatDetail || undefined} />
        <Metric label="פניות פתוחות" value={openLeads} icon={<Users size={18} />} />
        <Metric label="משימות" value={openTasks} icon={<ListChecks size={18} />} />
      </section>

      <section className="grid content-grid">
        <div className="card">
          <div className="item-head">
            <h2 className="section-title">שבתות פנויות קרובות</h2>
            <button className="ghost-btn" type="button" onClick={() => onGo('calendar')}>ללוחות</button>
          </div>
          <div className="list">
            {availableShabbats.length === 0 && <p className="muted">לא נמצאו שבתות פנויות בקרוב.</p>}
            {availableShabbats.map(shabbat => {
              const parsha = getParshaLabel(shabbat.labelDate);

              return (
                <div className="list-item" key={shabbat.startDate}>
                  <div className="item-head">
                    <div>
                      <p className="item-title">{formatDateLine(shabbat.labelDate)}</p>
                      {parsha && <span className="muted">{parsha}</span>}
                    </div>
                    <span className="pill available">{shabbat.available.length} פנויים</span>
                  </div>
                  <span className="muted">
                    {shabbat.available.slice(0, 4).map(complex => complex.name).join(', ')}
                    {shabbat.available.length > 4 ? ` ועוד ${shabbat.available.length - 4}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="item-head">
            <h2 className="section-title">פעולות מהירות</h2>
          </div>
          <div className="grid">
            <button className="primary-btn" type="button" onClick={() => onGo('lookup')}>בדיקת זמינות ללקוח</button>
            <button className="secondary-btn" type="button" onClick={() => onGo('leads')}>הוספת פנייה</button>
            <button className="ghost-btn" type="button" onClick={() => onGo('tasks')}>פתיחת משימות</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, icon, detail, compact = false }: { label: string; value: number; icon: React.ReactNode; detail?: string; compact?: boolean }) {
  return (
    <div className={`card metric ${compact ? 'compact' : ''}`}>
      <div className="item-head">
        <p className="metric-label">{label}</p>
        {icon}
      </div>
      <p className="metric-value">{value}</p>
      {detail && <span className="muted">{detail}</span>}
    </div>
  );
}

function QuickLookup({ state, persist, session }: { state: AppState; persist: (state: AppState) => void; session: CloudSession | null }) {
  const [form, setForm] = useState({
    startDate: todayYMD(),
    endDate: '',
    guests: '20',
    area: 'לא משנה',
    vacationType: 'שבת חתן',
    customerName: '',
    customerPhone: '',
    notes: '',
  });
  const [checked, setChecked] = useState(false);

  const results = useMemo(() => {
    if (!form.startDate || !form.endDate || form.endDate < form.startDate || isPastDate(form.startDate)) return [];
    const requestedGuests = Number(form.guests || 0);

    return state.complexes
      .filter(complex => complex.active)
      .map(complex => {
        const conflicts = state.availabilityBlocks.filter(block =>
          block.complexId === complex.id && hasDateConflict(block, form.startDate, form.endDate)
        );
        const guestFit = getGuestFit(complex.maxGuests, requestedGuests);
        const capacityOk = complex.maxGuests >= requestedGuests;
        const areaOk = form.area === 'לא משנה' || complex.area === form.area;
        const score = guestFit.score + (capacityOk ? 20 : 0) + (areaOk ? 30 : 0) + (conflicts.length === 0 ? 30 : 0);
        return { complex, conflicts, capacityOk, areaOk, guestFit, score };
      })
      .filter(result => result.guestFit.isReasonable)
      .sort((a, b) => {
        const availabilityOrder = Number(a.conflicts.length > 0) - Number(b.conflicts.length > 0);
        if (availabilityOrder !== 0) return availabilityOrder;
        const areaOrder = Number(!a.areaOk) - Number(!b.areaOk);
        if (areaOrder !== 0) return areaOrder;
        return b.score - a.score;
      });
  }, [form.area, form.endDate, form.guests, form.startDate, state.availabilityBlocks, state.complexes]);

  const createLeadFromForm = async () => {
    const leadData = {
      customerName: form.customerName || 'לקוח ללא שם',
      customerPhone: form.customerPhone,
      startDate: form.startDate,
      endDate: form.endDate,
      guests: Number(form.guests || 0),
      areaPreference: form.area,
      vacationType: form.vacationType,
      notes: form.notes,
      status: 'new' as const,
    };

    if (session) {
      const lead = await insertCloudLead(session, leadData);
      persist({ ...state, leads: [lead, ...state.leads] });
      return;
    }

    const next = createLead(state, {
      ...leadData,
    });
    persist(next);
  };

  const getOwnerWhatsappHref = (complex: Complex) => {
    const phone = normalizePhone(complex.ownerPhone ?? '');
    if (!phone) return '';

    const text = encodeURIComponent([
      `שלום, אשמח לבדוק זמינות עבור ${complex.name}.`,
      `תאריכים: ${formatDateLine(form.startDate, form.endDate)}`,
      `כמות אורחים: ${form.guests || 'לא צוין'}`,
      form.customerName ? `שם לקוח: ${form.customerName}` : '',
      form.notes ? `הערות: ${form.notes}` : '',
    ].filter(Boolean).join('\n'));

    return `https://wa.me/${phone}?text=${text}`;
  };
  const getCustomerWhatsappHref = (complex: Complex) => {
    const phone = normalizePhone(form.customerPhone);
    const text = encodeURIComponent(buildComplexOfferText(complex, {
      startDate: form.startDate,
      endDate: form.endDate,
      guests: form.guests,
      notes: form.notes,
    }));

    return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  };

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">בדיקת זמינות מהירה</h2>
        <div className="form-grid">
          <DateField label="כניסה" value={form.startDate} min={todayYMD()} onChange={value => setForm({ ...form, startDate: value, endDate: form.endDate < value ? '' : form.endDate })} />
          <DateField label="יציאה" value={form.endDate} min={form.startDate || todayYMD()} onChange={value => setForm({ ...form, endDate: value })} />
          <Field label="אורחים" value={form.guests} type="number" min="1" onChange={value => setForm({ ...form, guests: value })} />
          <SelectField label="אזור" value={form.area} options={areaPreferenceOptions} onChange={value => setForm({ ...form, area: value })} />
          <SelectField label="סוג נופש" value={form.vacationType} options={['שבת חתן', 'משפחה', 'זוגות', 'קבוצה', 'חג']} onChange={value => setForm({ ...form, vacationType: value })} />
          <Field label="שם לקוח" value={form.customerName} onChange={value => setForm({ ...form, customerName: value })} />
          <Field label="טלפון" value={form.customerPhone} onChange={value => setForm({ ...form, customerPhone: value })} />
          <Field className="full" label="הערות" value={form.notes} onChange={value => setForm({ ...form, notes: value })} />
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="primary-btn" type="button" onClick={() => setChecked(true)}>
            <Search size={16} /> בדוק
          </button>
          <button className="ghost-btn" type="button" onClick={createLeadFromForm}>שמור פנייה בלי הצעה</button>
        </div>
      </section>

      {checked && (
        <section className="card">
          <h2 className="section-title">תוצאות</h2>
          <p className="muted">מוצגים רק מתחמים בטווח סביר סביב {form.guests || 0} אורחים.</p>
          <div className="list">
            {results.length === 0 && <p className="muted">לא נמצאו מתחמים בטווח סביר לכמות הזו.</p>}
            {results.map(result => (
              <div className="list-item" key={result.complex.id}>
                <div className="item-head">
                  <div>
                    <p className="item-title">{result.complex.name}</p>
                    <span className="muted">{result.complex.city} · עד {result.complex.maxGuests} אורחים · {result.complex.rooms} חדרים</span>
                    <span className="muted">{result.guestFit.label}</span>
                  </div>
                  <span className={`availability-icon ${result.conflicts.length ? 'busy' : 'open'}`} title={result.conflicts.length ? 'יש סימון בלוח לתאריכים האלה' : 'אין סימון בלוח לתאריכים האלה'}>
                    {result.conflicts.length ? <CalendarX size={18} /> : <CalendarCheck size={18} />}
                  </span>
                </div>
                {result.conflicts.length > 0 && (
                  <div className="muted">
                    {result.conflicts.map(block => `${statusLabels[block.status]}: ${formatDateLine(block.startDate, block.endDate)}`).join(' | ')}
                  </div>
                )}
                <div className="actions">
                  <a className="primary-btn" href={getCustomerWhatsappHref(result.complex)} target="_blank" rel="noreferrer">
                    <Share2 size={16} /> שלח ללקוח
                  </a>
                  {result.complex.ownerPhone && (
                    <>
                      <a className="secondary-btn" href={`tel:${result.complex.ownerPhone}`}>שיחה לבעל מתחם</a>
                      <a className="primary-btn" href={getOwnerWhatsappHref(result.complex)} target="_blank" rel="noreferrer">
                        <MessageCircle size={16} /> WhatsApp
                      </a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function StaysView({ state, persist, session }: { state: AppState; persist: (state: AppState) => void; session: CloudSession | null }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const activeComplexes = state.complexes.filter(complex => complex.active);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeForm, setCloseForm] = useState({
    complexId: activeComplexes[0]?.id ?? '',
    startDate: todayYMD(),
    endDate: '',
    customerName: '',
    customerPhone: '',
    commissionAmount: '',
    commissionPaid: false,
    invoiceStatus: 'not_sent' as InvoiceStatus,
    note: '',
  });
  const [closeFormError, setCloseFormError] = useState('');
  const [closeFormTouched, setCloseFormTouched] = useState(false);
  const [editingArrivalId, setEditingArrivalId] = useState<string | null>(null);
  const [editingArrivalDraft, setEditingArrivalDraft] = useState<ArrivalEditDraft | null>(null);
  const [editingArrivalError, setEditingArrivalError] = useState('');
  const [expandedClosureIds, setExpandedClosureIds] = useState<string[]>([]);
  const [notificationStatus, setNotificationStatus] = useState(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const today = todayYMD();
  const allEvents = useMemo(() => getStayEvents(state), [state.availabilityBlocks, state.complexes]);
  const upcomingArrivals = allEvents.filter(event => event.type === 'arrival' && event.date >= today).slice(0, 40);
  const closureBlocks = useMemo(
    () => state.availabilityBlocks
      .filter(block =>
        block.status !== 'available' &&
        Boolean(block.customerName || block.customerPhone || block.commissionAmount || block.commissionPaid || block.invoiceSent || block.invoiceStatus === 'end_of_stay')
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .slice(0, 80),
    [state.availabilityBlocks],
  );
  const unpaidCommissionBlocks = closureBlocks.filter(block => !block.commissionPaid && parseMoneyAmount(block.commissionAmount) > 0);
  const moneyToCollect = unpaidCommissionBlocks.reduce((sum, block) => sum + parseMoneyAmount(block.commissionAmount), 0);
  const reminders = allEvents.filter(event => event.date === today || event.reminderDate === today);
  const eventsByDate = useMemo(() => {
    return allEvents.reduce<Record<string, StayEvent[]>>((groups, event) => {
      (groups[event.date] ??= []).push(event);
      return groups;
    }, {});
  }, [allEvents]);
  const closeFormValidation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!activeComplexes.length) errors.complexId = 'אין מתחמים פעילים לשמירה.';
    if (!closeForm.complexId) errors.complexId = 'צריך לבחור מתחם.';
    if (!closeForm.startDate) errors.startDate = 'צריך למלא תאריך כניסה.';
    if (!closeForm.endDate) errors.endDate = 'צריך למלא תאריך יציאה.';
    if (closeForm.startDate && closeForm.endDate && closeForm.endDate < closeForm.startDate) {
      errors.endDate = 'תאריך היציאה לא יכול להיות לפני תאריך הכניסה.';
    }
    return errors;
  }, [activeComplexes.length, closeForm.complexId, closeForm.endDate, closeForm.startDate]);
  const showCloseFormErrors = closeFormTouched || Boolean(closeFormError);
  const grid = getMonthGrid(year, month);

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!reminders.length) return;

    const key = `kalanofesh-reminders-${today}`;
    const sent = new Set((localStorage.getItem(key) || '').split(',').filter(Boolean));
    reminders.forEach(reminder => {
      if (sent.has(reminder.id)) return;
      const typeLabel = reminder.type === 'arrival' ? 'כניסה' : 'יציאה';
      const timing = reminder.date === today ? 'היום' : 'בעוד 3 ימים';
      const invoiceReminder = reminder.type === 'departure' && reminder.date === today && reminder.invoiceStatus === 'end_of_stay';
      new Notification(`קלנופש: ${typeLabel} ${timing}`, {
        body: `${reminder.customerName} - ${reminder.complexName}${invoiceReminder ? ' | לשלוח חשבונית' : ''}`,
        tag: reminder.id,
      });
      sent.add(reminder.id);
    });
    localStorage.setItem(key, Array.from(sent).join(','));
  }, [reminders, today]);

  const requestNotifications = async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationStatus(permission);
  };

  const moveMonth = (direction: -1 | 1) => {
    const next = new Date(year, month + direction, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };
  const toggleClosureDetails = (blockId: string) => {
    setExpandedClosureIds(current =>
      current.includes(blockId)
        ? current.filter(id => id !== blockId)
        : [...current, blockId]
    );
  };

  const saveCloseBlock = async () => {
    setCloseFormError('');
    setCloseFormTouched(true);
    if (Object.keys(closeFormValidation).length > 0) {
      setCloseFormError('יש שדות שצריך לתקן לפני שמירת הסגירה.');
      return;
    }
    const blockData = {
      complexId: closeForm.complexId,
      startDate: closeForm.startDate,
      endDate: closeForm.endDate,
      status: 'booked' as AvailabilityStatus,
      customerName: closeForm.customerName || undefined,
      customerPhone: closeForm.customerPhone || undefined,
      commissionAmount: closeForm.commissionAmount || undefined,
      commissionPaid: closeForm.commissionPaid,
      invoiceSent: closeForm.invoiceStatus === 'sent',
      invoiceStatus: closeForm.invoiceStatus,
      note: closeForm.note || 'סגירה ממסך אירוחים',
    };

    if (session) {
      try {
        const block = await insertCloudAvailability(session, blockData);
        persist({ ...state, availabilityBlocks: [...state.availabilityBlocks, block] });
      } catch (error) {
        persist(createAvailabilityBlock(state, blockData));
        setCloseFormError(describeCloudSaveError(error));
        return;
      }
    } else {
      persist(createAvailabilityBlock(state, blockData));
    }

    setCloseForm(current => ({
      ...current,
      customerName: '',
      customerPhone: '',
      commissionAmount: '',
      commissionPaid: false,
      invoiceStatus: 'not_sent',
      note: '',
    }));
    setCloseFormTouched(false);
    setShowCloseForm(false);
  };

  const updateClosureBlock = async (block: AvailabilityBlock, patch: Partial<AvailabilityBlock>) => {
    const updated = { ...block, ...patch, updatedAt: new Date().toISOString() };
    persist({
      ...state,
      availabilityBlocks: state.availabilityBlocks.map(item => item.id === block.id ? updated : item),
    });

    if (session) {
      try {
        const cloudBlock = await updateCloudAvailability(session, block.id, patch);
        persist({
          ...state,
          availabilityBlocks: state.availabilityBlocks.map(item => item.id === block.id ? cloudBlock : item),
        });
      } catch {
        // Local update remains visible. If the cloud schema is missing columns, rerun supabase/schema.sql.
      }
    }
  };

  const startEditingArrival = (block: AvailabilityBlock) => {
    setEditingArrivalId(block.id);
    setEditingArrivalError('');
    setEditingArrivalDraft({
      complexId: block.complexId,
      startDate: block.startDate,
      endDate: block.endDate,
      customerName: block.customerName ?? '',
      customerPhone: block.customerPhone ?? '',
      commissionAmount: block.commissionAmount ?? '',
      commissionPaid: Boolean(block.commissionPaid),
      invoiceStatus: block.invoiceStatus ?? (block.invoiceSent ? 'sent' : 'not_sent'),
      note: block.note ?? '',
    });
  };

  const cancelEditingArrival = () => {
    setEditingArrivalId(null);
    setEditingArrivalDraft(null);
    setEditingArrivalError('');
  };

  const saveEditingArrival = async (block: AvailabilityBlock) => {
    if (!editingArrivalDraft) return;
    if (!editingArrivalDraft.complexId) {
      setEditingArrivalError('צריך לבחור מתחם.');
      return;
    }
    if (!editingArrivalDraft.startDate || !editingArrivalDraft.endDate) {
      setEditingArrivalError('צריך למלא תאריך כניסה ויציאה.');
      return;
    }
    if (editingArrivalDraft.endDate < editingArrivalDraft.startDate) {
      setEditingArrivalError('תאריך היציאה לא יכול להיות לפני תאריך הכניסה.');
      return;
    }

    const patch: Partial<AvailabilityBlock> = {
      complexId: editingArrivalDraft.complexId,
      startDate: editingArrivalDraft.startDate,
      endDate: editingArrivalDraft.endDate,
      customerName: editingArrivalDraft.customerName?.trim() || undefined,
      customerPhone: editingArrivalDraft.customerPhone?.trim() || undefined,
      commissionAmount: editingArrivalDraft.commissionAmount?.trim() || undefined,
      commissionPaid: Boolean(editingArrivalDraft.commissionPaid),
      invoiceStatus: editingArrivalDraft.invoiceStatus ?? 'not_sent',
      invoiceSent: editingArrivalDraft.invoiceStatus === 'sent',
      note: editingArrivalDraft.note?.trim() || undefined,
    };

    await updateClosureBlock(block, patch);
    cancelEditingArrival();
  };

  return (
    <div className="grid">
      <section className="card">
        <div className="item-head">
          <div>
            <h2 className="section-title">לוח כניסות ויציאות</h2>
            <p className="muted">תזכורות מופיעות 3 ימים לפני ובאותו יום, לפי סימונים שיש בהם לקוח.</p>
          </div>
          <div className="actions">
            <button className="primary-btn" type="button" onClick={() => setShowCloseForm(current => !current)}>
              <Plus size={16} /> הוסף סגירה
            </button>
            <span className="pill check">{upcomingArrivals.length} כניסות קרובות</span>
          </div>
        </div>
        {showCloseForm && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            <SelectField
              label="מתחם"
              value={closeForm.complexId}
              options={activeComplexes.map(complex => complex.id)}
              labels={Object.fromEntries(activeComplexes.map(complex => [complex.id, complex.name]))}
              onChange={value => setCloseForm(current => ({ ...current, complexId: value }))}
              error={showCloseFormErrors ? closeFormValidation.complexId : undefined}
            />
            <DateField
              label="כניסה"
              value={closeForm.startDate}
              min=""
              onChange={value => setCloseForm(current => ({
                ...current,
                startDate: value,
                endDate: current.endDate < value ? '' : current.endDate,
              }))}
              error={showCloseFormErrors ? closeFormValidation.startDate : undefined}
            />
            <DateField
              label="יציאה"
              value={closeForm.endDate}
              min={closeForm.startDate}
              onChange={value => setCloseForm(current => ({ ...current, endDate: value }))}
              error={showCloseFormErrors ? closeFormValidation.endDate : undefined}
            />
            <Field label="שם לקוח" value={closeForm.customerName} onChange={value => setCloseForm(current => ({ ...current, customerName: value }))} />
            <Field label="טלפון" value={closeForm.customerPhone} onChange={value => setCloseForm(current => ({ ...current, customerPhone: value }))} />
            <Field label="עמלה שלקחנו" value={closeForm.commissionAmount} onChange={value => setCloseForm(current => ({ ...current, commissionAmount: value }))} placeholder="לדוגמה: 1,500" />
            <label className="owner-select">
              <input
                type="checkbox"
                checked={closeForm.commissionPaid}
                onChange={event => setCloseForm(current => ({ ...current, commissionPaid: event.target.checked }))}
              />
              <span>העמלה שולמה</span>
            </label>
            <SelectField
              label="חשבונית"
              value={closeForm.invoiceStatus}
              options={Object.keys(invoiceStatusLabels)}
              labels={invoiceStatusLabels}
              onChange={value => setCloseForm(current => ({ ...current, invoiceStatus: value as InvoiceStatus }))}
            />
            <Field className="full" label="הערה" value={closeForm.note} onChange={value => setCloseForm(current => ({ ...current, note: value }))} />
            {closeFormError && <p className="form-error full">{closeFormError}</p>}
            <div className="actions full">
              <button className="primary-btn" type="button" onClick={saveCloseBlock}>שמור סגירה</button>
              <button className="ghost-btn" type="button" onClick={() => setShowCloseForm(false)}>ביטול</button>
            </div>
          </div>
        )}
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="secondary-btn" type="button" onClick={requestNotifications} disabled={notificationStatus === 'granted' || notificationStatus === 'unsupported'}>
            <BellRing size={16} /> {notificationStatus === 'granted' ? 'התראות פעילות' : 'הפעל התראות'}
          </button>
          {notificationStatus === 'unsupported' && <span className="muted">הדפדפן הזה לא תומך בהתראות.</span>}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">תזכורות להיום</h2>
        <div className="list">
          {reminders.length === 0 && <p className="muted">אין תזכורות להיום.</p>}
          {reminders.map(event => (
            <StayEventItem event={event} key={event.id} reminder />
          ))}
        </div>
      </section>

      <section className="grid content-grid">
        <div className="card">
          <h2 className="section-title">כניסות קרובות</h2>
          <div className="list">
            {upcomingArrivals.length === 0 && <p className="muted">אין כניסות קרובות.</p>}
            {upcomingArrivals.map((event, index) => {
              const block = state.availabilityBlocks.find(item => item.id === event.blockId);
              if (!block) return <StayEventItem event={event} key={event.id} />;
              const isEditing = editingArrivalId === block.id;
              const isNewDateGroup = index === 0 || upcomingArrivals[index - 1]?.date !== event.date;

              return (
                <div className="arrival-date-group" key={event.id}>
                  {isNewDateGroup && (
                    <div className="date-group-label">
                      {formatGregorianDate(event.date)}
                      <span>{upcomingArrivals.filter(item => item.date === event.date).length} כניסות</span>
                    </div>
                  )}
                  <div className="list-item stay-event arrival">
                    <div className="item-head">
                      <div>
                        <p className="item-title">כניסה: {block.customerName || 'לקוח ללא שם'}</p>
                        <span className="muted">{formatDateLine(block.startDate, block.endDate)} · {event.complexName}</span>
                      </div>
                      <span className="pill available">כניסה</span>
                    </div>
                    {isEditing && editingArrivalDraft ? (
                      <div className="form-grid">
                        <SelectField
                          label="מתחם"
                          value={editingArrivalDraft.complexId}
                          options={activeComplexes.map(complex => complex.id)}
                          labels={Object.fromEntries(activeComplexes.map(complex => [complex.id, complex.name]))}
                          onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, complexId: value }) : current)}
                        />
                        <DateField
                          label="כניסה"
                          value={editingArrivalDraft.startDate}
                          min=""
                          onChange={value => setEditingArrivalDraft(current => current ? ({
                            ...current,
                            startDate: value,
                            endDate: current.endDate < value ? '' : current.endDate,
                          }) : current)}
                        />
                        <DateField
                          label="יציאה"
                          value={editingArrivalDraft.endDate}
                          min={editingArrivalDraft.startDate}
                          onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, endDate: value }) : current)}
                        />
                        <Field label="שם לקוח" value={editingArrivalDraft.customerName ?? ''} onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, customerName: value }) : current)} />
                        <Field label="טלפון" value={editingArrivalDraft.customerPhone ?? ''} onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, customerPhone: value }) : current)} />
                        <Field label="עמלה" value={editingArrivalDraft.commissionAmount ?? ''} onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, commissionAmount: value }) : current)} />
                        <label className="owner-select">
                          <input
                            type="checkbox"
                            checked={Boolean(editingArrivalDraft.commissionPaid)}
                            onChange={change => setEditingArrivalDraft(current => current ? ({ ...current, commissionPaid: change.target.checked }) : current)}
                          />
                          <span>שולם</span>
                        </label>
                        <SelectField
                          label="חשבונית"
                          value={editingArrivalDraft.invoiceStatus ?? 'not_sent'}
                          options={Object.keys(invoiceStatusLabels)}
                          labels={invoiceStatusLabels}
                          onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, invoiceStatus: value as InvoiceStatus }) : current)}
                        />
                        <Field className="full" label="הערה" value={editingArrivalDraft.note ?? ''} onChange={value => setEditingArrivalDraft(current => current ? ({ ...current, note: value }) : current)} />
                        {editingArrivalError && <p className="form-error full">{editingArrivalError}</p>}
                        <div className="actions full">
                          <button className="primary-btn" type="button" onClick={() => saveEditingArrival(block)}>שמור שינויים</button>
                          <button className="ghost-btn" type="button" onClick={cancelEditingArrival}>ביטול</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {block.customerPhone && <span className="muted">{block.customerPhone}</span>}
                        {(block.commissionAmount || block.commissionPaid || block.invoiceSent || block.invoiceStatus === 'end_of_stay') && (
                          <span className="muted">
                            {[
                              block.commissionAmount ? `עמלה: ${block.commissionAmount}` : '',
                              block.commissionPaid ? 'שולם' : '',
                              block.invoiceStatus === 'end_of_stay' ? 'תזכורת: לשלוח חשבונית בסוף השהות' : '',
                              block.invoiceSent || block.invoiceStatus === 'sent' ? 'נשלחה חשבונית' : '',
                            ].filter(Boolean).join(' · ')}
                          </span>
                        )}
                        {block.note && <span className="muted">{block.note}</span>}
                        <div className="actions lead-actions">
                          {block.customerPhone && (
                            <a className="secondary-btn icon-only" href={`tel:${block.customerPhone}`} title="שיחה" aria-label={`שיחה אל ${block.customerName || 'לקוח'}`}>
                              <Phone size={17} />
                            </a>
                          )}
                          <button className="ghost-btn" type="button" onClick={() => startEditingArrival(block)}>
                            <Pencil size={17} />
                            עריכה
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="item-head">
            <button className="ghost-btn" type="button" onClick={() => moveMonth(-1)}>הקודם</button>
            <h2 className="section-title">{new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))}</h2>
            <button className="ghost-btn" type="button" onClick={() => moveMonth(1)}>הבא</button>
          </div>
          <div className="calendar stay-calendar">
            <div className="calendar-head">
              {HEBREW_WEEKDAYS_SHORT.map(day => <span key={day}>{day}</span>)}
            </div>
            {grid.map((week, weekIndex) => (
              <div className="calendar-row" key={weekIndex}>
                {week.map((day, dayIndex) => {
                  if (!day) return <span key={dayIndex} />;
                  const dateStr = toYMD(day);
                  const dayEvents = eventsByDate[dateStr] ?? [];
                  const arrivalEvents = dayEvents.filter(event => event.type === 'arrival');
                  const departureEvents = dayEvents.filter(event => event.type === 'departure');
                  return (
                    <div className={`day stay-day ${dayEvents.length ? 'has-stays' : ''}`} key={dateStr}>
                      <span>{day.getDate()}</span>
                      {arrivalEvents.length > 0 && (
                        <small className="arrival" title={arrivalEvents.map(event => event.complexName).join(', ')}>
                          {arrivalEvents.length === 1 ? `כניסה: ${arrivalEvents[0].complexName}` : `${arrivalEvents.length} כניסות`}
                        </small>
                      )}
                      {departureEvents.length > 0 && (
                        <small className="departure" title={departureEvents.map(event => event.complexName).join(', ')}>
                          {departureEvents.length === 1 ? `יציאה: ${departureEvents[0].complexName}` : `${departureEvents.length} יציאות`}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="item-head">
          <div>
            <h2 className="section-title">רשימת סגירות</h2>
            <p className="muted">כאן אפשר לעדכן סטטוס, עמלה, תשלום וחשבונית לסגירות קיימות.</p>
          </div>
          <span className="pill check">{closureBlocks.length} סגירות</span>
        </div>
        <div className="catalog-preview" style={{ marginTop: 12 }}>
          <p className="metric-label">עוד כסף שאמור להיכנס</p>
          <p className="metric-value" style={{ margin: '4px 0' }}>{formatMoneyAmount(moneyToCollect)}</p>
          <p className="muted" style={{ margin: 0 }}>
            מחושב מתוך {unpaidCommissionBlocks.length} סגירות עם עמלה שעדיין לא סומנה כשולמה.
          </p>
        </div>
        <div className="list" style={{ marginTop: 12 }}>
          {closureBlocks.length === 0 && <p className="muted">אין סגירות להצגה.</p>}
          {closureBlocks.map(block => {
            const complex = state.complexes.find(item => item.id === block.complexId);
            const isExpanded = expandedClosureIds.includes(block.id);
            const summary = [
              block.commissionAmount ? `עמלה: ${block.commissionAmount}` : '',
              block.commissionPaid ? 'שולם' : '',
              block.invoiceStatus === 'end_of_stay' ? 'חשבונית בסוף השהות' : '',
              block.invoiceSent || block.invoiceStatus === 'sent' ? 'נשלחה חשבונית' : '',
            ].filter(Boolean).join(' · ');

            return (
              <div className={`list-item closure-item ${isExpanded ? 'expanded' : 'collapsed'}`} key={block.id}>
                <div className="item-head">
                  <div>
                    <p className="item-title">{block.customerName || 'סגירה ללא שם'}</p>
                    <span className="muted">{complex?.name ?? 'מתחם'} · {formatDateLine(block.startDate, block.endDate)}</span>
                    {summary && <span className="muted">{summary}</span>}
                  </div>
                  <div className="actions">
                    <span className={`pill ${block.status}`}>{statusLabels[block.status]}</span>
                    <button
                      className="ghost-btn icon-only catalog-toggle"
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={isExpanded ? 'סגור פרטי סגירה' : 'פתח פרטי סגירה'}
                      title={isExpanded ? 'סגירת פרטים' : 'פתיחת פרטים'}
                      onClick={() => toggleClosureDetails(block.id)}
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="closure-details">
                    {block.customerPhone && <span className="muted">{block.customerPhone}</span>}
                    {block.note && <span className="muted">{block.note}</span>}
                    <div className="form-grid">
                      <SelectField
                        label="סטטוס"
                        value={block.status}
                        options={['booked', 'tentative', 'offered', 'check', 'maintenance']}
                        labels={statusLabels}
                        onChange={value => updateClosureBlock(block, { status: value as AvailabilityStatus })}
                      />
                      <Field
                        label="עמלה"
                        value={block.commissionAmount ?? ''}
                        onChange={value => updateClosureBlock(block, { commissionAmount: value })}
                        placeholder="לדוגמה: 1,500"
                      />
                      <label className="owner-select">
                        <input
                          type="checkbox"
                          checked={Boolean(block.commissionPaid)}
                          onChange={event => updateClosureBlock(block, { commissionPaid: event.target.checked })}
                        />
                        <span>שולם</span>
                      </label>
                      <SelectField
                        label="חשבונית"
                        value={block.invoiceStatus ?? (block.invoiceSent ? 'sent' : 'not_sent')}
                        options={Object.keys(invoiceStatusLabels)}
                        labels={invoiceStatusLabels}
                        onChange={value => updateClosureBlock(block, { invoiceStatus: value as InvoiceStatus, invoiceSent: value === 'sent' })}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StayEventItem({ event, reminder = false }: { event: StayEvent; reminder?: boolean }) {
  const typeLabel = event.type === 'arrival' ? 'כניסה' : 'יציאה';
  const reminderLabel = event.date === todayYMD() ? 'היום' : 'בעוד 3 ימים';

  return (
    <div className={`list-item stay-event ${event.type}`}>
      <div className="item-head">
        <div>
          <p className="item-title">{typeLabel}: {event.customerName}</p>
          <span className="muted">{formatDateLine(event.date)} · {event.complexName}</span>
        </div>
        <span className={`pill ${event.type === 'arrival' ? 'available' : 'check'}`}>{reminder ? reminderLabel : typeLabel}</span>
      </div>
      {event.customerPhone && <span className="muted">{event.customerPhone}</span>}
      {(event.commissionAmount || event.commissionPaid || event.invoiceSent || event.invoiceStatus === 'end_of_stay') && (
        <span className="muted">
          {[
            event.commissionAmount ? `עמלה: ${event.commissionAmount}` : '',
            event.commissionPaid ? 'שולם' : '',
            event.invoiceStatus === 'end_of_stay' ? 'תזכורת: לשלוח חשבונית בסוף השהות' : '',
            event.invoiceSent || event.invoiceStatus === 'sent' ? 'נשלחה חשבונית' : '',
          ].filter(Boolean).join(' · ')}
        </span>
      )}
      {event.note && <span className="muted">{event.note}</span>}
      {event.customerPhone && (
        <div className="actions">
          <a className="secondary-btn" href={`tel:${event.customerPhone}`}><Phone size={15} /> שיחה</a>
        </div>
      )}
    </div>
  );
}

function CalendarView({ state, persist, session }: { state: AppState; persist: (state: AppState) => void; session: CloudSession | null }) {
  const now = new Date();
  const [complexId, setComplexId] = useState(state.complexes[0]?.id ?? '');
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [status, setStatus] = useState<AvailabilityStatus>('booked');
  const [selectedDate, setSelectedDate] = useState(todayYMD());
  const [rangeForm, setRangeForm] = useState({
    startDate: todayYMD(),
    endDate: '',
    note: '',
  });
  const selected = state.complexes.find(complex => complex.id === complexId);
  const grid = getMonthGrid(year, month);
  const blocks = state.availabilityBlocks.filter(block => block.complexId === complexId);
  const selectedDateEnd = useMemo(() => {
    const [dateYear, dateMonth, dateDay] = selectedDate.split('-').map(Number);
    return toYMD(new Date(dateYear, dateMonth - 1, dateDay + 1));
  }, [selectedDate]);
  const dailyAvailability = useMemo(() => (
    state.complexes
      .filter(complex => complex.active)
      .map(complex => {
        const block = state.availabilityBlocks.find(item =>
          item.complexId === complex.id &&
          item.status !== 'available' &&
          hasDateConflict(item, selectedDate, selectedDateEnd)
        );

        return { complex, block };
      })
  ), [selectedDate, selectedDateEnd, state.availabilityBlocks, state.complexes]);
  const freeComplexes = dailyAvailability.filter(item => !item.block);

  const saveBlock = async (blockData: {
    complexId: string;
    startDate: string;
    endDate: string;
    status: AvailabilityStatus;
    customerName?: string;
    customerPhone?: string;
    note?: string;
  }) => {
    if (session) {
      const block = await insertCloudAvailability(session, blockData);
      persist({ ...state, availabilityBlocks: [...state.availabilityBlocks, block] });
      return;
    }

    const next = createAvailabilityBlock(state, blockData);
    persist(next);
  };

  const selectDay = (date: Date) => {
    const dateStr = toYMD(date);
    if (isPastDate(dateStr)) return;
    const endDate = toYMD(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));

    setSelectedDate(dateStr);
    setRangeForm(current => ({
      ...current,
      startDate: dateStr,
      endDate,
    }));
  };

  const markSelectedDay = async () => {
    if (isPastDate(selectedDate)) return;

    await saveBlock({
      complexId,
      startDate: selectedDate,
      endDate: selectedDateEnd,
      status,
      note: rangeForm.note || (status === 'booked' ? 'תפוס אצל בעל הוילה' : 'סומן כפנוי'),
    });
  };

  const saveRange = async () => {
    if (!rangeForm.startDate || !rangeForm.endDate || rangeForm.endDate < rangeForm.startDate || isPastDate(rangeForm.startDate)) return;

    await saveBlock({
      complexId,
      startDate: rangeForm.startDate,
      endDate: rangeForm.endDate,
      status,
      note: rangeForm.note || (status === 'booked' ? 'תפוס אצל בעל הוילה' : 'סומן כפנוי'),
    });

    setRangeForm(current => ({ ...current, note: '' }));
  };

  const deleteBlock = async (blockId: string) => {
    if (!window.confirm('למחוק את הסימון/הלקוח הזה מהלוח?')) return;

    persist({
      ...state,
      availabilityBlocks: state.availabilityBlocks.filter(block => block.id !== blockId),
    });

    if (session) {
      try {
        await deleteCloudAvailability(session, blockId);
      } catch {
        // The local deletion keeps the screen responsive. A later cloud refresh may restore it if the cloud rejected the delete.
      }
    }
  };

  const moveMonth = (direction: -1 | 1) => {
    const next = new Date(year, month + direction, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">לוח זמינות לפי מתחם</h2>
        <div className="form-grid">
          <SelectField label="מתחם" value={complexId} options={state.complexes.map(complex => complex.id)} labels={Object.fromEntries(state.complexes.map(complex => [complex.id, complex.name]))} onChange={setComplexId} />
          <SelectField label="סימון" value={status} options={['booked', 'available']} labels={statusLabels} onChange={value => setStatus(value as AvailabilityStatus)} />
        </div>
        {selected && <p className="muted">{selected.city} · {selected.rooms} חדרים · עד {selected.maxGuests} אורחים</p>}
      </section>

      <section className="card">
        <div className="item-head">
          <h2 className="section-title">סימון טווח אירוח</h2>
          <span className={`pill ${status}`}>{statusLabels[status]}</span>
        </div>
        <div className="form-grid">
          <DateField
            label="כניסה"
            value={rangeForm.startDate}
            min={todayYMD()}
            onChange={value => setRangeForm(current => ({
              ...current,
              startDate: value,
              endDate: current.endDate < value ? '' : current.endDate,
            }))}
          />
          <DateField
            label="יציאה"
            value={rangeForm.endDate}
            min={rangeForm.startDate || todayYMD()}
            onChange={value => setRangeForm(current => ({ ...current, endDate: value }))}
          />
          <Field
            className="full"
            label="הערה פנימית"
            value={rangeForm.note}
            onChange={value => setRangeForm(current => ({ ...current, note: value }))}
            placeholder={status === 'booked' ? 'לדוגמה: תפוס אצל בעל הוילה' : 'לדוגמה: בעל המתחם אישר שפנוי'}
          />
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="primary-btn" type="button" onClick={saveRange}>שמור טווח</button>
          <button className="secondary-btn" type="button" onClick={markSelectedDay}>סמן את היום שנבחר</button>
          <span className="muted">לחיצה על יום בלוח בודקת מי פנוי באותו תאריך וממלאת את טווח הסימון.</span>
        </div>
      </section>

      <section className="card">
        <div className="item-head">
          <button className="ghost-btn" type="button" onClick={() => moveMonth(-1)}>הקודם</button>
          <h2 className="section-title">{new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(new Date(year, month, 1))}</h2>
          <button className="ghost-btn" type="button" onClick={() => moveMonth(1)}>הבא</button>
        </div>
        <div className="calendar">
          <div className="calendar-head">
            {HEBREW_WEEKDAYS_SHORT.map(day => <span key={day}>{day}</span>)}
          </div>
          {grid.map((week, weekIndex) => (
            <div className="calendar-row" key={weekIndex}>
              {week.map((day, dayIndex) => {
                if (!day) return <span key={dayIndex} />;
                const dateStr = toYMD(day);
                const block = blocks.find(item => hasDateConflict(item, dateStr, toYMD(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1))));
                const className = [
                  'day',
                  isPastDate(dateStr) ? 'past' : '',
                  dateStr === selectedDate ? 'selected' : '',
                  block?.status === 'available' ? 'free' : '',
                  block?.status === 'booked' ? 'busy' : '',
                  block && block.status !== 'available' && block.status !== 'booked' ? 'pending' : '',
                ].filter(Boolean).join(' ');
                return (
                  <button className={className} disabled={isPastDate(dateStr)} key={dateStr} type="button" onClick={() => selectDay(day)} title={`בדיקת זמינות: ${formatDateLine(dateStr)}`}>
                    <span>{day.getDate()}</span>
                    <small>{formatHebrewDate(dateStr).split(' ').slice(0, 2).join(' ')}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="item-head">
          <div>
            <h2 className="section-title">בדיקת זמינות לתאריך</h2>
            <p className="muted">{formatDateLine(selectedDate)}</p>
          </div>
          <span className="pill available">{freeComplexes.length} פנויים</span>
        </div>
        <div className="availability-grid">
          {dailyAvailability.map(({ complex, block }) => {
            const isFree = !block;

            return (
              <div className={`availability-item ${isFree ? 'free' : 'blocked'}`} key={complex.id}>
                <div className="item-head">
                  <div>
                    <p className="item-title">{complex.name}</p>
                    <span className="muted">{complex.city} · עד {complex.maxGuests} אורחים · {complex.rooms} חדרים</span>
                  </div>
                  <span className={`pill ${isFree ? 'available' : block.status}`}>
                    {isFree ? 'פנוי בוודאות' : statusLabels[block.status]}
                  </span>
                </div>
                {block?.customerName && <span className="muted">{block.customerName}{block.customerPhone ? ` · ${block.customerPhone}` : ''}</span>}
                {block?.note && <span className="muted">{block.note}</span>}
                <div className="actions">
                  <button
                    className={isFree ? 'primary-btn' : 'secondary-btn'}
                    type="button"
                    onClick={() => {
                      setComplexId(complex.id);
                      setRangeForm(current => ({
                        ...current,
                        startDate: selectedDate,
                        endDate: selectedDateEnd,
                      }));
                    }}
                  >
                    בחר לסימון
                  </button>
                  {complex.ownerPhone && <a className="ghost-btn" href={`tel:${complex.ownerPhone}`}>התקשר לבעל מתחם</a>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">סימונים קיימים</h2>
        <div className="list">
          {byDate(blocks).filter(block => block.endDate >= todayYMD()).map(block => (
            <div className="list-item" key={block.id}>
              <div className="item-head">
                <div>
                  <p className="item-title">{formatDateLine(block.startDate, block.endDate)}</p>
                  {block.customerName && <span className="muted">{block.customerName}{block.customerPhone ? ` · ${block.customerPhone}` : ''}</span>}
                </div>
                <span className={`pill ${block.status}`}>{statusLabels[block.status]}</span>
              </div>
              {block.note && <span className="muted">{block.note}</span>}
              <div className="actions">
                <button className="ghost-btn danger-btn" type="button" onClick={() => deleteBlock(block.id)}>
                  <Trash2 size={15} /> מחק
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function LeadsView({ state, persist, session }: { state: AppState; persist: (state: AppState) => void; session: CloudSession | null }) {
  const [dateMode, setDateMode] = useState<'dates' | 'parsha'>('dates');
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    startDate: todayYMD(),
    endDate: '',
    parsha: '',
    guests: '20',
    areaPreference: 'לא משנה',
    vacationType: 'שבת חתן',
    budget: '',
    notes: '',
    status: 'new' as LeadStatus,
  });

  const resetLeadForm = () => {
    setEditingLeadId(null);
    setDateMode('dates');
    setForm({
      customerName: '',
      customerPhone: '',
      startDate: todayYMD(),
      endDate: '',
      parsha: '',
      guests: '20',
      areaPreference: 'לא משנה',
      vacationType: 'שבת חתן',
      budget: '',
      notes: '',
      status: 'new',
    });
  };

  const saveLead = async () => {
    const hasDates = Boolean(form.startDate && form.endDate && form.endDate >= form.startDate);
    const hasParsha = Boolean(form.parsha.trim());
    if (!form.customerPhone || (dateMode === 'dates' && !hasDates) || (dateMode === 'parsha' && !hasParsha)) return;
    const existingLead = editingLeadId ? state.leads.find(lead => lead.id === editingLeadId) : undefined;
    const leadData = {
      customerName: form.customerName || 'לקוח ללא שם',
      customerPhone: form.customerPhone,
      startDate: dateMode === 'dates' ? form.startDate : undefined,
      endDate: dateMode === 'dates' ? form.endDate : undefined,
      parsha: dateMode === 'parsha' ? form.parsha.trim() : undefined,
      guests: Number(form.guests || 0),
      areaPreference: form.areaPreference,
      vacationType: form.vacationType,
      budget: form.budget,
      notes: form.notes,
      status: form.status,
    };

    if (existingLead) {
      const updatedLead = {
        ...existingLead,
        ...leadData,
        updatedAt: new Date().toISOString(),
      };

      if (session) {
        const cloudLead = await updateCloudLead(session, updatedLead);
        persist({ ...state, leads: state.leads.map(lead => lead.id === cloudLead.id ? cloudLead : lead) });
        resetLeadForm();
        return;
      }

      persist({ ...state, leads: state.leads.map(lead => lead.id === updatedLead.id ? updatedLead : lead) });
      resetLeadForm();
      return;
    }

    if (session) {
      const lead = await insertCloudLead(session, leadData);
      persist({ ...state, leads: [lead, ...state.leads] });
      resetLeadForm();
      return;
    }

    const next = createLead(state, {
      ...leadData,
    });
    persist(next);
    resetLeadForm();
  };

  const editLead = (leadId: string) => {
    const lead = state.leads.find(item => item.id === leadId);
    if (!lead) return;

    setEditingLeadId(lead.id);
    setDateMode(lead.parsha ? 'parsha' : 'dates');
    setForm({
      customerName: lead.customerName,
      customerPhone: lead.customerPhone,
      startDate: lead.startDate ?? todayYMD(),
      endDate: lead.endDate ?? '',
      parsha: lead.parsha ?? '',
      guests: String(lead.guests || 0),
      areaPreference: lead.areaPreference,
      vacationType: lead.vacationType,
      budget: lead.budget ?? '',
      notes: lead.notes ?? '',
      status: lead.status,
    });
  };

  const deleteLead = async (leadId: string) => {
    if (!window.confirm('למחוק את הפנייה הזו?')) return;

    persist({
      ...state,
      leads: state.leads.filter(lead => lead.id !== leadId),
      leadOffers: state.leadOffers.filter(offer => offer.leadId !== leadId),
      availabilityBlocks: state.availabilityBlocks.map(block => block.leadId === leadId ? { ...block, leadId: undefined } : block),
      tasks: state.tasks.map(task => task.leadId === leadId ? { ...task, leadId: undefined } : task),
    });

    if (session) {
      try {
        await deleteCloudLead(session, leadId);
      } catch {
        // Local deletion keeps the app moving. If Supabase rejects the delete, the item can reappear after a full cloud refresh.
      }
    }
  };

  const shareLead = async (lead: Lead) => {
    const text = buildLeadShareText(lead);
    const title = `פנייה: ${lead.customerName}`;
    const shareApi = navigator as Navigator & {
      share?: (data: { title?: string; text?: string }) => Promise<void>;
      clipboard?: Navigator['clipboard'];
    };

    if (shareApi.share) {
      try {
        await shareApi.share({ title, text });
        return;
      } catch {
        return;
      }
    }

    await navigator.clipboard?.writeText(text);
    window.alert('פרטי הפנייה הועתקו ללוח.');
  };

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">{editingLeadId ? 'עריכת פנייה' : 'פנייה חדשה'}</h2>
        <div className="form-grid">
          <Field label="שם" value={form.customerName} onChange={value => setForm({ ...form, customerName: value })} />
          <Field label="טלפון" value={form.customerPhone} onChange={value => setForm({ ...form, customerPhone: value })} />
          <SelectField label="לפי" value={dateMode} options={['dates', 'parsha']} labels={{ dates: 'תאריך', parsha: 'פרשה' }} onChange={value => setDateMode(value as 'dates' | 'parsha')} />
          {dateMode === 'dates' ? (
            <>
              <DateField label="כניסה" value={form.startDate} min={todayYMD()} onChange={value => setForm({ ...form, startDate: value, endDate: form.endDate < value ? '' : form.endDate })} />
              <DateField label="יציאה" value={form.endDate} min={form.startDate || todayYMD()} onChange={value => setForm({ ...form, endDate: value })} />
            </>
          ) : (
            <Field label="פרשה" value={form.parsha} onChange={value => setForm({ ...form, parsha: value })} placeholder="לדוגמה: פרשת נח" />
          )}
          <Field label="אורחים" value={form.guests} type="number" min="1" onChange={value => setForm({ ...form, guests: value })} />
          <Field label="תקציב" value={form.budget} onChange={value => setForm({ ...form, budget: value })} />
          <SelectField
            label="סטטוס"
            value={form.status}
            options={Object.keys(leadStatusLabels)}
            labels={leadStatusLabels}
            onChange={value => setForm({ ...form, status: value as LeadStatus })}
          />
          <Field className="full" label="הערות" value={form.notes} onChange={value => setForm({ ...form, notes: value })} />
        </div>
        <div className="actions" style={{ marginTop: 12 }}>
          <button className="primary-btn" type="button" onClick={saveLead}>
            <Plus size={16} /> {editingLeadId ? 'עדכן פנייה' : 'שמור פנייה'}
          </button>
          {editingLeadId && (
            <button className="secondary-btn" type="button" onClick={resetLeadForm}>
              ביטול עריכה
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">פניות</h2>
        <div className="list">
          {state.leads.map(lead => (
            <div className="list-item" key={lead.id}>
              <div className="item-head">
                <p className="item-title">{lead.customerName}</p>
                <span className="pill offered">{leadStatusLabels[lead.status]}</span>
              </div>
              <span className="muted">{lead.parsha ? `פרשה: ${lead.parsha}` : lead.startDate ? formatDateLine(lead.startDate, lead.endDate) : 'תאריך לא נקבע'}</span>
              <span className="muted">{lead.customerPhone} · {lead.guests} אורחים · {lead.vacationType}</span>
              {lead.notes && <span className="muted">{lead.notes}</span>}
              <div className="actions lead-actions">
                <a className="secondary-btn icon-only" href={`tel:${lead.customerPhone}`} title="שיחה" aria-label={`שיחה אל ${lead.customerName}`}>
                  <Phone size={17} />
                </a>
                <button className="ghost-btn icon-only" type="button" onClick={() => shareLead(lead)} title="שיתוף פנייה" aria-label={`שיתוף פנייה של ${lead.customerName}`}>
                  <Share2 size={17} />
                </button>
                <button className="ghost-btn icon-only" type="button" onClick={() => editLead(lead.id)} title="עריכה" aria-label={`עריכת פנייה של ${lead.customerName}`}>
                  <Pencil size={17} />
                </button>
                <button className="ghost-btn danger-btn icon-only" type="button" onClick={() => deleteLead(lead.id)} title="מחיקה" aria-label={`מחיקת פנייה של ${lead.customerName}`}>
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TasksView({ state, persist, session }: { state: AppState; persist: (state: AppState) => void; session: CloudSession | null }) {
  const [title, setTitle] = useState('');
  const [showDoneTasks, setShowDoneTasks] = useState(false);
  const openTasks = state.tasks.filter(task => task.status === 'open');
  const doneTasks = state.tasks.filter(task => task.status === 'done');

  const addTask = async () => {
    if (!title.trim()) return;
    const taskData = { title: title.trim(), dueDate: todayYMD() };

    if (session) {
      const task = await insertCloudTask(session, taskData);
      persist({ ...state, tasks: [task, ...state.tasks] });
      setTitle('');
      return;
    }

    persist(createTask(state, taskData));
    setTitle('');
  };

  const closeTask = async (taskId: string) => {
    if (session) await updateCloudTaskStatus(session, taskId, 'done');
    persist({ ...state, tasks: state.tasks.map(item => item.id === taskId ? { ...item, status: 'done' } : item) });
  };

  return (
    <div className="grid">
      <section className="card">
        <h2 className="section-title">משימה חדשה</h2>
        <div className="actions">
          <input className="input" value={title} onChange={event => setTitle(event.target.value)} placeholder="לדוגמה: לבדוק מחיר לשבת הקרובה" />
          <button className="primary-btn" type="button" onClick={addTask}>הוסף</button>
        </div>
      </section>

      <section className="card">
        <div className="item-head">
          <h2 className="section-title">משימות פתוחות</h2>
          <span className="pill check">{openTasks.length} פתוחות</span>
        </div>
        <div className="list">
          {openTasks.length === 0 && <p className="muted">אין משימות פתוחות.</p>}
          {openTasks.map(task => (
            <div className="list-item" key={task.id}>
              <div className="item-head">
                <p className="item-title">{task.title}</p>
                <button className="ghost-btn" type="button" onClick={() => closeTask(task.id)}>
                  <CheckCircle2 size={16} /> בוצע
                </button>
              </div>
              <span className="muted">לתאריך: {formatGregorianDate(task.dueDate)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="item-head">
          <div>
            <h2 className="section-title">משימות שבוצעו</h2>
            <p className="muted">הן יורדות מהרשימה הראשית ונשמרות כאן לבדיקה מאוחרת.</p>
          </div>
          <button className="secondary-btn" type="button" onClick={() => setShowDoneTasks(current => !current)}>
            {showDoneTasks ? 'הסתר' : 'הצג'} ({doneTasks.length})
          </button>
        </div>
        {showDoneTasks && (
          <div className="list" style={{ marginTop: 12 }}>
            {doneTasks.length === 0 && <p className="muted">עוד אין משימות שבוצעו.</p>}
            {doneTasks.map(task => (
              <div className="list-item" key={task.id}>
                <div className="item-head">
                  <p className="item-title">{task.title}</p>
                  <span className="pill available">בוצע</span>
                </div>
                <span className="muted">לתאריך: {formatGregorianDate(task.dueDate)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  min,
  placeholder,
  className = '',
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  placeholder?: string;
  className?: string;
  error?: string;
}) {
  return (
    <label className={`field ${className}`}>
      <span className="label">{label}</span>
      <input className={`input ${error ? 'input-error' : ''}`} value={value} type={type} min={min} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function DateField({ label, value, min, onChange, error }: { label: string; value: string; min?: string; onChange: (value: string) => void; error?: string }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input className={`input ${error ? 'input-error' : ''}`} type="date" value={value} min={min} onChange={event => onChange(event.target.value)} />
      {value && <span className="muted">{formatHebrewDate(value)}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  labels,
  onChange,
  error,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <select className={`input ${error ? 'input-error' : ''}`} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}
      </select>
      {error && <span className="field-error">{error}</span>}
    </label>
  );
}

export default App;

