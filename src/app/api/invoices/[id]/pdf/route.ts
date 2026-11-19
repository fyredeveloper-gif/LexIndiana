import { getSessionUser } from "@/lib/auth";
import { handleApiError, notFound, requireCapability, unauthorized } from "@/lib/api";
import { getInvoiceDetail } from "@/lib/data";
import { fileResponse } from "@/lib/download";
import { buildInvoicePdf } from "@/lib/invoice-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  const denied = requireCapability(user.role, "invoice:read");
  if (denied) return denied;

  const { id } = await params;
  const invoice = await getInvoiceDetail(user, id);
  if (!invoice) return notFound("Invoice not found.");

  try {
    const pdf = await buildInvoicePdf({
      firm: {
        name: user.firmName,
        address: user.firmAddress,
        phone: user.firmPhone,
        email: user.firmEmail ?? user.email,
        attorneyName: user.name,
        attorneyNumber: user.indianaAttorneyNumber,
      },
      invoice: {
        number: invoice.number,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        notes: invoice.notes,
        subtotal: invoice.subtotal,
        total: invoice.total,
      },
      client: invoice.matter.client,
      matter: {
        title: invoice.matter.title,
        causeNumber: invoice.matter.causeNumber,
        county: invoice.matter.county,
        courtName: invoice.matter.courtName,
      },
      items: invoice.items,
    });

    return fileResponse(Buffer.from(pdf), `invoice-${invoice.number}.pdf`, "application/pdf");
  } catch (error) {
    return handleApiError(error, "Could not build the invoice PDF.");
  }
}
