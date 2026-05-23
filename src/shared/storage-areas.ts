import { isSyncBackendEnabled } from "./sync-backends";

export const STORAGE_AREAS = {
  local: "local",
  sync: "sync",
} as const;

export type AreaName = (typeof STORAGE_AREAS)[keyof typeof STORAGE_AREAS];

export function areaForSyncEnabled(enabled: boolean): AreaName {
  return enabled ? STORAGE_AREAS.sync : STORAGE_AREAS.local;
}

export function otherStorageArea(area: AreaName): AreaName {
  return area === STORAGE_AREAS.sync ? STORAGE_AREAS.local : STORAGE_AREAS.sync;
}

export async function effectiveArea(area: AreaName) {
  return area === STORAGE_AREAS.sync && !(await isSyncBackendEnabled())
    ? STORAGE_AREAS.local
    : area;
}
