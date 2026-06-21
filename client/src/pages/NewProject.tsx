import AppLayout from "@/components/AppLayout";
import { AuthDialog } from "@/components/AuthDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { BACKGROUND_PRESETS, DEFAULT_ACCENT_COLORS } from "@shared/const";
import { TRPCClientError } from "@trpc/client";
import {
  Brain,
  Globe,
  Image as ImageIcon,
  Plus,
  Loader2,
  Palette,
  Sparkles,
  Upload,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const MAX_URLS = 7;
const MAX_IMAGES = 5;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

type LLMProvider = "gemini" | "claude";
type PendingFile = { dataUrl: string; mimeType: string; fileName: string };

const PROVIDERS: {
  id: LLMProvider;
  name: string;
  description: string;
  badge: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    id: "claude",
    name: "Anthropic Claude Sonnet",
    description: "Bester HTML/Copy-Output. Standard-Modell für Analyse & Generierung.",
    badge: "Empfohlen",
    icon: <Brain size={16} />,
    color: "border-orange-200 bg-orange-50/50",
  },
  {
    id: "gemini",
    name: "Google Gemini 2.5 Flash",
    description: "Schnell & kostengünstig.",
    badge: "Günstig",
    icon: <Zap size={16} />,
    color: "border-blue-200 bg-blue-50/50",
  },
];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function NewProject() {
  const [, navigate] = useLocation();
  const [authOpen, setAuthOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [ownSiteUrl, setOwnSiteUrl] = useState("");
  const [urls, setUrls] = useState<string[]>(["", ""]);
  const [llmProvider, setLlmProvider] = useState<LLMProvider>("claude");
  const [colorMode, setColorMode] = useState<"manual" | "extract">("manual");
  const [backgroundColor, setBackgroundColor] = useState<string>(BACKGROUND_PRESETS[0].hex);
  const [accentColors, setAccentColors] = useState<string[]>([DEFAULT_ACCENT_COLORS[0]!]);
  const [logoFile, setLogoFile] = useState<PendingFile | null>(null);
  const [imageFiles, setImageFiles] = useState<PendingFile[]>([]);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const imagesInputRef = useRef<HTMLInputElement>(null);

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: ({ projectId }) => {
      toast.success("Projekt erstellt – Analyse startet…");
      navigate(`/project/${projectId}`);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "TOO_MANY_REQUESTS") {
        toast.error(err.message);
        setAuthOpen(true);
        return;
      }
      toast.error(err.message);
    },
  });

  const addUrl = () => {
    if (urls.length < MAX_URLS) setUrls([...urls, ""]);
  };

  const removeUrl = (i: number) => {
    if (urls.length <= 1) return;
    setUrls(urls.filter((_, idx) => idx !== i));
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

  const validUrls = urls.map((u) => u.trim()).filter((u) => u && isValidUrl(u));
  const ownSiteTrimmed = ownSiteUrl.trim();
  const hasOwnSite = ownSiteTrimmed.length > 0 && isValidUrl(ownSiteTrimmed);

  const addAccentColor = () => {
    if (accentColors.length < 3) setAccentColors([...accentColors, "#C8A96E"]);
  };
  const removeAccentColor = (i: number) => {
    if (accentColors.length > 1) setAccentColors(accentColors.filter((_, idx) => idx !== i));
  };
  const updateAccentColor = (i: number, hex: string) => {
    setAccentColors(accentColors.map((c, idx) => (idx === i ? hex : c)));
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte nur Bilddateien hochladen.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("Das Logo ist zu groß (max. 6 MB).");
      return;
    }
    setLogoFile({ dataUrl: await readFileAsDataUrl(file), mimeType: file.type, fileName: file.name });
  };

  const handleImagesSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = MAX_IMAGES - imageFiles.length;
    if (room <= 0) {
      toast.error(`Maximal ${MAX_IMAGES} Bilder.`);
      return;
    }
    const toAdd = files.slice(0, room);
    const read: PendingFile[] = [];
    for (const file of toAdd) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > MAX_UPLOAD_BYTES) {
        toast.error(`${file.name} ist zu groß (max. 6 MB).`);
        continue;
      }
      read.push({ dataUrl: await readFileAsDataUrl(file), mimeType: file.type, fileName: file.name });
    }
    setImageFiles((prev) => [...prev, ...read]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) {
      toast.error("Bitte gib einen Projektnamen ein.");
      return;
    }
    if (validUrls.length === 0) {
      toast.error("Bitte gib mindestens eine gültige Mitbewerber-URL ein.");
      return;
    }
    if (colorMode === "extract" && !hasOwnSite) {
      toast.error("Gib deine eigene Website an, um Farben von dort zu übernehmen.");
      return;
    }
    createMutation.mutate({
      name: projectName.trim(),
      competitorUrls: validUrls,
      ownSiteUrl: hasOwnSite ? ownSiteTrimmed : undefined,
      llmProvider,
      colorMode,
      ...(colorMode === "manual" ? { backgroundColor, accentColors } : {}),
      logoImage: logoFile ? { dataUrl: logoFile.dataUrl, mimeType: logoFile.mimeType } : undefined,
      images: imageFiles.length > 0 ? imageFiles.map((f) => ({ dataUrl: f.dataUrl, mimeType: f.mimeType })) : undefined,
    });
  };

  return (
    <AppLayout title="Neues Projekt" subtitle="Eigene Website, Mitbewerber-URLs und Analyse starten">
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

          {/* Own Site */}
          <div className="card-premium p-6 space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">Deine eigene Website (optional)</h2>
              <p className="text-sm text-muted-foreground">
                Hast du schon eine Website, übernehmen wir Über-uns-Text, Leistungen und
                Kontakt/Impressum-Daten automatisch in deine neue Seite – plus Logo und Markenfarben.
              </p>
            </div>
            <div className="relative">
              <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="https://deine-website.de"
                value={ownSiteUrl}
                onChange={(e) => setOwnSiteUrl(e.target.value)}
                className={cn(
                  "pl-9 bg-background",
                  ownSiteUrl && !isValidUrl(ownSiteUrl) ? "border-red-300 focus-visible:ring-red-300" : ""
                )}
              />
            </div>

            {/* Logo upload */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Logo (optional)</Label>
              {logoFile ? (
                <div className="flex items-center gap-2 text-xs bg-secondary rounded-lg px-2.5 py-1.5">
                  <img src={logoFile.dataUrl} alt="Logo-Vorschau" className="w-6 h-6 rounded object-contain bg-white" />
                  <span className="truncate flex-1">{logoFile.fileName}</span>
                  <button type="button" onClick={() => setLogoFile(null)} className="text-muted-foreground hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-2 w-full justify-center"
                >
                  <Upload size={12} /> Logo hochladen
                </button>
              )}
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoSelect} />
            </div>

            {/* Images upload */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Eigene Bilder (optional, max. {MAX_IMAGES})</Label>
              {imageFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageFiles.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={f.dataUrl} alt={f.fileName} className="w-14 h-14 rounded-lg object-cover border border-border/60" />
                      <button
                        type="button"
                        onClick={() => setImageFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute -top-1.5 -right-1.5 bg-card border border-border rounded-full p-0.5 text-muted-foreground hover:text-red-500"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imageFiles.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => imagesInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg px-3 py-2 w-full justify-center"
                >
                  <ImageIcon size={12} /> Bilder hochladen
                </button>
              )}
              <input
                ref={imagesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImagesSelect}
              />
            </div>
          </div>

          {/* Competitor URLs */}
          <div className="card-premium p-6 space-y-4">
            <div>
              <h2 className="font-serif text-lg font-semibold mb-1">Mitbewerber-URLs</h2>
              <p className="text-sm text-muted-foreground">
                Gib bis zu {MAX_URLS} Mitbewerber-URLs ein. Mindestens eine URL ist erforderlich.
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
                Trage oben deine eigene Website ein, sonst können wir keine Farben übernehmen.
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
                Logo und Akzentfarben werden während der Analyse automatisch von deiner Website
                übernommen. Falls dort keine eindeutigen Farben gefunden werden, nutzen wir eine
                dezente Standardfarbe.
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
          </div>

          {/* Info Box */}
          <div className="bg-accent/5 border border-accent/20 rounded-xl p-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Was passiert als nächstes?</strong> Das Tool
              scraped alle URLs, extrahiert Texte und Struktur, analysiert USPs und Conversion-Muster
              mit <strong className="text-foreground">{PROVIDERS.find(p => p.id === llmProvider)?.name}</strong> und
              generiert eine überlegene Website. Dieser Prozess dauert ca. 1–3 Minuten. Die Vorschau ist
              kostenlos — für den vollständigen Export und zum Bearbeiten meldest du dich danach an.
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
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        title="Kostenlose Analyse schon verwendet"
        description="Melde dich an, um weitere Projekte zu erstellen."
      />
    </AppLayout>
  );
}
