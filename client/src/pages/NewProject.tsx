import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Globe, Loader2, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function NewProject() {
  const [, navigate] = useLocation();
  const [projectName, setProjectName] = useState("");
  const [urls, setUrls] = useState<string[]>(["", ""]);

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: ({ projectId }) => {
      toast.success("Projekt erstellt – Analyse startet…");
      navigate(`/project/${projectId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const addUrl = () => {
    if (urls.length < 5) setUrls([...urls, ""]);
  };

  const removeUrl = (i: number) => {
    if (urls.length > 1) setUrls(urls.filter((_, idx) => idx !== i));
  };

  const updateUrl = (i: number, val: string) => {
    setUrls(urls.map((u, idx) => (idx === i ? val : u)));
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validUrls = urls.filter((u) => u.trim() && isValidUrl(u.trim()));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      toast.error("Bitte gib einen Projektnamen ein.");
      return;
    }
    if (validUrls.length === 0) {
      toast.error("Bitte gib mindestens eine gültige URL ein.");
      return;
    }
    createMutation.mutate({
      name: projectName.trim(),
      urls: validUrls,
    });
  };

  return (
    <AppLayout title="Neues Projekt" subtitle="Mitbewerber-URLs eingeben und Analyse starten">
      <div className="max-w-2xl mx-auto animate-fade-in-up">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Name */}
          <div className="card-premium p-6 space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">Projektname</h2>
              <p className="text-sm text-muted-foreground">
                Gib deinem Projekt einen aussagekräftigen Namen.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium">
                Name
              </Label>
              <Input
                id="name"
                placeholder="z.B. Kerzen-Markt Analyse Q3 2026"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                className="bg-background"
                required
              />
            </div>
          </div>

          {/* URLs */}
          <div className="card-premium p-6 space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">Mitbewerber-URLs</h2>
              <p className="text-sm text-muted-foreground">
                Gib bis zu 5 Mitbewerber-URLs ein. Mindestens eine URL ist erforderlich.
              </p>
            </div>

            <div className="space-y-3">
              {urls.map((url, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Globe
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      placeholder={`https://mitbewerber-${i + 1}.de`}
                      value={url}
                      onChange={(e) => updateUrl(i, e.target.value)}
                      className={`pl-9 bg-background ${
                        url && !isValidUrl(url) ? "border-red-300 focus-visible:ring-red-300" : ""
                      }`}
                    />
                    {url && isValidUrl(url) && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-emerald-400 rounded-full" />
                    )}
                  </div>
                  {urls.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                      onClick={() => removeUrl(i)}
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {urls.length < 5 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={addUrl}
              >
                <Plus size={13} className="mr-1.5" /> URL hinzufügen
              </Button>
            )}

            {/* URL Summary */}
            <div className="flex items-center gap-2 pt-2 border-t border-border/40">
              <span className="text-xs text-muted-foreground">
                {validUrls.length} von {urls.length} URLs gültig
              </span>
              <div className="flex gap-1">
                {urls.map((u, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full ${
                      u && isValidUrl(u) ? "bg-emerald-400" : "bg-border"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Was passiert als nächstes?</strong> Das Tool
              scraped alle URLs, extrahiert Texte und Struktur, analysiert USPs und Conversion-Muster
              per KI und generiert eine überlegene Website. Dieser Prozess dauert ca. 1–3 Minuten.
            </p>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            size="lg"
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={createMutation.isPending || validUrls.length === 0 || !projectName.trim()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                Erstelle Projekt…
              </>
            ) : (
              <>Analyse starten ({validUrls.length} URL{validUrls.length !== 1 ? "s" : ""})</>
            )}
          </Button>
        </form>
      </div>
    </AppLayout>
  );
}
