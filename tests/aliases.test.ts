import { describe, expect, it } from "vitest";
import { parseAliases, serializeAliases } from "@/lib/aliases";

describe("contact alias encoding", () => {
  it("round-trips a list", () => {
    const aliases = ["Nora Whitaker", "N. Whitaker"];
    expect(parseAliases(serializeAliases(aliases))).toEqual(aliases);
  });

  it("trims, drops blanks, and accepts a comma-separated string", () => {
    expect(parseAliases(serializeAliases(" Ridgeline Property, , RPG "))).toEqual([
      "Ridgeline Property",
      "RPG",
    ]);
  });

  it("caps the list at 25 aliases", () => {
    const many = Array.from({ length: 40 }, (_, index) => `Alias ${index}`);
    expect(parseAliases(serializeAliases(many))).toHaveLength(25);
  });

  it("treats empty and malformed values as no aliases", () => {
    expect(parseAliases(null)).toEqual([]);
    expect(parseAliases("")).toEqual([]);
    expect(parseAliases(serializeAliases([]))).toEqual([]);
  });
});
