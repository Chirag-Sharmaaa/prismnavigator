import { format, parse, isValid, addYears } from "date-fns";

export function formatINR(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "₹0";
  const num = Math.round(Number(n));
  const x = num.toString();
  const lastThree = x.substring(x.length - 3);
  const otherNumbers = x.substring(0, x.length - 3);
  const formatted =
    (otherNumbers ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," : "") +
    lastThree;
  return "₹" + formatted;
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    const date = new Date(d);
    if (!isValid(date)) return "—";
    return format(date, "dd MMM yyyy");
  } catch {
    return "—";
  }
}

// Try a list of formats; reject if day>31 or month>12
function tryFormats(s: string, formats: string[]): string | null {
  for (const f of formats) {
    try {
      const d = parse(s, f, new Date());
      if (isValid(d)) {
        // Sanity: parsed components must round-trip into a real date in [1900..2100]
        const yr = d.getFullYear();
        if (yr >= 1900 && yr <= 2100) return d.toISOString().slice(0, 10);
      }
    } catch {}
  }
  return null;
}

export function parseDate(v: any): string | null {
  if (v == null || v === "") return null;
  // Date object (xlsx with cellDates:true returns these)
  if (v instanceof Date || (typeof v === "object" && v !== null && typeof (v as any).getFullYear === "function")) {
    const d = v as Date;
    if (!isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return null;
  }
  if (typeof v === "number") {
    if (v > 60000) return null; // unrealistic serial
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isValid(d) ? d.toISOString().slice(0, 10) : null;
  }
  const s = String(v).trim();
  if (!s) return null;

  // Pre-validate DD.MM / DD/MM / DD-MM patterns: reject when day>31 or month>12 BEFORE parsing
  const dmMatch = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmMatch) {
    const a = Number(dmMatch[1]); const b = Number(dmMatch[2]);
    // If first part > 12, must be DD.MM. If second part > 12 AND first <= 12, fall back to MM.DD
    if (a > 31 || b > 31) return null;
    // Prefer DD.MM.YYYY (Indian); only treat as MM.DD when day position > 12 AND month position <= 12
    if (a <= 31 && b <= 12) {
      // DD.MM.YYYY
      const out = tryFormats(s, ["d.M.yyyy", "dd.MM.yyyy", "d/M/yyyy", "dd/MM/yyyy", "d-M-yyyy", "dd-MM-yyyy"]);
      if (out) return out;
    }
    if (a <= 12 && b > 12 && b <= 31) {
      const out = tryFormats(s, ["M.d.yyyy", "MM.dd.yyyy", "M/d/yyyy", "MM/dd/yyyy"]);
      if (out) return out;
    }
  }

  // Order: DD.MM.YYYY → DD/MM/YYYY → DD-MM-YYYY → YYYY-MM-DD → MM/DD/YYYY
  const out = tryFormats(s, [
    "dd.MM.yyyy", "d.M.yyyy",
    "dd/MM/yyyy", "d/M/yyyy",
    "dd-MM-yyyy", "d-M-yyyy",
    "yyyy-MM-dd", "yyyy/MM/dd",
    "MM/dd/yyyy", "M/d/yyyy",
  ]);
  if (out) return out;

  const d = new Date(s);
  return isValid(d) ? d.toISOString().slice(0, 10) : null;
}

// Extract first DD.MM.YYYY-style date from a text blob (used for ADHOC mixed-content cells)
export function extractDateFromText(v: any): string | null {
  if (v == null) return null;
  const s = String(v);
  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  return parseDate(m[0]);
}

export function getCurrentFY(): string {
  const today = new Date();
  const m = today.getMonth();
  const y = today.getFullYear();
  if (m >= 3) return `${y}-${(y + 1).toString().slice(-2)}`;
  return `${y - 1}-${y.toString().slice(-2)}`;
}

export function getFYForYear(startDate: string | null, yearNumber: number): string {
  if (!startDate) return "";
  const d = new Date(startDate);
  if (!isValid(d)) return "";
  const yearStart = addYears(d, yearNumber - 1);
  const m = yearStart.getMonth();
  const y = yearStart.getFullYear();
  const fyStart = m >= 3 ? y : y - 1;
  return `${fyStart}-${(fyStart + 1).toString().slice(-2)}`;
}

export function isYearOverdue(startDate: string | null, yearNumber: number): boolean {
  if (!startDate) return false;
  const d = new Date(startDate);
  if (!isValid(d)) return false;
  return new Date() > addYears(d, yearNumber);
}

// Returns the current "year_number" of a project (1-based).
// Year 1 covers the first 12 months from start_date.
export function currentYearNumber(startDate: string | null): number {
  if (!startDate) return 1;
  const d = new Date(startDate);
  if (!isValid(d)) return 1;
  const now = new Date();
  const months = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return Math.max(1, Math.floor(months / 12) + 1);
}

export function parseAmount(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[₹\s]/g, "");
  // Sum multiple values like "5613959+ 28,45,643" or "3,60,500/- & 2,00,000/-"
  const parts = s.split(/[+&]/);
  let total = 0;
  for (const p of parts) {
    const cleaned = p.replace(/[^0-9.]/g, "");
    const n = parseFloat(cleaned);
    if (!isNaN(n)) total += n;
  }
  return total;
}

export function parseBool(v: any): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v > 0;
  const s = String(v).trim().toLowerCase();
  return ["yes", "y", "true", "1", "released", "received"].includes(s);
}

export function parseDuration(v: any): number {
  if (v == null) return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (s.includes("month")) return Math.round(n / 12);
  return Math.round(n);
}
