import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator", scientist_e: "Scientist E", manager: "Category Manager", guest: "Guest",
};

function SettingsPage() {
  const { user, isGuest, refresh } = useAuth();
  const navigate = useNavigate();
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [name, setName] = React.useState(user?.name || "");
  const [pwd, setPwd] = React.useState("");
  const [pwd2, setPwd2] = React.useState("");
  const [emailNotif, setEmailNotif] = React.useState(false);
  const [pushNotif, setPushNotif] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const t = (localStorage.getItem("prism-theme") as "light" | "dark") || "light";
    setTheme(t);
    setEmailNotif(localStorage.getItem("prism-notif-email") === "true");
    setPushNotif(localStorage.getItem("prism-notif-push") === "true");
  }, []);
  React.useEffect(() => setName(user?.name || ""), [user]);

  const applyTheme = (t: "light" | "dark") => {
    setTheme(t);
    if (typeof window !== "undefined") {
      localStorage.setItem("prism-theme", t);
      document.documentElement.setAttribute("data-theme", t);
    }
  };

  const saveName = async () => {
    if (!user) return;
    const trimmed = name.trim();
    const { error } = await supabase.from("users").update({ name: trimmed }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.updateUser({ data: { name: trimmed } });
    setName(trimmed);
    toast.success("Saved");
    await refresh();
  };

  const updatePwd = async () => {
    if (pwd !== pwd2) { toast.error("Passwords don't match"); return; }
    if (pwd.length < 6) { toast.error("Password too short"); return; }
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) toast.error(error.message);
    else { toast.success("Password updated"); setPwd(""); setPwd2(""); }
  };

  if (!user && !isGuest) {
    React.useEffect(() => { navigate({ to: "/login" }); }, []);
    return null;
  }

  return (
    <Layout>
      <h1 className="text-2xl font-bold mb-5">Settings</h1>

      <Section title="Appearance">
        <div className="flex gap-2">
          <button onClick={() => applyTheme("light")}
            className={`px-4 py-2 rounded border text-sm ${theme === "light" ? "bg-[#2E75B6] text-white border-[#2E75B6]" : "border-border"}`}>Light</button>
          <button onClick={() => applyTheme("dark")}
            className={`px-4 py-2 rounded border text-sm ${theme === "dark" ? "bg-[#2E75B6] text-white border-[#2E75B6]" : "border-border"}`}>Dark</button>
        </div>
      </Section>

      {user && !isGuest && (
        <>
          <Section title="Account">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">Display Name</label>
                <div className="flex gap-2 mt-1">
                  <input value={name} onChange={(e) => setName(e.target.value)}
                    className="flex-1 px-3 py-2 bg-background border border-border rounded" />
                  <button onClick={saveName} className="bg-[#1E3A5F] text-white px-3 py-2 rounded text-xs">Save</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email</label>
                <div className="px-3 py-2 bg-muted rounded">{user.email}</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Role</label>
                <div className="px-3 py-2 bg-muted rounded">{ROLE_LABELS[user.role]}</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Category Access</label>
                <div className="px-3 py-2 bg-muted rounded flex flex-wrap gap-1">
                  {(user.category_access || []).map((c) => (
                    <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-[#D6E4F0] text-[#1E3A5F]">{c}</span>
                  ))}
                  {(!user.category_access || user.category_access.length === 0) && <span className="text-xs text-muted-foreground">All</span>}
                </div>
              </div>
            </div>
            <div className="mt-5 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold mb-2">Change Password</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <input type="password" placeholder="New password" value={pwd} onChange={(e) => setPwd(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded text-sm" />
                <input type="password" placeholder="Confirm password" value={pwd2} onChange={(e) => setPwd2(e.target.value)}
                  className="px-3 py-2 bg-background border border-border rounded text-sm" />
              </div>
              <button onClick={updatePwd} className="mt-3 bg-[#1E3A5F] text-white px-4 py-2 rounded text-sm">Update Password</button>
            </div>
          </Section>

          <Section title="Notifications">
            <div className="space-y-3">
              <Toggle label="Email notifications" checked={emailNotif} onChange={(v) => { setEmailNotif(v); localStorage.setItem("prism-notif-email", String(v)); }} />
              <Toggle label="Push notifications" checked={pushNotif} onChange={(v) => { setPushNotif(v); localStorage.setItem("prism-notif-push", String(v)); }} />
            </div>
            <p className="text-xs text-muted-foreground mt-3">Email notifications coming in a future update.</p>
          </Section>

          <Section title="Data & Privacy">
            <p className="text-sm text-muted-foreground">All project data is stored securely on ICMR servers. Contact your administrator for data requests.</p>
          </Section>
        </>
      )}
    </Layout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-5 mb-4">
      <h2 className="font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer">
      <span className="text-sm">{label}</span>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 rounded-full transition ${checked ? "bg-[#2E75B6]" : "bg-muted"}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transform transition ${checked ? "translate-x-5" : "translate-x-0.5"} mt-0.5`} />
      </button>
    </label>
  );
}
