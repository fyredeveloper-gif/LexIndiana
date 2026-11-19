import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceStatusControl } from "@/components/forms/invoice-tools";
import { Icon } from "@/components/icons";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/data";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/dates";
import { INVOICE_STATUS_LABELS } from "@/lib/utils";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const invoice = await getInvoiceDetail(user, id);
  if (!invoice) notFound();
  const canManage = can(user.role, "invoice:manage");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/invoices" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900">
          <Icon name="arrowLeft" className="h-3.5 w-3.5" />
          All invoices
        </Link>
      </div>

      <PageHeader
        eyebrow={`${invoice.items.length} line item${invoice.items.length === 1 ? "" : "s"}`}
        title={`Invoice ${invoice.number}`}
        description={`${invoice.matter.client.name} · ${invoice.matter.title}`}
        actions={
          <>
            {canManage ? <InvoiceStatusControl invoiceId={invoice.id} status={invoice.status} /> : null}
            <a href={`/api/invoices/${invoice.id}/pdf`} className="btn btn-primary">
              <Icon name="download" className="h-4 w-4" />
              Download PDF
            </a>
          </>
        }
      />

      <article className="card overflow-hidden">
        <header className="bg-ink-950 px-8 py-7 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl font-semibold">{user.firmName}</h2>
              <p className="mt-1 text-xs text-ink-300">
                {user.name}
                {user.indianaAttorneyNumber ? ` · Indiana Attorney No. ${user.indianaAttorneyNumber}` : ""}
              </p>
              {user.firmAddress ? <p className="mt-1 max-w-md text-xs text-ink-400">{user.firmAddress}</p> : null}
              <p className="mt-1 text-xs text-ink-400">
                {[user.firmPhone, user.firmEmail ?? user.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="text-right">
              <p className="font-serif text-3xl font-semibold tracking-wide">INVOICE</p>
              <p className="mt-1 text-xs text-ink-300">{invoice.number}</p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 border-b border-ink-100 px-8 py-6 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Bill to</p>
            <p className="mt-1.5 text-sm font-semibold text-ink-900">{invoice.matter.client.name}</p>
            {invoice.matter.client.organization ? (
              <p className="text-xs text-ink-600">{invoice.matter.client.organization}</p>
            ) : null}
            {invoice.matter.client.address ? (
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{invoice.matter.client.address}</p>
            ) : null}
            {invoice.matter.client.email ? <p className="mt-1 text-xs text-ink-500">{invoice.matter.client.email}</p> : null}
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Matter</p>
            <p className="mt-1.5 text-sm font-semibold text-ink-900">{invoice.matter.title}</p>
            {invoice.matter.causeNumber ? (
              <p className="font-mono text-xs text-ink-600">{invoice.matter.causeNumber}</p>
            ) : null}
            <p className="mt-1 text-xs text-ink-500">
              {invoice.matter.county} County
              {invoice.matter.courtName ? ` · ${invoice.matter.courtName}` : ""}
            </p>
          </div>
          <div className="sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Dates</p>
            <p className="mt-1.5 text-xs text-ink-600">Issued {formatDate(invoice.issueDate)}</p>
            {invoice.dueDate ? <p className="text-xs text-ink-600">Due {formatDate(invoice.dueDate)}</p> : null}
            <p className="mt-1 text-xs font-semibold text-ink-800">
              Status: {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th pl-8">Date</th>
                <th className="th">Description</th>
                <th className="th text-right">Hours</th>
                <th className="th text-right">Rate</th>
                <th className="th pr-8 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="td whitespace-nowrap pl-8 text-ink-600">{formatDate(item.workDate)}</td>
                  <td className="td">{item.description}</td>
                  <td className="td text-right tabular-nums">{item.hours.toFixed(2)}</td>
                  <td className="td text-right tabular-nums text-ink-600">{formatMoney(item.rate)}</td>
                  <td className="td pr-8 text-right tabular-nums font-medium">{formatMoney(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-6 px-8 py-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            {invoice.notes ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-400">Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-ink-600">{invoice.notes}</p>
              </>
            ) : null}
            <p className="mt-4 text-[11px] leading-relaxed text-ink-400">
              Payable to {user.firmName}. Please reference invoice {invoice.number} with your payment.
            </p>
          </div>
          <div className="w-full max-w-[260px]">
            <div className="flex items-center justify-between border-b border-ink-100 py-2 text-xs text-ink-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(invoice.subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-ink-950 px-4 py-3 text-white">
              <span className="text-xs font-semibold uppercase tracking-wider">Total due</span>
              <span className="font-serif text-lg font-semibold tabular-nums">{formatMoney(invoice.total)}</span>
            </div>
          </div>
        </div>
      </article>
    </div>
  );
}
