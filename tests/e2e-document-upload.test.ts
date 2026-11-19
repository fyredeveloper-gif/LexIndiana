import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildSampleTemplateDocx, isValidDocx } from "@/lib/docx";
import { testDatabaseUrl } from "./helpers/database-url";
import { createFixture, resetTestDatabase, type Fixture } from "./helpers/fixture";
import { postJson, sessionCookie, TEST_PASSWORD } from "./helpers/http";
import { startNextServer, type RunningNextServer } from "./helpers/next-server";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FILE_NAME = "lex-25mb.docx";
const UPLOAD_BYTES = 25_000_000;

let fixture: Fixture;
let server: RunningNextServer | undefined;
let storageRoot: string;

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "lex-indiana-upload-"));
  await resetTestDatabase();
  fixture = await createFixture();
  await prisma.user.update({
    where: { id: fixture.users.ownerA.id },
    data: { passwordHash: await bcrypt.hash(TEST_PASSWORD, 4) },
  });

  server = await startNextServer({
    DATABASE_URL: testDatabaseUrl,
    STORAGE_DRIVER: "local",
    STORAGE_ROOT: storageRoot,
    MAX_UPLOAD_MB: "25",
  });
}, 150_000);

afterAll(async () => {
  await server?.stop();
  await prisma.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
}, 30_000);

function build25MbDocx(): Buffer {
  const base = buildSampleTemplateDocx();
  const docx = Buffer.concat([base, Buffer.alloc(UPLOAD_BYTES - base.length)]);
  expect(docx).toHaveLength(UPLOAD_BYTES);
  expect(isValidDocx(docx)).toBe(true);
  return docx;
}

describe("25 MB document round-trip", () => {
  it("stores a tenant-prefixed key and returns byte-identical bytes", async () => {
    if (!server) throw new Error("Next test server is not running");
    const { baseUrl } = server;

    const login = await postJson(baseUrl, "/api/auth/login", {
      email: fixture.users.ownerA.email,
      password: TEST_PASSWORD,
    });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);

    const docx = build25MbDocx();
    const form = new FormData();
    form.append("file", new File([new Uint8Array(docx)], FILE_NAME, { type: DOCX_MIME }));

    const upload = await fetch(
      `${baseUrl}/api/matters/${fixture.matters.assignedA.id}/documents`,
      { method: "POST", headers: { cookie }, body: form },
    );
    expect(upload.status).toBe(201);
    const { id } = (await upload.json()) as { id: string };

    const document = await prisma.matterDocument.findUniqueOrThrow({
      where: { id },
      select: { storageKey: true, size: true, fileName: true },
    });
    const prefix = `firms/${fixture.firmA.id}/matters/${fixture.matters.assignedA.id}/`;
    expect(document.fileName).toBe(FILE_NAME);
    expect(document.size).toBe(UPLOAD_BYTES);
    expect(document.storageKey.startsWith(prefix)).toBe(true);
    expect(document.storageKey).toMatch(/\/\d+-lex-25mb\.docx$/);

    const diskPath = path.join(storageRoot, document.storageKey);
    const stored = await readFile(diskPath);
    expect(stored).toHaveLength(UPLOAD_BYTES);
    expect(stored.equals(docx)).toBe(true);
    expect((await stat(diskPath)).size).toBe(UPLOAD_BYTES);

    const download = await fetch(`${baseUrl}/api/documents/${id}`, {
      headers: { cookie },
    });
    expect(download.status).toBe(200);
    const downloaded = Buffer.from(await download.arrayBuffer());
    expect(downloaded).toHaveLength(UPLOAD_BYTES);
    expect(downloaded.equals(docx)).toBe(true);
    expect(createHash("sha256").update(downloaded).digest("hex")).toBe(
      createHash("sha256").update(docx).digest("hex"),
    );

    const deleted = await fetch(`${baseUrl}/api/documents/${id}`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(deleted.status).toBe(200);
    expect(await prisma.matterDocument.count({ where: { id } })).toBe(0);
    await expect(stat(diskPath)).rejects.toBeTruthy();
  }, 60_000);
});
