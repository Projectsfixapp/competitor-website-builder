#!/bin/bash
# ─── Competitor Website Builder – Hetzner Deploy Script ──────────────────────
# Verwendung: bash deploy/deploy.sh
#
# Voraussetzungen auf dem Hetzner-Server:
#   - Ubuntu 22.04 oder 24.04
#   - Docker + Docker Compose installiert
#   - .env Datei im Projektverzeichnis vorhanden (aus .env.production.template)
#
# Dieses Script:
#   1. Prüft Voraussetzungen
#   2. Baut Docker-Images neu
#   3. Führt Datenbank-Migrationen aus
#   4. Startet alle Services
#   5. Richtet nginx + SSL ein (optional)

set -euo pipefail

# ─── Farben ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── Voraussetzungen prüfen ───────────────────────────────────────────────────
log_info "Prüfe Voraussetzungen…"

command -v docker >/dev/null 2>&1 || log_error "Docker nicht gefunden. Installiere mit: curl -fsSL https://get.docker.com | sh"
command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || log_error "Docker Compose nicht gefunden."

if [ ! -f ".env" ]; then
    log_warn ".env Datei nicht gefunden!"
    log_info "Kopiere Template: cp deploy/.env.production.template .env"
    log_info "Dann .env befüllen und Script erneut ausführen."
    exit 1
fi

log_success "Alle Voraussetzungen erfüllt."

# ─── Alte Container stoppen ───────────────────────────────────────────────────
log_info "Stoppe laufende Container…"
docker compose down --remove-orphans 2>/dev/null || true

# ─── Images bauen ─────────────────────────────────────────────────────────────
log_info "Baue Docker-Images (kann 2–5 Minuten dauern)…"
docker compose build --no-cache

# ─── Datenbank starten ────────────────────────────────────────────────────────
log_info "Starte Datenbank…"
docker compose up -d db
log_info "Warte auf Datenbank-Bereitschaft (max. 60s)…"
for i in $(seq 1 12); do
    if docker compose exec -T db mysqladmin ping -h localhost --silent 2>/dev/null; then
        log_success "Datenbank bereit."
        break
    fi
    if [ "$i" -eq 12 ]; then
        log_error "Datenbank nicht erreichbar nach 60 Sekunden."
    fi
    sleep 5
done

# ─── Datenbank-Migrationen ────────────────────────────────────────────────────
log_info "Führe Datenbank-Migrationen aus…"
# Lade .env Variablen für Migration
source .env
MIGRATION_URL="mysql://${MYSQL_USER:-appuser}:${MYSQL_PASSWORD}@127.0.0.1:3306/${MYSQL_DATABASE:-competitor_builder}"

# Warte kurz bis Port erreichbar
sleep 3

# Führe alle SQL-Migrationen aus
for sql_file in drizzle/*.sql; do
    if [ -f "$sql_file" ]; then
        log_info "Migriere: $sql_file"
        docker compose exec -T db mysql \
            -u"${MYSQL_USER:-appuser}" \
            -p"${MYSQL_PASSWORD}" \
            "${MYSQL_DATABASE:-competitor_builder}" \
            < "$sql_file" 2>/dev/null || log_warn "Migration $sql_file fehlgeschlagen (evtl. bereits angewendet)"
    fi
done
log_success "Migrationen abgeschlossen."

# ─── App starten ──────────────────────────────────────────────────────────────
log_info "Starte Applikation…"
docker compose up -d app

# ─── Health Check ─────────────────────────────────────────────────────────────
log_info "Warte auf App-Bereitschaft (max. 30s)…"
for i in $(seq 1 6); do
    if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
        log_success "App läuft auf Port 3000."
        break
    fi
    if [ "$i" -eq 6 ]; then
        log_warn "Health-Check fehlgeschlagen – prüfe Logs: docker compose logs app"
    fi
    sleep 5
done

# ─── nginx Setup (optional) ───────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}──────────────────────────────────────────────────────────────${NC}"
echo -e "${YELLOW} Optionaler Schritt: nginx + SSL einrichten${NC}"
echo -e "${YELLOW}──────────────────────────────────────────────────────────────${NC}"
echo ""
echo "Führe folgende Befehle manuell aus (ersetze 'deine-domain.de'):"
echo ""
echo "  # nginx installieren (falls nicht vorhanden)"
echo "  sudo apt install -y nginx certbot python3-certbot-nginx"
echo ""
echo "  # nginx-Konfiguration kopieren"
echo "  sudo cp deploy/nginx.conf /etc/nginx/sites-available/competitor-builder"
echo "  sudo sed -i 's/deine-domain.de/DEINE_DOMAIN/g' /etc/nginx/sites-available/competitor-builder"
echo "  sudo ln -sf /etc/nginx/sites-available/competitor-builder /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "  # SSL-Zertifikat (Let's Encrypt)"
echo "  sudo certbot --nginx -d DEINE_DOMAIN"
echo ""

log_success "Deployment abgeschlossen!"
echo ""
echo -e "  App erreichbar unter: ${GREEN}http://localhost:3000${NC}"
echo -e "  Logs anzeigen:        ${BLUE}docker compose logs -f app${NC}"
echo -e "  Status prüfen:        ${BLUE}docker compose ps${NC}"
echo -e "  Neu deployen:         ${BLUE}bash deploy/deploy.sh${NC}"
echo ""
