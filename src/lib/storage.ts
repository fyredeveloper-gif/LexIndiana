import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type StorageDriver = "local" | "s3";

const DRIVER: StorageDriver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase() === "s3" ? "s3" : "local";
export const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB ?? 25);
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const STORAGE_ROOT = path.resolve(
  /* turbopackIgnore: true */ process.cwd(),
  process.env.STORAGE_ROOT ?? "storage",
);

let s3Client: S3Client | null = null;

/** AWS uses virtual-hosted addresses unless a custom endpoint explicitly opts in. */
export function s3ForcePathStyle(): boolean {
  return process.env.S3_FORCE_PATH_STYLE === "true";
}

function s3(): { client: S3Client; bucket: string } {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  if (!s3Client) {
    s3Client = new S3Client({
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: s3ForcePathStyle(),
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.S3_ACCESS_KEY_ID,
              secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }
  return { client: s3Client, bucket };
}

/** IDs come from Prisma cuid(); reject anything that could traverse the tree. */
export function assertSegment(value: string, label = "id"): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

export function safeFileName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
  const trimmed = base.length > 140 ? base.slice(base.length - 140) : base;
  return trimmed.replace(/^[.\s]+/, "") || "document";
}

export function matterObjectKey(firmId: string, matterId: string, fileName: string): string {
  return `firms/${assertSegment(firmId, "firm id")}/matters/${assertSegment(matterId, "matter id")}/${Date.now()}-${safeFileName(fileName)}`;
}

export function templateObjectKey(firmId: string, fileName: string): string {
  return `firms/${assertSegment(firmId, "firm id")}/templates/${Date.now()}-${safeFileName(fileName)}`;
}

/** Throws unless the key lives under the firm's own storage prefix. */
export function assertOwnedKey(firmId: string, key: string): string {
  const prefix = `firms/${assertSegment(firmId, "firm id")}/`;
  if (!key.startsWith(prefix) || key.includes("..")) {
    throw new Error("STORAGE_KEY_OUTSIDE_TENANT");
  }
  return key;
}

function localPath(key: string): string {
  const full = path.resolve(/* turbopackIgnore: true */ STORAGE_ROOT, key);
  if (full !== STORAGE_ROOT && !full.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("STORAGE_KEY_OUTSIDE_TENANT");
  }
  return full;
}

export async function putObject(key: string, data: Buffer, contentType = "application/octet-stream"): Promise<number> {
  if (data.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${MAX_UPLOAD_MB} MB limit.`);
  }
  if (DRIVER === "s3") {
    const { client, bucket } = s3();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        ServerSideEncryption: process.env.S3_SSE === "none" ? undefined : "AES256",
      }),
    );
    return data.byteLength;
  }

  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data, { mode: 0o600 });
  return data.byteLength;
}

export async function getObject(key: string): Promise<Buffer> {
  if (DRIVER === "s3") {
    const { client, bucket } = s3();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!response.Body) throw new Error("Object not found");
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
  return readFile(localPath(key));
}

export async function deleteObject(key: string): Promise<void> {
  if (DRIVER === "s3") {
    const { client, bucket } = s3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  await unlink(localPath(key)).catch(() => undefined);
}

/** Human-readable location for the UI; never used to read files. */
export function storageLocation(key: string): string {
  return DRIVER === "s3" ? `s3://${process.env.S3_BUCKET ?? "bucket"}/${key}` : `${path.relative(process.cwd(), STORAGE_ROOT)}/${key}`;
}

export function storageDriver(): StorageDriver {
  return DRIVER;
}
