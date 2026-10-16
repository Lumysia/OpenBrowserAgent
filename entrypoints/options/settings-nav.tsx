import { CircleHelp } from "lucide-react";
import { REPO_URL } from "../../src/shared/config";
import { openOrFocusUrl } from "../../src/shared/tab-navigation";
import { useMessages } from "../../src/ui/messages";
import { cn } from "../../src/ui/utils";
import { hasSubPages, OPTIONS_PAGES, optionsPlaceFor } from "./pages";

// The sidebar: every page, with a group's sub-pages listed under it. A
// group's own link opens its first sub-page.
export function SettingsNav({ route }: { route: string }) {
  const t = useMessages();
  const current = optionsPlaceFor(route);
  return (
    <nav aria-label={t.common.settings}>
      <ul className="settings-nav">
        {OPTIONS_PAGES.filter(({ standalone }) => !standalone).map((page) => {
          const { id, icon: Icon, title, subPages } = page;
          const grouped = hasSubPages(page);
          const here = id === current.page.id;
          return (
            <li key={id}>
              <a
                className={cn(
                  "nav-link",
                  here && (grouped ? "contains-active" : "active"),
                )}
                href={`#${subPages[0].route}`}
                aria-current={here && !grouped ? "page" : undefined}
              >
                <Icon size={16} aria-hidden />
                {title(t)}
              </a>
              {grouped && (
                <ul className="settings-nav settings-nav-sub">
                  {subPages.map((subPage) => {
                    const active = subPage === current.subPage;
                    return (
                      <li key={subPage.route}>
                        <a
                          className={cn("nav-link", active && "active")}
                          href={`#${subPage.route}`}
                          aria-current={active ? "page" : undefined}
                        >
                          {subPage.title(t)}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
        <li>
          <a
            className="nav-link"
            href={REPO_URL}
            onClick={(event) => {
              event.preventDefault();
              openOrFocusUrl(REPO_URL).catch(console.warn);
            }}
          >
            <CircleHelp size={16} aria-hidden />
            {t.common.help}
          </a>
        </li>
      </ul>
    </nav>
  );
}
