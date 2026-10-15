import type { WebDavSyncBackendConfig } from "../shared/types";
import { CommitInput, Input, Label } from "./components";
import { useMessages } from "./messages";

type Field = "url" | "username" | "password";

const WEBDAV_URL_EXAMPLE = "https://example.com/dav/";

// The WebDAV server address and sign-in, in Settings and in first-run setup.
// Settings saves a field when editing ends; setup (`live`) takes every
// change at once, so its Connect button follows what is typed.
export function WebDavConnectionFields({
  backend,
  disabled,
  live,
  onChange,
}: {
  backend: WebDavSyncBackendConfig;
  disabled?: boolean;
  live?: boolean;
  onChange: (patch: Partial<Pick<WebDavSyncBackendConfig, Field>>) => void;
}) {
  const t = useMessages();
  const field = (
    name: Field,
    label: string,
    { type, placeholder }: { type?: string; placeholder?: string } = {},
  ) => {
    const value = backend[name] || "";
    const set = (next: string) => onChange({ [name]: next });
    return (
      <Label>
        {label}
        {live ? (
          <Input
            type={type}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onChange={(event) => set(event.target.value)}
          />
        ) : (
          <CommitInput
            type={type}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onCommit={set}
          />
        )}
      </Label>
    );
  };
  return (
    <>
      {field("url", t.options.syncBackendWebDavUrl, {
        placeholder: WEBDAV_URL_EXAMPLE,
      })}
      {field("username", t.options.syncBackendUsername)}
      {field("password", t.options.syncBackendPassword, { type: "password" })}
    </>
  );
}
