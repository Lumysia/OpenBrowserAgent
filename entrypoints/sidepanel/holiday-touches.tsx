import {
  Cake,
  Earth,
  Flower2,
  Ghost,
  Heart,
  Laugh,
  PartyPopper,
  TreePine,
} from "lucide-react";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  burstHoliday,
  holidayOn,
  localDayKey,
  type HolidayBadge as Badge,
} from "../../src/shared/holidays";
import { useMessages } from "../../src/ui/messages";
import { storage } from "../../src/shared/storage";
import { THEMES } from "../../src/shared/theme/themes";
import type { Preferences } from "../../src/shared/types";
import { useStoredState } from "../../src/ui/useStoredState";

const BADGE_ICONS = {
  party: PartyPopper,
  heart: Heart,
  flower: Flower2,
  laugh: Laugh,
  earth: Earth,
  ghost: Ghost,
  tree: TreePine,
  cake: Cake,
} as const;

// Today's holiday while the touches are on; follows the date past midnight.
export function useHoliday() {
  const [preferences] = useStoredState(storage.preferences);
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const midnight = new Date(today);
    midnight.setHours(24, 0, 0, 0);
    const timer = setTimeout(
      () => setToday(new Date()),
      midnight.getTime() - Date.now() + 1000,
    );
    return () => clearTimeout(timer);
  }, [today]);
  if (!preferences) return undefined;
  return holidayOn(today, preferences.holidayTouches !== false);
}

// A small badge with the day's name, above the empty chat's greeting.
export function HolidayBadge() {
  const t = useMessages();
  const holiday = useHoliday();
  if (!holiday) return null;
  return (
    <span
      className="holiday-badge"
      style={{ "--holiday": holiday.colors[0] } as CSSProperties}
    >
      <BadgeMark badge={holiday.badge} />
      {t.themes.holidays[holiday.id].name}
    </span>
  );
}

function BadgeMark({ badge }: { badge: Badge }) {
  if ("flag" in badge) {
    const stripes = THEMES[badge.flag].flag ?? [];
    const step = 100 / stripes.length;
    const fill = `linear-gradient(180deg, ${stripes
      .map((color, index) => `${color} ${index * step}% ${(index + 1) * step}%`)
      .join(", ")})`;
    return (
      <span className="holiday-badge-mark" aria-hidden="true">
        <span
          className="holiday-badge-flag"
          style={{ "--flag": fill } as CSSProperties}
        />
      </span>
    );
  }
  const Icon = BADGE_ICONS[badge.icon];
  return (
    <span className="holiday-badge-mark" aria-hidden="true">
      <Icon size={13} />
    </span>
  );
}

// The burst on the first message sent on a holiday: send() reports the
// send, the composer shows the particles.
type Burst = { id: number; colors: string[] };
let currentBurst: Burst | undefined;
const burstListeners = new Set<() => void>();

export async function celebrateSend(preferences: Preferences | undefined) {
  const now = new Date();
  const holiday = burstHoliday(
    await storage.holidayBurstDay.get(),
    now,
    preferences?.holidayTouches !== false,
  );
  if (!holiday) return;
  await storage.holidayBurstDay.set(localDayKey(now));
  currentBurst = { id: (currentBurst?.id ?? 0) + 1, colors: holiday.colors };
  burstListeners.forEach((listener) => listener());
}

const PARTICLES = 18;
const BURST_MS = 1600;

export function HolidayBurst() {
  const burst = useSyncExternalStore(
    (listener) => {
      burstListeners.add(listener);
      return () => burstListeners.delete(listener);
    },
    () => currentBurst,
  );
  const [shownId, setShownId] = useState<number>();
  useEffect(() => {
    if (!burst) return undefined;
    setShownId(burst.id);
    const timer = setTimeout(() => setShownId(undefined), BURST_MS);
    return () => clearTimeout(timer);
  }, [burst]);
  if (!burst || shownId !== burst.id) return null;
  return (
    <span key={burst.id} className="holiday-burst" aria-hidden="true">
      {Array.from({ length: PARTICLES }, (_, index) => (
        <span key={index} style={particleStyle(index, burst.colors)} />
      ))}
    </span>
  );
}

// Fans out upwards from the send button, with a little spread in reach,
// spin and timing so it doesn't look mechanical.
function particleStyle(index: number, colors: string[]): CSSProperties {
  const angle = (-160 + (140 * index) / (PARTICLES - 1)) * (Math.PI / 180);
  const reach = 70 + ((index * 37) % 50);
  return {
    "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
    "--dy": `${Math.round(Math.sin(angle) * reach)}px`,
    "--spin": `${((index * 73) % 360) - 180}deg`,
    "--delay": `${(index % 4) * 30}ms`,
    "--color": colors[index % colors.length],
  } as CSSProperties;
}
