import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import * as React from "react";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase, CATEGORY_SLUGS, type Category } from "@/lib/supabase";
import type { Project, YearlyStatus } from "@/lib/types";
import { Layout } from "@/components/Layout";
import { useAuth, canEdit, canDelete, canViewCategory } from "@/lib/auth";
import { ImportModal } from "@/components/ImportModal";
import { AddProjectModal } from "@/components/AddProjectModal";
import { Upload, X, Trash2, Plus, Download } from "lucide-react";
import { isYearOverdue, currentYearNumber, getCurrentFY, formatINR, formatDate } from "@/lib/format";
import type { FYBudget } from "@/lib/types";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/category/$slug")({
  component: CategoryPage,
});

type FilterKey = "all" | "grantReleased" | "grantPending" | "reportDue" | "reportNotReviewed" | "reportReviewed" | "fyPending";
type ExportFormat = "excel" | "pdf";

type ExportFieldKey =
  | "serial_number"
  | "file_number"
  | "eoffice_number"
  | "iris_id"
  | "title"
  | "pi_name"
  | "co_pi"
  | "department"
  | "institute"
  | "institute_address"
  | "state"
  | "broad_subject_area"
  | "project_state"
  | "start_date"
  | "date_of_completion"
  | "duration_years"
  | "total_sanctioned_amount"
  | "total_amount_released"
  | "current_status_note"
  | "remarks"
  | "outcomes_publications"
  | "proposal_type"
  | "project_id"
  | "priority_disease_categorization"
  | "aetiology_pathogenesis_sub_condition"
  | "research_phase_modalities"
  | "details"
  | "objectives"
  | "expected_outcome_deliverables"
  | "disease_condition"
  | "details_of_expected_outcome"
  | "equipment_approved"
  | "project_stage"
  | "po"
  | "project_year"
  | "grant_released"
  | "report_status"
  | "financial_year"
  | "fy_pending_amount";

const EXPORT_FIELDS: Array<{ key: ExportFieldKey; label: string }> = [
  { key: "serial_number", label: "S. No." },
  { key: "file_number", label: "File No." },
  { key: "eoffice_number", label: "e-Office No." },
  { key: "iris_id", label: "IRIS ID" },
  { key: "title", label: "Title" },
  { key: "pi_name", label: "PI Name" },
  { key: "co_pi", label: "Co-PI" },
  { key: "department", label: "Department" },
  { key: "institute", label: "Institute" },
  { key: "institute_address", label: "Institute Address" },
  { key: "state", label: "State" },
  { key: "broad_subject_area", label: "Broad Subject Area" },
  { key: "project_state", label: "Project State" },
  { key: "start_date", label: "Start Date" },
  { key: "date_of_completion", label: "Completion Date" },
  { key: "duration_years", label: "Duration (Years)" },
  { key: "total_sanctioned_amount", label: "Total Sanctioned Amount" },
  { key: "total_amount_released", label: "Total Amount Released" },
  { key: "current_status_note", label: "Current Status Note" },
  { key: "remarks", label: "Remarks" },
  { key: "outcomes_publications", label: "Outcomes / Publications" },
  { key: "proposal_type", label: "Proposal Type" },
  { key: "project_id", label: "Project ID" },
  { key: "priority_disease_categorization", label: "Priority Disease Categorization" },
  { key: "aetiology_pathogenesis_sub_condition", label: "Aetiology / Pathogenesis / Sub-condition" },
  { key: "research_phase_modalities", label: "Research Phase / Modalities" },
  { key: "details", label: "Details" },
  { key: "objectives", label: "Objectives" },
  { key: "expected_outcome_deliverables", label: "Expected Outcome / Deliverables" },
  { key: "disease_condition", label: "Disease / Condition" },
  { key: "details_of_expected_outcome", label: "Details of Expected Outcome" },
  { key: "equipment_approved", label: "Equipment Approved" },
  { key: "project_stage", label: "Project Stage" },
  { key: "po", label: "PO" },
  { key: "project_year", label: "Project Year" },
  { key: "grant_released", label: "Current Grant Released" },
  { key: "report_status", label: "Current Report Status" },
  { key: "financial_year", label: "Current Financial Year" },
  { key: "fy_pending_amount", label: "FY Pending Amount" },
];

const DEFAULT_EXPORT_FIELDS: ExportFieldKey[] = [
  "serial_number",
  "file_number",
  "eoffice_number",
  "title",
  "pi_name",
  "institute",
  "state",
  "project_state",
  "total_sanctioned_amount",
  "grant_released",
  "report_status",
  "financial_year",
  "fy_pending_amount",
];

function CategoryPage() {
  const { slug } = useParams({ from: "/category/$slug" });
  const category = CATEGORY_SLUGS[slug.toLowerCase()] as Category | undefined;
  const { user, isGuest } = useAuth();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [yearly, setYearly] = React.useState<YearlyStatus[]>([]);
  const [budgets, setBudgets] = React.useState<FYBudget[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showImport, setShowImport] = React.useState(false);
  const [showAdd, setShowAdd] = React.useState(false);
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [showExport, setShowExport] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>("excel");
  const [selectedExportFields, setSelectedExportFields] = React.useState<ExportFieldKey[]>(DEFAULT_EXPORT_FIELDS);

  const [activeOnly, setActiveOnly] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = sessionStorage.getItem("prism-active-only");
    return v === null ? true : v === "true";
  });
  React.useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.setItem("prism-active-only", String(activeOnly));
  }, [activeOnly]);

  // Bulk delete
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [confirmText, setConfirmText] = React.useState("");
  const [showConfirm, setShowConfirm] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!category) return;
    setLoading(true);
    const { data: ps } = await supabase.from("projects").select("*").eq("category", category);
    const ids = (ps || []).map((p: any) => p.id);
    let ys: any[] = [];
    let bs: any[] = [];
    if (ids.length) {
      const [yr, br] = await Promise.all([
        supabase.from("project_yearly_status").select("*").in("project_id", ids),
        supabase.from("project_fy_budget").select("*").in("project_id", ids),
      ]);
      ys = yr.data || [];
      bs = br.data || [];
    }
    setProjects((ps as Project[]) || []);
    setYearly((ys as YearlyStatus[]) || []);
    setBudgets((bs as FYBudget[]) || []);
    setLoading(false);
  }, [category]);

  React.useEffect(() => { load(); }, [load]);

  if (!category) return <Layout><div>Invalid category</div></Layout>;
  if (!canViewCategory(user, isGuest, category)) {
    return <Layout><div className="p-8 text-center text-muted-foreground">You don't have access to this category.</div></Layout>;
  }

  const yearlyByProject = new Map<string, YearlyStatus[]>();
  for (const y of yearly) {
    if (!yearlyByProject.has(y.project_id)) yearlyByProject.set(y.project_id, []);
    yearlyByProject.get(y.project_id)!.push(y);
  }

  // Apply active-only first
  const baseProjects = activeOnly
    ? projects.filter((p) => p.project_state === "Active")
    : projects;

  // Helpers
  const currentYearOf = (p: Project): YearlyStatus | undefined => {
    const ys = yearlyByProject.get(p.id) || [];
    if (!ys.length) return undefined;
    const cur = currentYearNumber(p.start_date);
    return ys.find((y) => y.year_number === cur)
      || [...ys].sort((a, b) => b.year_number - a.year_number)[0];
  };

  const hasOverdueDue = (p: Project) => {
    const ys = yearlyByProject.get(p.id) || [];
    return ys.some((y) => y.report_status === "Due" && isYearOverdue(p.start_date, y.year_number));
  };
  const hasReport = (p: Project, status: string) => {
    const ys = yearlyByProject.get(p.id) || [];
    return ys.some((y) => y.report_status === status);
  };

  // Current FY in both formats
  const currentFYShort = getCurrentFY();
  const fyParts = currentFYShort.split("-");
  const fyStart = Number(fyParts[0]);
  const currentFYLong = `${fyStart}-${fyStart + 1}`;
  const matchesFY = (s: string | null | undefined) =>
    !!s && (s === currentFYShort || s === currentFYLong || s.startsWith(`${fyStart}-`));

  const fyPendingAmt = (p: Project): number => {
    const fyB = budgets.find((b) => b.project_id === p.id && matchesFY(b.financial_year));
    if (fyB && (fyB.required_budget || 0) > (fyB.released_budget || 0)) {
      return (fyB.required_budget || 0) - (fyB.released_budget || 0);
    }
    const ys = yearlyByProject.get(p.id) || [];
    const cur = ys.find((y) => matchesFY(y.financial_year));
    if (cur && !cur.grant_released) {
      return (cur.sanctioned_amount || 0) - (cur.amount_released || 0);
    }
    return 0;
  };

  const fyPendingProjects = baseProjects.filter((p) => fyPendingAmt(p) > 0);
  const fyPendingTotal = fyPendingProjects.reduce((s, p) => s + fyPendingAmt(p), 0);

  // Distinct project counts
  const counts = {
    total: baseProjects.length,
    grantReleased: baseProjects.filter((p) => currentYearOf(p)?.grant_released === true).length,
    grantPending: baseProjects.filter((p) => {
      const cy = currentYearOf(p);
      return cy ? !cy.grant_released : true;
    }).length,
    reportDue: baseProjects.filter(hasOverdueDue).length,
    reportNotReviewed: baseProjects.filter((p) => hasReport(p, "Received - Not Reviewed")).length,
    reportReviewed: baseProjects.filter((p) => hasReport(p, "Received - Reviewed")).length,
    fyPending: fyPendingProjects.length,
  };

  const filtered = baseProjects.filter((p) => {
    switch (filter) {
      case "all": return true;
      case "grantReleased": return currentYearOf(p)?.grant_released === true;
      case "grantPending": {
        const cy = currentYearOf(p);
        return cy ? !cy.grant_released : true;
      }
      case "reportDue": return hasOverdueDue(p);
      case "reportNotReviewed": return hasReport(p, "Received - Not Reviewed");
      case "reportReviewed": return hasReport(p, "Received - Reviewed");
      case "fyPending": return fyPendingAmt(p) > 0;
    }
  });

  const grantData = [
    { name: "Released", count: counts.grantReleased },
    { name: "Pending", count: counts.grantPending },
  ];
  const reportData = [
    { name: "Due", count: counts.reportDue },
    { name: "Not Reviewed", count: counts.reportNotReviewed },
    { name: "Reviewed", count: counts.reportReviewed },
  ];

  const canImport = canEdit(user, isGuest, category);
  const canBulkDelete = canDelete(user, isGuest);

  const buildExportRow = (p: Project) => {
    const cur = currentYearOf(p);
    const fyPending = fyPendingAmt(p);
    return {
      serial_number: p.serial_number || "—",
      file_number: p.file_number || "—",
      eoffice_number: p.eoffice_number || "—",
      iris_id: p.iris_id || "—",
      title: p.title || "—",
      pi_name: p.pi_name || "—",
      co_pi: p.co_pi || "—",
      department: p.department || "—",
      institute: p.institute || "—",
      institute_address: p.institute_address || "—",
      state: p.state || "—",
      broad_subject_area: p.broad_subject_area || "—",
      project_state: p.project_state || "—",
      start_date: formatDate(p.start_date),
      date_of_completion: formatDate(p.date_of_completion),
      duration_years: p.duration_years ?? "—",
      total_sanctioned_amount: p.total_sanctioned_amount == null ? "—" : formatINR(p.total_sanctioned_amount),
      total_amount_released: p.total_amount_released == null ? "—" : formatINR(p.total_amount_released),
      current_status_note: p.current_status_note || "—",
      remarks: p.remarks || "—",
      outcomes_publications: p.outcomes_publications || "—",
      proposal_type: p.proposal_type || "—",
      project_id: p.project_id || "—",
      priority_disease_categorization: p.priority_disease_categorization || "—",
      aetiology_pathogenesis_sub_condition: p.aetiology_pathogenesis_sub_condition || "—",
      research_phase_modalities: p.research_phase_modalities || "—",
      details: p.details || "—",
      objectives: p.objectives || "—",
      expected_outcome_deliverables: p.expected_outcome_deliverables || "—",
      disease_condition: p.disease_condition || "—",
      details_of_expected_outcome: p.details_of_expected_outcome || "—",
      equipment_approved: p.equipment_approved || "—",
      project_stage: p.project_stage || "—",
      po: p.po || "—",
      project_year: p.project_year || "—",
      grant_released: cur ? (cur.grant_released ? "Yes" : "No") : "—",
      report_status: cur?.report_status || "—",
      financial_year: cur?.financial_year || "—",
      fy_pending_amount: fyPending > 0 ? formatINR(fyPending) : "—",
    } satisfies Record<ExportFieldKey, string | number>;
  };

  const handleExport = () => {
    if (!selectedExportFields.length) {
      toast.error("Select at least one column to export.");
      return;
    }

    const rows = filtered.map(buildExportRow);
    const headers = selectedExportFields.map((key) => EXPORT_FIELDS.find((field) => field.key === key)?.label || key);
    const body = rows.map((row) => selectedExportFields.map((key) => row[key] ?? ""));

    if (exportFormat === "excel") {
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, category);
      XLSX.writeFile(workbook, `${category.toLowerCase()}-projects-export.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text(`${category} Projects Export`, 40, 36);
      autoTable(doc, {
        startY: 56,
        head: [headers],
        body,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [30, 58, 95], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 247, 250] },
      });
      doc.save(`${category.toLowerCase()}-projects-export.pdf`);
    }

    setShowExport(false);
    toast.success(`Exported ${rows.length} project${rows.length === 1 ? "" : "s"} as ${exportFormat === "excel" ? "Excel" : "PDF"}.`);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllVisible = () => setSelectedIds(new Set(filtered.map((p) => p.id)));
  const deselectAll = () => setSelectedIds(new Set());
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const performDelete = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await supabase.from("project_fy_budget").delete().in("project_id", ids);
      await supabase.from("status_history").delete().in("project_id", ids);
      await supabase.from("documents").delete().in("project_id", ids);
      await supabase.from("comments").delete().in("project_id", ids);
      await supabase.from("project_yearly_status").delete().in("project_id", ids);
      await supabase.from("projects").delete().in("id", ids);
      toast.success(`${ids.length} projects deleted successfully.`);
      setShowConfirm(false); setConfirmText(""); exitSelectMode();
      load();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  return (
    <Layout>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
        <h1 className="text-2xl font-bold">{category} Projects</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active projects only
          </label>
          {canBulkDelete && !selectMode && (
            <button onClick={() => setSelectMode(true)}
              className="inline-flex items-center gap-1.5 text-sm border border-border bg-card px-3 py-1.5 rounded hover:bg-muted">
              <Trash2 size={14} /> Select to Delete
            </button>
          )}
          {canImport && (
            <>
              <button onClick={() => setShowAdd(true)}
                className="inline-flex items-center gap-2 bg-[#16A34A] text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90">
                <Plus size={16} /> Add Project
              </button>
              <button onClick={() => setShowImport(true)}
                className="inline-flex items-center gap-2 bg-[#2E75B6] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#1E3A5F]">
                <Upload size={16} /> Import Projects
              </button>
            </>
          )}
          <button onClick={() => setShowExport(true)}
            className="inline-flex items-center gap-2 bg-[#16A34A] text-white px-4 py-2 rounded-md text-sm font-medium hover:opacity-90">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {selectMode && (
        <div className="bg-card border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{selectedIds.size} selected</span>
          <button onClick={selectAllVisible} className="text-xs px-2 py-1 border border-border rounded hover:bg-muted">Select All</button>
          <button onClick={deselectAll} className="text-xs px-2 py-1 border border-border rounded hover:bg-muted">Deselect All</button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={selectedIds.size === 0}
            className="text-xs px-3 py-1 bg-[#DC2626] text-white rounded disabled:opacity-50">
            Delete Selected
          </button>
          <button onClick={exitSelectMode} className="text-xs px-2 py-1 border border-border rounded hover:bg-muted ml-auto">Cancel</button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <Stat label="Total" value={counts.total} active={filter === "all"} onClick={() => setFilter("all")} color="#1E3A5F" />
        <Stat label="Grant Released" value={counts.grantReleased} active={filter === "grantReleased"} onClick={() => setFilter("grantReleased")} color="#16A34A" />
        <Stat label="Grant Pending" value={counts.grantPending} active={filter === "grantPending"} onClick={() => setFilter("grantPending")} color="#DC2626" />
        <Stat label="Reports Due" value={counts.reportDue} active={filter === "reportDue"} onClick={() => setFilter("reportDue")} color="#D97706" />
        <Stat label="Not Reviewed" value={counts.reportNotReviewed} active={filter === "reportNotReviewed"} onClick={() => setFilter("reportNotReviewed")} color="#2E75B6" />
        <Stat label="Reviewed" value={counts.reportReviewed} active={filter === "reportReviewed"} onClick={() => setFilter("reportReviewed")} color="#16A34A" />
        <button onClick={() => setFilter("fyPending")}
          className={`bg-card border p-4 rounded-lg text-left hover:shadow-md transition ${filter === "fyPending" ? "border-[#2E75B6] ring-2 ring-[#2E75B6]/30" : "border-border"}`}>
          <div className="text-xs text-muted-foreground">FY {currentFYLong} Grant Pending</div>
          <div className="text-2xl font-bold text-[#D97706]">{counts.fyPending}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{formatINR(fyPendingTotal)} total pending</div>
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="font-semibold mb-2 text-sm">Grant Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={grantData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" />
              <YAxis stroke="var(--color-muted-foreground)" />
              <Tooltip /><Legend />
              <Bar dataKey="count" fill="#2E75B6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card p-4 rounded-lg border border-border">
          <h3 className="font-semibold mb-2 text-sm">Report Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={reportData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" stroke="var(--color-muted-foreground)" />
              <YAxis stroke="var(--color-muted-foreground)" />
              <Tooltip /><Legend />
              <Bar dataKey="count" fill="#1E3A5F" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {filter !== "all" && (
        <div className="flex flex-wrap gap-2 mb-3">
          <span className="inline-flex items-center gap-1 bg-[#D6E4F0] text-[#1E3A5F] px-2 py-1 rounded-full text-xs">
            Filter: {filter}
            <button onClick={() => setFilter("all")}><X size={12} /></button>
          </span>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? <div className="p-8 text-center text-muted-foreground">Loading…</div> : (
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left">
                  {selectMode && <th className="p-3 w-10"></th>}
                  <th className="p-3">S.No</th>
                  <th className="p-3">File No.</th>
                  <th className="p-3">e-Office No.</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">PI</th>
                  <th className="p-3">DOS</th>
                  <th className="p-3">State</th>
                  <th className="p-3">Project State</th>
              <th className="p-3">Grant</th>
                  <th className="p-3">Report</th>
                  <th className="p-3">FY {currentFYLong} Pending</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const cur = currentYearOf(p);
                  const muted = p.project_state && p.project_state !== "Active";
                  return (
                    <tr key={p.id} className={`border-t border-border hover:bg-muted/50 ${muted ? "opacity-60" : ""}`}>
                      {selectMode && (
                        <td className="p-3">
                          <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
                        </td>
                      )}
                      <td className="p-3">{p.serial_number || "—"}</td>
                      <td className="p-3">{p.file_number || "—"}</td>
                      <td className="p-3">{p.eoffice_number || "—"}</td>
                      <td className="p-3 max-w-xs">
                        <Link to="/project/$id" params={{ id: p.id }} className="text-[#2E75B6] hover:underline font-medium line-clamp-2">
                          {p.title}
                        </Link>
                      </td>
                      <td className="p-3">{p.pi_name || "—"}</td>
                      <td className="p-3 text-xs">{formatDate(p.start_date)}</td>
                      <td className="p-3">{p.state || "—"}</td>
                      <td className="p-3"><StateBadge state={p.project_state} /></td>
                  <td className="p-3">{cur ? (cur.grant_released ? <span className="text-[#16A34A]">✓</span> : <span className="text-[#DC2626]">✗</span>) : "—"}</td>
                      <td className="p-3 text-xs">{cur?.report_status || "—"}</td>
                      <td className="p-3 text-xs">{fyPendingAmt(p) > 0 ? formatINR(fyPendingAmt(p)) : "—"}</td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={selectMode ? 12 : 11} className="p-8 text-center text-muted-foreground">No projects found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showImport && <ImportModal category={category} onClose={() => setShowImport(false)} onImported={load} />}
      {showAdd && <AddProjectModal category={category} onClose={() => setShowAdd(false)} onCreated={load} />}

      {showExport && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-5 max-w-2xl w-full">
            <h3 className="font-bold text-lg mb-2">Export Projects</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Choose the file format and the columns to include for the currently visible projects.
            </p>
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium block mb-2">Export format</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setExportFormat("excel")}
                    className={`px-3 py-2 rounded border text-sm ${exportFormat === "excel" ? "bg-[#2E75B6] text-white border-[#2E75B6]" : "bg-background border-border"}`}>
                    Excel
                  </button>
                  <button
                    onClick={() => setExportFormat("pdf")}
                    className={`px-3 py-2 rounded border text-sm ${exportFormat === "pdf" ? "bg-[#2E75B6] text-white border-[#2E75B6]" : "bg-background border-border"}`}>
                    PDF
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium block mb-2">Columns</label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-auto border border-border rounded p-2 bg-background">
                  {EXPORT_FIELDS.map((field) => {
                    const checked = selectedExportFields.includes(field.key);
                    return (
                      <label key={field.key} className="inline-flex items-center gap-2 text-xs bg-card px-2 py-1 rounded border border-border cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setSelectedExportFields((prev) =>
                              prev.includes(field.key) ? prev.filter((item) => item !== field.key) : [...prev, field.key]
                            );
                          }}
                        />
                        {field.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExport(false)} className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted">Cancel</button>
              <button onClick={handleExport} className="text-xs px-3 py-1.5 bg-[#16A34A] text-white rounded">Export {exportFormat === "excel" ? "Excel" : "PDF"}</button>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground border border-border rounded-lg p-5 max-w-md w-full">
            <h3 className="font-bold text-lg mb-2">Confirm Bulk Delete</h3>
            <p className="text-sm text-muted-foreground mb-3">
              You are about to permanently delete <strong>{selectedIds.size}</strong> projects and all their data
              (yearly status, documents, comments, history). This cannot be undone. Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full px-3 py-2 bg-background border border-border rounded text-sm mb-3"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowConfirm(false); setConfirmText(""); }}
                className="text-xs px-3 py-1.5 border border-border rounded hover:bg-muted">Cancel</button>
              <button
                onClick={performDelete}
                disabled={confirmText !== "DELETE"}
                className="text-xs px-3 py-1.5 bg-[#DC2626] text-white rounded disabled:opacity-50">
                Delete {selectedIds.size} projects
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Stat({ label, value, onClick, color, active }: { label: string; value: number; onClick: () => void; color: string; active?: boolean }) {
  return (
    <button onClick={onClick}
      className={`bg-card border p-4 rounded-lg text-left hover:shadow-md transition ${active ? "border-[#2E75B6] ring-2 ring-[#2E75B6]/30" : "border-border"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
    </button>
  );
}

export function StateBadge({ state }: { state: string | null }) {
  const colors: Record<string, string> = {
    Active: "bg-[#16A34A] text-white",
    Suspended: "bg-[#D97706] text-white",
    "Under Review": "bg-[#2E75B6] text-white",
    Closed: "bg-[#DC2626] text-white",
    Completed: "bg-gray-500 text-white",
  };
  if (!state) return <span className="text-muted-foreground">—</span>;
  return <span className={`text-xs px-2 py-0.5 rounded ${colors[state] || "bg-gray-300"}`}>{state}</span>;
}
