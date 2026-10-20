import {
  createSkillFile,
  getSkillBody,
  getSkillMetadata,
  normalizeSkillName,
  parseSkillFrontmatter,
  skillFileKind,
  uniqueSkillName,
  withSkillMetadata,
} from "../skills";
import type { Skill, SkillFile, SkillInvokeMode } from "../types";
import { isSecretStep } from "./secret-fields";
import { fieldLabel } from "./transcript";
import { originOf } from "./urls";
import {
  TEACH_STEP_KIND,
  type TeachDraft,
  type TeachField,
  type TeachSession,
  type TeachStep,
} from "./types";

// A recording saved as an ordinary skill: SKILL.md (written by the model
// from the transcript; its frontmatter `metadata` set here) and
// references/demonstration.json, the recorded steps with their targets as
// hints, without any typed value.

export const DEMONSTRATION_PATH = "references/demonstration.json";
const DEMONSTRATION_FORMAT = "openbrowseragent-demonstration/1";
const FALLBACK_NAME = "recorded-task";

export const RECORDED_SKILL_SOURCE = "demonstration";

export const RECORDED_SKILL_STATUS = {
  draft: "draft",
  verified: "verified",
} as const;

export type RecordedSkillStatus =
  (typeof RECORDED_SKILL_STATUS)[keyof typeof RECORDED_SKILL_STATUS];

export type RecordedSkillInfo = {
  status: RecordedSkillStatus;
  origin: string;
  recordedAt: string;
};

// The skill's recording details, if it was recorded.
export function recordedSkillInfo(skill: Skill): RecordedSkillInfo | undefined {
  const metadata = getSkillMetadata(skill);
  if (metadata.source !== RECORDED_SKILL_SOURCE) return undefined;
  return {
    status:
      metadata.status === RECORDED_SKILL_STATUS.verified
        ? RECORDED_SKILL_STATUS.verified
        : RECORDED_SKILL_STATUS.draft,
    origin: metadata.origin || "",
    recordedAt: metadata.recordedAt || "",
  };
}

// Keys of a skill's metadata that only code sets: whether it was recorded
// and whether its check passed. Edits by the agent, in Settings or by an
// import keep the earlier values whatever the new SKILL.md says.
const CODE_OWNED_METADATA = ["source", "status"] as const;

const demonstrationFileOf = (skill: Skill) =>
  skill.files.find((file) => file.path === DEMONSTRATION_PATH)?.content;

// `after`, an edit of `before` (undefined for a new or imported skill), with
// the code-owned metadata of `before`. A new skill is never verified, and a
// verified one whose instructions or demonstration changed is a draft
// again: only a check run verifies.
export function guardSkillEdit(
  before: Skill | undefined,
  after: Skill,
  now = Date.now(),
): Skill {
  const incoming = getSkillMetadata(after);
  const kept = before ? getSkillMetadata(before) : incoming;
  const owned = Object.fromEntries(
    CODE_OWNED_METADATA.map((key) => [key, kept[key] || ""]),
  );
  const stale = before
    ? recordedSkillInfo(before)?.status === RECORDED_SKILL_STATUS.verified &&
      (getSkillBody(before) !== getSkillBody(after) ||
        demonstrationFileOf(before) !== demonstrationFileOf(after))
    : owned.status === RECORDED_SKILL_STATUS.verified;
  if (stale) owned.status = RECORDED_SKILL_STATUS.draft;
  const unchanged = CODE_OWNED_METADATA.every(
    (key) => (incoming[key] || "") === owned[key],
  );
  return unchanged ? after : withSkillMetadata(after, owned, now);
}

export function withRecordedStatus(
  skill: Skill,
  status: RecordedSkillStatus,
  now = Date.now(),
) {
  return withSkillMetadata(skill, { status }, now);
}

const isFence = (line: string) => /^```[\w-]*$/.test(line.trim());
const isRule = (line: string) => line.trim() === "---";

// What the model wrote: a SKILL.md, possibly in a code fence, after a
// short preamble ("Here is the skill:"), with any line endings. The
// frontmatter is the first `---` block that names the skill.
export function parseDraft(text: string): TeachDraft {
  const lines = text.replace(/\r\n?/g, "\n").trim().split("\n");
  for (let open = lines.findIndex(isRule); open >= 0;) {
    const close = lines.findIndex(
      (line, index) => index > open && isRule(line),
    );
    if (close < 0) break;
    const frontmatter = `${lines.slice(open, close + 1).join("\n")}\n`;
    const { name, description } = parseSkillFrontmatter(frontmatter);
    if (name || description) {
      let rest = lines.slice(close + 1);
      // The fence opened before the frontmatter closes after the body.
      if (lines.slice(0, open).some(isFence)) {
        const end = rest.findLastIndex(isFence);
        if (end >= 0) rest = rest.slice(0, end);
      }
      return {
        name: normalizeSkillName(name),
        description,
        body: rest.join("\n").trim(),
      };
    }
    open = lines.findIndex((line, index) => index > open && isRule(line));
  }
  const body = lines.join("\n").replace(/^```[\w-]*\n([\s\S]*?)\n```$/, "$1");
  return { name: "", description: "", body: body.trim() };
}

// An input the skill needs: each field the user typed in and each step
// they marked as changing.
type DemonstrationInput = {
  label: string;
  step: number;
  sensitive: boolean;
  example?: string;
};

function inputsOf(steps: TeachStep[]): DemonstrationInput[] {
  return steps.flatMap((step, index) => {
    const typed = step.kind === TEACH_STEP_KIND.field;
    if (!typed && !step.varies) return [];
    const sensitive = isSecretStep(step);
    return [
      {
        label: fieldLabel(step.target),
        step: index + 1,
        sensitive,
        ...(step.field?.example && !sensitive
          ? { example: step.field.example }
          : {}),
      },
    ];
  });
}

// The steps without anything the recorder keeps only for itself.
function demonstrationStep(step: TeachStep, index: number) {
  const { id: _id, at: _at, field, choice, ...rest } = step;
  const secret = isSecretStep(step);
  const kept = field && {
    inputType: field.inputType,
    length: field.length,
    sensitive: secret,
    ...(field.submitted ? { submitted: true } : {}),
    ...(field.example && !secret ? { example: field.example } : {}),
  };
  return {
    step: index + 1,
    ...rest,
    ...(choice !== undefined && !secret ? { choice } : {}),
    ...(kept ? { field: kept } : {}),
  };
}

export function demonstrationJson(
  session: Pick<TeachSession, "steps" | "startUrl" | "startedAt">,
) {
  return JSON.stringify(
    {
      format: DEMONSTRATION_FORMAT,
      note: "Hints from the user's demonstration. Find each element again in a fresh snapshot; never act on these values blindly.",
      recordedAt: new Date(session.startedAt).toISOString(),
      startUrl: session.startUrl,
      inputs: inputsOf(session.steps),
      steps: session.steps.map(demonstrationStep),
    },
    null,
    2,
  );
}

const HINTS_NOTE = `Use \`${DEMONSTRATION_PATH}\` (read it with \`read\`) only as hints for finding each target: take a fresh snapshot and find the element again by its role and name; the page may have changed since the recording.`;

// The body always points the agent to the hints, whatever the model wrote.
export function bodyWithHintsNote(body: string) {
  if (body.includes(DEMONSTRATION_PATH)) return body.trim();
  return `${body.trim()}\n\n## Recording\n\n${HINTS_NOTE}\n`;
}

// The name the skill gets: the draft's (or the fallback), made unique
// among the skills there are with -2, -3…
export function recordedSkillName(name: string, existingNames: string[]) {
  return uniqueSkillName(
    normalizeSkillName(name) || FALLBACK_NAME,
    existingNames,
  );
}

export function buildRecordedSkill({
  session,
  draft,
  existingNames,
  now = Date.now(),
  id = crypto.randomUUID(),
}: {
  session: Pick<TeachSession, "steps" | "startUrl" | "startedAt">;
  draft: TeachDraft;
  existingNames: string[];
  now?: number;
  id?: string;
}): Skill {
  const name = recordedSkillName(draft.name, existingNames);
  const description = draft.description.trim();
  const reference: SkillFile = {
    path: DEMONSTRATION_PATH,
    kind: skillFileKind(DEMONSTRATION_PATH),
    encoding: "utf-8",
    content: demonstrationJson(session),
    updatedAt: now,
  };
  return {
    id,
    name,
    description,
    files: [
      {
        ...createSkillFile(
          name,
          description,
          bodyWithHintsNote(draft.body),
          now,
          {
            source: RECORDED_SKILL_SOURCE,
            origin: originOf(session.startUrl),
            recordedAt: new Date(session.startedAt).toISOString(),
            status: RECORDED_SKILL_STATUS.draft,
          },
        ),
        encoding: "utf-8",
      },
      reference,
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// A recorded skill is used only when picked until a check run passed; then
// the side panel offers to let the agent use it on its own.
export const RECORDED_SKILL_INVOKE: SkillInvokeMode = "manual";

export function offersAutomaticUse(skill: Skill, invoke: SkillInvokeMode) {
  return (
    invoke === RECORDED_SKILL_INVOKE &&
    recordedSkillInfo(skill)?.status === RECORDED_SKILL_STATUS.verified
  );
}

export type Demonstration = { startUrl: string; steps: TeachStep[] };

// The recording a skill was made from, read back from its
// demonstration file; steps get new ids.
export function demonstrationOf(skill: Skill): Demonstration | undefined {
  const file = skill.files.find((item) => item.path === DEMONSTRATION_PATH);
  if (!file) return undefined;
  try {
    const parsed = JSON.parse(file.content) as {
      startUrl?: unknown;
      steps?: unknown;
    };
    if (typeof parsed.startUrl !== "string" || !Array.isArray(parsed.steps))
      return undefined;
    const steps = parsed.steps.flatMap((item): TeachStep[] => {
      const {
        step: _step,
        field,
        ...rest
      } = item as Record<string, unknown> &
        Partial<TeachStep> & {
          field?: Partial<TeachField> & { sensitive?: boolean };
        };
      if (typeof rest.kind !== "string" || !rest.page) return [];
      return [
        {
          ...(rest as TeachStep),
          id: crypto.randomUUID(),
          at: 0,
          ...(field
            ? {
                field: {
                  inputType: String(field.inputType || ""),
                  length: Number(field.length) || 0,
                  secret: field.sensitive === true,
                  ...(field.submitted ? { submitted: true } : {}),
                  ...(field.example && field.sensitive !== true
                    ? { example: String(field.example) }
                    : {}),
                },
              }
            : {}),
        },
      ];
    });
    return { startUrl: parsed.startUrl, steps };
  } catch {
    return undefined;
  }
}
