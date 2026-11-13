"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { PanelLeft, Search, Moon, Sun, ChevronRight } from "lucide-react";
import { SidebarTree } from "@/components/navigation/SidebarTree";
import { CommandSearchModal } from "@/components/navigation/CommandSearchModal";
import { useWorkspace } from "@/components/navigation/WorkspaceContext";
import { getAncestorChain } from "@/lib/tree";
import { Button } from "@/components/ui/button";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const params = useParams<{ documentId?: string }>();
  const pathname = usePathname();
  const { items, unlockedTitles, setSearchOpen } = useWorkspace();

  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [sidebarWidth, setSidebarWidth] = React.useState(260);
  const [isDark, setIsDark] = React.useState(false);
  const resizingRef = React.useRef(false);

  React.useEffect(() => {
    const savedDark = window.localStorage.getItem("ww-theme") === "dark";
    setIsDark(savedDark);
    document.documentElement.classList.toggle("dark", savedDark);
  }, []);

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("ww-theme", next ? "dark" : "light");
      return next;
    });
  }

  React.useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      const clamped = Math.min(420, Math.max(210, e.clientX));
      setSidebarWidth(clamped);
    }
    function onMouseUp() {
      resizingRef.current = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const breadcrumbs = React.useMemo(() => {
    if (!params?.documentId) return [];
    return getAncestorChain(items, params.documentId);
  }, [items, params?.documentId]);

  const staticPageTitle =
    pathname === "/trash"
      ? "Trash"
      : pathname === "/settings/members"
      ? "Members & Invites"
      : pathname === "/settings/security"
      ? "Security & Vault"
      : null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Resizable Sidebar */}
      {sidebarOpen && (
        <aside
          style={{ width: `${sidebarWidth}px` }}
          className="relative hidden shrink-0 border-r border-border bg-secondary/50 md:block"
        >
          <SidebarTree />
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={() => {
              resizingRef.current = true;
            }}
            className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-ring/50"
          />
        </aside>
      )}

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen((p) => !p)}
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>

            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-1 text-sm"
            >
              {staticPageTitle ? (
                <span className="truncate font-medium">{staticPageTitle}</span>
              ) : (
                breadcrumbs.map((crumb, idx) => {
                  const title = crumb.is_vault_encrypted
                    ? unlockedTitles[crumb.id] || "🔒 Encrypted Vault Page"
                    : crumb.title || "Untitled";
                  return (
                    <React.Fragment key={crumb.id}>
                      {idx > 0 && (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <Link
                        href={`/${crumb.id}`}
                        className="truncate rounded px-1.5 py-0.5 hover:bg-accent"
                      >
                        {crumb.icon ? `${crumb.icon} ` : ""}
                        {title}
                      </Link>
                    </React.Fragment>
                  );
                })
              )}
            </nav>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchOpen(true)}
              className="hidden h-8 gap-2 text-xs text-muted-foreground sm:inline-flex"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <kbd className="rounded border border-border px-1 font-mono text-[10px]">
                ⌘K
              </kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandSearchModal />
    </div>
  );
}
