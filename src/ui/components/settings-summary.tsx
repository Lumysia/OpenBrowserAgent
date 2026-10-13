import type { ReactNode } from "react";

// Summary line of a settings accordion: icon, name, badges and a description.
// The name truncates to one line and the description to two; both keep their
// full text as a tooltip.
export function SettingsSummary({
  icon,
  title,
  badges,
  description,
}: {
  icon?: ReactNode;
  title: string;
  badges?: ReactNode;
  description?: string;
}) {
  return (
    <span className="settings-summary">
      <span className="settings-summary-title">
        {icon}
        <span className="settings-summary-name" title={title}>
          {title}
        </span>
        {badges}
      </span>
      {description ? <small title={description}>{description}</small> : null}
    </span>
  );
}
