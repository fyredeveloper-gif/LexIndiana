import { notFound } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { TemplateUploadForm } from "@/components/forms/document-tools";
import { Icon } from "@/components/icons";
import { Callout, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getTemplates } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/dates";
import { TEMPLATE_PLACEHOLDERS } from "@/lib/docx";
import { MAX_UPLOAD_MB } from "@/lib/storage";
import { formatFileSize } from "@/lib/utils";

export const metadata = { title: "Templates" };

export default async function TemplatesPage() {
  const user = await requireUser();
  if (!can(user.role, "template:read")) notFound();
  const canWrite = can(user.role, "template:write");
  const templates = await getTemplates(user);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Document assembly"
        title="Templates"
        description="Upload .docx templates with {{placeholder}} tags. Generated documents are written to the matter's isolated storage folder."
        actions={
          canWrite ? (
            <ActionButton
              url="/api/templates/sample"
              label="Install sample pleading"
              busyLabel="Installing…"
              icon="sparkle"
              className="btn btn-secondary"
            />
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Template library" description={`${templates.length} template${templates.length === 1 ? "" : "s"} in your workspace`} icon="template" />
          {templates.length === 0 ? (
            <EmptyState
              icon="template"
              title="No templates yet"
              description="Upload a .docx file or install the built-in sample Entry of Appearance to see document assembly in action."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {templates.map((template) => (
                <li key={template.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-brass-300">
                    <Icon name="template" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{template.name}</p>
                    <p className="text-[11px] text-ink-500">
                      {template.fileName} · {formatFileSize(template.size)} · added {formatDate(template.createdAt.slice(0, 10))}
                    </p>
                    {template.description ? (
                      <p className="mt-1 text-xs leading-relaxed text-ink-600">{template.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <a href={`/api/templates/${template.id}`} className="btn btn-secondary btn-sm">
                      <Icon name="download" className="h-3.5 w-3.5" />
                      Download
                    </a>
                    {canWrite ? (
                      <ActionButton
                        url={`/api/templates/${template.id}`}
                        method="DELETE"
                        label="Delete"
                        busyLabel="…"
                        confirmText={`Delete the template "${template.name}"?`}
                        className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canWrite ? (
          <Card>
            <CardHeader
              title="Add a template"
              description={`.docx only, up to ${MAX_UPLOAD_MB} MB`}
              icon="upload"
            />
            <div className="px-5 py-5">
              <TemplateUploadForm />
            </div>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader
          title="Supported placeholders"
          description="Use these tags anywhere in your .docx — inside paragraphs, tables, or captions"
          icon="sparkle"
        />
        <div className="grid gap-x-8 gap-y-1 px-5 py-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_PLACEHOLDERS.map((placeholder) => (
            <div key={placeholder.tag} className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-2 last:border-0">
              <code className="font-mono text-[11px] text-ink-800">{placeholder.tag}</code>
              <span className="text-right text-[11px] text-ink-500">{placeholder.description}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-ink-100 px-5 py-4">
          <Callout tone="info" title="Generation is firm- and matter-scoped">
            Files land at <code className="font-mono text-[11px]">storage/firms/&lt;firm id&gt;/matters/&lt;matter id&gt;/</code>{" "}
            in local mode (or the same key prefix in your S3 bucket). Downloads always pass through a session, role,
            and firm check first.
          </Callout>
        </div>
      </Card>
    </div>
  );
}
