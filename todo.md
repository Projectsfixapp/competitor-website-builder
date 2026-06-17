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
- [x] LLM-Adapter: universeller Wrapper für Manus/Gemini/Claude
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
