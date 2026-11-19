import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { buildSampleTemplateDocx, isValidDocx } from "@/lib/docx";

describe("OOXML validation", () => {
  it("accepts the generated sample template", () => {
    expect(isValidDocx(buildSampleTemplateDocx())).toBe(true);
  });

  it("rejects a zip that is missing required OOXML parts", () => {
    const zip = new PizZip();
    zip.file("word/document.xml", "<w:document />");
    expect(isValidDocx(zip.generate({ type: "nodebuffer" }) as Buffer)).toBe(false);
  });

  it("rejects non-zip content with a .docx name", () => {
    expect(isValidDocx(Buffer.from("not an OOXML package"))).toBe(false);
  });
});
