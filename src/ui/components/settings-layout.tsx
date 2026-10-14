import type { ReactNode } from "react";
import { cn } from "../utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";

// The title block every settings page starts with. Icons are sized by CSS.
export function SettingsPageHeader({
  icon,
  title,
  description,
  actions,
}: {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="settings-page-header">
      <div>
        <h1 className="settings-page-title">
          {icon} {title}
        </h1>
        <p className="muted">{description}</p>
      </div>
      {actions && <div className="settings-page-actions">{actions}</div>}
    </div>
  );
}

// A titled card of settings. Without children it is only a header.
export function SettingsSection({
  icon,
  title,
  description,
  danger,
  className,
  contentClassName,
  children,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  // A section whose actions delete data.
  danger?: boolean;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle
          className={cn("settings-section-title", danger && "danger-title")}
        >
          {icon} {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      {children && (
        <CardContent className={contentClassName}>{children}</CardContent>
      )}
    </Card>
  );
}
