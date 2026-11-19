import Link from "next/link";
import { notFound } from "next/navigation";
import { TaskForm } from "@/components/forms/task-tools";
import { TaskList } from "@/components/task-list";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMatterOptions } from "@/lib/data";
import { getFirmMemberOptions } from "@/lib/firm";
import { can } from "@/lib/permissions";
import { todayISO } from "@/lib/dates";
import { getTasks, type TaskItem } from "@/lib/tasks";

export const metadata = { title: "Tasks" };

function groupTasks(tasks: TaskItem[]) {
  const today = todayISO();
  const open = tasks.filter((task) => !task.completed);
  return {
    overdue: open.filter((task) => task.dueDate !== null && task.dueDate < today),
    today: open.filter((task) => task.dueDate === today),
    upcoming: open.filter((task) => task.dueDate !== null && task.dueDate > today),
    noDate: open.filter((task) => task.dueDate === null),
    completed: tasks.filter((task) => task.completed),
  };
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "task:read")) notFound();
  const canWrite = can(user.role, "task:write");
  const { show } = await searchParams;
  const showAll = show === "all";

  const [tasks, matters, members] = await Promise.all([
    getTasks(user, { includeCompleted: showAll }),
    getMatterOptions(user),
    canWrite ? getFirmMemberOptions(user.firmId) : Promise.resolve([]),
  ]);
  const groups = groupTasks(tasks);
  const openCount = groups.overdue.length + groups.today.length + groups.upcoming.length + groups.noDate.length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Practice workflow"
        title="Tasks"
        description="Assign follow-ups across matters, track due dates, and close the loop without leaving the workspace."
        actions={
          <Link href={showAll ? "/tasks" : "/tasks?show=all"} className="btn btn-secondary">
            {showAll ? "Hide completed" : "Show completed"}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {openCount === 0 && groups.completed.length === 0 ? (
            <Card>
              <EmptyState
                icon="check"
                title="No tasks yet"
                description="Add a task to start tracking assignments and follow-ups."
              />
            </Card>
          ) : null}

          {groups.overdue.length > 0 ? (
            <Card>
              <CardHeader title="Overdue" description={`${groups.overdue.length} need attention`} icon="alert" />
              <TaskList tasks={groups.overdue} canWrite={canWrite} matters={matters} members={members} />
            </Card>
          ) : null}

          {groups.today.length > 0 ? (
            <Card>
              <CardHeader title="Due today" description={`${groups.today.length} due`} icon="clock" />
              <TaskList tasks={groups.today} canWrite={canWrite} matters={matters} members={members} />
            </Card>
          ) : null}

          {groups.upcoming.length > 0 ? (
            <Card>
              <CardHeader title="Upcoming" description={`${groups.upcoming.length} scheduled`} icon="calendar" />
              <TaskList tasks={groups.upcoming} canWrite={canWrite} matters={matters} members={members} />
            </Card>
          ) : null}

          {groups.noDate.length > 0 ? (
            <Card>
              <CardHeader title="No due date" description={`${groups.noDate.length} unscheduled`} icon="check" />
              <TaskList tasks={groups.noDate} canWrite={canWrite} matters={matters} members={members} />
            </Card>
          ) : null}

          {groups.completed.length > 0 ? (
            <Card>
              <CardHeader title="Completed" description={`${groups.completed.length} closed`} icon="check" />
              <TaskList tasks={groups.completed} canWrite={canWrite} matters={matters} members={members} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          {canWrite ? (
            <Card>
              <CardHeader
                title="Add a task"
                description="Keep the next action visible to the whole team."
                icon="plus"
              />
              <div className="px-5 py-5">
                <TaskForm
                  matters={matters}
                  members={members.map((member) => ({ ...member }))}
                />
              </div>
            </Card>
          ) : null}

          <Card className="bg-ink-950 text-white">
            <div className="px-5 py-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brass-300">Task hygiene</p>
              <p className="mt-2 text-xs leading-relaxed text-ink-300">
                Give every task one next action and a due date. Completing a task keeps its history; delete only
                mistakes.
              </p>
              <p className="mt-3 text-[11px] text-ink-400">
                {openCount} open task{openCount === 1 ? "" : "s"} in this workspace.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
