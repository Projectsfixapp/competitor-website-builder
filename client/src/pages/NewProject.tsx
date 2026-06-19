import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { BACKGROUND_PRESETS, DEFAULT_ACCENT_COLORS } from "@shared/const";
import { Brain, Globe, Home, Palette, Plus, Loader2, Sparkles, Wand2, X, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const MAX_URLS = 7;

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
  const [ownSiteIndex, setOwnSiteIndex] = useState<number | null>(null);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("manus");
  const [colorMode, setColorMode] = useState<"manual" | "extract">("manual");
  const [backgroundColor, setBackgroundColor] = useState<string>(BACKGROUND_PRESETS[0].hex);
  const [accentColors, setAccentColors] = useState<string[]>([DEFAULT_ACCENT_COLORS[0]!]);

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: ({ projectId }) => {
      toast.success("Projekt erstellt – Analyse startet…");
      navigate(`/project/${projectId}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const addUrl = () => {
    if (urls.length < MAX_URLS) setUrls([...urls, ""]);
  };

  const removeUrl = (i: number) => {
    if (urls.length <= 1) return;
    setUrls(urls.filter((_, idx) => idx !== i));
    setOwnSiteIndex((prev) => {
      if (prev === null) return null;
      if (prev === i) return null;
      return prev > i ? prev - 1 : prev;
    });
  };

  const updateUrl = (i: number, val: string) => {
    setUrls(urls.map((u, idx) => (idx === i ? val : u)));
  };

  const toggleOwnSite = (i: number) => {
    setOwnSiteIndex((prev) => (prev === i ? null : i));
  };

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const validUrlEntries = urls
    .map((url, i) => ({ url: url.trim(), isOwnSite: i === ownSiteIndex }))
    .filter((entry) => entry.url && isValidUrl(entry.url));
  const validUrls = validUrlEntries.map((e) => e.url);
  const hasOwnSite = validUrlEntries.some((e) => e.isOwnSite);

  const addAccentColor = () => {
    if (accentColors.length < 3) setAccentColors([...accentColors, "#C8A96E"]);
  };
  const removeAccentColor = (i: number) => {
    if (accentColors.length > 1) setAccentColors(accentColors.filter((_, idx) => idx !== i));
  };
  const updateAccentColor = (i: number, hex: string) => {
    setAccentColors(accentColors.map((c, idx) => (idx === i ? hex : c)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      toast.error("Bitte gib einen Projektnamen ein.");
      return;
    }
    if (validUrlEntries.length === 0) {
      toast.error("Bitte gib mindestens eine gültige URL ein.");
      return;
    }
    if (colorMode === "extract" && !hasOwnSite) {
      toast.error("Markiere eine URL als deine eigene Website, um Farben von dort zu übernehmen.");
      return;
    }
    createMutation.mutate({
      name: projectName.trim(),
      urls: validUrlEntries,
      llmProvider,
      colorMode,
      ...(colorMode === "manual" ? { backgroundColor, accentColors } : {}),
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
                Gib bis zu {MAX_URLS} Mitbewerber-URLs ein. Mindestens eine URL ist erforderlich. Hast du
                eine eigene Website, markiere sie mit dem Haus-Symbol — sie wird mit ins Ranking
                aufgenommen und kann als Quelle für Logo &amp; Farben dienen.
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    title="Das ist meine eigene Website"
                    className={cn(
                      "px-2",
                      ownSiteIndex === i
                        ? "text-primary bg-primary/10 hover:bg-primary/15"
                        : "text-muted-foreground hover:text-primary"
                    )}
                    onClick={() => toggleOwnSite(i)}
                  >
                    <Home size={14} />
                  </Button>
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

            {urls.length < MAX_URLS && (
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

          {/* Design / Colors */}
          <div className="card-premium p-6 space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">Farben &amp; Logo</h2>
              <p className="text-sm text-muted-foreground">
                Heller Hintergrund ist Pflicht (kein Dark Mode) — wähle 1–3 Akzentfarben, oder
                übernimm sie automatisch von deiner eigenen Website.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setColorMode("manual")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-all",
                  colorMode === "manual"
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-border bg-background"
                )}
              >
                <Palette size={14} /> Manuell wählen
              </button>
              <button
                type="button"
                onClick={() => setColorMode("extract")}
                className={cn(
                  "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-xs font-medium transition-all",
                  colorMode === "extract"
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-border bg-background"
                )}
              >
                <Wand2 size={14} /> Von meiner Website übernehmen
              </button>
            </div>

            {colorMode === "extract" && !hasOwnSite && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 leading-relaxed">
                Markiere oben eine URL mit dem Haus-Symbol als deine eigene Website, sonst können
                wir keine Farben übernehmen.
              </div>
            )}

            {colorMode === "manual" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Hintergrund</Label>
                  <div className="flex gap-2">
                    {BACKGROUND_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        title={preset.label}
                        onClick={() => setBackgroundColor(preset.hex)}
                        className={cn(
                          "w-9 h-9 rounded-full border-2 transition-all",
                          backgroundColor === preset.hex ? "border-primary scale-110" : "border-border/60"
                        )}
                        style={{ backgroundColor: preset.hex }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Akzentfarbe{accentColors.length > 1 ? "n" : ""}</Label>
                  <div className="space-y-2">
                    {accentColors.map((color, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => updateAccentColor(i, e.target.value)}
                          className="w-9 h-9 rounded-lg border border-border/60 cursor-pointer bg-background p-0.5"
                        />
                        <span className="text-xs text-muted-foreground font-mono">{color}</span>
                        {accentColors.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="px-2 text-muted-foreground hover:text-red-500 hover:bg-red-50"
                            onClick={() => removeAccentColor(i)}
                          >
                            <X size={14} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  {accentColors.length < 3 && (
                    <Button type="button" variant="outline" size="sm" className="text-xs" onClick={addAccentColor}>
                      <Plus size={13} className="mr-1.5" /> Akzentfarbe hinzufügen
                    </Button>
                  )}
                </div>
              </div>
            )}

            {colorMode === "extract" && hasOwnSite && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                Logo und Akzentfarben werden während der Analyse automatisch von deiner markierten
                Website übernommen. Falls dort keine eindeutigen Farben gefunden werden, nutzen wir
                eine dezente Standardfarbe.
              </p>
            )}
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
