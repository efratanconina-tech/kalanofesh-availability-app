const HEBREW_UNITS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const HEBREW_TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const HEBREW_HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];

export const HEBREW_WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function todayYMD(): string {
  const date = new Date();
  return toYMD(date);
}

export function toYMD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseYMD(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function addHebrewPunctuation(value: string, singleMark = true): string {
  if (!value) return '';
  if (value.length === 1) return singleMark ? `${value}׳` : value;
  return `${value.slice(0, -1)}״${value.slice(-1)}`;
}

function hebrewNumber(value: number, singleMark = true): string {
  let remaining = value;
  let result = '';

  while (remaining >= 400) {
    result += 'ת';
    remaining -= 400;
  }

  result += HEBREW_HUNDREDS[Math.floor(remaining / 100)] ?? '';
  remaining %= 100;

  if (remaining === 15) {
    result += 'טו';
  } else if (remaining === 16) {
    result += 'טז';
  } else {
    result += HEBREW_TENS[Math.floor(remaining / 10)] ?? '';
    result += HEBREW_UNITS[remaining % 10] ?? '';
  }

  return addHebrewPunctuation(result, singleMark);
}

function getHebrewDateParts(date: Date): { day: number; month: string; year: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(date);

    const day = Number(parts.find(part => part.type === 'day')?.value);
    const month = parts.find(part => part.type === 'month')?.value ?? '';
    const year = Number(parts.find(part => part.type === 'year')?.value);

    if (!day || !month || !year) return null;
    return { day, month, year };
  } catch {
    return null;
  }
}

export function formatGregorianDate(value: string): string {
  const date = parseYMD(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function formatHebrewDate(value: string): string {
  const date = parseYMD(value);
  if (!date) return '';
  const parts = getHebrewDateParts(date);
  if (!parts) return '';
  const year = parts.year >= 5000 && parts.year < 6000 ? parts.year - 5000 : parts.year;
  return `${hebrewNumber(parts.day)} ${parts.month} ${hebrewNumber(year, false)}`;
}

export function formatDateLine(start: string, end?: string): string {
  const first = `${formatGregorianDate(start)} · ${formatHebrewDate(start)}`;
  if (!end) return first;
  return `${first} - ${formatGregorianDate(end)} · ${formatHebrewDate(end)}`;
}

export function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: (Date | null)[] = Array(first.getDay()).fill(null);

  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    rows.push(cells.slice(index, index + 7));
  }

  return rows;
}

export function isPastDate(value: string): boolean {
  return value < todayYMD();
}
