import { useId, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardTitle } from "./card";
import { Switch } from "./switch";

type Props = {
  icon?: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SettingSwitch({
  icon,
  title,
  description,
  checked,
  onChange,
}: Props) {
  const id = useId();
  return (
    <div className="setting-switch-row">
      <div>
        <CardTitle className="settings-section-title">
          {icon}
          <label htmlFor={id}>{title}</label>
        </CardTitle>
        <CardDescription id={`${id}-description`}>
          {description}
        </CardDescription>
      </div>
      <Switch
        id={id}
        aria-describedby={`${id}-description`}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function SettingSwitchCard(props: Props) {
  return (
    <Card>
      <CardContent>
        <SettingSwitch {...props} />
      </CardContent>
    </Card>
  );
}

// A switch row inside a settings card's list (`settings-toggle-list`).
export function SettingToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  value: boolean;
  onChange?: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="settings-toggle-row">
      <div>
        <CardTitle className="settings-section-title">
          {icon} {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </div>
      <Switch
        checked={value}
        disabled={disabled}
        aria-label={title}
        onCheckedChange={onChange}
      />
    </div>
  );
}
