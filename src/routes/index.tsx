import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { ChevronDown, Search as SearchIcon, AlertTriangle, X } from "lucide-react";
import { supabase, CATEGORIES, type Category } from "@/lib/supabase";
import { useAuth, canViewCategory } from "@/lib/auth";
import type { Project, YearlyStatus } from "@/lib/types";
import { Layout } from "@/components/Layout";
import { isYearOverdue, getCurrentFY, formatINR } from "@/lib/format";
import type { FYBudget } from "@/lib/types";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/")({
  component: HomePage,
});

const TICKER_TEXT =
  "Grant Monitoring • Progress Tracking • Document Management • ADHOC Projects • IG Projects • SG Projects • CAR Projects • NHRP Projects • ICMR Research Administration • Status Tracking • ";

const CATEGORY_COLORS: Record<Category, string> = {
  ADHOC: "#1E3A5F", IG: "#2E75B6", SG: "#16A34A", CAR: "#D97706", NHRP: "#DC2626",
};

function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [yearly, setYearly] = useState<YearlyStatus[]>([]);
  const [budgets, setBudgets] = useState<FYBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<{ title: string; items: Project[] } | null>(null);
  const [search, setSearch] = useState("");
  const [filterCats, setFilterCats] = useState<Category[]>([]);
  const [filterState, setFilterState] = useState<string>("");
  const [filterGrant, setFilterGrant] = useState<string>("");
  const [filterReport, setFilterReport] = useState<string>("");

  const [activeOnly, setActiveOnly] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const v = sessionStorage.getItem("prism-active-only");
    return v === null ? true : v === "true";
  });
  useEffect(() => {
    if (typeof window !== "undefined") sessionStorage.setItem("prism-active-only", String(activeOnly));
  }, [activeOnly]);

  useEffect(() => {
    (async () => {
      const [p, y, b] = await Promise.all([
        supabase.from("projects").select("*"),
        supabase.from("project_yearly_status").select("*"),
        supabase.from("project_fy_budget").select("*"),
      ]);
      setProjects((p.data as Project[]) || []);
      setYearly((y.data as YearlyStatus[]) || []);
      setBudgets((b.data as FYBudget[]) || []);
      setLoading(false);
    })();
  }, []);
  const { user, isGuest } = useAuth();

  const yearlyByProject = useMemo(() => {
    const m = new Map<string, YearlyStatus[]>();
    for (const y of yearly) {
      if (!m.has(y.project_id)) m.set(y.project_id, []);
      m.get(y.project_id)!.push(y);
    }
    return m;
  }, [yearly]);

  const visibleProjects = useMemo(() => projects.filter((p) => canViewCategory(user, isGuest, p.category)), [projects, user, isGuest]);

  const baseProjects = useMemo(
    () => activeOnly ? visibleProjects.filter((p) => p.project_state === "Active") : visibleProjects,
    [visibleProjects, activeOnly]
  );

  const actionRequiredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of baseProjects) {
      const ys = yearlyByProject.get(p.id) || [];
      for (const y of ys) {
        const overdue = isYearOverdue(p.start_date, y.year_number);
        if (overdue && !y.grant_released) ids.add(p.id);
        if (overdue && y.report_status === "Due") ids.add(p.id);
        if (y.report_status === "Received - Not Reviewed") ids.add(p.id);
      }
    }
    return ids;
  }, [baseProjects, yearlyByProject]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { TOTAL: baseProjects.length, ADHOC: 0, IG: 0, SG: 0, CAR: 0, NHRP: 0 };
    for (const p of baseProjects) c[p.category] = (c[p.category] || 0) + 1;
    return c;
  }, [baseProjects]);

  // Current FY in both formats
  const currentFYShort = getCurrentFY(); // "2025-26"
  const fyParts = currentFYShort.split("-");
  const fyStart = Number(fyParts[0]);
  const currentFYLong = `${fyStart}-${fyStart + 1}`; // "2025-2026"
  const matchesFY = (s: string | null | undefined) =>
    !!s && (s === currentFYShort || s === currentFYLong || s.startsWith(`${fyStart}-`));

  // FY pending: per project, sum pending amount for current FY
  const fyPending = useMemo(() => {
    const items: { project: Project; pending: number }[] = [];
    let total = 0;
    for (const p of baseProjects) {
      let pending = 0;
      const fyB = budgets.find((b) => b.project_id === p.id && matchesFY(b.financial_year));
      if (fyB && (fyB.required_budget || 0) > (fyB.released_budget || 0)) {
        pending = (fyB.required_budget || 0) - (fyB.released_budget || 0);
      } else {
        const ys = yearlyByProject.get(p.id) || [];
        const cur = ys.find((y) => matchesFY(y.financial_year));
        if (cur && !cur.grant_released) {
          pending = (cur.sanctioned_amount || 0) - (cur.amount_released || 0);
        }
      }
      if (pending > 0) {
        items.push({ project: p, pending });
        total += pending;
      }
    }
    return { items, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseProjects, budgets, yearlyByProject, currentFYLong]);

  const multiCentre = useMemo(() => baseProjects.filter((p) => p.is_multicentre), [baseProjects]);
  const multiByCat = useMemo(() => {
    const m: Record<string, number> = { ADHOC: 0, IG: 0, SG: 0, CAR: 0, NHRP: 0 };
    for (const p of multiCentre) m[p.category] = (m[p.category] || 0) + 1;
    return m;
  }, [multiCentre]);

  const grantByCategory = useMemo(() => {
    const data: any[] = CATEGORIES.map((cat) => ({ category: cat, Released: 0, "Not Released": 0 }));
    for (const p of baseProjects) {
      const ys = yearlyByProject.get(p.id) || [];
      const released = ys.some((y) => y.grant_released);
      const row = data.find((d) => d.category === p.category);
      if (row) row[released ? "Released" : "Not Released"]++;
    }
    return data;
  }, [baseProjects, yearlyByProject]);

  const reportStatusData = useMemo(() => {
    // Distinct project counts
    const due = new Set<string>();
    const notRev = new Set<string>();
    const rev = new Set<string>();
    for (const p of baseProjects) {
      const ys = yearlyByProject.get(p.id) || [];
      for (const y of ys) {
        if (y.report_status === "Due" && isYearOverdue(p.start_date, y.year_number)) due.add(p.id);
        if (y.report_status === "Received - Not Reviewed") notRev.add(p.id);
        if (y.report_status === "Received - Reviewed") rev.add(p.id);
      }
    }
    return [
      { name: "Due", value: due.size },
      { name: "Received - Not Reviewed", value: notRev.size },
      { name: "Received - Reviewed", value: rev.size },
    ];
  }, [baseProjects, yearlyByProject]);

  const donutData = CATEGORIES.map((cat) => ({ name: cat, value: counts[cat] || 0 }));

  const openPanel = (title: string, items: Project[]) => setPanel({ title, items });

  const searchResults = useMemo(() => {
    if (!search && filterCats.length === 0 && !filterState && !filterGrant && !filterReport) return [];
    const q = search.toLowerCase();
    return visibleProjects.filter((p) => {
      if (q) {
        const hay = [p.title, p.pi_name, p.institute, p.e_file_number, p.eoffice_number, p.file_number, p.iris_id]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterCats.length && !filterCats.includes(p.category)) return false;
      if (filterState && p.project_state !== filterState) return false;
      const ys = yearlyByProject.get(p.id) || [];
      if (filterGrant === "released" && !ys.some((y) => y.grant_released)) return false;
      if (filterGrant === "pending" && ys.every((y) => y.grant_released)) return false;
      if (filterReport && !ys.some((y) => y.report_status === filterReport)) return false;
      return true;
    });
  }, [search, filterCats, filterState, filterGrant, filterReport, visibleProjects, yearlyByProject]);

  const toggleCat = (c: Category) =>
    setFilterCats((fs) => (fs.includes(c) ? fs.filter((x) => x !== c) : [...fs, c]));

  return (
    <Layout fullBleed>
      {/* HERO */}
      <section className="relative h-screen w-full overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url('https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1800')" }}
        />
        <div className="absolute inset-0 bg-[#0F2137]/75" />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-4">
          <h1 className="text-7xl md:text-8xl font-extrabold text-white tracking-wider drop-shadow-lg">PRISM</h1>
          <div className="w-24 h-0.5 bg-[#2E75B6] my-6" />
          <p className="text-lg md:text-2xl text-white/95 font-light max-w-3xl">
            Project Records & Integrated Status Manager
          </p>
          <p className="mt-2 text-sm md:text-base text-white/70">ICMR Research Administration</p>
          <div className="absolute bottom-10 animate-bounce-down">
            <ChevronDown size={36} className="text-white" />
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div className="bg-[#2E75B6] text-white py-3 overflow-hidden whitespace-nowrap">
        <div className="inline-flex animate-ticker">
          <span className="px-4 font-medium">{TICKER_TEXT.repeat(8)}</span>
          <span className="px-4 font-medium">{TICKER_TEXT.repeat(8)}</span>
        </div>
      </div>

      {/* DASHBOARD */}
      <div className="px-4 sm:px-6 lg:px-8 py-10 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6 gap-3 flex-wrap">
          <h2 className="text-3xl font-bold text-[var(--navy)] dark:text-white">PRISM Dashboard</h2>
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
            Active projects only
          </label>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-8">
              <StatCard label="Total Projects" value={counts.TOTAL} color="#1E3A5F" onClick={() => openPanel("All Projects", baseProjects)} />
              {CATEGORIES.map((c) => (
                <StatCard key={c} label={c} value={counts[c] || 0} color={CATEGORY_COLORS[c]}
                  onClick={() => openPanel(`${c} Projects`, baseProjects.filter((p) => p.category === c))} />
              ))}
          <StatCard label="Action Required" value={actionRequiredIds.size} color="#DC2626"
                icon={<AlertTriangle size={16} />}
                onClick={() => openPanel("Action Required", baseProjects.filter((p) => actionRequiredIds.has(p.id)))} />
            </div>

            {/* FY Pending + Multi-centre stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
              <button onClick={() => openPanel(`FY ${currentFYLong} — Grants Pending`, fyPending.items.map((i) => i.project))}
                className="bg-card border border-border rounded-lg p-5 text-left shadow-sm hover:shadow-md transition">
                <div className="text-xs text-muted-foreground">FY {currentFYLong} Grants Pending</div>
                <div className="text-3xl font-bold mt-1 text-[#D97706]">{formatINR(fyPending.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">{fyPending.items.length} project(s) · pending release</div>
              </button>
              <button onClick={() => openPanel("Multi-centre Projects", multiCentre)}
                className="bg-card border border-border rounded-lg p-5 text-left shadow-sm hover:shadow-md transition">
                <div className="text-xs text-muted-foreground">Multi-centre Projects</div>
                <div className="text-3xl font-bold mt-1 text-[#2E75B6]">{multiCentre.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ADHOC: {multiByCat.ADHOC} · IG: {multiByCat.IG} · SG: {multiByCat.SG} · CAR: {multiByCat.CAR} · NHRP: {multiByCat.NHRP}
                </div>
              </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-6 mb-8">
              <div className="bg-card rounded-lg p-5 shadow-sm border border-border">
                <h3 className="font-semibold mb-4">Projects by Category</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95}>
                      {donutData.map((d) => <Cell key={d.name} fill={CATEGORY_COLORS[d.name as Category]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-card rounded-lg p-5 shadow-sm border border-border">
                <h3 className="font-semibold mb-4">Grant Release Status</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={grantByCategory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="category" stroke="var(--color-muted-foreground)" />
                    <YAxis stroke="var(--color-muted-foreground)" />
                    <Tooltip /><Legend />
                    <Bar dataKey="Released" fill="#16A34A" />
                    <Bar dataKey="Not Released" fill="#DC2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card rounded-lg p-5 shadow-sm border border-border mb-8">
              <h3 className="font-semibold mb-4">Report Status Overview</h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={reportStatusData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="name" stroke="var(--color-muted-foreground)" />
                  <YAxis stroke="var(--color-muted-foreground)" />
                  <Tooltip />
                  <Bar dataKey="value" fill="#2E75B6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Universal Search */}
            <div className="bg-card rounded-lg p-5 shadow-sm border border-border">
              <h3 className="font-semibold mb-3">Universal Search</h3>
              <div className="relative mb-3">
                <SearchIcon size={18} className="absolute left-3 top-3 text-muted-foreground" />
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by title, PI, institute, file number, e-office, IRIS ID…"
                  className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
                />
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                {CATEGORIES.map((c) => {
                  const allowed = canViewCategory(user, isGuest, c);
                  return (
                    <button key={c}
                      onClick={() => { if (!allowed) return; toggleCat(c); }}
                      disabled={!allowed}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition ${
                        filterCats.includes(c) ? "bg-[#2E75B6] text-white border-[#2E75B6]" : "bg-background border-border"
                      } ${!allowed ? 'opacity-40 cursor-not-allowed' : ''}`}>{c}</button>
                  );
                })}
                <select value={filterState} onChange={(e) => setFilterState(e.target.value)}
                  className="px-2 py-1 rounded-md text-xs bg-background border border-border">
                  <option value="">All States</option>
                  <option>Active</option><option>Suspended</option><option>Under Review</option>
                  <option>Closed</option><option>Completed</option>
                </select>
                <select value={filterGrant} onChange={(e) => setFilterGrant(e.target.value)}
                  className="px-2 py-1 rounded-md text-xs bg-background border border-border">
                  <option value="">All Grants</option>
                  <option value="released">Released</option><option value="pending">Pending</option>
                </select>
                <select value={filterReport} onChange={(e) => setFilterReport(e.target.value)}
                  className="px-2 py-1 rounded-md text-xs bg-background border border-border">
                  <option value="">All Reports</option>
                  <option>Due</option><option>Received - Not Reviewed</option><option>Received - Reviewed</option>
                </select>
              </div>
              {searchResults.length > 0 && (
                <div className="grid md:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto">
                  {searchResults.slice(0, 50).map((p) => (
                    <Link key={p.id} to="/project/$id" params={{ id: p.id }}
                      className="block p-3 bg-background rounded-md border border-border hover:border-[#2E75B6] transition">
                      <div className="flex justify-between items-start gap-2">
                        <div className="text-xs text-muted-foreground">{p.file_number || p.eoffice_number || "—"}</div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2E75B6] text-white">{p.category}</span>
                      </div>
                      <div className="font-semibold text-sm line-clamp-2 mt-1">{p.title}</div>
                      <div className="text-xs text-muted-foreground mt-1">PI: {p.pi_name || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.institute}</div>
                      {p.project_state && <span className="inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded bg-secondary">{p.project_state}</span>}
                    </Link>
                  ))}
                </div>
              )}
              {(search || filterCats.length || filterState || filterGrant || filterReport) && searchResults.length === 0 && (
                <div className="text-sm text-muted-foreground">No matching projects.</div>
              )}
            </div>
          </>
        )}
      </div>

      {/* SLIDE PANEL */}
      {panel && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setPanel(null)} />
          <div className="w-full max-w-md bg-card text-card-foreground shadow-2xl overflow-y-auto p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">{panel.title}</h3>
              <button onClick={() => setPanel(null)} className="p-1 rounded hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="text-sm text-muted-foreground mb-3">{panel.items.length} project(s)</div>
            <div className="space-y-2">
              {panel.items.map((p) => (
                <Link key={p.id} to="/project/$id" params={{ id: p.id }}
                  onClick={() => setPanel(null)}
                  className="block p-2.5 rounded border border-border hover:border-[#2E75B6]">
                  <div className="text-xs text-muted-foreground">{p.category} · {p.file_number || p.eoffice_number || "—"}</div>
                  <div className="text-sm font-medium line-clamp-2">{p.title}</div>
                  <div className="text-xs text-muted-foreground">PI: {p.pi_name || "—"}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function StatCard({ label, value, color, onClick, icon }: { label: string; value: number; color: string; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="bg-card border border-border rounded-lg p-4 text-left shadow-sm hover:shadow-md transition hover:-translate-y-0.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>{icon}
      </div>
      <div className="text-3xl font-bold mt-1" style={{ color }}>{value}</div>
    </button>
  );
}
