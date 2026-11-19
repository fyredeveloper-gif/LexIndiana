import { notFound } from "next/navigation";
import { ConflictChecker } from "@/components/conflict-checker";
import { Icon } from "@/components/icons";
import { Callout, Card, CardHeader, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export const metadata = { title: "Conflict Check" };

export default async function ConflictsPage() {
  const user = await requireUser();
  if (!can(user.role, "conflict:read")) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intake screening"
        title="Conflict check"
        description="Search every contact name, alias, note, and matter in your workspace before opening a new engagement."
      />

      <ConflictChecker />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="How the check works" icon="shield" />
          <div className="space-y-3 px-5 py-4 text-xs leading-relaxed text-ink-600">
            <p>
              The search reads only your workspace. It scans contact names, every alias, email addresses, organization
              names, notes, matter titles, cause numbers, and matter notes — then links any hit back to its matter and
              role.
            </p>
            <p>
              Results are case-insensitive and match partial strings, so a search for{" "}
              <span className="font-medium text-ink-800">Whit</span> finds{" "}
              <span className="font-medium text-ink-800">Whitmore</span> and{" "}
              <span className="font-medium text-ink-800">Whitfield Holdings</span>.
            </p>
            <p>
              This is a screening aid, not a substitute for your firm&apos;s written conflicts policy or the Indiana Rules
              of Professional Conduct. Document the result in the matter notes.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Screening checklist" icon="check" />
          <ul className="space-y-2.5 px-5 py-4 text-xs text-ink-600">
            {[
              "Search the client's full legal name and every trade name.",
              "Search opposing parties and their parent entities.",
              "Search counsel and any firm affiliations.",
              "Search witnesses and expert names.",
              "Record the date and result in the matter notes.",
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Callout tone="warning" title="Records stay inside your firm">
        Conflict searches are scoped to your firm membership. Names, aliases, and matters from other firms are never
        visible. Practice managers and consultants do not have ad-hoc conflict search access.
      </Callout>
    </div>
  );
}
