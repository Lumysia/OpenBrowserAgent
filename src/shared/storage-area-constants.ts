export const STORAGE_AREAS = {
  local: "local",
  sync: "sync",
} as const;

export type AreaName = (typeof STORAGE_AREAS)[keyof typeof STORAGE_AREAS];
