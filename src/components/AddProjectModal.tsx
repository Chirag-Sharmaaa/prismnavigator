import * as React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase, type Category } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { getFYForYear } from "@/lib/format";

interface Props { category: Category; onClose: () => void; onCreated: () => void; }

const STATES = ["Active", "Suspended", "Under Review", "Closed", "Completed"] as const;

export function AddProjectModal({ category, onClose, onCreated }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    title: "",
    project_state: "Active",
    file_number: "",
    eoffice_number: "",
    iris_id: "",
    pi_name: "",
    co_pi: "",
    contact_number: "",
    email_id: "",
    institute: "",
    institute_address: "",
    department: "",
    state: "",
    region: "",
    start_date: "",
    date_of_completion: "",
    duration_years: 1,
    broad_subject_area: "",
    total_sanctioned_amount: 0,
    fy_required: 0,
    fy_released: 0,
    current_status_note: "",
    remarks: "",
    outcomes_publications: "",
    is_multicentre: false,
    centre_details: "",
    proposal_type: "",
    project_id: "",
    priority_disease_categorization: "",
    aetiology_pathogenesis_sub_condition: "",
    research_phase_modalities: "",
    details: "",
    objectives: "",
    expected_outcome_deliverables: "",
    disease_condition: "",
    details_of_expected_outcome: "",
    equipment_approved: "",
    project_stage: "",
    po: "",
    project_year: "",
  });

  type YearRow = { year_number: number; financial_year: string; sanctioned_amount: number; amount_released: number; grant_released: boolean };
  const [years, setYears] = React.useState<YearRow[]>([
    { year_number: 1, financial_year: "", sanctioned_amount: 0, amount_released: 0, grant_released: false },
  ]);

  // Regenerate year rows when duration / start date change
  React.useEffect(() => {
    const n = Math.max(1, Math.min(10, Number(form.duration_years) || 1));
    setYears((prev) => {
      const next: YearRow[] = [];
      for (let i = 1; i <= n; i++) {
        const existing = prev.find((y) => y.year_number === i);
        next.push(existing
          ? { ...existing, financial_year: existing.financial_year || getFYForYear(form.start_date || null, i) }
          : { year_number: i, financial_year: getFYForYear(form.start_date || null, i), sanctioned_amount: 0, amount_released: 0, grant_released: false });
      }
      return next;
    });
  }, [form.duration_years, form.start_date]);

  const update = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const updateYear = (idx: number, k: keyof YearRow, v: any) =>
    setYears((ys) => ys.map((y, i) => (i === idx ? { ...y, [k]: v } : y)));

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.pi_name.trim()) return toast.error("PI Name is required");
    if (!form.institute.trim()) return toast.error("Institute is required");
    if (!form.start_date) return toast.error("Start Date is required");
    if (!form.duration_years || form.duration_years < 1) return toast.error("Duration is required");

    setSaving(true);
    try {
      const e_file_number =
        form.eoffice_number.trim() ||
        form.file_number.trim() ||
        `${category}-${Date.now()}`;

      const insertData: any = {
        category,
        title: form.title.trim(),
        project_state: form.project_state,
        file_number: form.file_number.trim() || null,
        eoffice_number: form.eoffice_number.trim() || null,
        iris_id: form.iris_id.trim() || null,
        e_file_number,
        pi_name: form.pi_name.trim(),
        co_pi: form.co_pi.trim().replace(/\s*[;,]\s*/g, " | ") || null,
        contact_number: form.contact_number.trim() || null,
        email_id: form.email_id.trim() || null,
        institute: form.institute.trim(),
        institute_address: form.institute_address.trim() || null,
        department: form.department.trim() || null,
        state: form.state.trim() || null,
        start_date: form.start_date,
        date_of_completion: form.date_of_completion || null,
        duration_years: Number(form.duration_years),
        broad_subject_area: form.broad_subject_area.trim() || null,
        total_sanctioned_amount: Number(form.total_sanctioned_amount) || 0,
        current_status_note: form.current_status_note.trim() || null,
        remarks: form.remarks.trim() || null,
        outcomes_publications: form.outcomes_publications.trim() || null,
        is_multicentre: !!form.is_multicentre,
        centre_details: form.centre_details.trim() || null,
        region: form.region.trim() || null,
        proposal_type: form.proposal_type.trim() || null,
        project_id: form.project_id.trim() || null,
        priority_disease_categorization: form.priority_disease_categorization.trim() || null,
        aetiology_pathogenesis_sub_condition: form.aetiology_pathogenesis_sub_condition.trim() || null,
        research_phase_modalities: form.research_phase_modalities.trim() || null,
        details: form.details.trim() || null,
        objectives: form.objectives.trim() || null,
        expected_outcome_deliverables: form.expected_outcome_deliverables.trim() || null,
        disease_condition: form.disease_condition.trim() || null,
        details_of_expected_outcome: form.details_of_expected_outcome.trim() || null,
        equipment_approved: form.equipment_approved.trim() || null,
        project_stage: form.project_stage.trim() || null,
        po: form.po.trim() || null,
        project_year: form.project_year.trim() || null,
        created_by: user?.id || null,
      };

      const { data: proj, error } = await supabase.from("projects").insert(insertData).select().single();
      if (error || !proj) throw new Error(error?.message || "Insert failed");

      // Yearly statuses
      for (const y of years) {
        try {
          await supabase.from("project_yearly_status").insert({
            project_id: proj.id,
            year_number: y.year_number,
            sanctioned_amount: Number(y.sanctioned_amount) || 0,
            amount_released: Number(y.amount_released) || 0,
            grant_released: !!y.grant_released,
            report_status: "Due",
            uc_submitted: false,
            extension_requested: false,
            financial_year: y.financial_year || getFYForYear(form.start_date, y.year_number) || null,
          });
        } catch (e) { console.error("Year insert failed:", e); }
      }

      if (Number(form.fy_required) > 0 || Number(form.fy_released) > 0) {
        try {
          await supabase.from("project_fy_budget").insert({
            project_id: proj.id,
            financial_year: "2025-2026",
            required_budget: Number(form.fy_required) || 0,
            released_budget: Number(form.fy_released) || 0,
          });
        } catch (e) { console.error("FY budget insert failed:", e); }
      }

      try {
        await supabase.from("status_history").insert({
          project_id: proj.id, year_number: null, changed_field: "project_created",
          old_value: null, new_value: "Added manually",
          changed_by: user?.id || null, changed_by_name: user?.name || "User",
        });
      } catch (e) { console.error("History insert failed:", e); }

      toast.success("Project added successfully");
      onCreated();
      onClose();
      navigate({ to: "/project/$id", params: { id: proj.id } });
    } catch (e: any) {
      toast.error(e.message || "Failed to add project");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full px-3 py-2 bg-background border border-border rounded text-sm";
  const lbl = "block text-xs font-medium text-muted-foreground mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-lg font-bold">Add New {category} Project</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          <Section title="Basic Information">
            <Field label="Project Title *" full><input className={inp} value={form.title} onChange={(e) => update("title", e.target.value)} /></Field>
            <Field label="Category"><input className={inp + " bg-muted"} value={category} readOnly /></Field>
            <Field label="Project State">
              <select className={inp} value={form.project_state} onChange={(e) => update("project_state", e.target.value)}>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </Section>

          <Section title="File References">
            <Field label="File Number"><input className={inp} value={form.file_number} onChange={(e) => update("file_number", e.target.value)} /></Field>
            <Field label="e-Office Number"><input className={inp} value={form.eoffice_number} onChange={(e) => update("eoffice_number", e.target.value)} /></Field>
            <Field label="IRIS ID / EPMS ID"><input className={inp} value={form.iris_id} onChange={(e) => update("iris_id", e.target.value)} /></Field>
          </Section>

          <Section title="Principal Investigator">
            <Field label="PI Name *"><input className={inp} value={form.pi_name} onChange={(e) => update("pi_name", e.target.value)} /></Field>
            <Field label="Co-PI(s)" full>
              <input className={inp} value={form.co_pi} onChange={(e) => update("co_pi", e.target.value)} placeholder="Dr. A | Dr. B | Dr. C" />
              <div className="text-[11px] text-muted-foreground mt-1">Separate multiple Co-PIs with a pipe | character</div>
            </Field>
            <Field label="Contact Number"><input className={inp} value={form.contact_number} onChange={(e) => update("contact_number", e.target.value)} /></Field>
            <Field label="Email ID"><input className={inp} type="email" value={form.email_id} onChange={(e) => update("email_id", e.target.value)} /></Field>
          </Section>

          <Section title="Institute">
            <Field label="Institute Name *" full><input className={inp} value={form.institute} onChange={(e) => update("institute", e.target.value)} /></Field>
            <Field label="Institute Address" full><textarea className={inp} rows={2} value={form.institute_address} onChange={(e) => update("institute_address", e.target.value)} /></Field>
            <Field label="Department"><input className={inp} value={form.department} onChange={(e) => update("department", e.target.value)} /></Field>
            <Field label="State"><input className={inp} value={form.state} onChange={(e) => update("state", e.target.value)} /></Field>
            <Field label="Multi-centre Project">
              <label className="inline-flex items-center gap-2 text-sm pt-2">
                <input type="checkbox" checked={form.is_multicentre} onChange={(e) => update("is_multicentre", e.target.checked)} />
                Yes
              </label>
            </Field>
            <Field label="Centre Details" full><textarea className={inp} rows={2} value={form.centre_details} onChange={(e) => update("centre_details", e.target.value)} /></Field>
          </Section>

          <Section title="Project Details">
            <Field label="Start Date *"><input className={inp} type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} /></Field>
            <Field label="Date of Completion"><input className={inp} type="date" value={form.date_of_completion} onChange={(e) => update("date_of_completion", e.target.value)} /></Field>
            <Field label="Duration (Years) *"><input className={inp} type="number" min={1} max={10} value={form.duration_years} onChange={(e) => update("duration_years", Number(e.target.value))} /></Field>
            <Field label="Broad Subject Area"><input className={inp} value={form.broad_subject_area} onChange={(e) => update("broad_subject_area", e.target.value)} /></Field>
            <Field label="Region"><input className={inp} value={form.region} onChange={(e) => update("region", e.target.value)} /></Field>
            <Field label="Proposal Type"><input className={inp} value={form.proposal_type} onChange={(e) => update("proposal_type", e.target.value)} /></Field>
            <Field label="Project ID"><input className={inp} value={form.project_id} onChange={(e) => update("project_id", e.target.value)} /></Field>
            <Field label="Priority Disease Categorization"><input className={inp} value={form.priority_disease_categorization} onChange={(e) => update("priority_disease_categorization", e.target.value)} /></Field>
            <Field label="Aetiology / Pathogenesis / Sub-condition"><input className={inp} value={form.aetiology_pathogenesis_sub_condition} onChange={(e) => update("aetiology_pathogenesis_sub_condition", e.target.value)} /></Field>
            <Field label="Research Phase / Modalities"><input className={inp} value={form.research_phase_modalities} onChange={(e) => update("research_phase_modalities", e.target.value)} /></Field>
            <Field label="Project Stage"><input className={inp} value={form.project_stage} onChange={(e) => update("project_stage", e.target.value)} /></Field>
            <Field label="PO"><input className={inp} value={form.po} onChange={(e) => update("po", e.target.value)} /></Field>
            <Field label="Project Year"><input className={inp} value={form.project_year} onChange={(e) => update("project_year", e.target.value)} /></Field>
          </Section>

          <Section title="Financial">
            <Field label="Total Sanctioned Amount (₹)"><input className={inp} type="number" value={form.total_sanctioned_amount} onChange={(e) => update("total_sanctioned_amount", Number(e.target.value))} /></Field>
            <Field label="2025-2026 Required Budget (₹)"><input className={inp} type="number" value={form.fy_required} onChange={(e) => update("fy_required", Number(e.target.value))} /></Field>
            <Field label="2025-2026 Released Budget (₹)"><input className={inp} type="number" value={form.fy_released} onChange={(e) => update("fy_released", Number(e.target.value))} /></Field>
          </Section>

          <div>
            <h3 className="font-semibold text-sm mb-2 text-[#1E3A5F] dark:text-[#86B6E5]">Year-wise Grants</h3>
            <div className="overflow-x-auto border border-border rounded">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Year</th>
                    <th className="p-2 text-left">Financial Year</th>
                    <th className="p-2 text-left">Sanctioned (₹)</th>
                    <th className="p-2 text-left">Released (₹)</th>
                    <th className="p-2 text-left">Released?</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((y, i) => (
                    <tr key={y.year_number} className="border-t border-border">
                      <td className="p-2 font-medium">Year {y.year_number}</td>
                      <td className="p-2"><input className={inp} value={y.financial_year} onChange={(e) => updateYear(i, "financial_year", e.target.value)} /></td>
                      <td className="p-2"><input className={inp} type="number" value={y.sanctioned_amount} onChange={(e) => updateYear(i, "sanctioned_amount", Number(e.target.value))} /></td>
                      <td className="p-2"><input className={inp} type="number" value={y.amount_released} onChange={(e) => updateYear(i, "amount_released", Number(e.target.value))} /></td>
                      <td className="p-2"><input type="checkbox" checked={y.grant_released} onChange={(e) => updateYear(i, "grant_released", e.target.checked)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Section title="Additional">
            <Field label="Current Status / Notes" full><textarea className={inp} rows={2} value={form.current_status_note} onChange={(e) => update("current_status_note", e.target.value)} /></Field>
            <Field label="Remarks" full><textarea className={inp} rows={2} value={form.remarks} onChange={(e) => update("remarks", e.target.value)} /></Field>
            <Field label="Outcomes / Publications" full><textarea className={inp} rows={2} value={form.outcomes_publications} onChange={(e) => update("outcomes_publications", e.target.value)} /></Field>
            <Field label="Details" full><textarea className={inp} rows={2} value={form.details} onChange={(e) => update("details", e.target.value)} /></Field>
            <Field label="Objectives" full><textarea className={inp} rows={2} value={form.objectives} onChange={(e) => update("objectives", e.target.value)} /></Field>
            <Field label="Expected Outcome / Deliverables" full><textarea className={inp} rows={2} value={form.expected_outcome_deliverables} onChange={(e) => update("expected_outcome_deliverables", e.target.value)} /></Field>
            <Field label="Disease / Condition" full><textarea className={inp} rows={2} value={form.disease_condition} onChange={(e) => update("disease_condition", e.target.value)} /></Field>
            <Field label="Details of Expected Outcome" full><textarea className={inp} rows={2} value={form.details_of_expected_outcome} onChange={(e) => update("details_of_expected_outcome", e.target.value)} /></Field>
            <Field label="Equipment Approved" full><textarea className={inp} rows={2} value={form.equipment_approved} onChange={(e) => update("equipment_approved", e.target.value)} /></Field>
          </Section>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-2 text-sm border border-border rounded hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-[#16A34A] text-white rounded hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save Project"}
          </button>
        </div>
      </div>
      {/* unused label class to satisfy bundler; styling */}
      <span className={"hidden " + lbl}></span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-sm mb-2 text-[#1E3A5F] dark:text-[#86B6E5]">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
