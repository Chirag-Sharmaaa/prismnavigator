import { Sidebar } from "./Sidebar";
import { Footer } from "./Footer";
import { GuestBanner } from "./GuestBanner";
import type { ReactNode } from "react";

export function Layout({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <GuestBanner />
        <main className={`flex-1 ${fullBleed ? "" : "px-4 sm:px-6 lg:px-8 py-6"}`}>
          {children}
        </main>
        <Footer />
      </div>
    </div>
  );
}
