import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceBuilder } from "@/components/forms/invoice-tools";
import { Icon } from "@/components/icons";
import { Card, CardHeader, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getInvoices, getUnbilledByMatter } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, minutesToHours } from "@/lib/dates";
import { INVOICE_STATUS_LABELS } from "@/lib/utils";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage() {
  const user = await requireUser();
  if (!can(user.role, "invoice:read")) notFound();
  const canManage = can(user.role, "invoice:manage");
  const [invoices, unbilledGroups] = await Promise.all([getInvoices(user), getUnbilledByMatter(user)]);

  const unbilledValue = unbilledGroups.reduce((sum, group) => sum + group.value, 0);
  const unbilledMinutes = unbilledGroups.reduce((sum, group) => sum + group.minutes, 0);
  const outstanding = invoices.filter((invoice) => invoice.status !== "PAID").reduce((sum, invoice) => sum + invoice.total, 0);
  const collected = invoices.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + invoice.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Invoices"
        description="Select unbilled time, generate a firm-branded PDF invoice, and track payment status."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Unbilled work" value={formatMoney(unbilledValue)} detail={`${minutesToHours(unbilledMinutes)} hours ready to bill`} icon="clock" accent="brass" />
        <Stat label="Outstanding" value={formatMoney(outstanding)} detail="Draft and sent invoices" icon="invoice" />
        <Stat label="Collected" value={formatMoney(collected)} detail="Marked paid" icon="check" />
      </div>

      {canManage ? (
      <Card>
        <CardHeader
          title="Generate an invoice"
          description="Only unbilled, billable entries with recorded time are available"
          icon="invoice"
          action={
            <Link href="/time" className="btn btn-secondary btn-sm">
              Review time
            </Link>
          }
        />
        <div className="px-5 py-5">
          <InvoiceBuilder
            groups={unbilledGroups.map((group) => ({
              matterId: group.matterId,
              matterTitle: group.matterTitle,
              clientName: group.clientName,
              minutes: group.minutes,
              value: group.value,
              entries: group.entries.map((entry) => ({
                id: entry.id,
                description: entry.description,
                workDate: entry.workDate,
                hours: entry.hours,
                amount: entry.amount,
                matterId: entry.matterId,
                matterTitle: entry.matterTitle,
                clientName: group.clientName,
              })),
            }))}
          />
        </div>
      </Card>
      ) : null}

      <Card>
        <CardHeader title="Invoice history" description={`${invoices.length} generated invoice${invoices.length === 1 ? "" : "s"}`} icon="invoice" />
        {invoices.length === 0 ? (
          <EmptyState
            icon="invoice"
            title="No invoices yet"
            description="Bill unbilled time above and your invoice history will appear here."
          />
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Invoice</th>
                  <th className="th">Matter</th>
                  <th className="th hidden sm:table-cell">Issued</th>
                  <th className="th hidden sm:table-cell">Due</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Total</th>
                  <th className="th w-8" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="group transition hover:bg-ink-50/60">
                    <td className="td">
                      <Link href={`/invoices/${invoice.id}`} className="font-medium text-ink-900 hover:underline">
                        {invoice.number}
                      </Link>
                      <p className="text-[11px] text-ink-400">{invoice.clientName}</p>
                    </td>
                    <td className="td">
                      <Link href={`/matters/${invoice.matterId}`} className="text-xs text-ink-600 hover:underline">
                        {invoice.matterTitle}
                      </Link>
                    </td>
                    <td className="td hidden sm:table-cell text-ink-600">{formatDate(invoice.issueDate)}</td>
                    <td className="td hidden sm:table-cell text-ink-600">
                      {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                    </td>
                    <td className="td">
                      <StatusBadge status={invoice.status} label={INVOICE_STATUS_LABELS[invoice.status]} />
                    </td>
                    <td className="td text-right font-semibold tabular-nums">{formatMoney(invoice.total)}</td>
                    <td className="td">
                      <a
                        href={`/api/invoices/${invoice.id}/pdf`}
                        className="text-ink-400 transition hover:text-ink-900"
                        title="Download PDF"
                      >
                        <Icon name="download" className="h-4 w-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
