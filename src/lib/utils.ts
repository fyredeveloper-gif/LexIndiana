export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s_]+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

export const CONTACT_TYPE_LABELS: Record<string, string> = {
  CLIENT: "Client",
  OPPOSING_PARTY: "Opposing Party",
  OPPOSING_COUNSEL: "Opposing Counsel",
  WITNESS: "Witness",
};

export const MATTER_STATUS_LABELS: Record<string, string> = {
  INTAKE: "Intake",
  ACTIVE: "Active",
  PENDING: "Pending",
  CLOSED: "Closed",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

export const CALENDAR_EVENT_TYPE_LABELS: Record<string, string> = {
  HEARING: "Hearing",
  MEETING: "Meeting",
  DEPOSITION: "Deposition",
  DEADLINE: "Deadline",
  OTHER: "Other",
};

export function taskPriorityClasses(priority: string): string {
  switch (priority) {
    case "URGENT":
      return "bg-red-50 text-red-700 ring-red-600/20";
    case "HIGH":
      return "bg-amber-50 text-amber-800 ring-amber-600/20";
    case "LOW":
      return "bg-ink-100 text-ink-500 ring-ink-500/20";
    default:
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
  }
}

export function calendarEventTypeClasses(type: string): string {
  switch (type) {
    case "HEARING":
      return "border-red-200 bg-red-50 text-red-800";
    case "DEPOSITION":
      return "border-purple-200 bg-purple-50 text-purple-800";
    case "DEADLINE":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "MEETING":
      return "border-sky-200 bg-sky-50 text-sky-800";
    default:
      return "border-ink-200 bg-ink-50 text-ink-700";
  }
}

export const SERVICE_METHOD_LABELS: Record<string, string> = {
  PERSONAL: "Personal service",
  E_SERVICE: "E-service (IOJA)",
  MAIL: "Certified / first-class mail",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PAID: "Paid",
};

export const INTAKE_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  CONVERTED: "Converted",
  DECLINED: "Declined",
};

export const CONFLICT_STATUS_LABELS: Record<string, string> = {
  CLEAR: "Clear",
  REVIEW: "Review",
  SKIPPED: "Not run",
};

export function statusBadgeClasses(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "INTAKE":
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
    case "PENDING":
      return "bg-amber-50 text-amber-800 ring-amber-600/20";
    case "CLOSED":
      return "bg-ink-100 text-ink-600 ring-ink-500/20";
    case "DRAFT":
      return "bg-ink-100 text-ink-700 ring-ink-500/20";
    case "SENT":
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
    case "PAID":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "NEW":
      return "bg-sky-50 text-sky-700 ring-sky-600/20";
    case "CONTACTED":
      return "bg-amber-50 text-amber-800 ring-amber-600/20";
    case "CONVERTED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    case "DECLINED":
      return "bg-ink-100 text-ink-600 ring-ink-500/20";
    default:
      return "bg-ink-100 text-ink-600 ring-ink-500/20";
  }
}

export const DOCUMENT_MIME_TYPES: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

export function fileExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index === -1 ? "" : fileName.slice(index + 1).toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
