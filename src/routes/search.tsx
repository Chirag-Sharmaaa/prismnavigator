import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase, CATEGORIES, type Category } from "@/lib/supabase";
import { useAuth, canViewCategory } from "@/lib/auth";
import type { Project } from "@/lib/types";
import { Layout } from "@/components/Layout";
import { Search as SearchIcon } from "lucide-react";

export const Route = createFileRoute("/search")({
  component: SearchPage,
});

function SearchPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [q, setQ] = React.useState("");
  const [cats, setCats] = React.useState<Category[]>([]);

  const { user, isGuest } = useAuth();

  React.useEffect(() => {
    supabase.from("projects").select("*").then(({ data }) => setProjects((data as Project[]) || []));
  }, []);

  const visible = projects.filter((p) => canViewCategory(user, isGuest, p.category));

  const results = visible.filter((p) => {
    if (cats.length && !cats.includes(p.category)) return false;
    if (!q) return true;
    const hay = [p.title, p.pi_name, p.institute, p.e_file_number, p.eoffice_number, p.file_number, p.iris_id]
      .filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-4">Search Projects</h1>
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="relative mb-4">
          <SearchIcon size={18} className="absolute left-3 top-3 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, PI, institute, file numbers…"
            className="w-full pl-10 pr-3 py-2.5 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((c) => {
            const allowed = canViewCategory(user, isGuest, c);
            return (
              <button key={c}
                onClick={() => { if (!allowed) return; setCats((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]); }}
                disabled={!allowed}
                className={`px-3 py-1 rounded-full text-xs border ${cats.includes(c) ? "bg-[#2E75B6] text-white border-[#2E75B6]" : "border-border"} ${!allowed ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {c}
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted-foreground mb-3">{results.length} result(s)</div>
        <div className="grid md:grid-cols-2 gap-3">
          {results.slice(0, 100).map((p) => (
            <Link key={p.id} to="/project/$id" params={{ id: p.id }}
              className="block p-3 bg-background rounded-md border border-border hover:border-[#2E75B6]">
              <div className="flex justify-between gap-2 items-start">
                <div className="text-xs text-muted-foreground">{p.file_number || p.eoffice_number || "—"}</div>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2E75B6] text-white">{p.category}</span>
              </div>
              <div className="font-semibold text-sm line-clamp-2 mt-1">{p.title}</div>
              <div className="text-xs text-muted-foreground mt-1">PI: {p.pi_name || "—"}</div>
              <div className="text-xs text-muted-foreground truncate">{p.institute}</div>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
