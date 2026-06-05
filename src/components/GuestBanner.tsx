import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export function GuestBanner() {
  const { isGuest } = useAuth();
  if (!isGuest) return null;
  return (
    <div className="bg-[#2E75B6] text-white px-4 py-2 text-sm flex items-center justify-between gap-4">
      <span>Browsing as Guest — Read Only Access. Log in to make changes.</span>
      <Link
        to="/login"
        className="bg-white text-[#1E3A5F] px-3 py-1 rounded text-xs font-semibold hover:bg-white/90"
      >
        Login
      </Link>
    </div>
  );
}
