import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Checks the identity a Windows build actually ships: the Version tab of every
 * exe and the icon it was stamped with.
 *
 * Both are invisible to the other checks. electron-builder derives the Windows
 * `CompanyName` from `package.json` `author` and `LegalCopyright` from the
 * `copyright` build option (default: "Copyright © <build year> <author>"), and
 * rcedit leaves whatever the Electron stub carried when a field is missing —
 * which is how a release shipped "GitHub, Inc." as its publisher with an empty
 * copyright. An icon path that points nowhere is reported by electron-builder
 * only as a log line. So parse the resources of the built executables and
 * compare them with the committed identity and `assets/icon.ico`.
 *
 * Usage: node scripts/desktop-metadata-check.mjs [release-dir]
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const RELEASE_DIR = process.argv[2] ?? "release";

// rcedit and makensis copy each image out of the .ico byte for byte, so the
// check can compare hashes instead of decoding and diffing pixels.
const ICON_FILE = path.join(ROOT, "assets", "icon.ico");

const RT_ICON = 3;
const RT_GROUP_ICON = 14;
const RT_VERSION = 16;
const PE32_PLUS_MAGIC = 0x20b;

const STUB_PUBLISHER = "GitHub, Inc.";

/** Top-level `key: value` of a YAML file. Enough for the flat keys read here. */
function yamlValue(file, key, { optional = false } = {}) {
  const text = readFileSync(file, "utf8");
  const match = new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(text);
  if (match == null) {
    if (optional) return null;
    throw new Error(`${key} is missing from ${file}`);
  }
  return match[1].replace(/^["']|["']$/g, "");
}

/**
 * The identity the build config and package metadata ask for. electron-builder
 * fills an unset `copyright` with the build year, so the expectation moves with
 * the calendar instead of going stale on January 1st.
 */
function expectedIdentity() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const company = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
  if (company == null) throw new Error('package.json needs an "author" name; it becomes the exe CompanyName');
  const buildConfig = path.join(ROOT, "electron-builder.yml");
  const copyright = yamlValue(buildConfig, "copyright", { optional: true });
  const year = new Date().getFullYear();
  return {
    CompanyName: company,
    FileDescription: pkg.description,
    FileVersion: pkg.version,
    ProductName: yamlValue(buildConfig, "productName"),
    // Same fallback electron-builder applies when `copyright` is not set.
    LegalCopyright: copyright ?? `Copyright © ${year} ${company}`,
  };
}

// --- PE resource parsing -------------------------------------------------

function parsePe(buffer, file) {
  if (buffer.toString("latin1", 0, 2) !== "MZ") throw new Error(`not a Windows executable: ${file}`);
  const peOffset = buffer.readUInt32LE(0x3c);
  if (buffer.toString("latin1", peOffset, peOffset + 4) !== "PE\0\0") throw new Error(`not a PE file: ${file}`);
  const coff = peOffset + 4;
  const machine = buffer.readUInt16LE(coff);
  const sectionCount = buffer.readUInt16LE(coff + 2);
  const optionalSize = buffer.readUInt16LE(coff + 16);
  const optional = coff + 20;
  const dataDirectories = optional + (buffer.readUInt16LE(optional) === PE32_PLUS_MAGIC ? 112 : 96);
  // Index 2 of the data directories is the resource table.
  const rsrcRva = buffer.readUInt32LE(dataDirectories + 2 * 8);
  const sections = [];
  const table = optional + optionalSize;
  for (let i = 0; i < sectionCount; i += 1) {
    const at = table + i * 40;
    sections.push({
      rva: buffer.readUInt32LE(at + 12),
      virtualSize: buffer.readUInt32LE(at + 8),
      rawSize: buffer.readUInt32LE(at + 16),
      rawPointer: buffer.readUInt32LE(at + 20),
    });
  }
  return { machine, rsrcRva, sections };
}

function rvaToOffset(pe, rva) {
  for (const section of pe.sections) {
    const span = Math.max(section.virtualSize, section.rawSize);
    if (rva >= section.rva && rva < section.rva + span) {
      const delta = rva - section.rva;
      if (delta >= section.rawSize) throw new Error(`RVA 0x${rva.toString(16)} is uninitialised data`);
      return section.rawPointer + delta;
    }
  }
  throw new Error(`RVA 0x${rva.toString(16)} is outside every section`);
}

function directoryEntries(buffer, at) {
  const named = buffer.readUInt16LE(at + 12);
  const ids = buffer.readUInt16LE(at + 14);
  const out = [];
  for (let i = 0; i < named + ids; i += 1) {
    const record = at + 16 + i * 8;
    out.push({ id: buffer.readUInt32LE(record), child: buffer.readUInt32LE(record + 4) });
  }
  return out;
}

/**
 * Map of resource type -> [{ name, lang, bytes }]. Image resources (icons) are
 * keyed by a plain number, which is all this check reads.
 */
function readResources(pe, buffer) {
  const resources = new Map();
  if (pe.rsrcRva === 0) return resources;
  const base = rvaToOffset(pe, pe.rsrcRva);
  for (const type of directoryEntries(buffer, base)) {
    if (type.id & 0x80000000) continue; // named type: not an icon or version block
    const leaves = [];
    for (const name of directoryEntries(buffer, base + (type.child & 0x7fffffff))) {
      if (name.id & 0x80000000) continue;
      for (const lang of directoryEntries(buffer, base + (name.child & 0x7fffffff))) {
        if (lang.id & 0x80000000) continue;
        const dataEntry = base + lang.child;
        const offset = rvaToOffset(pe, buffer.readUInt32LE(dataEntry));
        leaves.push({
          name: name.id,
          lang: lang.id,
          bytes: buffer.subarray(offset, offset + buffer.readUInt32LE(dataEntry + 4)),
        });
      }
    }
    resources.set(type.id, leaves);
  }
  return resources;
}

// --- VERSIONINFO ---------------------------------------------------------

function versionKey(blob, at) {
  let end = at;
  while (end + 2 <= blob.length && (blob[end] !== 0 || blob[end + 1] !== 0)) end += 2;
  return { key: blob.toString("utf16le", at, end), next: end + 2 };
}

/**
 * A VS_VERSIONINFO block is wLength, wValueLength, wType, szKey, padding, value,
 * children — with every boundary aligned to 4 bytes from the block's own start.
 */
function versionBlock(blob, at) {
  const length = blob.readUInt16LE(at);
  const valueLength = blob.readUInt16LE(at + 2);
  const type = blob.readUInt16LE(at + 4);
  const end = at + length;
  const { key, next } = versionKey(blob, at + 6);
  let cursor = next + ((4 - ((next - at) % 4)) % 4);
  const valueSize = type === 1 ? valueLength * 2 : valueLength;
  const value = blob.subarray(cursor, cursor + valueSize);
  cursor += valueSize;
  cursor += (4 - ((cursor - at) % 4)) % 4;
  const children = [];
  while (cursor + 6 <= end) {
    // Siblings are 4-byte aligned and a block's own length excludes the padding,
    // so step over the gap instead of reading it as a zero-length block.
    while (cursor + 2 <= end && blob.readUInt16LE(cursor) === 0) cursor += 2;
    if (cursor + 6 > end) break;
    const child = versionBlock(blob, cursor);
    children.push(child);
    cursor = child.end;
  }
  return { key, value, type, children, end };
}

/** Flattens StringFileInfo into the strings Explorer shows in the Version tab. */
function versionStrings(blob) {
  const strings = {};
  const walk = (block) => {
    for (const child of block.children) {
      if (child.children.length > 0) walk(child);
      else if (child.type === 1) strings[child.key] = child.value.toString("utf16le").replace(/\0+$/, "");
    }
  };
  walk(versionBlock(blob, 0));
  return strings;
}

// --- icons ---------------------------------------------------------------

function readIco(file) {
  const buffer = readFileSync(file);
  const count = buffer.readUInt16LE(4);
  const images = [];
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 16;
    const size = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    images.push({
      width: buffer.readUInt8(at) || 256,
      height: buffer.readUInt8(at + 1) || 256,
      bytes: buffer.subarray(offset, offset + size),
    });
  }
  return images;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Icon images the exe holds, reached through its RT_GROUP_ICON -> RT_ICON ids. */
function exeIcons(resources) {
  const icons = resources.get(RT_ICON) ?? [];
  const images = [];
  let dangling = 0;
  const referenced = new Set();
  for (const group of resources.get(RT_GROUP_ICON) ?? []) {
    const count = group.bytes.readUInt16LE(4);
    for (let i = 0; i < count; i += 1) {
      const at = 6 + i * 14;
      const id = group.bytes.readUInt16LE(at + 12);
      referenced.add(id);
      const icon = icons.find((candidate) => candidate.name === id);
      if (icon == null) continue;
      images.push({
        width: group.bytes.readUInt8(at) || 256,
        height: group.bytes.readUInt8(at + 1) || 256,
        bytes: icon.bytes,
      });
    }
  }
  for (const icon of icons) if (!referenced.has(icon.name)) dangling += 1;
  return { images, dangling, groups: (resources.get(RT_GROUP_ICON) ?? []).length };
}

// --- checks --------------------------------------------------------------

function inspect(file, expected, ico) {
  const buffer = readFileSync(file);
  const pe = parsePe(buffer, file);
  const resources = readResources(pe, buffer);
  const name = path.basename(file);
  const problems = [];

  const versionBlocks = resources.get(RT_VERSION) ?? [];
  if (versionBlocks.length === 0) {
    problems.push(`${name} has no version resource`);
    return { name, problems, summary: "" };
  }
  const strings = versionStrings(versionBlocks[0].bytes);

  for (const key of Object.keys(expected)) {
    if (strings[key] !== expected[key]) {
      problems.push(`${name} ${key} is ${JSON.stringify(strings[key] ?? null)}, expected ${JSON.stringify(expected[key])}`);
    }
  }
  for (const [key, value] of Object.entries(strings)) {
    if (value.includes(STUB_PUBLISHER)) problems.push(`${name} ${key} still carries Electron's stub publisher ${STUB_PUBLISHER}`);
  }

  const { images, dangling, groups } = exeIcons(resources);
  if (groups === 0) problems.push(`${name} has no RT_GROUP_ICON resource; it would show Electron's default icon`);
  if (dangling > 0) problems.push(`${name} has ${dangling} icon image(s) no group references`);
  for (const source of ico) {
    const match = images.find((image) => sha256(image.bytes) === sha256(source.bytes));
    if (match == null) problems.push(`${name} is missing the ${source.width}x${source.height} icon from assets/icon.ico`);
  }
  if (images.length === 0) problems.push(`${name} has no icon images`);

  const sizes = images.map((image) => `${image.width}x${image.height}`).sort();
  return {
    name,
    problems,
    summary:
      `${name}: ${strings.CompanyName} | ${strings.LegalCopyright} | ` +
      `${images.length} icon sizes (${sizes.join(", ")}), all from assets/icon.ico`,
  };
}

if (!existsSync(RELEASE_DIR)) {
  console.error(`[metadata-check] ${RELEASE_DIR} does not exist; run electron-builder first.`);
  process.exit(2);
}

const exes = [
  ...readdirSync(RELEASE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
    .map((entry) => path.join(RELEASE_DIR, entry.name)),
  ...(existsSync(path.join(RELEASE_DIR, "win-unpacked"))
    ? readdirSync(path.join(RELEASE_DIR, "win-unpacked"), { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".exe"))
        .map((entry) => path.join(RELEASE_DIR, "win-unpacked", entry.name))
    : []),
].sort();

if (exes.length === 0) {
  console.error(`[metadata-check] no .exe files in ${RELEASE_DIR} or ${RELEASE_DIR}/win-unpacked; run electron-builder first.`);
  process.exit(2);
}

const expected = expectedIdentity();
const ico = readIco(ICON_FILE);
const results = exes.map((file) => inspect(file, expected, ico));
const problems = results.flatMap((result) => result.problems);

if (problems.length > 0) {
  console.error("[metadata-check] exe identity or icon does not match the committed sources:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

for (const result of results) console.log(`[metadata-check] ${result.summary}`);
console.log(
  `[metadata-check] ${results.length} executables carry "${expected.CompanyName}", ` +
    `"${expected.LegalCopyright}" and all ${ico.length} icon sizes`,
);
