// Object storage for user-uploaded logos/images and AI-generated fallback
// images, backed by Cloudflare R2 (S3-compatible). The bucket is expected to
// be configured for public read access (R2 "Public Development URL" or a
// custom domain) — uploaded assets end up embedded in generated HTML and need
// to stay reachable indefinitely without signed-URL expiry.

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ENV } from "./_core/env";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  if (!ENV.r2AccountId || !ENV.r2AccessKeyId || !ENV.r2SecretAccessKey) {
    throw new Error(
      "Storage nicht konfiguriert: R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY setzen."
    );
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
  });
  return _client;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (!ENV.r2BucketName) {
    throw new Error("Storage nicht konfiguriert: R2_BUCKET_NAME setzen.");
  }
  if (!ENV.r2PublicUrlBase) {
    throw new Error("Storage nicht konfiguriert: R2_PUBLIC_URL_BASE setzen.");
  }
  const key = appendHashSuffix(relKey.replace(/^\/+/, ""));

  await getClient().send(
    new PutObjectCommand({
      Bucket: ENV.r2BucketName,
      Key: key,
      Body: data,
      ContentType: contentType,
    })
  );

  return { key, url: `${ENV.r2PublicUrlBase.replace(/\/+$/, "")}/${key}` };
}

const MAX_UPLOAD_DATA_URL_LENGTH = 8 * 1024 * 1024; // ~6MB binary as base64

export interface UploadedImageInput {
  dataUrl: string;
  mimeType: string;
}

export function validateUploadImage(image: UploadedImageInput): void {
  if (!image.mimeType.startsWith("image/")) {
    throw new Error("Nur Bilddateien können hochgeladen werden.");
  }
  if (!image.dataUrl.startsWith("data:image/")) {
    throw new Error("Ungültiges Bildformat.");
  }
  if (image.dataUrl.length > MAX_UPLOAD_DATA_URL_LENGTH) {
    throw new Error("Die Datei ist zu groß (max. ca. 6 MB).");
  }
}

/** Decodes a `data:<mime>;base64,<...>` URL and uploads it under `folder/`. */
export async function uploadDataUrl(
  folder: "logos" | "images",
  image: UploadedImageInput
): Promise<string> {
  validateUploadImage(image);
  const base64 = image.dataUrl.slice(image.dataUrl.indexOf(",") + 1);
  const buffer = Buffer.from(base64, "base64");
  const ext = image.mimeType.split("/")[1] ?? "png";
  const { url } = await storagePut(`${folder}/${Date.now()}.${ext}`, buffer, image.mimeType);
  return url;
}
