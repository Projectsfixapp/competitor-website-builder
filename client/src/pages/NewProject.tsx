import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Brain, Globe, Plus, Loader2, Sparkles, X, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type LLMProvider = "manus" | "gemini" | "claude";

const PROVIDERS: {
  id: LLMProvider;
  name: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: "manus",
    name: "Manus Built-in",
    description: "Kein eigener API-Key nötig. Nutzt das integrierte Manus-Modell.",
    badge: "Standard",
    icon: <Sparkles size={16} />,
    color: "border-primary/40 bg-primary/5",
  },
  {
    id: "gemini",
    name: "Google Gemini 2.5 Flash",
    description: "Schnell & kostengünstig. Benötigt GEMINI_API_KEY in den Einstellungen.",
    badge: "Günstig",
    icon: <Zap size={16} />,
    color: "border-blue-200 bg-blue-50/50",
  },
  {
    id: "claude",
    name: "Anthropic Claude Sonnet",
    description: "Bester HTML/Copy-Output. Benötigt ANTHROPIC_API_KEY in den Einstellungen.",
    badge: "Beste Qualität",
    icon: <Brain size={16} />,
    color: "border-orange-200 bg-orange-50/50",
  },
];

export default function NewProject() {
  const [, navigate] = useLocation();
  const [projectName, setProjectName] = useState("");
  const [urls, setUrls] = useState<string[]>(["", ""]);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("manus");

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
      llmProvider,
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
                placeholder="z.B. Mitbewerber-Analyse Q3 2026"
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

          {/* LLM Provider Selection */}
          <div className="card-premium p-6 space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">KI-Modell auswählen</h2>
              <p className="text-sm text-muted-foreground">
                Wähle das Modell, das Analyse und Website-Generierung durchführt.
              </p>
            </div>

            <div className="grid gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setLlmProvider(p.id)}
                  className={cn(
                    "w-full text-left rounded-xl border-2 p-4 transition-all duration-150",
                    llmProvider === p.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border/60 hover:border-border bg-background"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Radio indicator */}
                    <div
                      className={cn(
                        "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        llmProvider === p.id
                          ? "border-primary bg-primary"
                          : "border-border bg-background"
                      )}
                    >
                      {llmProvider === p.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                      )}
                    </div>

                    {/* Icon */}
                    <div
                      className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                        llmProvider === p.id ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"
                      )}
                    >
                      {p.icon}
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{p.name}</span>
                        <span
                          className={cn(
                            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                            llmProvider === p.id
                              ? "bg-primary/15 text-primary"
                              : "bg-secondary text-muted-foreground"
                          )}
                        >
                          {p.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {p.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {(llmProvider === "gemini" || llmProvider === "claude") && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
                <strong>Hinweis:</strong> Für{" "}
                {llmProvider === "gemini" ? "Gemini" : "Claude"} muss der API-Key{" "}
                <code className="font-mono bg-amber-100 px-1 rounded">
                  {llmProvider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY"}
                </code>{" "}
                als Umgebungsvariable gesetzt sein. Auf Hetzner: in der <code className="font-mono bg-amber-100 px-1 rounded">.env</code>-Datei eintragen.
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Was passiert als nächstes?</strong> Das Tool
              scraped alle URLs, extrahiert Texte und Struktur, analysiert USPs und Conversion-Muster
              mit <strong className="text-foreground">{PROVIDERS.find(p => p.id === llmProvider)?.name}</strong> und
              generiert eine überlegene Website. Dieser Prozess dauert ca. 1–3 Minuten.
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
