"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Callout, Field } from "@/components/ui";
import { Icon } from "@/components/icons";
import { apiRequest } from "@/lib/client";

export function DocumentPanel({
  matterId,
  templates,
}: {
  matterId: string;
  templates: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Choose a file first.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("file", file);
    const result = await apiRequest(`/api/matters/${matterId}/documents`, { formData });
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  };

  const generate = async (event: FormEvent) => {
    event.preventDefault();
    setGenerating(true);
    setGenerateError(null);
    const result = await apiRequest(`/api/matters/${matterId}/documents/generate`, { body: { templateId } });
    setGenerating(false);
    if (!result.ok) {
      setGenerateError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <form onSubmit={upload} className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Upload a document</p>
        {uploadError ? <Callout tone="danger">{uploadError}</Callout> : null}
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.pdf,.txt,.png,.jpg,.jpeg"
          className="block w-full rounded-lg border border-dashed border-ink-300 bg-ink-50/60 px-3 py-4 text-xs text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
        />
        <p className="text-[10px] text-ink-400">Stored in this matter&apos;s private firm folder.</p>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={uploading}>
          <Icon name="upload" className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : "Upload to matter"}
        </button>
      </form>

      <form onSubmit={generate} className="space-y-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Generate from a template</p>
        {generateError ? <Callout tone="danger">{generateError}</Callout> : null}
        {templates.length === 0 ? (
          <p className="text-xs text-ink-500">
            No templates yet. Add a .docx template on the Templates page — or install the sample pleading template.
          </p>
        ) : (
          <>
            <Field label="Template" htmlFor="document-template">
              <select
                id="document-template"
                className="input"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </Field>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={generating || !templateId}>
              <Icon name="sparkle" className="h-3.5 w-3.5" />
              {generating ? "Merging…" : "Generate .docx"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

export function TemplateUploadForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a .docx template.");
      return;
    }
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("description", description);
    const result = await apiRequest("/api/templates", { formData });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (fileRef.current) fileRef.current.value = "";
    setName("");
    setDescription("");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Field label="Template name" htmlFor="template-name" hint="Defaults to the file name.">
        <input
          id="template-name"
          className="input"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Notice of Hearing"
        />
      </Field>
      <Field label="Description" htmlFor="template-description">
        <input
          id="template-description"
          className="input"
          maxLength={500}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Used for motion hearings in Marion County"
        />
      </Field>
      <div>
        <label className="label" htmlFor="template-file">
          .docx file
        </label>
        <input
          id="template-file"
          ref={fileRef}
          type="file"
          accept=".docx"
          className="block w-full rounded-lg border border-dashed border-ink-300 bg-ink-50/60 px-3 py-4 text-xs text-ink-600 file:mr-3 file:rounded-md file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>
        <Icon name="upload" className="h-4 w-4" />
        {busy ? "Uploading…" : "Add to template library"}
      </button>
    </form>
  );
}
