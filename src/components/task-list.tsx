import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { TaskEditForm } from "@/components/forms/task-tools";
import { Badge, EmptyState } from "@/components/ui";
import { formatDate, relativeDueLabel, todayISO } from "@/lib/dates";
import { cn, TASK_PRIORITY_LABELS, taskPriorityClasses } from "@/lib/utils";
import type { TaskItem } from "@/lib/tasks";

export function TaskList({
  tasks,
  canWrite,
  hideMatter = false,
  matters,
  members = [],
}: {
  tasks: TaskItem[];
  canWrite: boolean;
  hideMatter?: boolean;
  matters?: Array<{ id: string; title: string; clientName: string }>;
  members?: Array<{ userId: string; name: string; role: string }>;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState
        icon="check"
        title="No tasks here"
        description="Add a task and it will show up in the workflow."
      />
    );
  }

  const today = todayISO();

  return (
    <ul className="divide-y divide-ink-100">
      {tasks.map((task) => {
        const overdue = !task.completed && task.dueDate !== null && task.dueDate < today;
        return (
          <li key={task.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className={cn(
                    "text-sm font-medium",
                    task.completed ? "text-ink-400 line-through" : "text-ink-900",
                  )}
                >
                  {task.title}
                </p>
                <Badge className={taskPriorityClasses(task.priority)}>
                  {TASK_PRIORITY_LABELS[task.priority] ?? task.priority}
                </Badge>
                {task.completed ? (
                  <Badge className="bg-emerald-50 text-emerald-700">Completed</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] text-ink-500">
                {task.dueDate ? (
                  <span className={overdue ? "font-medium text-red-600" : undefined}>
                    {formatDate(task.dueDate)} · {relativeDueLabel(task.dueDate)}
                  </span>
                ) : (
                  "No due date"
                )}
                {task.assigneeName ? ` · ${task.assigneeName}` : " · Unassigned"}
                {task.createdByName ? ` · added by ${task.createdByName}` : ""}
              </p>
              {!hideMatter && task.matterId ? (
                <Link
                  href={`/matters/${task.matterId}`}
                  className="mt-1 inline-block text-[11px] text-ink-600 hover:underline"
                >
                  {task.matterTitle}
                </Link>
              ) : null}
              {task.description ? (
                <p className="mt-1 max-w-2xl whitespace-pre-wrap text-[11px] leading-relaxed text-ink-500">
                  {task.description}
                </p>
              ) : null}
            </div>
            {canWrite ? (
              <div className="flex shrink-0 items-center gap-2">
                <ActionButton
                  url={`/api/tasks/${task.id}`}
                  method="PATCH"
                  body={{ completed: !task.completed }}
                  label={task.completed ? "Reopen" : "Complete"}
                  busyLabel="…"
                  className="btn btn-secondary btn-sm"
                />
                <ActionButton
                  url={`/api/tasks/${task.id}`}
                  method="DELETE"
                  label="Delete"
                  busyLabel="…"
                  confirmText="Delete this task?"
                  className="text-[11px] font-medium text-ink-400 hover:text-red-600"
                />
              </div>
            ) : null}
            {canWrite && matters ? (
              <div className="w-full">
                <TaskEditForm
                  task={{
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    matterId: task.matterId,
                    matterTitle: task.matterTitle,
                    assigneeId: task.assigneeId,
                    dueDate: task.dueDate,
                    priority: task.priority,
                  }}
                  matters={matters}
                  members={members}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
