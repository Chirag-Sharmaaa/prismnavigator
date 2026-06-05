import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { signIn, setGuest } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) toast.error(error);
    else { toast.success("Welcome back"); navigate({ to: "/" }); }
  };

  const goGuest = () => {
    setGuest(true);
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1E3A5F] to-[#2E75B6] px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-extrabold text-[#1E3A5F] tracking-wider">PRISM</h1>
          <p className="text-sm text-[#1E3A5F]/80 mt-2 font-medium">
            Project Records & Integrated Status Manager
          </p>
          <p className="text-xs text-muted-foreground mt-1">ICMR Research Administration</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#1E3A5F] mb-1">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-[#0F1923] focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#1E3A5F] mb-1">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-md bg-white text-[#0F1923] focus:outline-none focus:ring-2 focus:ring-[#2E75B6]"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-[#1E3A5F] hover:bg-[#2E75B6] text-white font-semibold py-2.5 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={goGuest} className="text-sm text-[#2E75B6] hover:underline font-medium">
            Continue as Guest →
          </button>
        </div>
        <p className="mt-6 text-xs text-center text-muted-foreground">
          No signup. Contact your administrator for an account.
        </p>
      </div>
      <Link to="/" className="hidden" />
    </div>
  );
}
