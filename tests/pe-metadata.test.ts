import { describe, expect, it } from "vitest";
import {
  RT_GROUP_ICON,
  RT_ICON,
  RT_VERSION,
  expectedIdentity,
  inspectExe,
  readIco,
  versionStrings,
  yamlValue,
  type IconImage,
} from "../scripts/pe-metadata.mjs";

/**
 * Covers the parser behind `scripts/desktop-metadata-check.mjs` with PE images
 * built in memory: real exes are hundreds of MB and only exist on a Windows
 * runner, and a committed fixture would rot silently.
 */

const PE_OFFSET = 0x80;
const RSRC_RVA = 0x1000;
const RSRC_RAW = 0x400;
const OPTIONAL_SIZE = 240; // PE32+ optional header with 16 data directories

const pad4 = (value: number): number => (value + 3) & ~3;

interface ResourceLanguage {
  lang: number;
  data: Buffer;
}

interface ResourceName {
  id: number;
  langs: ResourceLanguage[];
}

interface ResourceType {
  id: number;
  names: ResourceName[];
}

/** The identity electron-builder is expected to write for this repository. */
const EXPECTED = {
  CompanyName: "Haynes & Haynes Inc",
  FileDescription: "Practice management for Indiana attorneys",
  FileVersion: "1.0.0",
  ProductName: "Lex Indiana",
  LegalCopyright: "Copyright © 2026 Haynes & Haynes Inc",
};

const imageBytes = (width: number): Buffer =>
  // The check compares hashes rather than pixels, so distinct filler per size is
  // enough to tell the images apart.
  Buffer.alloc(64 + width, width % 251);

const ICON_IMAGES: IconImage[] = [
  { width: 16, height: 16, bytes: imageBytes(16) },
  { width: 32, height: 32, bytes: imageBytes(32) },
];

// --- builders ------------------------------------------------------------

function versionBlock(
  key: string,
  options: { text?: string; binary?: Buffer; children?: Buffer[] } = {},
): Buffer {
  const { text, binary, children = [] } = options;
  const keyBuffer = Buffer.from(`${key}\0`, "utf16le");
  const valueBuffer = text != null ? Buffer.from(`${text}\0`, "utf16le") : (binary ?? Buffer.alloc(0));
  const type = text != null ? 1 : 0;
  const valueLength = text != null ? text.length + 1 : valueBuffer.length;
  const afterKey = 6 + keyBuffer.length;
  const afterKeyPad = pad4(afterKey) - afterKey;
  const afterValue = afterKey + afterKeyPad + valueBuffer.length;
  const afterValuePad = pad4(afterValue) - afterValue;
  const total = afterValue + afterValuePad + children.reduce((sum, child) => sum + child.length, 0);

  const out = Buffer.alloc(total);
  out.writeUInt16LE(total, 0);
  out.writeUInt16LE(valueLength, 2);
  out.writeUInt16LE(type, 4);
  keyBuffer.copy(out, 6);
  valueBuffer.copy(out, afterKey + afterKeyPad);
  let at = afterValue + afterValuePad;
  for (const child of children) {
    child.copy(out, at);
    at += child.length;
  }
  return out;
}

function versionBlob(strings: Record<string, string>): Buffer {
  const table = versionBlock("040904b0", {
    children: Object.entries(strings).map(([key, value]) => versionBlock(key, { text: value })),
  });
  return versionBlock("VS_VERSION_INFO", {
    binary: Buffer.alloc(52),
    children: [versionBlock("StringFileInfo", { children: [table] })],
  });
}

function groupIconBlob(images: IconImage[]): Buffer {
  const out = Buffer.alloc(6 + 14 * images.length);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(images.length, 4);
  images.forEach((image, index) => {
    const at = 6 + index * 14;
    out.writeUInt8(image.width === 256 ? 0 : image.width, at);
    out.writeUInt8(image.height === 256 ? 0 : image.height, at + 1);
    out.writeUInt16LE(1, at + 4); // planes
    out.writeUInt16LE(32, at + 6); // bits per pixel
    out.writeUInt32LE(image.bytes.length, at + 8);
    out.writeUInt16LE(index + 1, at + 12); // RT_ICON id
  });
  return out;
}

function icoBuffer(images: IconImage[]): Buffer {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, index) => {
    const at = 6 + index * 16;
    header.writeUInt8(image.width === 256 ? 0 : image.width, at);
    header.writeUInt8(image.height === 256 ? 0 : image.height, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(image.bytes.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.bytes.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.bytes)]);
}

/** Resource section: directories, then data entries, then the blobs they point at. */
function resourceSection(types: ResourceType[]): Buffer {
  let cursor = 16 + 8 * types.length;
  const typeOffsets = types.map((type) => {
    const at = cursor;
    cursor += 16 + 8 * type.names.length;
    return at;
  });
  const nameOffsets = types.map((type) =>
    type.names.map((name) => {
      const at = cursor;
      cursor += 16 + 8 * name.langs.length;
      return at;
    }),
  );
  const dataEntryOffsets = types.map((type) =>
    type.names.map((name) => {
      const at = cursor;
      cursor += 16 * name.langs.length;
      return at;
    }),
  );
  cursor = pad4(cursor);
  const blobOffsets = types.map((type) =>
    type.names.map((name) =>
      name.langs.map((language) => {
        const at = cursor;
        cursor += pad4(language.data.length);
        return at;
      }),
    ),
  );

  const out = Buffer.alloc(cursor);
  const writeDirectory = (at: number, entries: { id: number; child: number }[]): void => {
    out.writeUInt32LE(0, at + 4); // timestamp
    out.writeUInt16LE(0, at + 8); // major version
    out.writeUInt16LE(0, at + 10); // minor version
    out.writeUInt16LE(0, at + 12); // named entries
    out.writeUInt16LE(entries.length, at + 14);
    entries.forEach((entry, index) => {
      out.writeUInt32LE(entry.id, at + 16 + index * 8);
      out.writeUInt32LE(entry.child, at + 20 + index * 8);
    });
  };

  writeDirectory(
    0,
    types.map((type, index) => ({ id: type.id, child: (0x80000000 | typeOffsets[index]) >>> 0 })),
  );
  types.forEach((type, typeIndex) => {
    writeDirectory(
      typeOffsets[typeIndex],
      type.names.map((name, nameIndex) => ({
        id: name.id,
        child: (0x80000000 | nameOffsets[typeIndex][nameIndex]) >>> 0,
      })),
    );
    type.names.forEach((name, nameIndex) => {
      writeDirectory(
        nameOffsets[typeIndex][nameIndex],
        name.langs.map((language, langIndex) => ({
          id: language.lang,
          child: dataEntryOffsets[typeIndex][nameIndex] + 16 * langIndex,
        })),
      );
      name.langs.forEach((language, langIndex) => {
        const at = dataEntryOffsets[typeIndex][nameIndex] + 16 * langIndex;
        const blob = blobOffsets[typeIndex][nameIndex][langIndex];
        out.writeUInt32LE(RSRC_RVA + blob, at); // data RVA
        out.writeUInt32LE(language.data.length, at + 4);
        out.writeUInt32LE(0, at + 8); // code page
        out.writeUInt32LE(0, at + 12); // reserved
        language.data.copy(out, blob);
      });
    });
  });
  return out;
}

/** A minimal but structurally real PE32+ image with one .rsrc section. */
function peImage(types: ResourceType[]): Buffer {
  const rsrc = resourceSection(types);
  const out = Buffer.alloc(RSRC_RAW + rsrc.length);
  out.write("MZ", 0, "latin1");
  out.writeUInt32LE(PE_OFFSET, 0x3c);
  out.write("PE\0\0", PE_OFFSET, "latin1");
  const coff = PE_OFFSET + 4;
  out.writeUInt16LE(0x8664, coff); // machine: x64
  out.writeUInt16LE(1, coff + 2); // sections
  out.writeUInt16LE(OPTIONAL_SIZE, coff + 16);
  const optional = coff + 20;
  out.writeUInt16LE(0x20b, optional); // PE32+
  out.writeUInt32LE(16, optional + 108); // number of data directories
  out.writeUInt32LE(RSRC_RVA, optional + 112 + 2 * 8);
  out.writeUInt32LE(rsrc.length, optional + 112 + 2 * 8 + 4);
  const section = optional + OPTIONAL_SIZE;
  out.write(".rsrc", section, "latin1");
  out.writeUInt32LE(rsrc.length, section + 8);
  out.writeUInt32LE(RSRC_RVA, section + 12);
  out.writeUInt32LE(rsrc.length, section + 16);
  out.writeUInt32LE(RSRC_RAW, section + 20);
  rsrc.copy(out, RSRC_RAW);
  return out;
}

interface ExeOptions {
  strings?: Record<string, string> | null;
  images?: IconImage[];
  group?: boolean;
  extraIcon?: Buffer | null;
}

function buildExe({ strings = EXPECTED, images = ICON_IMAGES, group = true, extraIcon = null }: ExeOptions = {}): Buffer {
  const types: ResourceType[] = [];
  if (strings != null) {
    types.push({ id: RT_VERSION, names: [{ id: 1, langs: [{ lang: 0x409, data: versionBlob(strings) }] }] });
  }
  if (group) {
    types.push({
      id: RT_GROUP_ICON,
      names: [{ id: 1, langs: [{ lang: 0x409, data: groupIconBlob(images) }] }],
    });
  }
  const iconNames: ResourceName[] = images.map((image, index) => ({
    id: index + 1,
    langs: [{ lang: 0x409, data: image.bytes }],
  }));
  if (extraIcon != null) iconNames.push({ id: images.length + 1, langs: [{ lang: 0x409, data: extraIcon }] });
  if (iconNames.length > 0) types.push({ id: RT_ICON, names: iconNames });
  return peImage(types);
}

// --- tests ---------------------------------------------------------------

describe("exe metadata check", () => {
  it("accepts an exe that matches the package metadata and committed icon", () => {
    const result = inspectExe(buildExe(), "Lex Indiana.exe", EXPECTED, ICON_IMAGES);

    expect(result.problems).toEqual([]);
    expect(result.summary).toContain("Haynes & Haynes Inc");
    expect(result.summary).toContain("Copyright © 2026 Haynes & Haynes Inc");
  });

  it("reports the Electron stub publisher left behind by a missing author", () => {
    const result = inspectExe(
      buildExe({ strings: { ...EXPECTED, CompanyName: "GitHub, Inc." } }),
      "Lex Indiana.exe",
      EXPECTED,
      ICON_IMAGES,
    );

    const problems = result.problems.join("\n");
    expect(problems).toContain('CompanyName is "GitHub, Inc.", expected "Haynes & Haynes Inc"');
    expect(problems).toContain("still carries Electron's stub publisher GitHub, Inc.");
  });

  it("reports a copyright year that does not match the build year", () => {
    const result = inspectExe(
      buildExe({ strings: { ...EXPECTED, LegalCopyright: "Copyright © 2025 Haynes & Haynes Inc" } }),
      "Lex Indiana.exe",
      EXPECTED,
      ICON_IMAGES,
    );

    expect(result.problems.join("\n")).toContain("LegalCopyright is \"Copyright © 2025 Haynes & Haynes Inc\"");
  });

  it("reports an icon size the build did not stamp", () => {
    const ico = [...ICON_IMAGES, { width: 48, height: 48, bytes: imageBytes(48) }];
    const result = inspectExe(buildExe(), "Lex Indiana.exe", EXPECTED, ico);

    expect(result.problems).toEqual(["Lex Indiana.exe is missing the 48x48 icon from assets/icon.ico"]);
  });

  it("reports an exe holding Electron's default icon", () => {
    const result = inspectExe(buildExe({ group: false }), "Lex Indiana.exe", EXPECTED, ICON_IMAGES);

    expect(result.problems.join("\n")).toContain("has no RT_GROUP_ICON resource");
    expect(result.problems.join("\n")).toContain("has no icon images");
  });

  it("reports icon images no group references", () => {
    const result = inspectExe(
      buildExe({ extraIcon: Buffer.alloc(40, 7) }),
      "Lex Indiana.exe",
      EXPECTED,
      ICON_IMAGES,
    );

    expect(result.problems).toEqual(["Lex Indiana.exe has 1 icon image(s) no group references"]);
  });

  it("reports an exe with no version resource", () => {
    const result = inspectExe(buildExe({ strings: null }), "Lex Indiana.exe", EXPECTED, ICON_IMAGES);

    expect(result.problems).toEqual(["Lex Indiana.exe has no version resource"]);
    expect(result.summary).toBe("");
  });
});

describe("VS_VERSIONINFO parsing", () => {
  it("reads the strings Explorer shows in the Version tab", () => {
    expect(versionStrings(versionBlob(EXPECTED))).toEqual(EXPECTED);
  });

  it("keeps a non-ASCII copyright intact", () => {
    const strings = versionStrings(versionBlob({ LegalCopyright: "Copyright © 2026 Haynes & Haynes Inc" }));

    expect(strings.LegalCopyright).toBe("Copyright © 2026 Haynes & Haynes Inc");
  });
});

describe("icon directory parsing", () => {
  it("reads each size and image, with a zero dimension meaning 256", () => {
    const images = readIco(
      icoBuffer([
        { width: 16, height: 16, bytes: imageBytes(16) },
        { width: 256, height: 256, bytes: imageBytes(256) },
      ]),
    );

    expect(images.map((image) => `${image.width}x${image.height}`)).toEqual(["16x16", "256x256"]);
    expect(images[1].bytes).toEqual(imageBytes(256));
  });
});

describe("expected identity", () => {
  const pkg = {
    author: { name: "Haynes & Haynes Inc" },
    description: "Practice management for Indiana attorneys",
    version: "1.0.0",
  };

  it("derives the copyright year from the build clock when none is configured", () => {
    const identity = expectedIdentity({ pkg, buildConfig: { productName: "Lex Indiana" }, year: 2027 });

    expect(identity.LegalCopyright).toBe("Copyright © 2027 Haynes & Haynes Inc");
    expect(identity.CompanyName).toBe("Haynes & Haynes Inc");
  });

  it("uses a configured copyright verbatim", () => {
    const identity = expectedIdentity({
      pkg,
      buildConfig: { productName: "Lex Indiana", copyright: "Copyright © Haynes & Haynes Inc" },
      year: 2027,
    });

    expect(identity.LegalCopyright).toBe("Copyright © Haynes & Haynes Inc");
  });

  it("accepts author as a plain string", () => {
    const identity = expectedIdentity({
      pkg: { ...pkg, author: "Haynes & Haynes Inc" },
      buildConfig: { productName: "Lex Indiana" },
    });

    expect(identity.CompanyName).toBe("Haynes & Haynes Inc");
  });

  it("refuses to guess a publisher", () => {
    expect(() => expectedIdentity({ pkg: { ...pkg, author: undefined }, buildConfig: { productName: "Lex Indiana" } })).toThrow(
      /needs an "author" name/,
    );
  });
});

describe("build config parsing", () => {
  const config = [
    "productName: Lex Indiana",
    '# copyright: "not this one"',
    "win:",
    "  artifactName: Lex Indiana Setup ${version}.${ext}",
    'copyright: "Copyright © 2026 Haynes & Haynes Inc"',
  ].join("\n");

  it("reads a top-level key and strips quotes", () => {
    expect(yamlValue(config, "copyright")).toBe("Copyright © 2026 Haynes & Haynes Inc");
    expect(yamlValue(config, "productName")).toBe("Lex Indiana");
  });

  it("ignores indented and commented keys", () => {
    expect(yamlValue(config, "artifactName", { optional: true })).toBeNull();
  });

  it("returns null for an unset optional key and throws for a required one", () => {
    expect(yamlValue(config, "author", { optional: true })).toBeNull();
    expect(() => yamlValue(config, "author")).toThrow(/author is missing/);
  });
});
