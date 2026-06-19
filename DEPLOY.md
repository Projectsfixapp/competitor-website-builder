# Competitor Website Builder – Hetzner Deployment

Vollständige Anleitung für den Betrieb auf einem Hetzner Cloud Server (oder jedem anderen Linux-VPS).

---

## Voraussetzungen

| Anforderung | Empfehlung |
|---|---|
| Server | Hetzner CX22 (2 vCPU, 4 GB RAM) oder größer |
| Betriebssystem | Ubuntu 22.04 oder 24.04 |
| Domain | Optional, aber empfohlen für HTTPS |
| Ports | 80 (HTTP), 443 (HTTPS) offen in Hetzner Firewall |

---

## Schritt 1: Server vorbereiten

```bash
# Als root einloggen
ssh root@DEINE_SERVER_IP

# System aktualisieren
apt update && apt upgrade -y

# Docker installieren (offizielles Script)
curl -fsSL https://get.docker.com | sh

# Docker ohne sudo nutzbar machen (optional, für nicht-root User)
usermod -aG docker $USER
newgrp docker

# Git installieren
apt install -y git
```

---

## Schritt 2: Projekt auf den Server übertragen

**Option A: Per Git (empfohlen)**
```bash
# Auf dem Server
cd /opt
git clone https://github.com/DEIN_REPO/competitor-website-builder.git
cd competitor-website-builder
```

**Option B: Per ZIP-Upload (ohne Git)**
```bash
# Lokal: ZIP herunterladen (Code-Tab → "Download all files")
# Dann auf den Server übertragen:
scp competitor-website-builder.zip root@DEINE_SERVER_IP:/opt/
ssh root@DEINE_SERVER_IP
cd /opt && unzip competitor-website-builder.zip
cd competitor-website-builder
```

---

## Schritt 3: Umgebungsvariablen konfigurieren

```bash
# Template kopieren
cp deploy/.env.production.template .env

# .env bearbeiten
nano .env
```

**Pflichtfelder:**

| Variable | Beschreibung | Wie erhalten |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | MySQL Root-Passwort | Selbst wählen (sicher!) |
| `MYSQL_PASSWORD` | App-Datenbankpasswort | Selbst wählen |
| `JWT_SECRET` | Session-Signing-Key | `openssl rand -hex 32` |
| `VITE_APP_ID` | Manus OAuth App-ID | Manus Projekteinstellungen |
| `BUILT_IN_FORGE_API_KEY` | Manus LLM API-Key | Manus Projekteinstellungen |

**`GEMINI_API_KEY` ist nicht mehr rein optional:** wird zusätzlich zur Text-Analyse auch für die KI-Bild-Fallback-Generierung genutzt (`server/geminiImages.ts`), unabhängig davon, welcher LLM-Provider für die Analyse gewählt wird. Ohne diesen Key generiert die App bei fehlenden echten Bildern einfach foto-freie, farbflächenbasierte Designs statt Fotos — kein Absturz, aber weniger visuelle Vielfalt.

| Variable | Beschreibung |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) — Pflicht für Bild-Fallback, optional nur für Text falls Gemini nicht als Analyse-Provider gewählt wird |
| `ANTHROPIC_API_KEY` | [Anthropic Console](https://console.anthropic.com/settings/keys) — nur falls Claude als Analyse-Provider gewählt wird |

---

## Schritt 4: Deployment starten

```bash
# Deploy-Script ausführbar machen
chmod +x deploy/deploy.sh

# Deployment starten
bash deploy/deploy.sh
```

Das Script führt automatisch aus:
1. Docker-Images bauen
2. Datenbank starten und warten
3. SQL-Migrationen anwenden
4. App starten
5. Health-Check

---

## Schritt 5: nginx + SSL einrichten (empfohlen)

```bash
# nginx und certbot installieren
sudo apt install -y nginx certbot python3-certbot-nginx

# nginx-Konfiguration kopieren und Domain eintragen
sudo cp deploy/nginx.conf /etc/nginx/sites-available/competitor-builder
sudo sed -i 's/deine-domain.de/DEINE_DOMAIN.DE/g' /etc/nginx/sites-available/competitor-builder

# Aktivieren
sudo ln -sf /etc/nginx/sites-available/competitor-builder /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# SSL-Zertifikat (kostenlos via Let's Encrypt)
sudo certbot --nginx -d DEINE_DOMAIN.DE
```

Nach diesem Schritt ist die App unter `https://DEINE_DOMAIN.DE` erreichbar.

---

## Verwaltung

```bash
# Logs anzeigen (live)
docker compose logs -f app

# Datenbanklog
docker compose logs -f db

# Status aller Container
docker compose ps

# App neu starten
docker compose restart app

# Alles stoppen
docker compose down

# Update deployen (nach Code-Änderungen)
git pull && bash deploy/deploy.sh
```

---

## Hetzner Firewall einrichten

In der Hetzner Cloud Console unter **Firewalls**:

| Regel | Protokoll | Port | Quelle |
|---|---|---|---|
| SSH | TCP | 22 | Deine IP (einschränken!) |
| HTTP | TCP | 80 | Any |
| HTTPS | TCP | 443 | Any |

Port 3000 und 3306 **nicht** öffentlich freigeben – diese laufen nur intern.

---

## Kosten-Übersicht

| Provider | Kosten pro Website-Generierung (ca.) |
|---|---|
| Manus Built-in | Aus Manus-Credits |
| Google Gemini 2.5 Flash | ~0,01–0,05 € |
| Anthropic Claude Sonnet | ~0,05–0,15 € |

**Hetzner Server:** CX22 = ~4,35 €/Monat

---

## Troubleshooting

**App startet nicht:**
```bash
docker compose logs app
```

**Datenbank-Verbindungsfehler:**
```bash
# Prüfen ob DB läuft
docker compose ps db
# Verbindung testen
docker compose exec db mysql -u appuser -p competitor_builder
```

**nginx 502 Bad Gateway:**
```bash
# App läuft?
curl http://localhost:3000/api/health
# nginx-Fehlerlog
sudo tail -f /var/log/nginx/competitor-builder.error.log
```

**SSL-Zertifikat erneuern:**
```bash
sudo certbot renew --dry-run
```
