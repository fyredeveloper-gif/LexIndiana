import { z } from "zod";
import { INDIANA_COUNTIES } from "@/lib/indiana";

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const optionalText = (max = 500) =>
  z
    .union([z.string().trim().max(max, `Keep this under ${max} characters.`), z.null()])
    .optional()
    .transform((value) => (value ? value : null));
const requiredText = (max = 200, message = "This field is required.") =>
  z.string().trim().min(1, message).max(max, `Keep this under ${max} characters.`);

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: "Password must include at least one letter and one number.",
  });

export const registerSchema = z.object({
  name: requiredText(120, "Enter your full name."),
  email,
  password: passwordSchema,
  firmName: optionalText(160),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(200),
});

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});

export const profileSchema = z.object({
  name: requiredText(120, "Enter your full name."),
  indianaAttorneyNumber: optionalText(24),
  defaultHourlyRate: z.coerce
    .number()
    .min(0, "Rate cannot be negative.")
    .max(5000, "Rate looks too high.")
    .transform((value) => Math.round(value * 100) / 100),
});

export const contactTypeSchema = z.enum(["CLIENT", "OPPOSING_PARTY", "OPPOSING_COUNSEL", "WITNESS"]);

export const contactSchema = z.object({
  type: contactTypeSchema,
  name: requiredText(160, "Enter a name."),
  aliases: z
    .union([z.array(z.string()), z.string()])
    .optional()
    .transform((value) => {
      if (!value) return [];
      const list = Array.isArray(value) ? value : value.split(",");
      return list
        .map((alias) => alias.trim())
        .filter(Boolean)
        .slice(0, 25);
    }),
  email: z
    .union([z.literal(""), email, z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  phone: optionalText(40),
  organization: optionalText(160),
  address: optionalText(400),
  notes: optionalText(4000),
});

// Partial updates must not apply create-time transforms to absent fields.
export const contactUpdateSchema = z.object({
  type: contactTypeSchema.optional(),
  name: z.string().trim().min(1).max(160).optional(),
  aliases: z.union([z.array(z.string()), z.string()]).optional(),
  email: z.union([z.literal(""), email]).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  organization: z.string().trim().max(160).nullable().optional(),
  address: z.string().trim().max(400).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export const matterStatusSchema = z.enum(["INTAKE", "ACTIVE", "PENDING", "CLOSED"]);

export const matterSchema = z.object({
  clientId: requiredText(64, "Select a client."),
  title: requiredText(200, "Enter a matter title."),
  causeNumber: optionalText(40),
  county: requiredText(80, "Enter the county."),
  courtName: optionalText(200),
  practiceArea: requiredText(80, "Enter a practice area."),
  status: matterStatusSchema.default("INTAKE"),
  notes: optionalText(8000),
});

export const matterUpdateSchema = z.object({
  clientId: z.string().trim().min(1).max(64).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  causeNumber: z.string().trim().max(40).nullable().optional(),
  county: z.string().trim().min(1).max(80).optional(),
  courtName: z.string().trim().max(200).nullable().optional(),
  practiceArea: z.string().trim().min(1).max(80).optional(),
  status: matterStatusSchema.optional(),
  notes: z.string().trim().max(8000).nullable().optional(),
});

export const timeEntrySchema = z.object({
  matterId: requiredText(64, "Select a matter."),
  description: requiredText(1000, "Describe the work performed."),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."),
  hours: z.coerce.number().min(0.1, "Enter at least 0.1 hours.").max(24, "A single entry cannot exceed 24 hours."),
  hourlyRate: z.coerce.number().min(0).max(5000).optional(),
  billable: z.boolean().default(true),
});

export const timerStartSchema = z.object({
  matterId: requiredText(64, "Select a matter."),
  description: z.string().trim().max(1000).optional(),
});

export const timerStopSchema = z.object({
  description: z.string().trim().max(1000).optional(),
});

export const serviceMethodSchema = z.enum(["PERSONAL", "E_SERVICE", "MAIL"]);

export const deadlineSchema = z.object({
  matterId: z
    .union([z.literal(""), z.string().max(64), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  title: requiredText(200, "Enter a deadline title."),
  ruleKey: optionalText(60),
  ruleCitation: optionalText(200),
  triggerEvent: requiredText(200, "Describe the triggering event."),
  triggerDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid trigger date."),
  serviceMethod: serviceMethodSchema,
  days: z.coerce.number().int().min(1, "Enter the prescribed period in days.").max(3650),
  notes: optionalText(4000),
});

export const deadlineUpdateSchema = z.object({
  completed: z.boolean().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});

export const taskPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const calendarEventTypeSchema = z.enum(["HEARING", "MEETING", "DEPOSITION", "DEADLINE", "OTHER"]);

const optionalId = z
  .union([z.literal(""), z.string().max(64), z.null()])
  .optional()
  .transform((value) => (value ? value : null));
const optionalDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date."), z.null()])
  .optional()
  .transform((value) => (value ? value : null));
const dateTimeLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time.");

export const taskSchema = z.object({
  matterId: optionalId,
  assigneeId: optionalId,
  title: requiredText(200, "Enter a task title."),
  description: optionalText(4000),
  dueDate: optionalDate,
  priority: taskPrioritySchema.default("MEDIUM"),
});

export const taskUpdateSchema = z.object({
  matterId: z.union([z.literal(""), z.string().max(64)]).nullable().optional(),
  assigneeId: z.union([z.literal(""), z.string().max(64)]).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  dueDate: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .nullable()
    .optional(),
  priority: taskPrioritySchema.optional(),
  completed: z.boolean().optional(),
});

export const calendarEventSchema = z
  .object({
    matterId: optionalId,
    title: requiredText(200, "Enter an event title."),
    description: optionalText(4000),
    type: calendarEventTypeSchema.default("MEETING"),
    startsAt: dateTimeLocal,
    endsAt: z.union([z.literal(""), dateTimeLocal, z.null()]).optional().transform((value) => value || null),
    allDay: z.boolean().default(false),
    location: optionalText(200),
  })
  .refine((value) => !value.endsAt || value.endsAt > value.startsAt, {
    message: "The end time must be after the start time.",
    path: ["endsAt"],
  });

export const calendarEventUpdateSchema = z.object({
  matterId: z.union([z.literal(""), z.string().max(64)]).nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(4000).nullable().optional(),
  type: calendarEventTypeSchema.optional(),
  startsAt: dateTimeLocal.optional(),
  endsAt: z.union([z.literal(""), dateTimeLocal]).nullable().optional(),
  allDay: z.boolean().optional(),
  location: z.string().trim().max(200).nullable().optional(),
});

export const generateDocumentSchema = z.object({
  templateId: requiredText(64, "Select a template."),
});

export const invoiceSchema = z.object({
  matterId: requiredText(64, "Select a matter."),
  timeEntryIds: z.array(z.string().min(1)).min(1, "Select at least one time entry to bill."),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueDate: z
    .union([z.literal(""), z.null(), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional()
    .transform((value) => (value ? value : null)),
  notes: optionalText(2000),
});

export const invoiceStatusSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID"]),
});

export const templateMetaSchema = z.object({
  name: requiredText(120, "Give the template a name."),
  description: optionalText(500),
});

export const intakeStatusSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CONVERTED", "DECLINED"]),
});

export const intakeSubmissionSchema = z.object({
  name: requiredText(160, "Enter your full name."),
  email,
  phone: requiredText(40, "Enter a phone number."),
  organization: optionalText(160),
  county: requiredText(80, "Select your county.").refine(
    (value) => (INDIANA_COUNTIES as readonly string[]).includes(value),
    "Select an Indiana county.",
  ),
  practiceArea: requiredText(80, "Select a practice area."),
  summary: z
    .string()
    .trim()
    .min(20, "Please describe your matter in at least 20 characters.")
    .max(4000, "Keep the description under 4,000 characters."),
  opposingParties: optionalText(1000),
  referralSource: optionalText(160),
  acknowledged: z.boolean().refine((value) => value === true, {
    message: "Please acknowledge the notice before submitting.",
  }),
  // Honeypot: real applicants never fill this hidden field.
  website: z.string().max(200).optional(),
});

export const intakeSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  intro: z.string().trim().max(600).nullable().optional(),
});

// ---------------------------------------------------------------------------
// Firm membership
// ---------------------------------------------------------------------------

export const staffRoleSchema = z.enum(["OWNER", "ATTORNEY", "PARALEGAL", "CLM", "CONSULTANT"]);

export const firmProfileSchema = z.object({
  name: requiredText(160, "Enter the firm name."),
  address: optionalText(400),
  phone: optionalText(40),
  email: z
    .union([z.literal(""), email, z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
});

export const inviteSchema = z
  .object({
    email,
    role: staffRoleSchema,
    title: optionalText(80),
  })
  .refine((value) => value.role !== "OWNER", {
    message: "Ownership is transferred, not invited.",
    path: ["role"],
  });

export const memberUpdateSchema = z
  .object({
    role: staffRoleSchema.optional(),
    title: z.string().trim().max(80).nullable().optional(),
  })
  .refine((value) => value.role !== undefined || value.title !== undefined, {
    message: "Nothing to update.",
  });

export const transferOwnershipSchema = z.object({
  userId: requiredText(64, "Select the new owner."),
});

export const joinSchema = z.object({
  name: requiredText(120, "Enter your full name."),
  password: passwordSchema,
});

export const matterAccessSchema = z.object({
  userId: requiredText(64, "Select a consultant."),
});

export const intakeUpdateSchema = z
  .object({
    status: z.enum(["NEW", "CONTACTED", "CONVERTED", "DECLINED"]).optional(),
    assignedToId: z.union([z.literal(""), z.string().max(64), z.null()]).optional(),
    internalNote: z.string().trim().max(4000).nullable().optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.assignedToId !== undefined || value.internalNote !== undefined,
    { message: "Nothing to update." },
  );
