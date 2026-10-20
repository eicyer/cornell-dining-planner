// Calendar-date helpers for "YYYY-MM-DD" strings, always read as local
// dates. `new Date(str)` would parse a date-only string as UTC midnight and
// can land on the wrong day depending on the viewer's timezone offset.

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toDateString(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function todayString(): string {
  return toDateString(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return toDateString(date);
}

// Sunday-first, matching the US calendar convention students already read.
export function weekOf(dateStr: string): string[] {
  const start = addDays(dateStr, -parseLocalDate(dateStr).getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function weekdayLabel(dateStr: string, format: 'short' | 'long' = 'short'): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: format });
}

export function longDateLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
