import { describe, expect, it } from "vitest";
import { extractConfigJson } from "./pipeline";

describe("extractConfigJson", () => {
  it("returns {} when no CONFIG block is present", () => {
    expect(extractConfigJson("<html><body>Hi</body></html>")).toEqual({});
  });

  it("parses a well-formed JSON object literal", () => {
    const html = `<script>const CONFIG = {"hero":"Willkommen","cta":"Jetzt starten"};</script>`;
    expect(extractConfigJson(html)).toEqual({ hero: "Willkommen", cta: "Jetzt starten" });
  });

  it("parses loose JS object-literal syntax (unquoted keys, single quotes, trailing comma)", () => {
    const html = `<script>const CONFIG = { hero: 'Willkommen', items: [1, 2, 3], };</script>`;
    expect(extractConfigJson(html)).toEqual({ hero: "Willkommen", items: [1, 2, 3] });
  });

  it("returns {} for malformed object literals instead of throwing", () => {
    const html = `<script>const CONFIG = { this is not valid };</script>`;
    expect(extractConfigJson(html)).toEqual({});
  });

  it("never executes code embedded in the CONFIG block", () => {
    let sideEffect = false;
    const html = `<script>const CONFIG = (function(){ sideEffect = true; return {}; })();</script>`;
    // The regex only matches a literal `{...}` body, so an IIFE like this simply
    // fails to match (no leading "{") and falls back to {} — it must never run.
    const result = extractConfigJson(html);
    expect(result).toEqual({});
    expect(sideEffect).toBe(false);
  });

  it("never executes a classic eval-breakout payload (constructor.constructor)", () => {
    // JSON5 only understands literal values, not expressions/method calls, so this
    // fails to parse and falls back to {} — it must never reach process.exit().
    const html = `<script>const CONFIG = { x: "a".constructor.constructor("process.exit(1)")() };</script>`;
    expect(extractConfigJson(html)).toEqual({});
  });
});
