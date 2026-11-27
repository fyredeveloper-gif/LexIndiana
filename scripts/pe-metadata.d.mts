// Types for scripts/pe-metadata.mjs, which the TS suite imports directly.
export declare const RT_ICON = 3;
export declare const RT_GROUP_ICON = 14;
export declare const RT_VERSION = 16;
export declare const STUB_PUBLISHER: string;

export interface PeSection {
  rva: number;
  virtualSize: number;
  rawSize: number;
  rawPointer: number;
}

export interface PeImage {
  machine: number;
  rsrcRva: number;
  sections: PeSection[];
}

export interface ResourceLeaf {
  name: number;
  lang: number;
  bytes: Buffer;
}

export interface IconImage {
  width: number;
  height: number;
  bytes: Buffer;
}

export interface ExpectedIdentity {
  CompanyName: string;
  FileDescription: string;
  FileVersion: string;
  ProductName: string;
  LegalCopyright: string;
}

export interface InspectResult {
  name: string;
  problems: string[];
  summary: string;
}

export interface PackageMetadata {
  author?: string | { name?: string };
  description?: string;
  version?: string;
}

export interface BuildConfigMetadata {
  productName: string | null;
  copyright?: string | null;
}

export declare function yamlValue(text: string, key: string, options?: { optional?: boolean }): string | null;
export declare function expectedIdentity(input: {
  pkg: PackageMetadata;
  buildConfig: BuildConfigMetadata;
  year?: number;
}): ExpectedIdentity;
export declare function parsePe(buffer: Buffer, label?: string): PeImage;
export declare function rvaToOffset(pe: PeImage, rva: number): number;
export declare function readResources(pe: PeImage, buffer: Buffer): Map<number, ResourceLeaf[]>;
export declare function versionStrings(blob: Buffer): Record<string, string>;
export declare function readIco(buffer: Buffer): IconImage[];
export declare function sha256(buffer: Buffer): string;
export declare function exeIcons(resources: Map<number, ResourceLeaf[]>): {
  images: IconImage[];
  dangling: number;
  groups: number;
};
export declare function inspectExe(
  buffer: Buffer,
  name: string,
  expected: ExpectedIdentity,
  ico: IconImage[],
): InspectResult;
