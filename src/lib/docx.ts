import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

/** Placeholder tags supported in uploaded .docx templates. */
export const TEMPLATE_PLACEHOLDERS: Array<{ tag: string; description: string }> = [
  { tag: "{{client_name}}", description: "Primary client's full name" },
  { tag: "{{client_first_name}}", description: "Client's first name" },
  { tag: "{{client_organization}}", description: "Client's organization" },
  { tag: "{{client_address}}", description: "Client's mailing address" },
  { tag: "{{opposing_party}}", description: "Opposing party on the matter" },
  { tag: "{{opposing_counsel}}", description: "Opposing counsel on the matter" },
  { tag: "{{witness_names}}", description: "Witnesses, comma separated" },
  { tag: "{{matter_title}}", description: "Matter title" },
  { tag: "{{cause_number}}", description: "Indiana cause number" },
  { tag: "{{county}}", description: "County" },
  { tag: "{{court_name}}", description: "Court name" },
  { tag: "{{practice_area}}", description: "Practice area" },
  { tag: "{{matter_status}}", description: "Matter status" },
  { tag: "{{attorney_name}}", description: "Attorney name" },
  { tag: "{{attorney_number}}", description: "Indiana attorney number" },
  { tag: "{{firm_name}}", description: "Firm name" },
  { tag: "{{firm_address}}", description: "Firm address" },
  { tag: "{{firm_phone}}", description: "Firm phone" },
  { tag: "{{firm_email}}", description: "Firm email" },
  { tag: "{{today}}", description: "Today's date in Indiana" },
];

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDocx(template: Buffer, values: Record<string, string>): Buffer {
  const zip = new PizZip(template);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });

  const escaped: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    escaped[key] = escapeXml(value ?? "");
  }

  doc.render(escaped);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}

export function isValidDocx(buffer: Buffer): boolean {
  try {
    const zip = new PizZip(buffer);
    const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
    return (
      required.every((name) => Boolean(zip.files[name])) &&
      Object.keys(zip.files).every((name) => !name.split("/").includes(".."))
    );
  } catch {
    return false;
  }
}

/** A minimal, Word-compatible .docx used to demonstrate document assembly. */
export function buildSampleTemplateDocx(): Buffer {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const relationships = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const paragraph = (text: string, options: { bold?: boolean; center?: boolean; size?: number } = {}) => {
    const props = [
      options.center ? '<w:jc w:val="center"/>' : "",
      options.bold ? "<w:b/>" : "",
      options.size ? `<w:sz w:val="${options.size}"/>` : "",
    ].join("");
    return `<w:p><w:pPr><w:spacing w:after="120"/>${props}</w:pPr><w:r><w:rPr>${props}</w:rPr><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  };

  const body = [
    paragraph("{{firm_name}}", { center: true, bold: true, size: 28 }),
    paragraph("{{firm_address}}", { center: true, size: 20 }),
    paragraph("{{firm_phone}}  |  {{firm_email}}", { center: true, size: 20 }),
    paragraph(""),
    paragraph("IN THE {{court_name}}", { center: true, bold: true }),
    paragraph("{{county}} COUNTY, INDIANA", { center: true, bold: true }),
    paragraph(""),
    paragraph("{{client_name}},                )"),
    paragraph("                                )"),
    paragraph("          Plaintiff,            )   Cause No. {{cause_number}}"),
    paragraph("                                )"),
    paragraph("     v.                         )"),
    paragraph("                                )"),
    paragraph("{{opposing_party}},             )"),
    paragraph("          Defendant.            )"),
    paragraph(""),
    paragraph("ENTRY OF APPEARANCE", { center: true, bold: true, size: 24 }),
    paragraph(""),
    paragraph(
      "Comes now {{attorney_name}}, Indiana Attorney No. {{attorney_number}}, attorney for {{client_name}}, and enters an appearance in the above-captioned {{matter_title}} matter.",
    ),
    paragraph(""),
    paragraph("Dated: {{today}}"),
    paragraph(""),
    paragraph("Respectfully submitted,"),
    paragraph(""),
    paragraph("_________________________________"),
    paragraph("{{attorney_name}}"),
    paragraph("Indiana Attorney No. {{attorney_number}}"),
    paragraph("{{firm_name}}"),
    paragraph("{{firm_address}}"),
    paragraph("{{firm_phone}}"),
    paragraph("{{firm_email}}"),
  ].join("");

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;

  const zip = new PizZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.file("_rels/.rels", relationships);
  zip.file("word/document.xml", documentXml);
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
}
