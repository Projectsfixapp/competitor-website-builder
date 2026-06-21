export const COOKIE_NAME = "app_session_id";
// Identifies a not-yet-signed-up visitor so they can run exactly one free
// preview analysis (see countUnclaimedAnonymousProjects) and so that project
// can be "claimed" onto their account once they register/login.
export const ANON_COOKIE_NAME = "app_anon_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ─── Design / Theme ────────────────────────────────────────────────────────────
// Background is intentionally a small curated light-only palette, not a free
// color picker — "kein Dark Mode" is a product guarantee, not a suggestion.
export const BACKGROUND_PRESETS = [
  { id: "off-white", label: "Off-White", hex: "#FAFAF9" },
  { id: "pure-white", label: "Reinweiß", hex: "#FFFFFF" },
  { id: "warm-cream", label: "Warme Creme", hex: "#FBF6EE" },
  { id: "soft-gray", label: "Sanftes Grau", hex: "#F4F4F5" },
] as const;

export const DEFAULT_BACKGROUND_HEX: string = BACKGROUND_PRESETS[0].hex;
export const DEFAULT_ACCENT_COLORS = ["#C8A96E"];
export const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
