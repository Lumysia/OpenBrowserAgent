import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { browserToolsForPrompt } from "../../src/background/tool-schema";
import { usesWorkspaceCapabilities } from "../../src/shared/agents";
import { createSystemPrompt } from "../../src/shared/system-prompt";
import type { Messages } from "../../src/shared/i18n";
import { PROMPT_BREAKDOWN_SEGMENT } from "../../src/shared/prompt-breakdown";
import { getSkillInstruction, isSkillEnabled } from "../../src/shared/skills";
import {
  isToolPartType,
  type AttachmentTab,
  type Agent,
  type Chat,
  type Preferences,
  type PromptBreakdown,
  type SelectedElement,
  type Skill,
  type UploadedAttachment,
} from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
} from "../../src/ui/components";
import { buildSidepanelContext } from "./sidepanel-context";
import { formatEstimatedTokens } from "./format";
import { IconTooltip } from "./icon-tooltip";

export type PromptUsageEstimate = PromptBreakdown;

export function usePromptUsageEstimate({
  input,
  currentChat,
  preferences,
  attachedTabs,
  selectedElements,
  pendingAttachments,
  uploadedAttachments,
  selectedSkills,
  agent,
  skills,
}: {
  input: string;
  currentChat?: Chat;
  preferences?: Preferences;
  attachedTabs: AttachmentTab[];
  selectedElements: SelectedElement[];
  pendingAttachments: UploadedAttachment[];
  uploadedAttachments: UploadedAttachment[];
  selectedSkills: Skill[];
  agent: Agent;
  skills: Skill[];
}): PromptUsageEstimate {
  const [contextChars, setContextChars] = useState(0);

  useEffect(() => {
    let cancelled = false;
    buildSidepanelContext({
      capabilities: agent.capabilities,
      attachedTabs,
      selectedElements,
    })
      .then((context) => !cancelled && setContextChars(context.length))
      .catch(() => !cancelled && setContextChars(0));
    return () => {
      cancelled = true;
    };
  }, [agent.capabilities, attachedTabs, selectedElements]);

  return useMemo(() => {
    const attachments = uniqueAttachments([
      ...uploadedAttachments,
      ...pendingAttachments,
    ]);
    const enabledSkills = skills.filter(isSkillEnabled);
    const availableSkills = preferences?.autoSelectSkills ? enabledSkills : [];
    const system = createSystemPrompt({
      capabilities: agent.capabilities,
      imageGenerationEnabled: preferences?.imageGenerationEnabled,
      agent,
    });
    return {
      systemPromptChars:
        system.length +
        availableToolSchemaChars({
          capabilities: agent.capabilities,
          hasUploadedAttachments: attachments.length > 0,
          hasSkills: availableSkills.length > 0,
          hasWorkspace: usesWorkspaceCapabilities(agent.capabilities),
          imageGenerationEnabled: !!preferences?.imageGenerationEnabled,
          latestUserText: input,
        }),
      userPromptChars: input.trim().length,
      conversationPromptChars: currentChat?.messages.reduce(
        (total, message) =>
          total + message.content.length + toolPartChars(message.parts),
        0,
      ),
      tabPromptChars: contextChars,
      skillPromptChars:
        selectedSkills.reduce(
          (total, skill) => total + getSkillInstruction(skill).length,
          0,
        ) +
        availableSkills.reduce(
          (total, skill) =>
            total + skill.name.length + skill.description.length,
          0,
        ),
      attachmentPromptChars: attachments.reduce(
        (total, attachment) =>
          total +
          attachment.name.length +
          (attachment.text?.length || 0) +
          (attachment.dataUrl?.length || 0),
        0,
      ),
    };
  }, [
    input,
    currentChat?.messages,
    preferences?.autoSelectSkills,
    preferences?.imageGenerationEnabled,
    contextChars,
    pendingAttachments,
    uploadedAttachments,
    selectedSkills,
    agent,
    skills,
  ]);
}

export function PromptUsagePreview({
  estimate,
  t,
}: {
  estimate: PromptUsageEstimate;
  t: Messages;
}) {
  const segments = promptSegments(estimate, t);
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (!total) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span>
          <IconTooltip label={t.sidepanel.runInfo.promptBreakdown} side="top">
            <Button
              className="prompt-usage-trigger"
              variant="ghost"
              size="icon"
              aria-label={t.sidepanel.runInfo.promptBreakdown}
            >
              <Info size={16} />
            </Button>
          </IconTooltip>
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="prompt-usage-popover-content"
        align="end"
        side="top"
      >
        <div
          className="prompt-usage-preview"
          aria-label={t.sidepanel.runInfo.promptBreakdown}
        >
          <Progress
            segments={segments.map((segment) => ({
              key: segment.key,
              value: segment.value,
              className: `run-info-prompt-${segment.key}`,
              tooltip: `${segment.label}\n${formatEstimatedTokens(segment.value, t)}`,
            }))}
          />
          <div className="prompt-usage-preview-rows">
            {segments.map((segment) => (
              <div className="prompt-usage-preview-row" key={segment.key}>
                <span>{segment.label}</span>
                <strong>{formatEstimatedTokens(segment.value, t)}</strong>
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function promptSegments(estimate: PromptUsageEstimate, t: Messages) {
  return [
    {
      key: PROMPT_BREAKDOWN_SEGMENT.system,
      label: t.sidepanel.runInfo.prebuiltPrompt,
      value: estimate.systemPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.user,
      label: t.sidepanel.runInfo.userPrompt,
      value: estimate.userPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.conversation,
      label: t.sidepanel.runInfo.conversationPrompt,
      value: estimate.conversationPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.tabs,
      label: t.sidepanel.runInfo.tabPrompt,
      value: estimate.tabPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.skills,
      label: t.sidepanel.runInfo.skillPrompt,
      value: estimate.skillPromptChars || 0,
    },
    {
      key: PROMPT_BREAKDOWN_SEGMENT.attachments,
      label: t.sidepanel.runInfo.attachmentPrompt,
      value: estimate.attachmentPromptChars || 0,
    },
  ].filter((segment) => segment.value > 0);
}

function availableToolSchemaChars({
  capabilities,
  hasUploadedAttachments,
  hasSkills,
  hasWorkspace,
  imageGenerationEnabled,
  latestUserText,
}: {
  capabilities: Agent["capabilities"];
  hasUploadedAttachments: boolean;
  hasSkills: boolean;
  hasWorkspace: boolean;
  imageGenerationEnabled: boolean;
  latestUserText: string;
}) {
  return jsonLength(
    browserToolsForPrompt({
      capabilities,
      hasUploadedAttachments,
      hasSkills,
      hasWorkspace,
      imageGenerationEnabled,
      latestUserText,
    }),
  );
}

function uniqueAttachments(attachments: UploadedAttachment[]) {
  return Array.from(
    new Map(attachments.map((item) => [item.id, item])).values(),
  );
}

function toolPartChars(parts: Chat["messages"][number]["parts"]) {
  if (!parts?.length) return 0;
  return parts.reduce((total, part) => {
    if (!isToolPartType(part.type)) return total;
    return total + jsonLength(part.input) + jsonLength(part.output);
  }, 0);
}

function jsonLength(value: unknown) {
  if (!value) return 0;
  try {
    return JSON.stringify(value).length;
  } catch {
    return String(value).length;
  }
}
