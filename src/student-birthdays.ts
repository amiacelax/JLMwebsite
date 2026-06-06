/** Seed student birthdays — merge into KV or student profiles later. */

export interface StudentBirthday {
  id: string;
  name: string;
  month: number | null;
  day: number | null;
  uncertain?: boolean;
  note?: string;
}

export const STUDENT_BIRTHDAYS: StudentBirthday[] = [
  { id: "david", name: "David", month: 1, day: 27 },
  { id: "jay", name: "Jay", month: 2, day: 5 },
  { id: "zenny", name: "Zenny", month: 4, day: 12 },
  { id: "jeremiah", name: "Jeremiah", month: 5, day: 2 },
  { id: "faye", name: "Faye", month: 5, day: 8 },
  { id: "taylor", name: "Taylor", month: 5, day: 10 },
  { id: "alanna", name: "Alanna", month: 5, day: 12 },
  { id: "josh", name: "Josh", month: 5, day: 18 },
  { id: "gabe", name: "Gabe", month: 6, day: 11 },
  { id: "mattias", name: "Mattias", month: 7, day: 2 },
  { id: "emily", name: "Emily", month: 7, day: 5 },
  { id: "gary", name: "Gary", month: 7, day: 13 },
  { id: "akane", name: "Akane", month: 8, day: 15 },
  { id: "cael", name: "Cael", month: 9, day: 8 },
  { id: "kash", name: "Kash", month: 9, day: 12 },
  { id: "ivan", name: "Ivan", month: 9, day: 29, uncertain: true, note: "Date uncertain (Sep 29?)" },
  { id: "regina", name: "Regina", month: 9, day: 29, uncertain: true, note: "Date uncertain (Sep 29?)" },
  { id: "alex", name: "Alex", month: 12, day: 8 },
  { id: "bryan", name: "Bryan", month: null, day: null, uncertain: true, note: "Birthday unknown" },
  { id: "jacob", name: "Jacob", month: 12, day: 31 },
];

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatBirthdayLabel(entry: StudentBirthday): string {
  if (entry.month == null || entry.day == null) return "—";
  const base = `${MONTH_NAMES[entry.month - 1]} ${entry.day}`;
  return entry.uncertain ? `${base}?` : base;
}

export function getJstYmd(now = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value || 0);

  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

function daysInMonth(month: number): number {
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 31;
}

/** Days until next occurrence (0 = today) using Japan-time "today". */
export function daysUntilBirthday(
  entry: StudentBirthday,
  now = new Date()
): number | null {
  if (entry.month == null || entry.day == null) return null;

  const { year, month, day } = getJstYmd(now);
  let targetYear = year;
  const maxDay = daysInMonth(entry.month);
  const safeDay = Math.min(entry.day, maxDay);

  if (entry.month < month || (entry.month === month && safeDay < day)) {
    targetYear += 1;
  }

  const target = Date.UTC(targetYear, entry.month - 1, safeDay);
  const today = Date.UTC(year, month - 1, day);
  return Math.round((target - today) / 86400000);
}

export function listStudentBirthdaysSorted(now = new Date()): StudentBirthday[] {
  return [...STUDENT_BIRTHDAYS].sort((a, b) => {
    const da = daysUntilBirthday(a, now);
    const db = daysUntilBirthday(b, now);
    if (da == null && db == null) return a.name.localeCompare(b.name);
    if (da == null) return 1;
    if (db == null) return -1;
    if (da !== db) return da - db;
    return a.name.localeCompare(b.name);
  });
}

export function birthdaysTodayJst(now = new Date()): StudentBirthday[] {
  const { month, day } = getJstYmd(now);
  return STUDENT_BIRTHDAYS.filter(
    (entry) => entry.month === month && entry.day === day
  );
}

export function birthdayAlertKey(year: number, month: number, day: number, id: string): string {
  return `birthday-alert:${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}:${id}`;
}
