import { useEffect, useState } from "react";
import { OPTIONS_ROUTE } from "../../src/shared/config";

export function useHashRoute() {
  const [route, setRoute] = useState(
    () => location.hash.replace(/^#/, "") || OPTIONS_ROUTE.general,
  );

  useEffect(() => {
    const onHashChange = () =>
      setRoute(location.hash.replace(/^#/, "") || OPTIONS_ROUTE.general);
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}
