import { useEffect, useState } from "react";
import { resolveOptionsRoute } from "../../src/shared/config";

// The settings route in the location hash. An older page's hash is replaced
// with where that page is now, so the address shows the current place.
export function useHashRoute() {
  const [route, setRoute] = useState(() => currentRoute());

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);

  return route;
}

function currentRoute() {
  const route = resolveOptionsRoute(location.hash);
  if (location.hash && location.hash !== `#${route}`)
    history.replaceState(null, "", `#${route}`);
  return route;
}
