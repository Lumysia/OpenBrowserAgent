import { ArrowLeft, CalendarPlus } from "lucide-react";
import { useState } from "react";
import { formatCount } from "../../../src/shared/i18n";
import { taskState } from "../../../src/shared/tasks/normalize";
import type { TaskDraft } from "../../../src/shared/tasks/edit";
import type { Agent } from "../../../src/shared/types";
import {
  Button,
  EMPTY_STATE_VARIANT,
  EmptyState,
  IconTooltip,
  ScrollArea,
} from "../../../src/ui/components";
import { useMessages } from "../../../src/ui/messages";
import { formFor } from "./task-form-state";
import { TaskFormView } from "./task-form";
import { TaskItem } from "./task-item";
import { useTasks } from "./use-tasks";

type Editing = { id?: string; draft?: Partial<TaskDraft> } | undefined;

// The task list, a view next to chat history: each task's schedule, state,
// last result (its chat) and next run, with create, edit, pause/resume, run
// now and delete.
export function TasksPanel({
  agents,
  defaultAgentId,
  pageUrl,
  draft,
  onOpenChat,
  onBack,
}: {
  agents: Agent[];
  defaultAgentId: string;
  // The page the user is on, offered for a new watch.
  pageUrl?: string;
  // A task prefilled from a chat.
  draft?: Partial<TaskDraft>;
  onOpenChat: (chatId: string) => void;
  onBack: () => void;
}) {
  const t = useMessages();
  const data = useTasks();
  const [editing, setEditing] = useState<Editing>(
    draft ? { draft } : undefined,
  );
  const editedTask = editing?.id
    ? data.tasks.find((task) => task.id === editing.id)
    : undefined;
  const sorted = [...data.tasks].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="history-page tasks-page">
      <div className="history-page-header">
        <IconTooltip label={t.sidepanel.backToChat}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.sidepanel.backToChat}
            onClick={editing ? () => setEditing(undefined) : onBack}
          >
            <ArrowLeft size={18} />
          </Button>
        </IconTooltip>
        <div>
          <strong>
            {editing
              ? editing.id
                ? t.tasks.editTask
                : t.tasks.newTask
              : t.tasks.title}
          </strong>
          {!editing && (
            <small>{formatCount(t.tasks.count, data.tasks.length)}</small>
          )}
        </div>
        <div className="history-page-actions">
          {!editing && (
            <IconTooltip label={t.tasks.newTask}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t.tasks.newTask}
                onClick={() => setEditing({})}
              >
                <CalendarPlus size={18} />
              </Button>
            </IconTooltip>
          )}
        </div>
      </div>
      <ScrollArea className="history-panel">
        {editing ? (
          <TaskFormView
            key={editing.id || "new"}
            initial={formFor(editedTask, editing.draft, {
              agentId: defaultAgentId,
              deviceId: data.context.deviceId,
              url: pageUrl,
              now: Date.now(),
            })}
            agents={agents}
            devices={data.devices}
            thisDeviceId={data.context.deviceId}
            onCancel={() => setEditing(undefined)}
            onSave={async (next) => {
              await data.save(next, editing.id);
              setEditing(undefined);
            }}
          />
        ) : (
          <>
            {!data.loading && !data.tasks.length && (
              <EmptyState
                variant={EMPTY_STATE_VARIANT.plain}
                title={t.tasks.empty}
                description={t.tasks.emptyHint}
                action={
                  <Button size="sm" onClick={() => setEditing({})}>
                    <CalendarPlus size={15} /> {t.tasks.newTask}
                  </Button>
                }
              />
            )}
            {sorted.map((task) => {
              const state = taskState(data.states, task.id);
              return (
                <TaskItem
                  key={task.id}
                  task={task}
                  state={state}
                  context={data.context}
                  devices={data.devices}
                  onOpenChat={onOpenChat}
                  onEdit={() => setEditing({ id: task.id })}
                  onRunNow={() => void data.runNow(task.id).catch(console.warn)}
                  onSetPaused={(paused) =>
                    void data
                      .setPaused(task, state, paused)
                      ?.catch(console.warn)
                  }
                  onDelete={() => void data.remove(task.id).catch(console.warn)}
                />
              );
            })}
          </>
        )}
      </ScrollArea>
    </div>
  );
}
