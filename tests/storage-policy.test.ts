import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { s3ForcePathStyle } from "@/lib/storage";

describe("S3 addressing policy", () => {
  beforeEach(() => {
    delete process.env.S3_FORCE_PATH_STYLE;
  });

  afterEach(() => {
    delete process.env.S3_FORCE_PATH_STYLE;
  });

  it("defaults to AWS virtual-hosted style when unset", () => {
    expect(s3ForcePathStyle()).toBe(false);
  });

  it("uses path style only when explicitly enabled for R2 or MinIO", () => {
    process.env.S3_FORCE_PATH_STYLE = "false";
    expect(s3ForcePathStyle()).toBe(false);
    process.env.S3_FORCE_PATH_STYLE = "true";
    expect(s3ForcePathStyle()).toBe(true);
  });
});
