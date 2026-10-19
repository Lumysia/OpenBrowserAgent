import { MousePointerClick } from "lucide-react";
import { useState } from "react";
import { mayActUnattended, resolveAgent } from "../../../src/shared/agents";
import {
  INTERVAL_UNITS,
  TASK_LIMITS,
  TRIGGER_KINDS,
  type TaskDevice,
} from "../../../src/shared/tasks/types";
import type { TaskDraft } from "../../../src/shared/tasks/edit";
import type { Agent } from "../../../src/shared/types";
import {
  Button,
  Feedback,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "../../../src/ui/components";
import { useLocale, useMessages } from "../../../src/ui/messages";
import { agentDisplayName } from "../../../src/ui/agent-display";
import { useComposer } from "../sidepanel-providers";
import { weekdayName } from "./task-display";
import {
  draftFromForm,
  type FormError,
  type TaskForm,
} from "./task-form-state";

const PART_PAGE = "page";
const WEEK = [1, 2, 3, 4, 5, 6, 0];

// Creates or edits a task. What its runs may do follows from the agent
// picked here (its "act on its own" permission), shown under the agent.
export function TaskFormView({
  initial,
  agents,
  devices,
  thisDeviceId,
  onSave,
  onCancel,
}: {
  initial: TaskForm;
  agents: Agent[];
  devices: TaskDevice[];
  thisDeviceId: string;
  onSave: (draft: TaskDraft) => Promise<unknown>;
  onCancel: () => void;
}) {
  const t = useMessages();
  const f = t.tasks.form;
  const locale = useLocale();
  const composer = useComposer();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<FormError>();
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<TaskForm>) =>
    setForm((current) => ({ ...current, ...patch }));
  const agent = resolveAgent(agents, form.agentId);
  // An element picked on the watched page (its structural path).
  const picked = composer.selectedElements.find(
    (element) => element.path && element.pageUrl,
  );
  const partOptions = [
    { value: PART_PAGE, label: f.partPage },
    ...(form.selector ? [{ value: form.selector, label: f.partElement }] : []),
    ...(picked?.path && picked.path !== form.selector
      ? [{ value: picked.path, label: f.partElement }]
      : []),
  ];

  async function save() {
    const result = draftFromForm(form);
    if ("error" in result) return setError(result.error);
    setError(undefined);
    setSaving(true);
    try {
      await onSave(result.draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="task-form stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Label>
        {f.title}
        <Input
          value={form.title}
          maxLength={TASK_LIMITS.titleChars}
          onChange={(event) => set({ title: event.target.value })}
        />
      </Label>
      <Label>
        {form.kind === "watch" ? f.watchPrompt : f.prompt}
        <Textarea
          rows={3}
          value={form.prompt}
          maxLength={TASK_LIMITS.promptChars}
          placeholder={
            form.kind === "watch"
              ? f.watchPromptPlaceholder
              : f.promptPlaceholder
          }
          onChange={(event) => set({ prompt: event.target.value })}
        />
      </Label>
      <Label>
        {f.kind}
        <Select
          value={form.kind}
          onValueChange={(kind) => set({ kind: kind as TaskForm["kind"] })}
        >
          <SelectTrigger aria-label={f.kind}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRIGGER_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t.tasks.kinds[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Label>
      {form.kind === "once" && (
        <Label>
          {f.at}
          <Input
            type="datetime-local"
            value={form.at}
            onChange={(event) => set({ at: event.target.value })}
          />
        </Label>
      )}
      {form.kind === "interval" && (
        <div className="task-form-row">
          <Label>
            {f.every}
            <Input
              type="number"
              min={1}
              max={TASK_LIMITS.maxIntervalCount}
              value={form.every}
              onChange={(event) => set({ every: event.target.value })}
            />
          </Label>
          <Label>
            {f.unit}
            <Select
              value={form.unit}
              onValueChange={(unit) => set({ unit: unit as TaskForm["unit"] })}
            >
              <SelectTrigger aria-label={f.unit}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_UNITS.map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {t.tasks.unitNames[unit]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Label>
        </div>
      )}
      {(form.kind === "daily" || form.kind === "weekly") && (
        <Label>
          {f.time}
          <Input
            type="time"
            value={form.time}
            onChange={(event) => set({ time: event.target.value })}
          />
        </Label>
      )}
      {form.kind === "weekly" && (
        <div className="stack">
          <span className="settings-field-heading">{f.days}</span>
          <ToggleGroup
            type="multiple"
            size="sm"
            aria-label={f.days}
            value={form.days}
            onValueChange={(days) => days.length && set({ days })}
          >
            {WEEK.map((day) => (
              <ToggleGroupItem key={day} value={String(day)}>
                {weekdayName(locale, day)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
      {form.kind === "watch" && (
        <>
          <Label>
            {f.url}
            <Input
              type="url"
              value={form.url}
              placeholder="https://"
              onChange={(event) => set({ url: event.target.value })}
            />
          </Label>
          <div className="task-form-row">
            <Label>
              {f.part}
              <Select
                value={form.selector || PART_PAGE}
                onValueChange={(value) =>
                  set({
                    selector: value === PART_PAGE ? "" : value,
                    ...(picked?.path === value && picked.pageUrl
                      ? { url: picked.pageUrl }
                      : {}),
                  })
                }
              >
                <SelectTrigger aria-label={f.part}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {partOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="task-form-pick"
              onClick={() => void composer.selectElement()}
            >
              <MousePointerClick size={15} /> {f.pickElement}
            </Button>
          </div>
          <Label>
            {f.checkEvery}
            <Input
              type="number"
              min={TASK_LIMITS.minWatchMinutes}
              value={form.everyMinutes}
              onChange={(event) => set({ everyMinutes: event.target.value })}
            />
          </Label>
          <small className="muted">{f.watchHint}</small>
        </>
      )}
      <Label>
        {f.agent}
        <Select value={agent.id} onValueChange={(agentId) => set({ agentId })}>
          <SelectTrigger aria-label={f.agent}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {agentDisplayName(item, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <small className="muted task-form-access">
          {mayActUnattended(agent) ? f.mayAct : f.looksOnly}
        </small>
      </Label>
      {devices.length > 1 && (
        <Label>
          {f.device}
          <Select
            value={form.deviceId}
            onValueChange={(deviceId) => set({ deviceId })}
          >
            <SelectTrigger aria-label={f.device}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {devices.map((device) => (
                <SelectItem key={device.id} value={device.id}>
                  {device.id === thisDeviceId
                    ? f.thisDevice.replace("{name}", device.name)
                    : device.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Label>
      )}
      {error && <Feedback error>{f[error]}</Feedback>}
      <div className="row">
        <Button type="submit" disabled={saving}>
          {f.save}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
