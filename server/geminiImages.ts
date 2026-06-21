/**
 * AI image generation via Google's Gemini image-capable model. Used only as
 * a fallback for generateWebsite() when scraping found no usable real
 * photos (e.g. the customer didn't provide their own site).
 *
 * Always requires GEMINI_API_KEY, independent of which provider (gemini/
 * claude) is doing the text analysis/generation for the project.
 */

const GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image";

export interface GeneratedImage {
  /** data:<mime>;base64,<...> — usable directly as an <img src>. */
  dataUrl: string;
}

export async function generateImageWithGemini(prompt: string): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY nicht gesetzt — wird auch für die KI-Bild-Fallback-Generierung benötigt");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Gemini-Bildgenerierung Fehler ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> };
    }>;
  };
  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline) {
    throw new Error("Gemini hat kein Bild zurückgegeben");
  }

  return { dataUrl: `data:${inline.mimeType};base64,${inline.data}` };
}
