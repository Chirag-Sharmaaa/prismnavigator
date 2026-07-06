import { createFileRoute, useParams, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/lib/supabase";
import type { Project, YearlyStatus, FYBudget, StatusHistoryEntry, DocumentRow, CommentRow, ReportStatus, ProjectState } from "@/lib/types";
import { Layout } from "@/components/Layout";
import { useAuth, canEdit, canDelete, canComment } from "@/lib/auth";
import { formatDate, formatINR, isYearOverdue, getCurrentFY, getFYForYear } from "@/lib/format";
import { StateBadge } from "./category.$slug";
import { Edit2, Save, Trash2, Upload, Download, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { EditProjectModal } from "@/components/EditProjectModal";

export const Route = createFileRoute("/project/$id")({
  component: ProjectPage,
});

function ProjectPage() {
  const { id } = useParams({ from: "/project/$id" });
  const { user, isGuest } = useAuth();
  const [project, setProject] = React.useState<Project | null>(null);
  const [yearly, setYearly] = React.useState<YearlyStatus[]>([]);
  const [budgets, setBudgets] = React.useState<FYBudget[]>([]);
  const [history, setHistory] = React.useState<StatusHistoryEntry[]>([]);
  const [docs, setDocs] = React.useState<DocumentRow[]>([]);
  const [comments, setComments] = React.useState<CommentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);
  const [showEditModal, setShowEditModal] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const [p, y, b, h, d, c] = await Promise.all([
      supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      supabase.from("project_yearly_status").select("*").eq("project_id", id).order("year_number"),
      supabase.from("project_fy_budget").select("*").eq("project_id", id),
      supabase.from("status_history").select("*").eq("project_id", id).order("timestamp", { ascending: false }),
      supabase.from("documents").select("*").eq("project_id", id).order("uploaded_at", { ascending: false }),
      supabase.from("comments").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    ]);
    setProject(p.data as Project);
    setYearly((y.data as YearlyStatus[]) || []);
    setBudgets((b.data as FYBudget[]) || []);
    setHistory((h.data as StatusHistoryEntry[]) || []);
    setDocs((d.data as DocumentRow[]) || []);
    setComments((c.data as CommentRow[]) || []);
    setLoading(false);
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  if (loading || !project) return <Layout><div className="p-8 text-muted-foreground">Loading…</div></Layout>;

  const editable = canEdit(user, isGuest, project.category);
  const deletable = canDelete(user, isGuest);
  const commentable = canComment(user, isGuest);

  const guard = (fn: () => void) => () => {
    if (isGuest) { toast.error("Guests cannot make changes. Please log in."); return; }
    if (!editable) { toast.error("You don't have permission."); return; }
    fn();
  };

  const logHistory = async (field: string, oldV: any, newV: any, yearNum: number | null = null) => {
    await supabase.from("status_history").insert({
      project_id: id, year_number: yearNum, changed_field: field,
      old_value: oldV?.toString() ?? null, new_value: newV?.toString() ?? null,
      changed_by: user?.id || null, changed_by_name: user?.name || "User",
    });
  };

  const updateYearly = async (yId: string, field: keyof YearlyStatus, value: any) => {
    if (!editable) { toast.error("You don't have permission."); return; }
    const old = yearly.find((y) => y.id === yId);
    if (!old) return;
    const { error } = await supabase.from("project_yearly_status").update({ [field]: value }).eq("id", yId);
    if (error) { toast.error(error.message); return; }
    await logHistory(`year_${old.year_number}_${field}`, (old as any)[field], value, old.year_number);
    load();
  };

  const addYearlyRow = async () => {
    if (!editable) { toast.error("You don't have permission."); return; }
    const nextYear = (yearly.length ? Math.max(...yearly.map((y) => y.year_number)) : 0) + 1;
    const { error } = await supabase.from("project_yearly_status").insert({
      project_id: id,
      year_number: nextYear,
      sanctioned_amount: 0,
      amount_released: 0,
      grant_released: false,
      report_status: "Due",
      uc_submitted: false,
      extension_requested: false,
      financial_year: getCurrentFY(),
      grant_sanctioned: false,
      hold_amount: 0,
      hold_amount_released: false,
      grant_release_date: null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Added yearly record");
    load();
  };

  const deleteYearlyRow = async (yId: string) => {
    if (!editable) { toast.error("You don't have permission."); return; }
    const old = yearly.find((y) => y.id === yId);
    if (!old) return;
    if (!confirm(`Delete year ${old.year_number} record?`)) return;
    const { error } = await supabase.from("project_yearly_status").delete().eq("id", yId);
    if (error) { toast.error(error.message); return; }
    await logHistory(`year_${old.year_number}_deleted`, old.year_number, null, old.year_number);
    toast.success("Deleted yearly record");
    load();
  };

  const updateProject = async (patch: Partial<Project>) => {
    if (!editable) { toast.error("You don't have permission."); return; }
    const { error } = await supabase.from("projects").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    for (const k of Object.keys(patch)) {
      await logHistory(k, (project as any)[k], (patch as any)[k]);
    }
    toast.success("Saved");
    load();
  };

  const updateBudgetValue = async (field: "required_budget" | "released_budget", value: number) => {
    if (!editable) { toast.error("You don't have permission."); return; }
    if (fyBudget) {
      const { error } = await supabase.from("project_fy_budget").update({ [field]: value }).eq("id", fyBudget.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("project_fy_budget").insert({ project_id: id, financial_year: "2025-2026", required_budget: 0, released_budget: 0, [field]: value });
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Budget updated");
    load();
  };

  const updateYearlyField = async (yId: string, field: keyof YearlyStatus, value: any) => {
    if (!editable) { toast.error("You don't have permission."); return; }
    const old = yearly.find((y) => y.id === yId);
    if (!old) return;
    const { error } = await supabase.from("project_yearly_status").update({ [field]: value }).eq("id", yId);
    if (error) { toast.error(error.message); return; }
    await logHistory(`year_${old.year_number}_${field}`, (old as any)[field], value, old.year_number);
    toast.success("Updated");
    load();
  };

  const addComment = async (text: string) => {
    if (!commentable) { toast.error("Please log in to comment."); return; }
    if (!text.trim()) return;
    const { error } = await supabase.from("comments").insert({
      project_id: id, content: text, author_id: user?.id || null, author_name: user?.name || "User",
    });
    if (error) toast.error(error.message);
    else load();
  };

  const deleteComment = async (cId: string) => {
    if (!deletable) { toast.error("You don't have permission."); return; }
    await supabase.from("comments").delete().eq("id", cId);
    load();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editable) return;
    const file = e.target.files?.[0]; if (!file) return;
    const path = `${id}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("prism-documents").upload(path, file);
    if (error) { toast.error(error.message); return; }
    const { data: urlData } = supabase.storage.from("prism-documents").getPublicUrl(path);
    await supabase.from("documents").insert({
      project_id: id, filename: file.name, file_url: urlData.publicUrl,
      file_size: file.size, uploaded_by: user?.id || null, uploaded_by_name: user?.name || "User",
    });
    toast.success("Uploaded");
    load();
  };

  const deleteDoc = async (doc: DocumentRow) => {
    if (!deletable) return;
    await supabase.from("documents").delete().eq("id", doc.id);
    load();
  };

  const totalReleased = yearly.reduce((sum, y) => sum + (y.amount_released || 0), 0);
  const balance = (project.total_sanctioned_amount || 0) - totalReleased;
  const holdAmt = yearly.find((y) => y.year_number === 1)?.hold_amount || 0;
  const holdReleased = yearly.find((y) => y.year_number === 1)?.hold_amount_released;
  const fyBudget = budgets.find((b) => b.financial_year === "2025-2026");

  const currentFY = getCurrentFY();

  return (
    <Layout>
      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-5 mb-5">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold leading-tight">{project.title}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-xs px-2 py-0.5 rounded bg-[#2E75B6] text-white">{project.category}</span>
              <StateBadge state={project.project_state} />
              <span className="text-xs text-muted-foreground">E-File: <strong className="text-foreground">{project.e_file_number || "—"}</strong></span>
            </div>
          </div>
      {editable && (
            <div className="flex gap-2">
              <button onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-[#2E75B6] text-white rounded hover:bg-[#1E3A5F]">
                <Edit2 size={12} /> Edit Details
              </button>
              <button onClick={() => setEditMode(!editMode)}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-[#1E3A5F] text-white rounded">
                {editMode ? <><Save size={12} /> Done</> : <><Edit2 size={12} /> Quick Edit</>}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Project Details */}
      <Card title="Project Details">
        <div className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <EditableProjectField label="Serial Number" value={project.serial_number} editMode={editMode && editable} onSave={(v) => updateProject({ serial_number: v || null })} />
          <EditableProjectField label="File Number" value={project.file_number} editMode={editMode && editable} onSave={(v) => updateProject({ file_number: v || null })} />
          <EditableProjectField label="e-Office Number" value={project.eoffice_number} editMode={editMode && editable} onSave={(v) => updateProject({ eoffice_number: v || null })} />
          <EditableProjectField label="IRIS / EPMS ID" value={project.iris_id} editMode={editMode && editable} onSave={(v) => updateProject({ iris_id: v || null })} />
          <EditableProjectField label="PI Name" value={project.pi_name} editMode={editMode && editable} onSave={(v) => updateProject({ pi_name: v || null })} />
          <EditableProjectField label="Co-PI(s)" value={project.co_pi} editMode={editMode && editable} onSave={(v) => updateProject({ co_pi: v || null })} />
          <div>
            <div className="text-xs text-muted-foreground">Multi-centre Project</div>
            {editMode && editable ? (
              <label className="inline-flex items-center gap-2 text-sm pt-1">
                <input type="checkbox" checked={!!project.is_multicentre} onChange={(e) => updateProject({ is_multicentre: e.target.checked })} />
                Yes, this is a multi-centre project
              </label>
            ) : (
              <span className={`text-[11px] px-2 py-0.5 rounded ${project.is_multicentre ? "bg-[#16A34A] text-white" : "bg-muted text-muted-foreground"}`}>
                {project.is_multicentre ? "Yes" : "No"}
              </span>
            )}
          </div>
          <EditableProjectField label="Centre Details" value={project.centre_details} editMode={editMode && editable} onSave={(v) => updateProject({ centre_details: v || null })} />
          <EditableProjectField label="Contact Number" value={project.contact_number} editMode={editMode && editable} onSave={(v) => updateProject({ contact_number: v || null })} />
          <EditableProjectField label="Email ID" value={project.email_id} editMode={editMode && editable} onSave={(v) => updateProject({ email_id: v || null })} inputType="email" />
          <EditableProjectField label="Department" value={project.department} editMode={editMode && editable} onSave={(v) => updateProject({ department: v || null })} />
          <EditableProjectField label="Broad Subject Area" value={project.broad_subject_area} editMode={editMode && editable} onSave={(v) => updateProject({ broad_subject_area: v || null })} />
          <EditableProjectField label="Institute" value={project.institute} editMode={editMode && editable} onSave={(v) => updateProject({ institute: v || null })} />
          <EditableProjectField label="Institute Address" value={project.institute_address} editMode={editMode && editable} onSave={(v) => updateProject({ institute_address: v || null })} textarea />
          <EditableProjectField label="State" value={project.state} editMode={editMode && editable} onSave={(v) => updateProject({ state: v || null })} />
          <EditableProjectField label="Date of Start" value={project.start_date} editMode={editMode && editable} onSave={(v) => updateProject({ start_date: v || null })} inputType="date" />
          <EditableProjectField label="Date of Completion" value={project.date_of_completion} editMode={editMode && editable} onSave={(v) => updateProject({ date_of_completion: v || null })} inputType="date" />
          <EditableProjectField label="Duration" value={project.duration_years?.toString() || ""} editMode={editMode && editable} onSave={(v) => updateProject({ duration_years: Number(v) || null })} inputType="number" />
          <div>
            <div className="text-xs text-muted-foreground">Project State</div>
            {editMode && editable ? (
              <select value={project.project_state || ""} onChange={(e) => updateProject({ project_state: e.target.value as ProjectState })}
                className="text-sm bg-background border border-border rounded px-2 py-1 mt-1">
                <option value="Active">Active</option><option value="Suspended">Suspended</option>
                <option value="Under Review">Under Review</option><option value="Closed">Closed</option>
                <option value="Completed">Completed</option>
              </select>
            ) : (
              <StateBadge state={project.project_state} />
            )}
          </div>
        </div>
      </Card>

      {/* Financial Summary */}
      <Card title="Financial Summary">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          <EditableMoneyField label="Total Sanctioned" value={project.total_sanctioned_amount} editMode={editMode && editable} onSave={(v) => updateProject({ total_sanctioned_amount: Number(v) || 0 })} />
          <Money label="Total Released (Yearly Sum)" value={totalReleased} />
          <EditableMoneyField label="Total Amount Released (Records)" value={project.total_amount_released} editMode={editMode && editable} onSave={(v) => updateProject({ total_amount_released: Number(v) || 0 })} />
          <EditableMoneyField label="10% Hold Amount" value={holdAmt} editMode={editMode && editable} onSave={(v) => {
            const firstYear = yearly.find((y) => y.year_number === 1);
            if (firstYear) updateYearlyField(firstYear.id, "hold_amount", Number(v) || 0);
          }} />
          <div>
            <div className="text-xs text-muted-foreground">10% Hold Released</div>
            {editMode && editable ? (
              <label className="inline-flex items-center gap-2 mt-1 text-sm">
                <input type="checkbox" checked={!!holdReleased} onChange={(e) => {
                  const firstYear = yearly.find((y) => y.year_number === 1);
                  if (firstYear) updateYearlyField(firstYear.id, "hold_amount_released", e.target.checked);
                }} />
                Yes
              </label>
            ) : (
              <div className="font-semibold">{holdReleased ? "Yes" : "No"}</div>
            )}
          </div>
          <EditableMoneyField label="2025-2026 Required" value={fyBudget?.required_budget} editMode={editMode && editable} onSave={(v) => updateBudgetValue("required_budget", Number(v) || 0)} />
          <EditableMoneyField label="2025-2026 Released" value={fyBudget?.released_budget} editMode={editMode && editable} onSave={(v) => updateBudgetValue("released_budget", Number(v) || 0)} />
          <Money label="Balance Pending" value={balance} highlight={balance > 0 ? "warning" : undefined} />
        </div>
      </Card>

      {/* Year-wise Grant & Status */}
      <Card title="Year-wise Grant & Status">
        {editable && (
          <div className="mb-3 flex justify-end">
            <button onClick={addYearlyRow} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-[#16A34A] text-white rounded">
              <Plus size={12} /> Add Year Row
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2">Year</th>
                <th className="p-2">FY</th>
                <th className="p-2">Sanctioned</th>
                <th className="p-2">Released</th>
                <th className="p-2">Grant Released</th>
                <th className="p-2">Grant Release Date</th>
                <th className="p-2">Report Status</th>
                <th className="p-2">UC Submitted</th>
                <th className="p-2">Extension Requested</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {yearly.map((y) => {
                const overdue = isYearOverdue(project.start_date, y.year_number) && y.report_status === "Due";
                const fy = y.financial_year || getFYForYear(project.start_date, y.year_number);
                const isCurrent = fy === currentFY;
                return (
                  <tr key={y.id} className={`border-t border-border ${overdue ? "bg-red-100 dark:bg-red-950/30" : isCurrent ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                    <td className="p-2 font-semibold">{y.year_number}</td>
                    <td className="p-2 text-xs">{fy || "—"}</td>
                    <td className="p-2">{formatINR(y.sanctioned_amount)}</td>
                    <td className="p-2">
                      {editable ? (
                        <input type="number" defaultValue={y.amount_released || 0}
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== y.amount_released) updateYearly(y.id, "amount_released", v); }}
                          className="w-24 px-2 py-1 bg-background border border-border rounded text-xs" />
                      ) : formatINR(y.amount_released)}
                    </td>
                <td className="p-2">
                      <input type="checkbox" checked={y.grant_released} disabled={!editable}
                        onChange={(e) => {
                          updateYearly(y.id, "grant_released", e.target.checked);
                          if (!e.target.checked && y.grant_release_date) {
                            updateYearly(y.id, "grant_release_date" as any, null);
                          }
                        }} />
                    </td>
                    <td className="p-2">
                      {editable ? (
                        <input type="date" disabled={!y.grant_released}
                          defaultValue={y.grant_release_date || ""}
                          onBlur={(e) => {
                            const v = e.target.value || null;
                            if (v !== (y.grant_release_date || null)) updateYearly(y.id, "grant_release_date" as any, v);
                          }}
                          className="px-2 py-1 bg-background border border-border rounded text-xs disabled:opacity-40" />
                      ) : (
                        y.grant_release_date ? formatDate(y.grant_release_date) : "—"
                      )}
                    </td>
                    <td className="p-2">
                      <select value={y.report_status} disabled={!editable}
                        onChange={(e) => updateYearly(y.id, "report_status", e.target.value as ReportStatus)}
                        className="text-xs bg-background border border-border rounded px-1.5 py-0.5">
                        <option>Due</option><option>Received - Not Reviewed</option><option>Received - Reviewed</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input type="checkbox" checked={y.uc_submitted} disabled={!editable}
                        onChange={(e) => updateYearly(y.id, "uc_submitted", e.target.checked)} />
                    </td>
                    <td className="p-2">
                      <input type="checkbox" checked={y.extension_requested} disabled={!editable}
                        onChange={(e) => updateYearly(y.id, "extension_requested", e.target.checked)} />
                    </td>
                    <td className="p-2">
                      {editable && (
                        <button onClick={() => deleteYearlyRow(y.id)} className="text-[#DC2626] hover:underline text-xs inline-flex items-center gap-1">
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {yearly.length === 0 && <tr><td colSpan={10} className="p-4 text-center text-muted-foreground">No yearly records.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Outcomes */}
      <EditableTextCard title="Outcomes & Publications" value={project.outcomes_publications} editable={editable} onSave={(v) => updateProject({ outcomes_publications: v })} />

      {/* Merged: Comments, Status & Remarks */}
      <Card title="Comments, Status & Remarks">
        {(project.current_status_note || project.remarks || editable) && (
          <ImportedStatusBlock
            statusNote={project.current_status_note}
            remarks={project.remarks}
            editable={editable}
            onSave={(patch) => updateProject(patch)}
          />
        )}

        <div className="border-t border-border pt-4 mt-4">
          <h3 className="text-sm font-semibold mb-3">User Comments</h3>
          {commentable && <CommentInput onAdd={addComment} />}
          {!commentable && !isGuest && <div className="text-xs text-muted-foreground mb-3">You don't have permission to comment.</div>}
          <div className="space-y-3">
            {comments.map((c) => (
              <div key={c.id} className="border border-border rounded p-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span><strong className="text-foreground">{c.author_name}</strong> · {formatDate(c.created_at)}</span>
                  {deletable && (
                    <button onClick={() => deleteComment(c.id)} className="text-[#DC2626] hover:underline"><Trash2 size={12} /></button>
                  )}
                </div>
                <div className="text-sm whitespace-pre-wrap">{c.content}</div>
              </div>
            ))}
            {comments.length === 0 && <div className="text-sm text-muted-foreground">No comments yet.</div>}
          </div>
        </div>
      </Card>

      {/* Documents */}
      <Card title="Documents">
        {editable && (
          <label className="inline-flex items-center gap-2 bg-[#2E75B6] text-white px-3 py-1.5 rounded text-sm cursor-pointer mb-3 hover:bg-[#1E3A5F]">
            <Upload size={14} /> Upload Document
            <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" onChange={handleUpload} className="hidden" />
          </label>
        )}
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex justify-between items-center p-2 border border-border rounded">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{d.filename}</div>
                <div className="text-xs text-muted-foreground">{d.uploaded_by_name} · {formatDate(d.uploaded_at)} · {d.file_size ? `${Math.round(d.file_size / 1024)} KB` : ""}</div>
              </div>
              <div className="flex gap-2">
                <a href={d.file_url} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-muted rounded"><Download size={14} /></a>
                {deletable && <button onClick={() => deleteDoc(d)} className="p-1.5 hover:bg-muted rounded text-[#DC2626]"><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
          {docs.length === 0 && <div className="text-sm text-muted-foreground">No documents.</div>}
        </div>
      </Card>

      {/* History Timeline */}
      <Card title="History Timeline">
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {history.map((h) => (
            <div key={h.id} className="text-xs border-l-2 border-[#2E75B6] pl-3 py-1">
              <div className="text-muted-foreground">{formatDate(h.timestamp)} · {h.changed_by_name || "System"}</div>
              <div><strong>{h.changed_field}</strong>: {h.old_value || "∅"} → {h.new_value || "∅"}</div>
            </div>
          ))}
          {history.length === 0 && <div className="text-sm text-muted-foreground">No history yet.</div>}
        </div>
      </Card>
    {showEditModal && (
        <EditProjectModal
          project={project}
          fyBudget={fyBudget}
          onClose={() => setShowEditModal(false)}
          onSaved={load}
        />
      )}
    </Layout>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 mb-5">
      <h2 className="font-bold text-lg mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function EditableProjectField({
  label, value, editMode, onSave, inputType = "text", textarea = false,
}: {
  label: string; value: string | number | null | undefined; editMode: boolean; onSave: (v: string) => void; inputType?: string; textarea?: boolean;
}) {
  const [draft, setDraft] = React.useState(String(value ?? ""));
  React.useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  if (!editMode) {
    const display = value == null || value === "" ? "—" : value;
    return (
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{display}</div>
      </div>
    );
  }

  if (textarea) {
    return (
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => onSave(e.target.value)} rows={2}
          className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded text-sm" />
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <input type={inputType} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => onSave(e.target.value)}
        className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded text-sm" />
    </div>
  );
}

function EditableMoneyField({ label, value, editMode, onSave }: { label: string; value: number | null | undefined; editMode: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = React.useState(String(value ?? ""));
  React.useEffect(() => { setDraft(String(value ?? "")); }, [value]);

  if (!editMode) return <Money label={label} value={value} />;
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <input type="number" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => onSave(e.target.value)}
        className="w-full mt-1 px-2 py-1.5 bg-background border border-border rounded text-sm" />
    </div>
  );
}

function Money({ label, value, highlight }: { label: string; value: any; highlight?: "warning" }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold ${highlight === "warning" ? "text-[#D97706]" : ""}`}>{formatINR(value)}</div>
    </div>
  );
}

function EditableTextCard({ title, value, editable, onSave }: { title: string; value: string | null; editable: boolean; onSave: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [text, setText] = React.useState(value || "");
  React.useEffect(() => setText(value || ""), [value]);
  return (
    <Card title={title}>
      {editing ? (
        <div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            className="w-full p-2 bg-background border border-border rounded text-sm" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => { onSave(text); setEditing(false); }}
              className="bg-[#16A34A] text-white px-3 py-1 rounded text-xs">Save</button>
            <button onClick={() => { setText(value || ""); setEditing(false); }}
              className="bg-muted px-3 py-1 rounded text-xs">Cancel</button>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-sm whitespace-pre-wrap text-foreground/80 min-h-[20px]">{value || <span className="text-muted-foreground">—</span>}</div>
          {editable && <button onClick={() => setEditing(true)} className="mt-2 text-xs text-[#2E75B6] hover:underline">Edit</button>}
        </div>
      )}
    </Card>
  );
}

function CommentInput({ onAdd }: { onAdd: (t: string) => void }) {
  const [t, setT] = React.useState("");
  return (
    <div className="mb-4">
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={2} placeholder="Write a comment…"
        className="w-full p-2 bg-background border border-border rounded text-sm" />
      <button onClick={() => { onAdd(t); setT(""); }}
        className="mt-2 bg-[#2E75B6] text-white px-3 py-1.5 rounded text-xs hover:bg-[#1E3A5F]">Add Comment</button>
    </div>
  );
}

function ImportedStatusBlock({
  statusNote, remarks, editable, onSave,
}: {
  statusNote: string | null;
  remarks: string | null;
  editable: boolean;
  onSave: (patch: Partial<Project>) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [s, setS] = React.useState(statusNote || "");
  const [r, setR] = React.useState(remarks || "");
  React.useEffect(() => { setS(statusNote || ""); setR(remarks || ""); }, [statusNote, remarks]);

  if (!editing && !statusNote && !remarks && !editable) return null;
  if (!editing && !statusNote && !remarks) {
    return (
      <div className="bg-muted/40 border border-border rounded-md p-3 text-xs">
        <div className="font-semibold text-muted-foreground mb-1">Imported Status Note</div>
        <div className="text-muted-foreground">No imported status or remarks.</div>
        {editable && (
          <button onClick={() => setEditing(true)} className="mt-2 text-[#2E75B6] hover:underline">Edit</button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-muted/40 border border-border rounded-md p-3 text-xs">
      <div className="font-semibold text-muted-foreground mb-2">Imported Status Note</div>
      {editing ? (
        <div className="space-y-2">
          <div>
            <div className="text-muted-foreground mb-1">Current Status</div>
            <textarea value={s} onChange={(e) => setS(e.target.value)} rows={2}
              className="w-full p-2 bg-background border border-border rounded text-xs" />
          </div>
          <div>
            <div className="text-muted-foreground mb-1">Remarks</div>
            <textarea value={r} onChange={(e) => setR(e.target.value)} rows={2}
              className="w-full p-2 bg-background border border-border rounded text-xs" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => { onSave({ current_status_note: s, remarks: r }); setEditing(false); }}
              className="bg-[#16A34A] text-white px-3 py-1 rounded">Save</button>
            <button onClick={() => { setS(statusNote || ""); setR(remarks || ""); setEditing(false); }}
              className="bg-muted px-3 py-1 rounded">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {statusNote && <div><span className="text-muted-foreground">Status: </span><span className="whitespace-pre-wrap">{statusNote}</span></div>}
          {remarks && <div><span className="text-muted-foreground">Remarks: </span><span className="whitespace-pre-wrap">{remarks}</span></div>}
          {editable && (
            <button onClick={() => setEditing(true)} className="text-[#2E75B6] hover:underline">Edit</button>
          )}
        </div>
      )}
    </div>
  );
}
