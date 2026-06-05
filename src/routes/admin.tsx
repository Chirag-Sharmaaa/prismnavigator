import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase, CATEGORIES } from "@/lib/supabase";
import type { AppUser, Project, UserRole, StatusHistoryEntry } from "@/lib/types";
import { Layout } from "@/components/Layout";
import { useAuth, canAccessAdmin } from "@/lib/auth";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

const PAGE_SIZE = 50;

function prettyField(f: string): string {
  return f
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = React.useState<AppUser[]>([]);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("manager");
  const [catAccess, setCatAccess] = React.useState<string[]>([]);

  // Activity log
  const [history, setHistory] = React.useState<StatusHistoryEntry[]>([]);
  const [projectsMap, setProjectsMap] = React.useState<Map<string, Project>>(new Map());
  const [allUsers, setAllUsers] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [filterCategory, setFilterCategory] = React.useState("");
  const [filterUser, setFilterUser] = React.useState("");
  const [filterField, setFilterField] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  React.useEffect(() => {
    if (!canAccessAdmin(user)) { navigate({ to: "/" }); return; }
    load();
  }, [user]);

  const load = async () => {
    const [u, p, h] = await Promise.all([
      supabase.from("users").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("id,title,category"),
      supabase.from("status_history").select("*").order("timestamp", { ascending: false }).limit(2000),
    ]);
    setUsers((u.data as AppUser[]) || []);
    const pm = new Map<string, Project>();
    for (const proj of (p.data || []) as Project[]) pm.set(proj.id, proj);
    setProjectsMap(pm);
    const hist = (h.data as StatusHistoryEntry[]) || [];
    setHistory(hist);
    const usersSet = new Set<string>();
    hist.forEach((e) => { if (e.changed_by_name) usersSet.add(e.changed_by_name); });
    setAllUsers(Array.from(usersSet).sort());
  };

  const createUser = async () => {
    if (!email || !name) { toast.error("Name and email required"); return; }
    const tempPwd = Math.random().toString(36).slice(2) + "Aa1!";
    const { data, error } = await supabase.auth.signUp({ email, password: tempPwd });
    if (error) { toast.error(error.message); return; }
    if (data.user) {
      await supabase.from("users").insert({
        id: data.user.id, email, name, role,
        category_access: role === "manager" ? catAccess : null,
      });
    }
    toast.success(`Invitation sent to ${email}.`);
    setName(""); setEmail(""); setCatAccess([]);
    load();
  };

  const deleteUser = async (u: AppUser) => {
    if (u.role === "admin" || u.role === "scientist_e") { toast.error("Cannot delete admin/scientist_e"); return; }
    if (!confirm(`Delete ${u.name}?`)) return;
    await supabase.from("users").delete().eq("id", u.id);
    load();
  };

  const updateUserRole = async (u: AppUser, newRole: UserRole, newCats: string[]) => {
    await supabase.from("users").update({ role: newRole, category_access: newRole === "manager" ? newCats : null }).eq("id", u.id);
    load();
  };

  if (!canAccessAdmin(user)) return <Layout><div>Unauthorized</div></Layout>;

  const filteredHistory = history.filter((h) => {
    const proj = projectsMap.get(h.project_id);
    if (filterCategory && proj?.category !== filterCategory) return false;
    if (filterUser && h.changed_by_name !== filterUser) return false;
    if (filterField && !h.changed_field.toLowerCase().includes(filterField.toLowerCase())) return false;
    if (dateFrom && h.timestamp < dateFrom) return false;
    if (dateTo && h.timestamp > dateTo + "T23:59:59") return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const pageRows = filteredHistory.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-4">Admin Panel</h1>

      <div className="bg-card border border-border rounded-lg p-5 mb-5">
        <h2 className="font-bold mb-3">Create New User</h2>
        <div className="grid md:grid-cols-2 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name"
            className="px-3 py-2 bg-background border border-border rounded" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email"
            className="px-3 py-2 bg-background border border-border rounded" />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}
            className="px-3 py-2 bg-background border border-border rounded">
            <option value="manager">Manager</option>
            <option value="scientist_e">Scientist E</option>
          </select>
          {role === "manager" && (
            <div className="flex flex-wrap gap-2 items-center">
              {CATEGORIES.map((c) => (
                <label key={c} className="text-xs flex items-center gap-1">
                  <input type="checkbox" checked={catAccess.includes(c)}
                    onChange={(e) => setCatAccess(e.target.checked ? [...catAccess, c] : catAccess.filter((x) => x !== c))} /> {c}
                </label>
              ))}
            </div>
          )}
        </div>
        <button onClick={createUser} className="mt-3 bg-[#1E3A5F] text-white px-4 py-2 rounded text-sm">Create User</button>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 mb-5">
        <h2 className="font-bold mb-3">Users ({users.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                <th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Role</th>
                <th className="p-2">Category Access</th><th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-2">{u.name}</td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">
                    <select defaultValue={u.role} onChange={(e) => updateUserRole(u, e.target.value as UserRole, u.category_access || [])}
                      disabled={u.role === "admin"}
                      className="text-xs bg-background border border-border rounded px-1.5 py-0.5">
                      <option value="admin">Admin</option><option value="scientist_e">Scientist E</option>
                      <option value="manager">Manager</option><option value="guest">Guest</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-wrap gap-1">
                      {(u.category_access || []).map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-[#D6E4F0] text-[#1E3A5F]">{c}</span>
                      ))}
                    </div>
                  </td>
                  <td className="p-2">
                    {u.role !== "admin" && u.role !== "scientist_e" && (
                      <button onClick={() => deleteUser(u)} className="text-[#DC2626]"><Trash2 size={14} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-5 mb-5">
        <h2 className="font-bold mb-3">Global Activity Log</h2>
        <div className="flex flex-wrap gap-2 mb-3 text-xs">
          <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
            className="px-2 py-1 bg-background border border-border rounded">
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterUser} onChange={(e) => { setFilterUser(e.target.value); setPage(1); }}
            className="px-2 py-1 bg-background border border-border rounded">
            <option value="">All Users</option>
            {allUsers.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <input value={filterField} onChange={(e) => { setFilterField(e.target.value); setPage(1); }}
            placeholder="Field…" className="px-2 py-1 bg-background border border-border rounded" />
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-2 py-1 bg-background border border-border rounded" />
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-2 py-1 bg-background border border-border rounded" />
          <button onClick={() => { setFilterCategory(""); setFilterUser(""); setFilterField(""); setDateFrom(""); setDateTo(""); setPage(1); }}
            className="px-2 py-1 border border-border rounded hover:bg-muted">Reset</button>
        </div>

        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-xs">
            <thead className="bg-muted text-left">
              <tr>
                <th className="p-2">Timestamp</th>
                <th className="p-2">User</th>
                <th className="p-2">Project Title</th>
                <th className="p-2">Category</th>
                <th className="p-2">Field Changed</th>
                <th className="p-2">Old → New</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((h) => {
                const proj = projectsMap.get(h.project_id);
                let ts = h.timestamp;
                try { ts = format(new Date(h.timestamp), "dd MMM yyyy, HH:mm"); } catch {}
                return (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-2 whitespace-nowrap">{ts}</td>
                    <td className="p-2">{h.changed_by_name || "—"}</td>
                    <td className="p-2 max-w-[240px] truncate">{proj?.title || "(deleted project)"}</td>
                    <td className="p-2">{proj?.category || "—"}</td>
                    <td className="p-2">{prettyField(h.changed_field)}</td>
                    <td className="p-2">
                      <span className="text-muted-foreground">{h.old_value ?? "∅"}</span>
                      {" → "}
                      <span>{h.new_value ?? "∅"}</span>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No history entries match.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-3 text-xs">
          <div className="text-muted-foreground">{filteredHistory.length} entries · Page {page} of {totalPages}</div>
          <div className="flex gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="px-2 py-1 border border-border rounded disabled:opacity-40">Prev</button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
              className="px-2 py-1 border border-border rounded disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
