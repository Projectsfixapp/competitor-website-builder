import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronRight,
  LogOut,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { AuthDialog } from "./AuthDialog";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Übersicht", icon: <BarChart3 size={16} />, exact: true },
  { href: "/new", label: "Neues Projekt", icon: <Plus size={16} /> },
];

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string | React.ReactNode;
  actions?: React.ReactNode;
}

export default function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  const { user, isAuthenticated, loading } = useAuth();
  const [location] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Lade…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-border/60 flex flex-col bg-card">
        {/* Logo */}
        <Link href="/" className="h-16 px-5 flex items-center gap-2.5 border-b border-border/60">
          <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center shrink-0">
            <Sparkles size={14} className="text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="font-serif text-sm font-semibold leading-tight truncate">Competitor</p>
            <p className="text-[10px] text-muted-foreground leading-tight tracking-wide uppercase">
              Website Builder
            </p>
          </div>
        </Link>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 py-2">
            Navigation
          </p>
          {navItems.map((item) => {
            const isActive = item.exact
              ? location === item.href
              : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all duration-150 group",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <span className={cn("shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                  {item.icon}
                </span>
                {item.label}
                {isActive && <ChevronRight size={12} className="ml-auto opacity-60" />}
              </Link>
            );
          })}

          {!isAuthenticated && (
            <>
              <Separator className="my-3" />
              <p className="px-2.5 text-xs text-muted-foreground leading-relaxed">
                Melde dich an, um deine Projekte zu speichern und zu exportieren.
              </p>
            </>
          )}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-border/60">
          {isAuthenticated ? (
            <UserMenu name={user?.name} email={user?.email} />
          ) : (
            <Button
              size="sm"
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => setAuthOpen(true)}
            >
              Anmelden
            </Button>
          )}
        </div>
      </aside>

      {/* ── Main Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {(title || actions) && (
          <header className="h-16 px-8 flex items-center justify-between border-b border-border/60 bg-card/50 backdrop-blur-sm shrink-0">
            <div>
              {title && (
                <h1 className="font-serif text-xl font-semibold leading-tight">{title}</h1>
              )}
              {subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </header>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-auto p-8">
          {children}
        </main>
      </div>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}

function UserMenu({ name, email }: { name?: string | null; email?: string | null }) {
  const { logout } = useAuth();
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-secondary transition-all duration-150 group">
      <div className="w-7 h-7 bg-accent/20 rounded-full flex items-center justify-center shrink-0">
        <User size={13} className="text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{name ?? "Nutzer"}</p>
        <p className="text-[10px] text-muted-foreground truncate">{email ?? ""}</p>
      </div>
      <button
        onClick={logout}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-border"
        title="Abmelden"
      >
        <LogOut size={12} className="text-muted-foreground" />
      </button>
    </div>
  );
}
