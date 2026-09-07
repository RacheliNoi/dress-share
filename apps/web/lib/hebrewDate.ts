// Hebrew <-> Gregorian date helpers, built entirely on the native
// Intl(hebrew-calendar) support already relied on elsewhere in this app - no
// external dependency. Used both for display (day cells showing the Hebrew
// date alongside the Gregorian one) and for the catalog's "search by Hebrew
// date" picker, which resolves a chosen Hebrew day/month/year to the
// Gregorian date that all the actual filtering/API logic runs on - Hebrew is
// UI-only here, never part of any stored or queried value.

export type HebrewMonthTable = {
  name: string;
  days: { day: number; gregorian: Date }[];
}[];

const hebrewFormatter = new Intl.DateTimeFormat("he-u-ca-hebrew", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

// Intl's "nu-hebr" numbering system prints plain Arabic digits, not the
// traditional gershayim letter-numerals (e.g. "24" instead of "כ״ד"), so the
// day number is converted by hand. Only needs to cover 1-30 (max days in a
// Hebrew month). 15/16 are special-cased to avoid spelling God's name.
export function toHebrewNumeral(num: number): string {
  if (num === 15) return "ט״ו";
  if (num === 16) return "ט״ז";

  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const letters = tens[Math.floor(num / 10)] + ones[num % 10];

  if (letters.length <= 1) {
    return letters + "׳";
  }

  return letters.slice(0, -1) + "״" + letters.slice(-1);
}

const HUNDREDS = ["", "ק", "ר", "ש", "ת", "תק", "תר", "תש", "תת", "תתק"];
const TENS = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
const ONES = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];

// A full Hebrew year (e.g. 5786) uses different conventions than a bare
// day-of-month: it's always written without the thousands digit (5786 ->
// תשפ״ו, not ה׳תשפ״ו - the millennium is assumed from context, same as
// civil use in Israel today), and can need a hundreds letter toHebrewNumeral
// was never built to produce (it only ever needs to cover 1-30).
export function toHebrewYearNumeral(year: number): string {
  const remainder = year % 1000;
  const hundreds = Math.floor(remainder / 100);
  const lastTwo = remainder % 100;

  // Same ט״ו/ט״ז special case as toHebrewNumeral, to avoid spelling God's
  // name - only applies to the tens+ones pair, not hundreds.
  const tail =
    lastTwo === 15
      ? "טו"
      : lastTwo === 16
        ? "טז"
        : TENS[Math.floor(lastTwo / 10)] + ONES[lastTwo % 10];

  const letters = HUNDREDS[hundreds] + tail;

  if (letters.length <= 1) {
    return letters + "׳";
  }

  return letters.slice(0, -1) + "״" + letters.slice(-1);
}

export function getHebrewDateParts(date: Date): {
  day: number;
  month: string;
  year: number;
} {
  const parts = hebrewFormatter.formatToParts(date);

  return {
    day: Number(parts.find((part) => part.type === "day")?.value ?? "0"),
    month: parts.find((part) => part.type === "month")?.value ?? "",
    year: Number(parts.find((part) => part.type === "year")?.value ?? "0"),
  };
}

// Display-only - never used for availability logic, which stays entirely on
// the Gregorian startDate/endDate values from the API.
export function getHebrewDateLabel(date: Date): string {
  const { day, month } = getHebrewDateParts(date);
  return `${toHebrewNumeral(day)} ב${month}`;
}

// Scans a generous Gregorian window around the expected year to build a
// day-by-day Hebrew calendar table for one Hebrew year. This handles leap
// years (13 months, e.g. אדר א׳/אדר ב׳) automatically since it just observes
// whatever Intl reports for each day, rather than re-implementing Hebrew
// calendar arithmetic by hand.
export function buildHebrewYearTable(hebrewYear: number): HebrewMonthTable {
  const approxGregorianYear = hebrewYear - 3760;
  const start = new Date(Date.UTC(approxGregorianYear - 1, 6, 1));
  const end = new Date(Date.UTC(approxGregorianYear + 1, 5, 30));
  const months: HebrewMonthTable = [];

  for (
    let cursor = start;
    cursor <= end;
    cursor = new Date(cursor.getTime() + 86400000)
  ) {
    const parts = getHebrewDateParts(cursor);

    if (parts.year !== hebrewYear) {
      continue;
    }

    const last = months[months.length - 1];

    if (!last || last.name !== parts.month) {
      months.push({
        name: parts.month,
        days: [{ day: parts.day, gregorian: new Date(cursor) }],
      });
    } else {
      last.days.push({ day: parts.day, gregorian: new Date(cursor) });
    }
  }

  return months;
}

export function hebrewToGregorian(
  table: HebrewMonthTable,
  monthName: string,
  day: number,
): Date | null {
  const month = table.find((entry) => entry.name === monthName);
  const dayEntry = month?.days.find((entry) => entry.day === day);
  return dayEntry ? dayEntry.gregorian : null;
}
