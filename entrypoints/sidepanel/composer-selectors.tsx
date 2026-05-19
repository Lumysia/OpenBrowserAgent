import { Brain, Check } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { Messages } from "../../src/shared/i18n";
import {
  REASONING_EFFORT,
  REASONING_EFFORT_OPTIONS,
  type ReasoningEffort,
} from "../../src/shared/reasoning";
import type {
  Agent,
  ChatMode,
  ModelConfig,
  Preferences,
} from "../../src/shared/types";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../src/ui/components";
import { ModelMenu, ModeSelector, selectedModelLabel } from "./composer-menus";
import { COMPOSER_MENU, type ComposerMenu } from "./sidepanel-menu-state";

export function ComposerSelectors({
  t,
  preferences,
  configuredModels,
  mode,
  agents,
  openMenu,
  aiWorking,
  onSetMode,
  onSetOpenMenu,
  onSetPreferences,
}: {
  t: Messages;
  preferences?: Preferences;
  configuredModels: ModelConfig[];
  mode: ChatMode;
  agents: Agent[];
  openMenu: ComposerMenu | null;
  aiWorking: boolean;
  onSetMode: (value: ChatMode) => void;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetPreferences: Dispatch<SetStateAction<Preferences>>;
}) {
  return (
    <div className="composer-selectors">
      <div className="selector-anchor model-anchor">
        <Popover
          open={openMenu === COMPOSER_MENU.model}
          onOpenChange={(open) =>
            onSetOpenMenu(open ? COMPOSER_MENU.model : null)
          }
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="composer-trigger composer-model-trigger"
              disabled={aiWorking}
            >
              {selectedModelLabel(
                preferences?.selectedModelId,
                configuredModels,
                t,
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="model-popover-content" align="end">
            <ModelMenu
              t={t}
              models={configuredModels}
              selectedModelId={preferences?.selectedModelId}
              onSelect={(modelId) => {
                if (preferences)
                  onSetPreferences((previous) => ({
                    ...previous,
                    selectedModelId: modelId,
                  }));
                onSetOpenMenu(null);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <ReasoningEffortSelector
        t={t}
        effort={preferences?.reasoningEffort || REASONING_EFFORT.default}
        openMenu={openMenu}
        aiWorking={aiWorking}
        onSetOpenMenu={onSetOpenMenu}
        onSetPreferences={onSetPreferences}
      />
      <div className="selector-anchor mode-anchor">
        <ModeSelector
          t={t}
          mode={mode}
          agents={agents}
          preferences={preferences}
          openMenu={openMenu}
          aiWorking={aiWorking}
          onSetMode={onSetMode}
          onSetOpenMenu={onSetOpenMenu}
          onSetPreferences={onSetPreferences}
        />
      </div>
    </div>
  );
}

function ReasoningEffortSelector({
  t,
  effort,
  openMenu,
  aiWorking,
  onSetOpenMenu,
  onSetPreferences,
}: {
  t: Messages;
  effort: ReasoningEffort;
  openMenu: ComposerMenu | null;
  aiWorking: boolean;
  onSetOpenMenu: (value: ComposerMenu | null) => void;
  onSetPreferences: Dispatch<SetStateAction<Preferences>>;
}) {
  return (
    <div className="selector-anchor reasoning-anchor">
      <Popover
        open={openMenu === COMPOSER_MENU.reasoning}
        onOpenChange={(open) =>
          onSetOpenMenu(open ? COMPOSER_MENU.reasoning : null)
        }
      >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="composer-trigger composer-reasoning-trigger"
            disabled={aiWorking}
            aria-label={t.sidepanel.reasoningEffort}
          >
            <ReasoningEffortIcon effort={effort} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="reasoning-popover-content" align="end">
          <ReasoningEffortMenu
            t={t}
            effort={effort}
            onSelect={(nextEffort) => {
              onSetPreferences((previous) => ({
                ...previous,
                reasoningEffort: nextEffort,
              }));
              onSetOpenMenu(null);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ReasoningEffortMenu({
  t,
  effort,
  onSelect,
}: {
  t: Messages;
  effort: ReasoningEffort;
  onSelect: (effort: ReasoningEffort) => void;
}) {
  return (
    <div className="add-context-menu reasoning-effort-menu">
      <div className="action-list-item muted">
        <Brain size={17} />
        <span>
          <strong>{t.sidepanel.reasoningEffort}</strong>
          <small>{t.sidepanel.reasoningEffortDescription}</small>
        </span>
      </div>
      {REASONING_EFFORT_OPTIONS.map((option) => {
        const selected = option === effort;
        return (
          <Button
            key={option}
            variant="ghost"
            className={`action-list-item ${selected ? "active" : ""}`}
            onClick={() => onSelect(option)}
          >
            <ReasoningEffortIcon effort={option} />
            <span>
              <strong>{reasoningEffortLabel(t, option)}</strong>
            </span>
            {selected && <Check className="menu-check" size={14} />}
          </Button>
        );
      })}
    </div>
  );
}

function ReasoningEffortIcon({ effort }: { effort: ReasoningEffort }) {
  return (
    <span className="reasoning-effort-icon" data-effort={effort}>
      <Brain size={15} />
      <span className="reasoning-effort-bars" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

function reasoningEffortLabel(t: Messages, effort: ReasoningEffort) {
  if (effort === REASONING_EFFORT.low) return t.sidepanel.reasoningEffortLow;
  if (effort === REASONING_EFFORT.medium)
    return t.sidepanel.reasoningEffortMedium;
  if (effort === REASONING_EFFORT.high) return t.sidepanel.reasoningEffortHigh;
  return t.sidepanel.reasoningEffortDefault;
}
