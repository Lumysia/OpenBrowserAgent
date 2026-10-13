import { useId, type ReactNode } from "react";
import { Card, CardContent, CardDescription, CardTitle } from "./card";
import { Switch } from "./switch";

type Props = {
  icon?: ReactNode;
  title: string;
  description?: string;
  // Shown after the title, e.g. an InfoTip with when to use the setting.
  info?: ReactNode;
  // "field": a row among form fields, titled like their labels.
  variant?: "card" | "field";
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SettingSwitch({
  icon,
  title,
  description,
  info,
  variant = "card",
  checked,
  onChange,
}: Props) {
  const id = useId();
  const heading = (
    <>
      {icon}
      <label htmlFor={id}>{title}</label>
      {info}
    </>
  );
  return (
    <div className="setting-switch-row">
      <div>
        {variant === "field" ? (
          <div className="settings-section-title settings-field-heading">
            {heading}
          </div>
        ) : (
          <CardTitle className="settings-section-title">{heading}</CardTitle>
        )}
        {description && (
          <CardDescription id={`${id}-description`}>
            {description}
          </CardDescription>
        )}
      </div>
      <Switch
        id={id}
        aria-describedby={description ? `${id}-description` : undefined}
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
