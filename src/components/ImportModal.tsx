import * as React from "react";
import * as XLSX from "xlsx";
import { X, Download, Upload, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase, type Category } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { parseAmount, parseBool, parseDate, parseDuration, getFYForYear, extractDateFromText } from "@/lib/format";

const VALID_CATEGORIES = new Set(["ADHOC", "IG", "SG", "CAR", "NHRP"]);

function normalizeIdentityPart(v: any): string | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim()
    .toUpperCase();
  return s || null;
}

function getProjectIdentityKeys(d: any, fallbackCategory?: Category): string[] {
  const category = (VALID_CATEGORIES.has(d?.category) ? d.category : fallbackCategory) as Category | undefined;
  if (!category) return [];

  const keys = new Set<string>();
  const eoffice = normalizeIdentityPart(d?.eoffice_number);
  const file = normalizeIdentityPart(d?.file_number);
  const iris = normalizeIdentityPart(d?.iris_id);

  if (eoffice) keys.add(`${category}|EOFFICE|${eoffice}`);
  if (file) keys.add(`${category}|FILE|${file}`);
  if (iris) keys.add(`${category}|IRIS|${iris}`);

  return Array.from(keys);
}

function buildImportProjectKey(d: any, fallbackCategory: Category): string {
  const category = (VALID_CATEGORIES.has(d?.category) ? d.category : fallbackCategory) as Category;
  const eoffice = normalizeIdentityPart(d?.eoffice_number);
  const file = normalizeIdentityPart(d?.file_number);
  const iris = normalizeIdentityPart(d?.iris_id);

  if (eoffice) return `${category}:EOFFICE:${eoffice}`;
  if (file) return `${category}:FILE:${file}`;
  if (iris) return `${category}:IRIS:${iris}`;

  const title = normalizeIdentityPart(d?.title)?.slice(0, 80)?.replace(/[^A-Z0-9]+/g, "-");
  const pi = normalizeIdentityPart(d?.pi_name)?.slice(0, 40)?.replace(/[^A-Z0-9]+/g, "-");
  const date = normalizeIdentityPart(d?.start_date);
  const fallback = [title, pi, date].filter(Boolean).join(":");

  return fallback
    ? `${category}:FALLBACK:${fallback}`
    : `${category}:AUTO:${Date.now()}:${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Sanitize the projects-table row before insert: empty strings → null on date/numeric fields
function sanitizeProjectRow(d: any, category: Category): any {
  const cat = VALID_CATEGORIES.has(d.category) ? d.category : category;
  const dateOrNull = (v: any) => (v === "" || v == null ? null : v);
  const numOrNull = (v: any) => {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };
  const intOrNull = (v: any) => {
    const n = numOrNull(v);
    return n == null ? null : Math.floor(n);
  };
  const strOrNull = (v: any) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === "" ? null : s;
  };
  return {
    category: cat,
    title: strOrNull(d.title),
    e_file_number: buildImportProjectKey(d, cat),
    pi_name: strOrNull(d.pi_name),
    serial_number: strOrNull(d.serial_number),
    file_number: strOrNull(d.file_number),
    eoffice_number: strOrNull(d.eoffice_number),
    iris_id: strOrNull(d.iris_id),
    co_pi: strOrNull(d.co_pi),
    contact_number: strOrNull(d.contact_number),
    email_id: strOrNull(d.email_id),
    department: strOrNull(d.department),
    institute: strOrNull(d.institute) ?? strOrNull(d.institute_address),
    institute_address: strOrNull(d.institute_address),
    state: strOrNull(d.state),
    region: strOrNull(d.region),
    broad_subject_area: strOrNull(d.broad_subject_area),
    remarks: strOrNull(d.remarks),
    current_status_note: strOrNull(d.current_status_note),
    outcomes_publications: strOrNull(d.outcomes_publications),
    proposal_type: strOrNull(d.proposal_type),
    project_id: strOrNull(d.project_id),
    priority_disease_categorization: strOrNull(d.priority_disease_categorization),
    aetiology_pathogenesis_sub_condition: strOrNull(d.aetiology_pathogenesis_sub_condition),
    research_phase_modalities: strOrNull(d.research_phase_modalities),
    details: strOrNull(d.details),
    objectives: strOrNull(d.objectives),
    expected_outcome_deliverables: strOrNull(d.expected_outcome_deliverables),
    disease_condition: strOrNull(d.disease_condition),
    details_of_expected_outcome: strOrNull(d.details_of_expected_outcome),
    equipment_approved: strOrNull(d.equipment_approved),
    project_stage: strOrNull(d.project_stage),
    po: strOrNull(d.po),
    project_year: strOrNull(d.project_year),
    start_date: dateOrNull(d.start_date),
    date_of_completion: dateOrNull(d.date_of_completion),
    duration_years: intOrNull(d.duration_years) ?? null,
    project_state: strOrNull(d.project_state) || "Active",
    total_sanctioned_amount: numOrNull(d.total_sanctioned_amount) ?? 0,
    total_amount_released: numOrNull(d.total_amount_released),
    is_multicentre: !!d.is_multicentre,
    centre_details: strOrNull(d.centre_details),
  };
}

interface Props { category: Category; onClose: () => void; onImported: () => void; }

interface ParsedRow {
  sheet: string;
  rowIndex: number;
  raw: Record<string, any>;
  status: "valid" | "warning" | "error";
  reason: string;
  warnings: string[];
  data: any;
  providedFields: string[];
  yearly: any[];
  budgets: any[];
}

const HEADER_LABEL_WORDS = ["file", "title", "pi", "name", "office", "grant", "institute", "date", "duration", "iris", "s.no", "remarks", "contact", "mail", "email", "department", "sanctioned", "released", "budget", "broad", "subject", "epms", "outcome", "publication", "co-pi", "co pi"];

function looksLikeHeaderRow(row: any[]): boolean {
  let hits = 0;
  for (const c of row) {
    if (c == null) continue;
    const s = String(c).toLowerCase().trim();
    if (!s || s.length > 60) continue;
    // skip cells that look like data: contain "/", digits-only, or have @
    if (/[@]/.test(s)) continue;
    if (/^\d+$/.test(s)) continue;
    if (/\//.test(s) && /\d/.test(s)) continue; // file refs like EMDR/IG/...
    if (HEADER_LABEL_WORDS.some((kw) => s.includes(kw))) hits++;
  }
  return hits >= 3;
}

function norm(s: any): string {
  return String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Map header text → canonical field name
function canonicalField(header: string): string | null {
  const n = norm(header);
  if (!n) return null;
  if (/(^|\b)s\.?\s*no\.?(\b|$)|serial/.test(n)) return "serial_number";
  if (/file\s*\.?\s*no/.test(n)) return "file_number";
  if (/e[\s-]*office\s*no/.test(n)) return "eoffice_number";
  if (/iris[\s-]*id|epms\s*id|iris$/.test(n)) return "iris_id";
  if (/pi.*name|pi\/guide.*name|^pi$|^pi\b/.test(n) && !/co[-\s]?pi/.test(n)) return "pi_name";
  if (/co[-\s]?pi/.test(n)) return "co_pi";
  if (/contact\s*no|pi\s*contact/.test(n)) return "contact_number";
  if (/mail|email/.test(n)) return "email_id";
  if (/^department$|^dept/.test(n)) return "department";
  if (/institute\s*address|pi\s*institute\s*address/.test(n)) return "institute_address";
  if (/^institute|institute\/department/.test(n)) return "institute";
  if (/^state$/.test(n)) return "state";
  if (/^region$/.test(n)) return "region";
  if (/^city$/.test(n)) return "city";
  if (/proposal\s*type/.test(n)) return "proposal_type";
  if (/project\s*id/.test(n)) return "project_id";
  if (/priority\s*disease/.test(n)) return "priority_disease_categorization";
  if (/aetiology|pathogenesis|sub[-\s]?condition|subcondition/.test(n)) return "aetiology_pathogenesis_sub_condition";
  if (/research\s*phase|modalit/.test(n)) return "research_phase_modalities";
  if (/^details$/.test(n)) return "details";
  if (/^objectives$/.test(n)) return "objectives";
  if (/expected\s*outcome|deliverables/.test(n)) return "expected_outcome_deliverables";
  if (/disease|condition/.test(n) && !/expected/.test(n)) return "disease_condition";
  if (/details\s*of\s*expected\s*outcome/.test(n)) return "details_of_expected_outcome";
  if (/equipment\s*approved/.test(n)) return "equipment_approved";
  if (/project\s*stage/.test(n)) return "project_stage";
  if (/^po$|^po\s*name/.test(n)) return "po";
  if (/project\s*year/.test(n)) return "project_year";
  if (/project\s*title|^title$/.test(n)) return "title";
  if (/date\s*of\s*start|start\s*date/.test(n)) return "start_date";
  if (/date\s*of\s*completion|date\s*of\s*end|completion\s*date|end\s*date/.test(n)) return "date_of_completion";
  if (/duration/.test(n)) return "duration_years";
  if (/broad\s*subject|subject\s*area/.test(n)) return "broad_subject_area";
  if (/^remarks/.test(n)) return "remarks";
  if (/current\s*status/.test(n)) return "current_status_note";
  if (/outcome|publication/.test(n)) return "outcomes_publications";
  if (/total\s*budget|total\s*amount\s*of\s*grant|total\s*sanctioned/.test(n)) return "total_sanctioned_amount";
  if (/total\s*amount\s*released/.test(n)) return "total_amount_released";
  return null;
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

function isYearSanctionedHeader(h: string, yr: number): boolean {
  const n = norm(h);
  const ord = ORDINALS[yr - 1];
  if (!new RegExp(`\\b${ord}\\s*year`).test(n)) return false;
  if (/released/.test(n)) return false;
  return /grant|sanction/.test(n);
}
function isYearReleasedHeader(h: string, yr: number): boolean {
  const n = norm(h);
  const ord = ORDINALS[yr - 1];
  if (!new RegExp(`\\b${ord}\\s*year`).test(n)) return false;
  return /released/.test(n);
}

function isJunkRow(rowArr: any[]): boolean {
  const cells = rowArr.map((c) => (c == null ? "" : String(c).trim()));
  if (cells.every((c) => c === "")) return true;
  const nonEmpty = cells.filter((c) => c !== "");
  if (nonEmpty.length === 1 && /^(total|grand\s*total)/i.test(nonEmpty[0])) return true;
  if (nonEmpty.length === 1 && /^\d+$/.test(nonEmpty[0])) return true;
  return false;
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string, category: Category): ParsedRow[] {
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false, dateNF: "yyyy-mm-dd", blankrows: false });
  if (!rows.length) return [];

  // Find header row: scan first 5 rows
  let headerIdx = -1;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (looksLikeHeaderRow(rows[i])) { headerIdx = i; break; }
  }

  let headers: string[];
  let dataStart: number;
  if (headerIdx === -1) {
    const maxCols = Math.max(...rows.map((r) => r.length));
    headers = synthesizeHeaders(category, sheetName, maxCols);
    dataStart = 0;
  } else {
    headers = rows[headerIdx].map((h, i) => String(h ?? `col_${i}`).trim() || `col_${i}`);
    dataStart = headerIdx + 1;
  }

  const out: ParsedRow[] = [];
  let lastMain: ParsedRow | null = null;

  // Find header indices for sub-row detection
  const fileIdx = headers.findIndex((h) => { const f = canonicalField(h); return f === "file_number" || f === "eoffice_number"; });
  const titleIdx = headers.findIndex((h) => canonicalField(h) === "title");
  const piIdx = headers.findIndex((h) => canonicalField(h) === "pi_name");
  const instIdx = headers.findIndex((h) => canonicalField(h) === "institute");

  for (let i = dataStart; i < rows.length; i++) {
    const arr = rows[i];
    if (isJunkRow(arr)) continue;

    // Sub-row detection
    const fileCell = fileIdx >= 0 ? String(arr[fileIdx] ?? "").trim() : "";
    const titleCell = titleIdx >= 0 ? String(arr[titleIdx] ?? "").trim() : "";
    const isCentreMarker = /^\d+\s*(st|nd|rd|th)\s*cent/i.test(fileCell);
    const fileEmpty = fileCell === "";
    const titleLooksLikeName = titleCell !== "" && (titleCell.length < 20 || /^(dr\.?|prof\.?|mr\.?|ms\.?|mrs\.?)\s/i.test(titleCell)) && !/\s/.test(titleCell.split(/\s+/).slice(2).join(""));
    const titleIsBlank = titleCell === "";

    if (lastMain && (isCentreMarker || (fileEmpty && (titleIsBlank || titleLooksLikeName)))) {
      const piName = piIdx >= 0 ? String(arr[piIdx] ?? "").trim() : "";
      const inst = instIdx >= 0 ? String(arr[instIdx] ?? "").trim() : "";
      if (piName) {
        lastMain.data.co_pi = lastMain.data.co_pi ? `${lastMain.data.co_pi} | ${piName}` : piName;
      }
      if (inst) {
        lastMain.data.centre_details = lastMain.data.centre_details
          ? `${lastMain.data.centre_details}\n${inst}` : inst;
      }
      lastMain.data.is_multicentre = true;
      // sum any grant amounts from sub-row
      let extra = 0;
      headers.forEach((h, idx) => {
        if (canonicalField(h) === "total_sanctioned_amount" || /grant|sanction/i.test(h)) {
          const v = arr[idx];
          if (v != null && v !== "") extra += parseAmount(v);
        }
      });
      if (extra > 0) {
        lastMain.data.total_sanctioned_amount = (lastMain.data.total_sanctioned_amount || 0) + extra;
      }
      continue;
    }

    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => { rowObj[h] = arr[idx] ?? null; });

    const parsed = parseRowFromObject(rowObj, headers, arr, category, sheetName, i + 1);
    if (parsed) {
      out.push(parsed);
      if (parsed.status !== "error") lastMain = parsed;
    }
  }
  return out;
}

function synthesizeHeaders(category: Category, sheetName: string, n: number): string[] {
  // IG-style positional layout (matches IG 2023/2024 column order)
  if (category === "IG") {
    const ig = ["File No.", "e-Office No.", "IRIS-ID", "PI Name", "Co-PI", "Institute", "e-mail ID", "Contact No.", "Project Title", "Date of Start", "Date of completion", "Duration", "Total budget"];
    while (ig.length < n) ig.push(`col_${ig.length}`);
    return ig.slice(0, n);
  }
  void sheetName;
  const base = ["S.No", "File No.", "e-Office No.", "PI Name", "Project Title", "Co-PI", "Contact No.", "e-mail ID", "Institute", "State", "Date of Start", "Date of completion", "Duration"];
  if (category === "ADHOC") base.splice(3, 0, "IRIS-ID");
  while (base.length < n) base.push(`col_${base.length}`);
  return base.slice(0, n);
}

function parseRowFromObject(
  row: Record<string, any>,
  headers: string[],
  arr: any[],
  category: Category,
  sheet: string,
  rowIndex: number,
): ParsedRow | null {
  const values = Object.values(row);
  const hasAny = values.some((v) => v != null && String(v).trim() !== "");
  if (!hasAny) return null;

  // Map fields by header
  const fieldVals: Record<string, any> = {};
  const yearSanct: Record<number, { val: any; header: string }> = {};
  const yearRel: Record<number, { val: any; header: string }> = {};
  let holdAmt: any = null, holdRel: any = null;
  let fyReq: any = null, fyRel: any = null;

  headers.forEach((h) => {
    const f = canonicalField(h);
    if (f && (fieldVals[f] == null || fieldVals[f] === "")) {
      const v = row[h];
      if (v != null && String(v).trim() !== "") fieldVals[f] = v;
    }
    for (let yr = 1; yr <= 5; yr++) {
      if (isYearSanctionedHeader(h, yr)) yearSanct[yr] = { val: row[h], header: h };
      if (isYearReleasedHeader(h, yr)) yearRel[yr] = { val: row[h], header: h };
    }
    const nh = norm(h);
    if (/10\s*%?\s*hold\s*amount\s*released/.test(nh)) holdRel = row[h];
    else if (/10\s*%?\s*hold\s*amount/.test(nh)) holdAmt = row[h];
    if (/2025[-\s]?2026.*required/.test(nh)) fyReq = row[h];
    if (/2025[-\s]?2026.*released/.test(nh)) fyRel = row[h];
  });

  const warnings: string[] = [];

  // PI fallback + sanitize (email/numeric → Unknown PI)
  let pi: any = fieldVals.pi_name;
  if (!pi) pi = arr[3];
  if (!pi || String(pi).trim() === "") pi = arr[6];
  const piStr = pi == null ? "" : String(pi).trim();
  if (!piStr) { pi = "Unknown PI"; warnings.push("PI defaulted"); }
  else if (piStr.includes("@") || /^\d+(\.\d+)?$/.test(piStr)) {
    pi = "Unknown PI"; warnings.push("PI invalid (email/number)");
  } else { pi = piStr; }

  // Title fallback
  let title = fieldVals.title;
  if (!title) {
    for (const v of values) {
      if (typeof v === "string" && v.trim().length > 15) { title = v; break; }
    }
  }
  if (!title || String(title).trim() === "") { title = `Untitled Project ${rowIndex}`; warnings.push("Title defaulted"); }

  const hasContent = headers.some((header) => {
    const value = row[header];
    return value != null && String(value).trim() !== "";
  });
  if (!hasContent) {
    return {
      sheet, rowIndex, raw: row, status: "error", reason: "No importable values",
      warnings: [], data: {}, providedFields: [], yearly: [], budgets: [],
    };
  }

  // Warnings for missing date/duration but still importable
  if (!fieldVals.start_date) warnings.push("Missing start date");
  if (!fieldVals.duration_years) warnings.push("Missing duration");

  const data: any = { category };
  data.serial_number = fieldVals.serial_number ? String(fieldVals.serial_number) : null;
  data.file_number = fieldVals.file_number ? String(fieldVals.file_number).trim() : null;
  data.eoffice_number = fieldVals.eoffice_number ? String(fieldVals.eoffice_number).trim() : null;
  data.iris_id = fieldVals.iris_id ? String(fieldVals.iris_id).trim() : null;
  data.pi_name = String(pi).trim();
  data.title = String(title).trim();
  data.co_pi = fieldVals.co_pi ? String(fieldVals.co_pi).trim().replace(/\s*[;,/]\s*/g, " | ") : null;
  data.is_multicentre = !!(data.co_pi && data.co_pi.split(" | ").filter((x: string) => x.trim()).length >= 2);
  data.centre_details = null;
  data.contact_number = fieldVals.contact_number ? String(fieldVals.contact_number).trim() : null;
  data.email_id = fieldVals.email_id ? String(fieldVals.email_id).trim() : null;
  data.department = fieldVals.department ? String(fieldVals.department).trim() : null;
  data.institute = fieldVals.institute ? String(fieldVals.institute).trim() : null;
  data.institute_address = fieldVals.institute_address ? String(fieldVals.institute_address).trim() : null;
  if (!data.institute && data.institute_address) data.institute = data.institute_address;
  data.state = fieldVals.state ? String(fieldVals.state).trim() : null;
  data.region = fieldVals.region ? String(fieldVals.region).trim() : null;
  data.broad_subject_area = fieldVals.broad_subject_area ? String(fieldVals.broad_subject_area).trim() : null;
  data.proposal_type = fieldVals.proposal_type ? String(fieldVals.proposal_type).trim() : null;
  data.project_id = fieldVals.project_id ? String(fieldVals.project_id).trim() : null;
  data.priority_disease_categorization = fieldVals.priority_disease_categorization ? String(fieldVals.priority_disease_categorization).trim() : null;
  data.aetiology_pathogenesis_sub_condition = fieldVals.aetiology_pathogenesis_sub_condition ? String(fieldVals.aetiology_pathogenesis_sub_condition).trim() : null;
  data.research_phase_modalities = fieldVals.research_phase_modalities ? String(fieldVals.research_phase_modalities).trim() : null;
  data.details = fieldVals.details ? String(fieldVals.details).trim() : null;
  data.objectives = fieldVals.objectives ? String(fieldVals.objectives).trim() : null;
  data.expected_outcome_deliverables = fieldVals.expected_outcome_deliverables ? String(fieldVals.expected_outcome_deliverables).trim() : null;
  data.disease_condition = fieldVals.disease_condition ? String(fieldVals.disease_condition).trim() : null;
  data.details_of_expected_outcome = fieldVals.details_of_expected_outcome ? String(fieldVals.details_of_expected_outcome).trim() : null;
  data.equipment_approved = fieldVals.equipment_approved ? String(fieldVals.equipment_approved).trim() : null;
  data.project_stage = fieldVals.project_stage ? String(fieldVals.project_stage).trim() : null;
  data.po = fieldVals.po ? String(fieldVals.po).trim() : null;
  data.project_year = fieldVals.project_year ? String(fieldVals.project_year).trim() : null;
  data.remarks = fieldVals.remarks ? String(fieldVals.remarks).trim() : null;
  data.current_status_note = fieldVals.current_status_note ? String(fieldVals.current_status_note).trim() : null;
  data.outcomes_publications = fieldVals.outcomes_publications ? String(fieldVals.outcomes_publications).trim() : null;
  data.start_date = parseDate(fieldVals.start_date);
  if (!data.start_date && fieldVals.start_date) warnings.push("invalid start date");
  data.date_of_completion = parseDate(fieldVals.date_of_completion);
  data.duration_years = parseDuration(fieldVals.duration_years) || 0;
  data.project_state = "Active";

  if (fieldVals.total_sanctioned_amount != null) {
    const headerKey = headers.find((h) => canonicalField(h) === "total_sanctioned_amount") || "";
    let amt = parseAmount(fieldVals.total_sanctioned_amount);
    if (/lac|lakh/i.test(headerKey)) amt *= 100000;
    data.total_sanctioned_amount = amt;
  }
  if (fieldVals.total_amount_released != null) {
    const headerKey = headers.find((h) => canonicalField(h) === "total_amount_released") || "";
    let amt = parseAmount(fieldVals.total_amount_released);
    if (/lac|lakh/i.test(headerKey)) amt *= 100000;
    data.total_amount_released = amt;
  }

  const yearly: any[] = [];
  const yrSet = new Set<number>([...Object.keys(yearSanct), ...Object.keys(yearRel)].map(Number));
  for (const yr of Array.from(yrSet).sort((a, b) => a - b)) {
    const y: any = { year_number: yr };
    const s = yearSanct[yr];
    if (s && s.val != null) {
      let amt = parseAmount(s.val);
      if (/lac|lakh/i.test(s.header)) amt *= 100000;
      y.sanctioned_amount = amt;
    }
    const r = yearRel[yr];
    if (r && r.val != null) {
      const num = parseAmount(r.val);
      const dt = extractDateFromText(r.val);
      if (dt) y.grant_release_date = dt;
      if (num > 0) {
        y.grant_released = true;
        y.amount_released = /lac|lakh/i.test(r.header) ? num * 100000 : num;
      } else {
        y.grant_released = parseBool(r.val);
        y.amount_released = 0;
      }
    }
    yearly.push(y);
  }
  if (holdAmt != null || holdRel != null) {
    let y1 = yearly.find((y) => y.year_number === 1);
    if (!y1) { y1 = { year_number: 1 }; yearly.push(y1); }
    if (holdAmt != null) y1.hold_amount = parseAmount(holdAmt);
    if (holdRel != null) y1.hold_amount_released = parseBool(holdRel);
  }

  const budgets: any[] = [];
  if (fyReq != null || fyRel != null) {
    budgets.push({
      financial_year: "2025-2026",
      required_budget: fyReq != null ? parseAmount(fyReq) : 0,
      released_budget: fyRel != null ? parseAmount(fyRel) : 0,
    });
  }

  data.e_file_number =
    (data.eoffice_number && data.eoffice_number) ||
    (data.file_number && data.file_number) ||
    (data.iris_id && data.iris_id) ||
    `${category}-${sheet}-${rowIndex}`;

  const providedFields = Array.from(new Set<string>(
    headers.flatMap((header) => {
      const f = canonicalField(header);
      if (!f) return [];
      const rawValue = row[header];
      if (rawValue == null || String(rawValue).trim() === "") return [];
      return [f];
    })
  ));

  return {
    sheet, rowIndex, raw: row,
    status: warnings.length ? "warning" : "valid",
    reason: warnings.join(", "),
    warnings, data, providedFields, yearly, budgets,
  };
}

const TEMPLATE_HEADERS = [
  "S.No", "File No.", "e-Office No.", "IRIS ID/EPMS ID", "PI Name", "Project Title",
  "Co-PI", "Contact No.", "e-mail ID", "Department", "Institute", "State",
  "Date of Start", "Date of completion", "Duration", "Broad Subject Area",
  "Total budget", "Total Amount Released", "Current Status", "Outcomes/ Publications", "Remarks",
  "1st Year Grant", "1st year grant released", "2nd Year Grant", "2nd year grant released",
  "3rd Year Grant", "3rd year grant released", "4th Year Grant", "4th year grant released",
  "5th Year Grant", "5th year grant released", "10 % Hold Amount", "10 % Hold Amount Released",
  "2025-2026 Required Budget", "2025-2026 Released Budget",
];

export function ImportModal({ category, onClose, onImported }: Props) {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<"template" | "upload">("upload");
  const [parsed, setParsed] = React.useState<ParsedRow[]>([]);
  const [sheetCount, setSheetCount] = React.useState(0);
  const [importing, setImporting] = React.useState(false);
  const [allHeaders, setAllHeaders] = React.useState<string[]>([]);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const csv = TEMPLATE_HEADERS.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${category}-template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
    const all: ParsedRow[] = [];
    const headerSet = new Set<string>();
    for (const name of wb.SheetNames) {
      const sheetParsed = parseSheet(wb.Sheets[name], name, category);
      all.push(...sheetParsed);
      for (const r of sheetParsed) Object.keys(r.raw).forEach((k) => headerSet.add(k));
    }
    setSheetCount(wb.SheetNames.length);
    setAllHeaders(Array.from(headerSet));
    setParsed(all);
  };

  const reset = () => {
    setParsed([]); setAllHeaders([]); setSheetCount(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const doImport = async () => {
    setImporting(true);
    let created = 0, updated = 0, skipped = 0;
    const failed: { row: any; reason: string }[] = [];
    try {
      const { data: existing, error: existingError } = await supabase
        .from("projects")
        .select("id,category,e_file_number,file_number,eoffice_number,iris_id,title,project_state,start_date,duration_years,total_sanctioned_amount,total_amount_released,pi_name,institute,state,region,proposal_type,project_id,priority_disease_categorization,aetiology_pathogenesis_sub_condition,research_phase_modalities,details,objectives,expected_outcome_deliverables,disease_condition,details_of_expected_outcome,equipment_approved,project_stage,po,project_year");
      if (existingError) throw existingError;

      const existingProjects = (existing || []) as Array<Record<string, any>>;
      const toImport = parsed.filter((r) => r.status !== "error");

      for (const r of toImport) {
        const sanitized = sanitizeProjectRow(r.data, category);
        const candidateKeys = getProjectIdentityKeys(r.data, category);
        const matchingProject = candidateKeys.length > 0
          ? existingProjects.find((project: Record<string, any>) => {
              const projectKeys = getProjectIdentityKeys(project, project.category as Category);
              return projectKeys.some((key) => candidateKeys.includes(key));
            })
          : null;

        if (matchingProject) {
          const updatePayload: Record<string, any> = {};
          const fieldNames = [
            "title","pi_name","co_pi","contact_number","email_id","department","institute","institute_address","state","region",
            "start_date","date_of_completion","duration_years","broad_subject_area","total_sanctioned_amount","total_amount_released",
            "current_status_note","remarks","outcomes_publications","project_state","is_multicentre","centre_details",
            "proposal_type","project_id","priority_disease_categorization","aetiology_pathogenesis_sub_condition","research_phase_modalities","details",
            "objectives","expected_outcome_deliverables","disease_condition","details_of_expected_outcome","equipment_approved","project_stage","po","project_year"
          ];

          for (const field of fieldNames) {
            const candidate = (sanitized as Record<string, any>)[field];
            if (candidate === null || candidate === undefined) continue;
            if (field === "title" && candidate === "Untitled Project") continue;
            if (field === "pi_name" && candidate === "Unknown PI") continue;
            const currentValue = (matchingProject as Record<string, any>)[field];
            if (currentValue == null || currentValue === "" || currentValue === undefined) {
              updatePayload[field] = candidate;
            } else if (candidate !== null && candidate !== "" && candidate !== undefined && candidate !== currentValue) {
              updatePayload[field] = candidate;
            }
          }

          if (r.providedFields.includes("file_number") || r.providedFields.includes("eoffice_number") || r.providedFields.includes("iris_id") || r.providedFields.includes("serial_number")) {
            const eFile = sanitized.e_file_number;
            if (eFile && !matchingProject.e_file_number) updatePayload.e_file_number = eFile;
          }

          if (Object.keys(updatePayload).length === 0) {
            skipped++;
            continue;
          }

          try {
            const { error } = await supabase.from("projects").update(updatePayload).eq("id", matchingProject.id);
            if (error) throw error;
            updated++;
          } catch (e: any) {
            console.error("[Import] projects update failed", e, updatePayload);
            failed.push({ row: r.raw, reason: e?.message || "projects update failed" });
          }
          continue;
        }

        const insertData = { ...sanitized, created_by: user?.id || null };

        try {
          const { data: proj, error } = await supabase.from("projects").insert(insertData).select().single();
          if (error || !proj) {
            console.error("[Import] projects insert failed", { code: (error as any)?.code, message: error?.message, details: (error as any)?.details, hint: (error as any)?.hint, row: insertData });
            failed.push({ row: r.raw, reason: error?.message || "projects insert returned no row" });
            continue;
          }

          const dur = Math.max(sanitized.duration_years || 0, ...r.yearly.map((y: any) => y.year_number || 0), 0);
          for (let yr = 1; yr <= dur; yr++) {
            const ey = r.yearly.find((y: any) => y.year_number === yr) || {};
            try {
              const yRow = {
                project_id: proj.id, year_number: yr,
                sanctioned_amount: Number(ey.sanctioned_amount) || 0,
                amount_released: Number(ey.amount_released) || 0,
                grant_released: !!ey.grant_released,
                grant_release_date: ey.grant_release_date || null,
                report_status: "Due",
                uc_submitted: false,
                extension_requested: false,
                financial_year: getFYForYear(sanitized.start_date, yr) || null,
                hold_amount: ey.hold_amount ?? null,
                hold_amount_released: ey.hold_amount_released ?? null,
              };
              const { error: yErr } = await supabase.from("project_yearly_status").insert(yRow);
              if (yErr) console.error("[Import] project_yearly_status insert failed", { code: (yErr as any).code, message: yErr.message, row: yRow });
            } catch (e) { console.error("[Import] yearly exception:", e); }
          }

          if (r.budgets.length) {
            for (const b of r.budgets) {
              try {
                const bRow = {
                  project_id: proj.id,
                  financial_year: b.financial_year,
                  required_budget: Number(b.required_budget) || 0,
                  released_budget: Number(b.released_budget) || 0,
                };
                const { error: bErr } = await supabase.from("project_fy_budget").insert(bRow);
                if (bErr) console.error("[Import] project_fy_budget insert failed", { code: (bErr as any).code, message: bErr.message, row: bRow });
              } catch (e) { console.error("[Import] budget exception:", e); }
            }
          }

          try {
            await supabase.from("status_history").insert({
              project_id: proj.id, year_number: null, changed_field: "project_created",
              old_value: null, new_value: "Imported via Excel",
              changed_by: user?.id || null, changed_by_name: user?.name || "Import",
            });
          } catch (e) { console.error("[Import] history exception:", e); }

          created++;
        } catch (e: any) {
          console.error("[Import] row exception:", e, insertData);
          failed.push({ row: r.raw, reason: e?.message || "Unknown error" });
        }
      }

      if (failed.length) {
        console.warn("[Import] failed rows:", failed);
        toast.warning(`${created} created, ${updated} updated, ${skipped} skipped. ${failed.length} failed — check console.`);
      } else {
        toast.success(`${created} created, ${updated} updated, ${skipped} skipped.`);
      }
      onImported();
      reset();
      onClose();
    } catch (err: any) {
      console.error("[Import] fatal:", err);
      toast.error(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const counts = {
    valid: parsed.filter((r) => r.status === "valid").length,
    warning: parsed.filter((r) => r.status === "warning").length,
    error: parsed.filter((r) => r.status === "error").length,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground rounded-lg shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-lg font-bold">Import {category} Projects</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={18} /></button>
        </div>
        <div className="flex border-b border-border">
          <button onClick={() => setTab("template")} className={`px-4 py-2 text-sm font-medium ${tab === "template" ? "border-b-2 border-[#2E75B6] text-[#2E75B6]" : "text-muted-foreground"}`}>
            Download Template
          </button>
          <button onClick={() => setTab("upload")} className={`px-4 py-2 text-sm font-medium ${tab === "upload" ? "border-b-2 border-[#2E75B6] text-[#2E75B6]" : "text-muted-foreground"}`}>
            Upload File
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {tab === "template" ? (
            <div>
              <p className="text-sm text-muted-foreground mb-4">Download a CSV template with all standard headers.</p>
              <button onClick={downloadTemplate}
                className="inline-flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1E3A5F]">
                <Download size={16} /> Download {category} Template
              </button>
            </div>
          ) : (
            <div>
              <label className="inline-flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1E3A5F] cursor-pointer">
                <Upload size={16} /> Choose File (.csv, .xlsx)
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
              </label>
              {parsed.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm mb-2">
                    {parsed.length} rows found across {sheetCount} sheet{sheetCount !== 1 ? "s" : ""} ·{" "}
                    <span className="text-[#16A34A] font-semibold">{counts.valid} valid</span> ·{" "}
                    <span className="text-[#D97706] font-semibold">{counts.warning} warnings</span> ·{" "}
                    <span className="text-[#DC2626] font-semibold">{counts.error} errors</span>
                  </div>
                  <div className="overflow-auto border border-border rounded-md max-h-[420px]">
                    <table className="text-xs">
                      <thead className="bg-muted sticky top-0 z-20">
                        <tr>
                          <th className="sticky left-0 bg-muted p-2 text-left border-r border-border z-30 whitespace-nowrap">Status</th>
                          <th className="p-2 text-left border-r border-border whitespace-nowrap">Sheet</th>
                          <th className="p-2 text-left border-r border-border whitespace-nowrap">Row</th>
                          {allHeaders.map((h) => (
                            <th key={h} className="p-2 text-left border-r border-border whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.map((r, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="sticky left-0 bg-card p-2 border-r border-border z-10 whitespace-nowrap" title={r.reason}>
                              {r.status === "valid" && <span className="inline-flex items-center gap-1 text-[#16A34A]"><CheckCircle2 size={12} /> Valid</span>}
                              {r.status === "warning" && <span className="inline-flex items-center gap-1 text-[#D97706]"><AlertTriangle size={12} /> {r.reason || "Warning"}</span>}
                              {r.status === "error" && <span className="inline-flex items-center gap-1 text-[#DC2626]"><XCircle size={12} /> {r.reason}</span>}
                            </td>
                            <td className="p-2 border-r border-border whitespace-nowrap">{r.sheet}</td>
                            <td className="p-2 border-r border-border">{r.rowIndex}</td>
                            {allHeaders.map((h) => (
                              <td key={h} className="p-2 border-r border-border whitespace-nowrap max-w-[240px] truncate">
                                {r.raw[h] != null ? String(r.raw[h]) : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button onClick={doImport} disabled={importing || (counts.valid + counts.warning) === 0}
                    className="mt-4 bg-[#16A34A] text-white px-4 py-2 rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-50">
                    {importing ? "Importing…" : `Confirm Import (${counts.valid + counts.warning})`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
