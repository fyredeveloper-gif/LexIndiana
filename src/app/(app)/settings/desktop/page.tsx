import Link from "next/link";
import { DesktopSettings } from "@/components/desktop-settings";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Desktop settings" };

export default async function DesktopSettingsPage() {
  await requireUser();

  return (
    <div>
      <PageHeader
        eyebrow="This installation"
        title="Desktop settings"
        description="Choose which repository this app opens, connect a sync peer, and reset the demo data. These controls are local to this computer and never touch the other repository."
        actions={
          <Link href="/settings" className="btn btn-secondary">
            Back to settings
          </Link>
        }
      />
      <DesktopSettings />
    </div>
  );
}
