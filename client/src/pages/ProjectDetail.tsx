import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Globe,
  Loader2,
  RefreshCw,
  Tag,
  Target,
  Users,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";

interface SSEStatus {
  step: string;
  message: string;
  progress: number;
}

interface SSEScraped {
  url: string;
  title: string;
  headlines: string[];
}

interface SSEAnalysis {
  insights: {
    usps: string[];
    keywords: string[];
    toneOfVoice: string;
    structurePatterns: string[];
    ctaPatterns: string[];
    targetAudience: string;
    competitorSummaries: Array<{ url: string; title: string; summary: string; usps: string[] }>;
  };
}

export default function ProjectDetail() {
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id ?? "0", 10);

  const { data, isLoading, refetch } = trpc.projects.get.useQuery(
    { id: projectId },
    { enabled: !!projectId, refetchInterval: false }
  );

  const [sseStatus, setSseStatus] = useState<SSEStatus | null>(null);
  const [sseScraped, setSseScraped] = useState<SSEScraped[]>([]);
  const [sseAnalysis, setSseAnalysis] = useState<SSEAnalysis | null>(null);
  const [sseError, setSseError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [expandedCompetitor, setExpandedCompetitor] = useState<number | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startAnalysis = () => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    setSseStatus({ step: "init", message: "Verbinde mit Server…", progress: 0 });
    setSseScraped([]);
    setSseAnalysis(null);
    setSseError(null);
    setIsRunning(true);

    const es = new EventSource(`/api/analyze/${projectId}`);
    eventSourceRef.current = es;

    es.addEventListener("status", (e) => {
      const d = JSON.parse(e.data) as SSEStatus;
      setSseStatus(d);
    });

    es.addEventListener("scraped", (e) => {
      const d = JSON.parse(e.data) as SSEScraped;
      setSseScraped((prev) => [...prev, d]);
    });

    es.addEventListener("analysis", (e) => {
      const d = JSON.parse(e.data) as SSEAnalysis;
      setSseAnalysis(d);
    });

    es.addEventListener("done", () => {
      setIsRunning(false);
      es.close();
      refetch();
    });

    es.addEventListener("error", (e) => {
      try {
        const d = JSON.parse((e as MessageEvent).data) as { message: string };
        setSseError(d.message);
      } catch {
        setSseError("Verbindungsfehler");
      }
      setIsRunning(false);
      es.close();
      refetch();
    });

    es.onerror = () => {
      if (!isRunning) return;
      setIsRunning(false);
      es.close();
    };
  };

  // Auto-start if project is pending
  useEffect(() => {
    if (data?.project.status === "pending" && !isRunning) {
      startAnalysis();
    }
  }, [data?.project.status]);

  useEffect(() => {
    return () => eventSourceRef.current?.close();
  }, []);

  const analysis = sseAnalysis?.insights ?? data?.analysis;
  const project = data?.project;
  const website = data?.website;

  if (isLoading) {
    return (
      <AppLayout title="Projekt laden…">
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout title="Projekt nicht gefunden">
        <div className="text-center py-24 text-muted-foreground">
          <AlertCircle size={40} className="mx-auto mb-4 opacity-30" />
          <p>Dieses Projekt existiert nicht oder du hast keinen Zugriff.</p>
        </div>
      </AppLayout>
    );
  }

  const currentStatus = sseStatus?.step ?? project.status;
  const isDone = project.status === "done" && !isRunning;
  const isError = project.status === "error" && !isRunning;

  const providerLabel: Record<string, string> = {
    manus: "Manus Built-in",
    gemini: "Gemini 2.5 Flash",
    claude: "Claude Sonnet",
  };
  const providerColor: Record<string, string> = {
    manus: "bg-primary/10 text-primary",
    gemini: "bg-blue-50 text-blue-600",
    claude: "bg-orange-50 text-orange-600",
  };
  const providerKey = (project.llmProvider ?? "manus") as string;

  return (
    <AppLayout
      title={project.name}
      subtitle={
        <span className="flex items-center gap-2">
          <span>Projekt #{project.id}</span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${providerColor[providerKey] ?? "bg-secondary text-muted-foreground"}`}>
            {providerLabel[providerKey] ?? providerKey}
          </span>
        </span>
      }
      actions={
        isDone && website ? (
          <Link href={`/project/${projectId}/preview`}>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Eye size={14} className="mr-1.5" /> Website ansehen
            </Button>
          </Link>
        ) : isError ? (
          <Button
            size="sm"
            variant="outline"
            onClick={startAnalysis}
          >
            <RefreshCw size={14} className="mr-1.5" /> Erneut versuchen
          </Button>
        ) : null
      }
    >
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in-up">

        {/* ── Progress Card ─────────────────────────────────────────────── */}
        {(isRunning || (!isDone && !isError)) && (
          <div className="card-premium p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg font-semibold">Analyse-Fortschritt</h2>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full pulse-dot" />
                  Live
                </span>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{sseStatus?.message ?? "Warte auf Start…"}</span>
                <span>{sseStatus?.progress ?? 0}%</span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${sseStatus?.progress ?? 0}%` }}
                />
              </div>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { key: "scraping", label: "Scraping", icon: <Globe size={14} /> },
                { key: "analyzing", label: "Analyse", icon: <BarChart3 size={14} /> },
                { key: "generating", label: "Generierung", icon: <Zap size={14} /> },
              ].map((step) => {
                const stepOrder = ["scraping", "analyzing", "generating", "done"];
                const currentIdx = stepOrder.indexOf(currentStatus);
                const stepIdx = stepOrder.indexOf(step.key);
                const isActive = currentStatus === step.key;
                const isComplete = currentIdx > stepIdx;
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : isComplete
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {isComplete ? (
                      <CheckCircle2 size={13} />
                    ) : isActive ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      step.icon
                    )}
                    {step.label}
                  </div>
                );
              })}
            </div>

            {/* Scraped URLs */}
            {sseScraped.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-border/40">
                <p className="text-xs font-medium text-muted-foreground">Gescrapte Seiten</p>
                {sseScraped.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.title}</p>
                      <p className="text-muted-foreground truncate">{s.url}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
        {(isError || sseError) && (
          <div className="card-premium p-5 border-red-200 bg-red-50">
            <div className="flex items-start gap-3">
              <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700">Analyse fehlgeschlagen</p>
                <p className="text-xs text-red-500 mt-1">
                  {sseError ?? project.errorMessage ?? "Unbekannter Fehler"}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 text-xs border-red-200 text-red-600 hover:bg-red-100"
                  onClick={startAnalysis}
                >
                  <RefreshCw size={12} className="mr-1.5" /> Erneut versuchen
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── Done Banner ───────────────────────────────────────────────── */}
        {isDone && website && (
          <div className="card-premium p-5 bg-emerald-50 border-emerald-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-emerald-700">Website erfolgreich generiert!</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Öffne die Vorschau, um die Website zu bearbeiten und zu exportieren.
                  </p>
                </div>
              </div>
              <Link href={`/project/${projectId}/preview`}>
                <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700 shrink-0">
                  <Eye size={14} className="mr-1.5" /> Vorschau öffnen
                  <ArrowRight size={13} className="ml-1.5" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Analysis Dashboard ────────────────────────────────────────── */}
        {analysis && (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="accent-line" />
              <h2 className="font-serif text-xl font-semibold">Analyse-Ergebnisse</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* USPs */}
              <div className="card-premium p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Target size={15} className="text-accent" />
                  Einzigartige Verkaufsargumente
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(analysis.usps ?? []).map((usp, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-primary/5 border border-primary/10 rounded-full text-xs font-medium"
                    >
                      {usp}
                    </span>
                  ))}
                </div>
              </div>

              {/* Keywords */}
              <div className="card-premium p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Tag size={15} className="text-accent" />
                  Keywords
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(analysis.keywords ?? []).map((kw, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 bg-accent/10 border border-accent/20 rounded-full text-xs"
                      style={{ color: "oklch(72% 0.08 75)" }}
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tone & Audience */}
              <div className="card-premium p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Users size={15} className="text-accent" />
                  Zielgruppe & Tonalität
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Zielgruppe
                    </p>
                    <p className="text-xs leading-relaxed">{analysis.targetAudience}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Tonalität
                    </p>
                    <p className="text-xs leading-relaxed">{analysis.toneOfVoice}</p>
                  </div>
                </div>
              </div>

              {/* CTAs */}
              <div className="card-premium p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Zap size={15} className="text-accent" />
                  CTA-Muster
                </div>
                <div className="space-y-1.5">
                  {(analysis.ctaPatterns ?? []).map((cta, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs px-3 py-1.5 bg-secondary rounded-lg"
                    >
                      <ArrowRight size={11} className="text-muted-foreground shrink-0" />
                      {cta}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Competitor Summaries */}
            {(analysis.competitorSummaries ?? []).length > 0 && (
              <div className="card-premium p-5 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Globe size={15} className="text-accent" />
                  Mitbewerber-Zusammenfassungen
                </div>
                <div className="space-y-2">
                  {(analysis.competitorSummaries ?? []).map((comp, i) => (
                    <div key={i} className="border border-border/50 rounded-lg overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-secondary/50 transition-colors"
                        onClick={() =>
                          setExpandedCompetitor(expandedCompetitor === i ? null : i)
                        }
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{comp.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{comp.url}</p>
                        </div>
                        {expandedCompetitor === i ? (
                          <ChevronUp size={14} className="text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                        )}
                      </button>
                      {expandedCompetitor === i && (
                        <div className="px-4 pb-4 space-y-3 border-t border-border/40">
                          <p className="text-xs text-muted-foreground leading-relaxed pt-3">
                            {comp.summary}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {comp.usps.map((usp, j) => (
                              <span
                                key={j}
                                className="px-2 py-0.5 bg-secondary rounded-full text-[11px]"
                              >
                                {usp}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
