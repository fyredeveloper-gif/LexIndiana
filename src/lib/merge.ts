import { formatDateLong, todayISO } from "@/lib/dates";
import { MATTER_STATUS_LABELS } from "@/lib/utils";

export type MergeUser = {
  name: string;
  email: string;
  indianaAttorneyNumber: string | null;
  firmName: string | null;
  firmAddress: string | null;
  firmPhone: string | null;
  firmEmail: string | null;
};

export type MergeMatter = {
  title: string;
  causeNumber: string | null;
  county: string;
  courtName: string | null;
  practiceArea: string;
  status: string;
};

export type MergeClient = {
  name: string;
  organization: string | null;
  address: string | null;
};

export function buildMergeValues(
  user: MergeUser,
  matter: MergeMatter,
  client: MergeClient,
  parties: Array<{ role: string; name: string }>,
): Record<string, string> {
  const namesFor = (role: string) =>
    parties
      .filter((party) => party.role === role)
      .map((party) => party.name)
      .join(", ");

  return {
    client_name: client.name,
    client_first_name: client.name.split(/\s+/)[0] ?? client.name,
    client_organization: client.organization ?? "",
    client_address: client.address ?? "",
    opposing_party: namesFor("OPPOSING_PARTY"),
    opposing_counsel: namesFor("OPPOSING_COUNSEL"),
    witness_names: namesFor("WITNESS"),
    matter_title: matter.title,
    cause_number: matter.causeNumber ?? "",
    county: matter.county,
    court_name: matter.courtName ?? `${matter.county} County Superior Court`,
    practice_area: matter.practiceArea,
    matter_status: MATTER_STATUS_LABELS[matter.status] ?? matter.status,
    attorney_name: user.name,
    attorney_number: user.indianaAttorneyNumber ?? "",
    firm_name: user.firmName ?? "",
    firm_address: user.firmAddress ?? "",
    firm_phone: user.firmPhone ?? "",
    firm_email: user.firmEmail ?? user.email,
    today: formatDateLong(todayISO()),
  };
}
