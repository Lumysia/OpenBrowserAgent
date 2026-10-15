// Site lists ("Hide on this site", blocked and allowed sites) and the match
// patterns page scripts are registered with. Dependency-free: page scripts
// import it through their settings modules.

// Every web page; extension pages, browser pages and the stores can't be
// scripted.
const WEB_PAGE_MATCHES = ["http://*/*", "https://*/*"];

// Where a page script is registered.
export type SiteMatchPatterns = {
  matches: string[];
  excludeMatches: string[];
};

// A host as typed or pasted ("https://www.example.com/path", "Example.com")
// to "www.example.com"; undefined when it is not a host name.
export function normalizeHost(value: string) {
  const text = value.trim().toLowerCase();
  if (!text) return undefined;
  let host = text;
  try {
    host = new URL(text.includes("://") ? text : `http://${text}`).hostname;
  } catch {
    return undefined;
  }
  host = host.replace(/^\*\./, "").replace(/\.$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host) ? host : undefined;
}

// A stored list of hosts, cleaned: valid hosts, each once.
export function normalizeHostList(list: unknown) {
  if (!Array.isArray(list)) return [];
  const hosts = list.map((item) => normalizeHost(String(item)));
  return [...new Set(hosts.filter((host): host is string => !!host))];
}

// A listed host covers its subdomains.
export function hostMatches(host: string, listed: string) {
  return host === listed || host.endsWith(`.${listed}`);
}

export function hostListed(hosts: string[], host: string) {
  return hosts.some((entry) => hostMatches(host, entry));
}

// The host of a web page; undefined for other pages (extension pages,
// browser pages, the PDF viewer, files).
export function pageHost(url: string | undefined) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol)
      ? parsed.hostname
      : undefined;
  } catch {
    return undefined;
  }
}

// A listed host and its subdomains, as a match pattern.
export function hostMatchPattern(host: string) {
  return `*://*.${host}/*`;
}

// Every web page except the listed hosts.
export function webPagesExcept(hosts: string[]): SiteMatchPatterns {
  return {
    matches: WEB_PAGE_MATCHES,
    excludeMatches: hosts.map(hostMatchPattern),
  };
}

// Whether patterns built here cover a host.
export function patternsCover(
  patterns: Partial<SiteMatchPatterns>,
  host: string,
) {
  const covers = (list: string[] = []) =>
    list.some((pattern) => {
      if (WEB_PAGE_MATCHES.includes(pattern)) return true;
      const listed = pattern.match(/^\*:\/\/\*\.(.+)\/\*$/)?.[1];
      return !!listed && hostMatches(host, listed);
    });
  return covers(patterns.matches) && !covers(patterns.excludeMatches);
}
