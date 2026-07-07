import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/set-password")({
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/set-password" });
  const { setPassword, verifyRecovery } = useAuth();
  const [password, setPasswordInput] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token_hash");
    const type = params.get("type");
    if (token && type) {
      verifyRecovery(token, type).catch(() => {});
    }
  }, [verifyRecovery]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setLoading(true);
    const { error } = await setPassword(password);
    setLoading(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Password set successfully");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1E3A5F] to-[#2E75B6] px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-extrabold text-[#1E3A5F] tracking-wider">PRISM</h1>
          <p className="text-sm text-[#1E3A5F]/80 mt-2 font-medium">Set your password to continue</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E3A5F] mb-1">New Password</label>
            <input type="password" required value={password} onChange={(e) => setPasswordInput(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md bg-white text-[#0F1923] focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E3A5F] mb-1">Confirm Password</label>
            <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full px-3 py-2 border border-border rounded-md bg-white text-[#0F1923] focus:outline-none focus:ring-2 focus:ring-[#2E75B6]" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-[#1E3A5F] hover:bg-[#2E75B6] text-white font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50">
            {loading ? "Saving..." : "Set Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
