import * as React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { Project, FYBudget } from "@/lib/types";

interface Props {
  project: Project;
  fyBudget?: FYBudget;
  onClose: () => void;
  onSaved: () => void;
}

const STATES = ["Active", "Suspended", "Under Review", "Closed", "Completed"] as const;

export function EditProjectModal({ project, fyBudget, onClose, onSaved }: Props) {
  const { user } = useAuth();
  const [saving, setSaving] = React.useState(false);

  const [form, setForm] = React.useState({
    title: project.title || "",
    project_state: project.project_state || "Active",
    file_number: project.file_number || "",
    eoffice_number: project.eoffice_number || "",
    iris_id: project.iris_id || "",
    pi_name: project.pi_name || "",
    co_pi: project.co_pi || "",
    contact_number: project.contact_number || "",
    email_id: project.email_id || "",
    institute: project.institute || "",
    institute_address: project.institute_address || "",
    department: project.department || "",
    state: project.state || "",
    start_date: project.start_date || "",
    date_of_completion: project.date_of_completion || "",
    duration_years: project.duration_years || 1,
    broad_subject_area: project.broad_subject_area || "",
    total_sanctioned_amount: project.total_sanctioned_amount || 0,
    fy_required: fyBudget?.required_budget || 0,
    fy_released: fyBudget?.released_budget || 0,
    current_status_note: project.current_status_note || "",
    remarks: project.remarks || "",
    outcomes_publications: project.outcomes_publications || "",
    is_multicentre: !!project.is_multicentre,
    centre_details: project.centre_details || "",
  });

  const update = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    if (!form.pi_name.trim()) return toast.error("PI Name is required");
    setSaving(true);
    try {
      const patch: any = {
        title: form.title.trim(),
        project_state: form.project_state,
        file_number: form.file_number.trim() || null,
        eoffice_number: form.eoffice_number.trim() || null,
        iris_id: form.iris_id.trim() || null,
        pi_name: form.pi_name.trim(),
        co_pi: form.co_pi.trim().replace(/\s*[;,]\s*/g, " | ") || null,
        contact_number: form.contact_number.trim() || null,
        email_id: form.email_id.trim() || null,
        institute: form.institute.trim() || null,
        institute_address: form.institute_address.trim() || null,
        department: form.department.trim() || null,
        state: form.state.trim() || null,
        start_date: form.start_date || null,
        date_of_completion: form.date_of_completion || null,
        duration_years: Number(form.duration_years) || null,
        broad_subject_area: form.broad_subject_area.trim() || null,
        total_sanctioned_amount: Number(form.total_sanctioned_amount) || 0,
        current_status_note: form.current_status_note.trim() || null,
        remarks: form.remarks.trim() || null,
        outcomes_publications: form.outcomes_publications.trim() || null,
        is_multicentre: !!form.is_multicentre,
        centre_details: form.centre_details.trim() || null,
      };

      const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
      if (error) throw new Error(error.message);

      // Log changed fields
      for (const k of Object.keys(patch)) {
        const oldV = (project as any)[k];
        const newV = patch[k];
        if ((oldV ?? "") !== (newV ?? "")) {
          try {
            await supabase.from("status_history").insert({
              project_id: project.id, year_number: null, changed_field: k,
              old_value: oldV?.toString() ?? null, new_value: newV?.toString() ?? null,
              changed_by: user?.id || null, changed_by_name: user?.name || "User",
            });
          } catch {}
        }
      }

      // FY 2025-2026 budget upsert
      if (Number(form.fy_required) !== (fyBudget?.required_budget || 0) ||
          Number(form.fy_released) !== (fyBudget?.released_budget || 0)) {
        if (fyBudget) {
          await supabase.from("project_fy_budget").update({
            required_budget: Number(form.fy_required) || 0,
            released_budget: Number(form.fy_released) || 0,
          }).eq("id", fyBudget.id);
        } else {
          await supabase.from("project_fy_budget").insert({
            project_id: project.id, financial_year: "2025-2026",
            required_budget: Number(form.fy_required) || 0,
            released_budget: Number(form.fy_released) || 0,
          });
        }
      }

      toast.success("Project details updated successfully");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full px-3 py-2 bg-background border border-border rounded text-sm";

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card text-card-foreground rounded-lg shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-lg font-bold">Edit Project Details</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-6">
          <Section title="Basic Information">
            <Field label="Project Title *" full><input className={inp} value={form.title} onChange={(e) => update("title", e.target.value)} /></Field>
            <Field label="Project State">
              <select className={inp} value={form.project_state} onChange={(e) => update("project_state", e.target.value)}>
                {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Multi-centre Project">
              <label className="inline-flex items-center gap-2 text-sm pt-2">
                <input type="checkbox" checked={form.is_multicentre} onChange={(e) => update("is_multicentre", e.target.checked)} />
                Yes, this is a multi-centre project
              </label>
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
            <Field label="Institute Name" full><input className={inp} value={form.institute} onChange={(e) => update("institute", e.target.value)} /></Field>
            <Field label="Institute Address" full><textarea className={inp} rows={2} value={form.institute_address} onChange={(e) => update("institute_address", e.target.value)} /></Field>
            <Field label="Department"><input className={inp} value={form.department} onChange={(e) => update("department", e.target.value)} /></Field>
            <Field label="State"><input className={inp} value={form.state} onChange={(e) => update("state", e.target.value)} /></Field>
            <Field label="Centre Details" full><textarea className={inp} rows={2} value={form.centre_details} onChange={(e) => update("centre_details", e.target.value)} /></Field>
          </Section>

          <Section title="Project Details">
            <Field label="Start Date"><input className={inp} type="date" value={form.start_date} onChange={(e) => update("start_date", e.target.value)} /></Field>
            <Field label="Date of Completion"><input className={inp} type="date" value={form.date_of_completion} onChange={(e) => update("date_of_completion", e.target.value)} /></Field>
            <Field label="Duration (Years)"><input className={inp} type="number" min={1} max={10} value={form.duration_years} onChange={(e) => update("duration_years", Number(e.target.value))} /></Field>
            <Field label="Broad Subject Area"><input className={inp} value={form.broad_subject_area} onChange={(e) => update("broad_subject_area", e.target.value)} /></Field>
          </Section>

          <Section title="Financial">
            <Field label="Total Sanctioned Amount (₹)"><input className={inp} type="number" value={form.total_sanctioned_amount} onChange={(e) => update("total_sanctioned_amount", Number(e.target.value))} /></Field>
            <Field label="2025-2026 Required Budget (₹)"><input className={inp} type="number" value={form.fy_required} onChange={(e) => update("fy_required", Number(e.target.value))} /></Field>
            <Field label="2025-2026 Released Budget (₹)"><input className={inp} type="number" value={form.fy_released} onChange={(e) => update("fy_released", Number(e.target.value))} /></Field>
          </Section>

          <Section title="Additional">
            <Field label="Current Status / Notes" full><textarea className={inp} rows={2} value={form.current_status_note} onChange={(e) => update("current_status_note", e.target.value)} /></Field>
            <Field label="Remarks" full><textarea className={inp} rows={2} value={form.remarks} onChange={(e) => update("remarks", e.target.value)} /></Field>
            <Field label="Outcomes / Publications" full><textarea className={inp} rows={2} value={form.outcomes_publications} onChange={(e) => update("outcomes_publications", e.target.value)} /></Field>
          </Section>
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-border">
          <button onClick={onClose} className="px-3 py-2 text-sm border border-border rounded hover:bg-muted">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-[#16A34A] text-white rounded hover:opacity-90 disabled:opacity-50">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
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
