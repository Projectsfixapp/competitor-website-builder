import AppLayout from "@/components/AppLayout";
import { AuthDialog } from "@/components/AuthDialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FolderOpen,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const statusConfig = {
  pending: { label: "Ausstehend", icon: <Clock size={13} />, color: "text-muted-foreground bg-muted" },
  scraping: { label: "Scraping…", icon: <Loader2 size={13} className="animate-spin" />, color: "text-blue-600 bg-blue-50" },
  analyzing: { label: "Analysiere…", icon: <Loader2 size={13} className="animate-spin" />, color: "text-amber-600 bg-amber-50" },
  generating: { label: "Generiere…", icon: <Loader2 size={13} className="animate-spin" />, color: "text-purple-600 bg-purple-50" },
  done: { label: "Fertig", icon: <CheckCircle2 size={13} />, color: "text-emerald-600 bg-emerald-50" },
  error: { label: "Fehler", icon: <AlertCircle size={13} />, color: "text-red-600 bg-red-50" },
};

export default function Dashboard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const { data: projects, isLoading, refetch } = trpc.projects.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      toast.success("Projekt gelöscht");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Projekt „${name}" wirklich löschen?`)) {
      deleteMutation.mutate({ id });
    }
  };

  if (!authLoading && !isAuthenticated) {
    return (
      <AppLayout title="Meine Projekte">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-5">
            <Lock size={26} className="text-muted-foreground" />
          </div>
          <h3 className="font-serif text-xl font-semibold mb-2">Anmelden, um Projekte zu sehen</h3>
          <p className="text-muted-foreground text-sm max-w-xs mb-6">
            Deine gespeicherten Analysen und generierten Websites sind an dein Konto gebunden.
          </p>
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => setAuthOpen(true)}
          >
            Anmelden / Registrieren
          </Button>
        </div>
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      title="Meine Projekte"
      subtitle="Alle gespeicherten Analysen und generierten Websites"
      actions={
        <Link href="/new">
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus size={14} className="mr-1.5" /> Neues Projekt
          </Button>
        </Link>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Lade Projekte…</p>
          </div>
        </div>
      ) : !projects || projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-secondary rounded-2xl flex items-center justify-center mb-5">
            <FolderOpen size={28} className="text-muted-foreground" />
          </div>
          <h3 className="font-serif text-xl font-semibold mb-2">Noch keine Projekte</h3>
          <p className="text-muted-foreground text-sm max-w-xs mb-6">
            Starte deine erste Mitbewerber-Analyse und generiere eine überlegene Website.
          </p>
          <Link href="/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus size={14} className="mr-1.5" /> Erste Analyse starten
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 stagger-children">
          {projects.map((project) => {
            const status = statusConfig[project.status] ?? statusConfig.pending;
            return (
              <div key={project.id} className="card-premium p-5 flex flex-col gap-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-sans text-sm font-semibold truncate">{project.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(project.createdAt), {
                        addSuffix: true,
                        locale: de,
                      })}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${status.color}`}
                  >
                    {status.icon}
                    {status.label}
                  </span>
                </div>

                {/* Error message */}
                {project.status === "error" && project.errorMessage && (
                  <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 leading-relaxed">
                    {project.errorMessage}
                  </p>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border/40">
                  <Link href={`/project/${project.id}`} className="flex-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full text-xs"
                    >
                      Öffnen <ArrowRight size={12} className="ml-1" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-red-500 hover:bg-red-50 px-2"
                    onClick={() => handleDelete(project.id, project.name)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
