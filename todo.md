# Competitor Website Builder – TODO

## Backend
- [x] DB-Schema: projects, competitor_urls, analysis_results, generated_websites
- [x] Scraping-Engine: serverseitiges URL-Abrufen und HTML-Parsen (Texte, Headlines, CTAs)
- [x] LLM-Analyse-Pipeline: USPs, Tonalität, Struktur, Conversion-Elemente extrahieren
- [x] LLM-Website-Generator: Hero, Features, CTA, Footer generieren
- [x] SSE-Streaming: Echtzeit-Fortschrittsanzeige für Scraping + Generierung
- [x] tRPC-Router: projects.list, projects.get, projects.create, projects.delete, projects.updateHtml

## Frontend
- [x] Premium-Design: Off-White Light Mode, Inter/Playfair Font, Gold-Akzent, großzügiges Whitespace
- [x] Landing Page / Home mit Hero, Feature-Grid und CTA-Banner
- [x] Dashboard-Layout mit Sidebar-Navigation und Auth-State
- [x] URL-Eingabe-Formular (1–5 URLs, Validierung, Live-Feedback)
- [x] Echtzeit-Fortschrittsanzeige (SSE, Schritt-für-Schritt-Status, Progress-Bar)
- [x] Analyse-Dashboard: USPs, Keywords, CTAs, Tonalität, Mitbewerber-Zusammenfassungen
- [x] Live-Vorschau: generierte Website als gerenderte HTML-Vorschau im iframe
- [x] Desktop/Mobile-Vorschau-Toggle
- [x] Inline-Editing: contenteditable auf alle Textelemente im iframe
- [x] HTML-Code-Editor mit Syntax-Highlighting
- [x] Export-Funktion: vollständiges HTML als Download
- [x] Projekt-Speicherung: Projekte pro Nutzer speichern und abrufen
- [x] Projekte-Übersicht: Liste aller gespeicherten Analysen mit Status-Badges
- [x] Projekt löschen mit Bestätigung

## Tests
- [x] Vitest-Tests für alle tRPC-Prozeduren (12 Tests, alle grün)
- [x] Auth-Logout-Test (bestehend)

## Modell-Auswahl
- [x] DB-Schema: llmProvider-Feld in projects-Tabelle
- [x] LLM-Adapter: universeller Wrapper für Gemini/Claude
- [x] Backend: llmProvider in SSE-Pipeline übergeben
- [x] Frontend: Modell-Auswahl-UI in NewProject (Radio/Select)
- [x] Frontend: gewähltes Modell im Projekt-Detail anzeigen

## Hetzner-Deployment
- [x] Dockerfile (multi-stage, Node 22 Alpine)
- [x] docker-compose.yml (App + MySQL)
- [x] nginx.conf (Reverse Proxy, HTTPS-ready, SSE-optimiert)
- [x] deploy.sh (automatisches Deploy-Script)
- [x] .env.production.template
- [x] DEPLOY.md (Schritt-für-Schritt-Anleitung)

## Manus-Entfernung & Freemium-Flow (2026-06-21)
- [x] Eigenes E-Mail/Passwort-Auth statt Manus-OAuth (server/_core/auth.ts, server/_core/password.ts)
- [x] Cloudflare R2 statt Manus-Forge-Storage (server/storage.ts)
- [x] "Manus Built-in"-LLM-Provider entfernt, Claude ist Standard
- [x] Lazy Signup: CTA öffnet Maske direkt, eine kostenlose Analyse ohne Login, Account-Pflicht erst für Speichern/Bearbeiten/Export
- [x] Anonyme Projekte (anonymousId-Cookie) + Claim-Flow beim Registrieren/Login
- [x] Rate-Limit: 1 unclaimed Projekt pro anonymer Session
- [x] "Eigene Website" als separates optionales Feld (statt Flag in der Konkurrenz-URL-Liste)
- [x] Logo-/Bilder-Upload direkt in der Eingabe-Maske (R2)
- [x] Über-uns/Leistungen/Impressum-Extraktion von der eigenen Website (server/scraper.ts: scrapeOwnSite)
- [x] Brand-Assets (Logo/Farben/Texte) werden beim Claim auf den User kopiert (Basis für künftige Module: CI, Druckdateien, Marketing, KI-Add-ons)
- [x] Alle Manus-Branding/Dev-Tooling-Reste entfernt (vite-plugin-manus-runtime, Debug-Collector, ManusDialog, manusTypes, ungenutzte Forge-Scaffolding-Dateien)
- [ ] Cloudflare R2 Zugangsdaten in Produktion eintragen (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET_NAME/R2_PUBLIC_URL_BASE)
- [ ] Payment/Kauf-Flow für die "ausführliche Datei" (aktuell nur Login-Gate, noch keine Bezahlung)
