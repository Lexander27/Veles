// All dates in the app are local calendar days stored as 'YYYY-MM-DD' strings.
// Weeks start on Monday.

export type DateStr = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayStr(): DateStr {
  return toDateStr(new Date());
}

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function addMonths(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toDateStr(d);
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: DateStr, b: DateStr): number {
  const ms = parseDate(b).getTime() - parseDate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** Monday = 0 … Sunday = 6 */
export function weekdayMon(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export interface MonthCell {
  date: DateStr;
  day: number;
  inMonth: boolean;
}

/** Calendar grid for a month, Monday-first, only as many weeks as needed (4–6). */
export function monthGrid(year: number, month: number): MonthCell[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = weekdayMon(first);
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells: MonthCell[] = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(year, month, 1 - lead + i);
    cells.push({ date: toDateStr(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return cells;
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function monthName(month: number): string {
  return MONTHS[month];
}

/** "Tuesday, 3 Nov" */
export function formatLong(s: DateStr): string {
  const d = parseDate(s);
  return `${WEEKDAYS[weekdayMon(d)]}, ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "3 Nov 2026" */
export function formatShort(s: DateStr, withYear = true): string {
  const d = parseDate(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${withYear ? ' ' + d.getFullYear() : ''}`;
}

/** "Today", "Yesterday", "Tomorrow" or "Tue 3 Nov" */
export function formatRelative(s: DateStr, today: DateStr = todayStr()): string {
  const diff = daysBetween(today, s);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  const d = parseDate(s);
  return `${WEEKDAYS[weekdayMon(d)].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}
