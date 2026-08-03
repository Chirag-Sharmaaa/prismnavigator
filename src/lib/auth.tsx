import * as React from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "./supabase";
import type { AppUser, UserRole } from "./types";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  isGuest: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  setGuest: (v: boolean) => void;
  refresh: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<{ error: string | null }>;
  verifyRecovery: (tokenHash: string, type: string) => Promise<{ error: string | null }>;
  setPassword: (password: string) => Promise<{ error: string | null }>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AppUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [isGuest, setIsGuestState] = React.useState(false);

  const setGuest = React.useCallback((v: boolean) => {
    setIsGuestState(v);
    if (typeof window !== "undefined") {
      if (v) localStorage.setItem("prism-guest", "true");
      else localStorage.removeItem("prism-guest");
    }
  }, []);

  const loadUser = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) {
      setUser(null);
      setGuest(false);
      return;
    }
    const sUser = sess.session.user;
    const meta = (sUser.user_metadata || {}) as Record<string, any>;
    const { data } = await supabase.from("users").select("*").eq("id", sUser.id).maybeSingle();
    const categoryAccess = Array.isArray(meta.category_access)
      ? meta.category_access
      : (typeof meta.category_access === "string" ? meta.category_access.split(",").map((c: string) => c.trim()).filter(Boolean) : []);

    if (data) {
      const profile = data as AppUser;
      const hydratedUser = {
        ...profile,
        name: profile.name || meta.name || meta.full_name || sUser.email || "User",
        role: (profile.role || meta.role || "guest") as UserRole,
        category_access: profile.category_access ?? categoryAccess,
      };
      setUser(hydratedUser);
      setGuest(false);
      return;
    }

    const fallbackUser: AppUser = {
      id: sUser.id,
      email: sUser.email || "",
      name: meta.name || meta.full_name || sUser.email || "User",
      role: (meta.role as UserRole | undefined) || "guest",
      category_access: categoryAccess,
    };

    try {
      const { data: created, error } = await supabase.from("users").insert({
        id: sUser.id,
        email: sUser.email || "",
        name: fallbackUser.name,
        role: fallbackUser.role,
        category_access: fallbackUser.category_access,
      }).select().single();
      if (!error && created) {
        setUser({ ...(created as AppUser), category_access: (created as AppUser).category_access ?? fallbackUser.category_access });
      } else {
        setUser(fallbackUser);
      }
    } catch {
      setUser(fallbackUser);
    }
    setGuest(false);
  }, [setGuest]);

  React.useEffect(() => {
    if (typeof window === "undefined") {
      setLoading(false);
      return;
    }
    setGuest(localStorage.getItem("prism-guest") === "true");
    loadUser().finally(() => setLoading(false));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) {
        setUser(null);
        setGuest(false);
      } else {
        void loadUser();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadUser, setGuest]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (typeof window !== "undefined") localStorage.removeItem("prism-guest");
    setIsGuestState(false);
    await loadUser();
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      localStorage.removeItem("prism-guest");
      localStorage.removeItem("prism-theme");
      localStorage.removeItem("prism-sidebar-collapsed");
    }
    setIsGuestState(false);
    setUser(null);
  };

  const requestPasswordReset = async (email: string) => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/set-password?flow=reset` : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
    return { error: error?.message ?? null };
  };

  const verifyRecovery = async (tokenHash: string, type: string) => {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
    if (!error) await loadUser();
    return { error: error?.message ?? null };
  };

  const setPassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (!error) await loadUser();
    return { error: error?.message ?? null };
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, isGuest, signIn, signOut, setGuest, refresh: loadUser, requestPasswordReset, verifyRecovery, setPassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isGuest, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const isLogin = pathname === "/login";
  const isPasswordSetup = pathname === "/set-password";

  React.useEffect(() => {
    if (loading || isLogin || isPasswordSetup) return;
    if (!user && !isGuest) navigate({ to: "/login" });
  }, [loading, user, isGuest, isLogin, isPasswordSetup, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground text-sm">
        Loading…
      </div>
    );
  }
  if (!isLogin && !isPasswordSetup && !user && !isGuest) return null;
  return <>{children}</>;
}

export function canEdit(user: AppUser | null, isGuest: boolean, category?: string): boolean {
  if (isGuest || !user) return false;
  if (user.role === "admin" || user.role === "scientist_e") return true;
  if (user.role === "manager") {
    if (!category) return true;
    return (user.category_access || []).includes(category);
  }
  return false;
}

export function canDelete(user: AppUser | null, isGuest: boolean): boolean {
  if (isGuest || !user) return false;
  return user.role === "admin" || user.role === "scientist_e";
}

export function canComment(user: AppUser | null, isGuest: boolean): boolean {
  if (isGuest || !user) return false;
  return ["admin", "scientist_e", "manager"].includes(user.role);
}

export function canAccessAdmin(user: AppUser | null): boolean {
  if (!user) return false;
  return user.role === "admin" || user.role === "scientist_e";
}

export function canViewCategory(user: AppUser | null, isGuest: boolean, category: string): boolean {
  if (isGuest) return true;
  if (!user) return false;
  if (user.role === "admin" || user.role === "scientist_e") return true;
  if (user.role === "manager") return (user.category_access || []).includes(category);
  return true;
}
