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
