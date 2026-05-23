import { isSyncBackendEnabled } from "./sync-backends";
import { STORAGE_AREAS, type AreaName } from "./storage-area-constants";

export { STORAGE_AREAS, type AreaName };

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
