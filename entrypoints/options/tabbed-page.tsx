import type { ComponentType } from "react";
import type { Messages } from "../../src/shared/i18n";
import { Tabs, TabsList, TabsTrigger } from "../../src/ui/components";
import { useMessages } from "../../src/ui/messages";

export type OptionsTab = {
  route: string;
  title: (t: Messages) => string;
  Page: ComponentType;
};

// A settings page made of tabs, one route each; the first tab is the page's
// own route. Each tab brings its own header.
export function tabbedPage(tabs: OptionsTab[]) {
  return function TabbedPage({ route }: { route: string }) {
    const t = useMessages();
    const active = tabs.find((tab) => tab.route === route) ?? tabs[0];
    return (
      <div className="stack">
        <Tabs
          value={active.route}
          onValueChange={(next) => {
            location.hash = next;
          }}
        >
          <TabsList>
            {tabs.map((tab) => (
              <TabsTrigger key={tab.route} value={tab.route}>
                {tab.title(t)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <active.Page />
      </div>
    );
  };
}
