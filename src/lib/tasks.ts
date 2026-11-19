import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth";
import { isoDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: string;
  completed: boolean;
  completedAt: string | null;
  matterId: string | null;
  matterTitle: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdByName: string;
  createdAt: string;
};

function taskWhere(user: SessionUser): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { firmId: user.firmId };
  // Consultants only see work attached to a matter explicitly shared with them.
  // Assignment alone is not an access grant: a firm-wide or unshared-matter
  // task would otherwise leak its title (and the matter it belongs to).
  if (user.role === "CONSULTANT") {
    where.matter = { access: { some: { userId: user.id } } };
  }
  return where;
}

function toTaskItem(task: {
  id: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  priority: string;
  completed: boolean;
  completedAt: Date | null;
  matterId: string | null;
  createdAt: Date;
  matter: { title: string } | null;
  assignee: { id: string; name: string } | null;
  createdBy: { name: string };
}): TaskItem {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate ? isoDate(task.dueDate) : null,
    priority: task.priority,
    completed: task.completed,
    completedAt: task.completedAt?.toISOString() ?? null,
    matterId: task.matterId,
    matterTitle: task.matter?.title ?? null,
    assigneeId: task.assignee?.id ?? null,
    assigneeName: task.assignee?.name ?? null,
    createdByName: task.createdBy.name,
    createdAt: task.createdAt.toISOString(),
  };
}

export async function getTasks(
  user: SessionUser,
  options: { includeCompleted?: boolean; limit?: number } = {},
): Promise<TaskItem[]> {
  const tasks = await prisma.task.findMany({
    where: {
      ...taskWhere(user),
      ...(options.includeCompleted ? {} : { completed: false }),
    },
    orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: options.limit ?? 200,
    include: {
      matter: { select: { title: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return tasks.map(toTaskItem);
}

export async function getMatterTasks(user: SessionUser, matterId: string): Promise<TaskItem[]> {
  const tasks = await prisma.task.findMany({
    where: {
      firmId: user.firmId,
      matterId,
      ...(user.role === "CONSULTANT"
        ? { matter: { access: { some: { userId: user.id } } } }
        : {}),
    },
    orderBy: [{ completed: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    take: 100,
    include: {
      matter: { select: { title: true } },
      assignee: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return tasks.map(toTaskItem);
}

/** Used by API writes to ensure matter references stay inside the caller's firm. */
export async function matterBelongsToFirm(firmId: string, matterId: string): Promise<boolean> {
  const matter = await prisma.matter.findFirst({
    where: { id: matterId, firmId },
    select: { id: true },
  });
  return Boolean(matter);
}

/** Used by API writes to prevent assigning work to a different firm's staff. */
export async function userBelongsToFirm(firmId: string, userId: string): Promise<boolean> {
  const membership = await prisma.membership.findFirst({
    where: { firmId, userId },
    select: { id: true },
  });
  return Boolean(membership);
}
