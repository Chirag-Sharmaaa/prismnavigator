import * as React from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Folder, Search, Shield, Settings, LogOut,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useAuth, canAccessAdmin } from "@/lib/auth";

interface NavItem { label: string; to: string; params?: any; icon: any; adminOnly?: boolean; }

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "ADHOC", to: "/category/$slug", params: { slug: "adhoc" }, icon: Folder },
  { label: "IG", to: "/category/$slug", params: { slug: "ig" }, icon: Folder },
  { label: "SG", to: "/category/$slug", params: { slug: "sg" }, icon: Folder },
  { label: "CAR", to: "/category/$slug", params: { slug: "car" }, icon: Folder },
  { label: "NHRP", to: "/category/$slug", params: { slug: "nhrp" }, icon: Folder },
  { label: "Search", to: "/search", icon: Search },
  { label: "Admin", to: "/admin", icon: Shield, adminOnly: true },
  { label: "Settings", to: "/settings", icon: Settings },
];

export function Sidebar() {
  const { user, isGuest, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("prism-sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
    else if (window.innerWidth < 768) setCollapsed(true);
  }, []);

  const toggle = () => {
    setCollapsed((c) => {
      const v = !c;
      if (typeof window !== "undefined") localStorage.setItem("prism-sidebar-collapsed", String(v));
      return v;
    });
  };

  const isActive = (to: string, params?: any) => {
    if (to === "/") return pathname === "/";
    if (params?.slug) return pathname === `/category/${params.slug}`;
    return pathname.startsWith(to);
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <aside
      style={{ width: collapsed ? 60 : 240 }}
      className="bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-[250ms] border-r border-sidebar-border shrink-0 h-screen sticky top-0 z-30"
    >
      <div className="flex items-center justify-between px-3 h-14 border-b border-sidebar-border">
        {!collapsed && (
          <Link to="/" className="font-bold text-lg tracking-wider">PRISM</Link>
        )}
        <button onClick={toggle} className="p-1.5 rounded hover:bg-white/10" aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {navItems.map((item) => {
          if (item.adminOnly && !canAccessAdmin(user)) return null;
          const active = isActive(item.to, item.params);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              to={item.to as any}
              params={item.params}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                active ? "bg-[#2E75B6] text-white" : "hover:bg-white/10"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="text-xs">
              <div className="font-semibold truncate">{isGuest ? "Guest" : user?.name || "—"}</div>
              <div className="opacity-70 capitalize">
                {isGuest ? "Read-only" : user?.role?.replace("_", " ") || ""}
              </div>
            </div>
            {(user || isGuest) && (
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 text-xs px-2 py-1.5 rounded hover:bg-white/10"
              >
                <LogOut size={14} /> {isGuest ? "Login" : "Logout"}
              </button>
            )}
          </div>
        ) : (
          <button onClick={handleLogout} className="w-full flex justify-center p-2 rounded hover:bg-white/10" title="Logout">
            <LogOut size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
