import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { ArrowRight, BarChart3, Globe, Layers, Sparkles, Zap } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: <Globe size={20} />,
    title: "Intelligentes Scraping",
    desc: "Analysiert Mitbewerber-URLs automatisch und extrahiert Texte, Headlines, CTAs und Seitenstruktur.",
  },
  {
    icon: <BarChart3 size={20} />,
    title: "KI-Analyse-Dashboard",
    desc: "Visualisiert USPs, Keywords, Tonalität und Conversion-Muster aller analysierten Websites.",
  },
  {
    icon: <Sparkles size={20} />,
    title: "Website-Generator",
    desc: "Erstellt vollständige, hochkonvertierende Websites – besser als jeder einzelne Mitbewerber.",
  },
  {
    icon: <Layers size={20} />,
    title: "Inline-Editing",
    desc: "Alle generierten Texte sind direkt im Browser editierbar – ohne Programmierkenntnisse.",
  },
  {
    icon: <Zap size={20} />,
    title: "Echtzeit-Fortschritt",
    desc: "Schritt-für-Schritt-Statusanzeige während Scraping, Analyse und Generierung.",
  },
  {
    icon: <ArrowRight size={20} />,
    title: "HTML-Export",
    desc: "Fertige Website als vollständiges HTML/CSS-Paket herunterladen und sofort einsetzen.",
  },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className="h-16 px-8 flex items-center justify-between border-b border-border/60 bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
            <Sparkles size={14} className="text-primary-foreground" />
          </div>
          <span className="font-serif text-base font-semibold">Competitor Website Builder</span>
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            isAuthenticated ? (
              <Link href="/dashboard">
                <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Dashboard öffnen <ArrowRight size={14} className="ml-1.5" />
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => (window.location.href = getLoginUrl())}
              >
                Kostenlos starten
              </Button>
            )
          )}
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-20 text-center animate-fade-in-up">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent mb-8">
          <Sparkles size={11} />
          KI-gestützte Mitbewerber-Analyse
        </div>
        <h1 className="font-serif text-5xl md:text-6xl font-semibold leading-tight mb-6">
          Analysiere Mitbewerber.
          <br />
          <span className="text-gold">Übertreffe sie.</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed mb-10">
          Gib Mitbewerber-URLs ein – das Tool scraped, analysiert und generiert automatisch eine
          überlegene, hochkonvertierende Website. Inklusive Inline-Editing und HTML-Export.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {isAuthenticated ? (
            <Link href="/new">
              <Button size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 px-8">
                Neue Analyse starten <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
          ) : (
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 px-8"
              onClick={() => (window.location.href = getLoginUrl())}
            >
              Jetzt kostenlos starten <ArrowRight size={16} className="ml-2" />
            </Button>
          )}
          {isAuthenticated && (
            <Link href="/dashboard">
              <Button size="lg" variant="outline" className="px-8">
                Meine Projekte
              </Button>
            </Link>
          )}
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-8">
        <div className="divider" />
      </div>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 py-20">
        <div className="text-center mb-14">
          <div className="accent-line mx-auto mb-4" />
          <h2 className="font-serif text-3xl font-semibold mb-3">Alles, was du brauchst</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Von der URL-Eingabe bis zum fertigen HTML-Export – vollständig automatisiert.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger-children">
          {features.map((f) => (
            <div key={f.title} className="card-premium p-6 space-y-3">
              <div className="w-9 h-9 bg-accent/10 rounded-lg flex items-center justify-center text-accent">
                {f.icon}
              </div>
              <h3 className="font-sans text-sm font-semibold">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA Banner ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-8 pb-20">
        <div className="bg-primary rounded-2xl p-12 text-center text-primary-foreground">
          <h2 className="font-serif text-3xl font-semibold mb-4">
            Bereit, deine Mitbewerber zu übertreffen?
          </h2>
          <p className="text-primary-foreground/70 mb-8 max-w-md mx-auto">
            Starte jetzt deine erste Analyse – kostenlos, ohne Kreditkarte.
          </p>
          {isAuthenticated ? (
            <Link href="/new">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 px-8">
                Analyse starten <ArrowRight size={16} className="ml-2" />
              </Button>
            </Link>
          ) : (
            <Button
              size="lg"
              className="bg-white text-primary hover:bg-white/90 px-8"
              onClick={() => (window.location.href = getLoginUrl())}
            >
              Kostenlos starten <ArrowRight size={16} className="ml-2" />
            </Button>
          )}
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-border/60 py-8 px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Sparkles size={12} />
            <span>Competitor Website Builder</span>
          </div>
          <span>© {new Date().getFullYear()} – Alle Rechte vorbehalten</span>
        </div>
      </footer>
    </div>
  );
}
