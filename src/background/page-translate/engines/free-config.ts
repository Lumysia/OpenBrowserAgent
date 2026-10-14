// Endpoints of the free translation engines, in one place: when a service
// changes, the fix is here.
//
// These are the endpoints the services' own web widgets and browsers use,
// not documented APIs. They can rate-limit or stop at any time; the engines
// detect that and say so.

// Google's web translation endpoint. It takes HTML (inline markers survive)
// and many paragraphs per request.
export const GOOGLE_TRANSLATE_HTML_URL =
  "https://translate-pa.googleapis.com/v1/translateHtml";

// The public browser key of Google's website translation widget, as its
// script sends it. The widget was retired on 2026-10-01; if Google revokes
// the key, the engine falls back to GOOGLE_TRANSLATE_FALLBACK_URL.
export const GOOGLE_TRANSLATE_WIDGET_KEY =
  "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520";

// The client name the widget sends with translateHtml.
export const GOOGLE_TRANSLATE_HTML_CLIENT = "te_lib";

// Google's older endpoint: no key, HTML, several paragraphs per request.
export const GOOGLE_TRANSLATE_FALLBACK_URL =
  "https://translate.googleapis.com/translate_a/t";

// Microsoft Edge's translation endpoint: no key, plain text only (it
// mangles HTML attributes; attribute-free markers survive).
export const MICROSOFT_TRANSLATE_URL =
  "https://edge.microsoft.com/translate/translatetext";

// After the key-based endpoint fails, use the fallback this long before
// trying it again.
export const GOOGLE_KEY_RETRY_MS = 60 * 60 * 1000;
