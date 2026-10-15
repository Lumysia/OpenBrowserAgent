// Permission to send the user's content to a provider's endpoint: the
// provider form, the prompt before the first request, and the error a
// request without it stops with.
export const providerConsentEnUS = {
  agreement:
    "I agree that content I share in chats (messages, page text, screenshots and files) is sent to {host}.",
  promptTitle: "Allow sending your content?",
  allow: "Agree",
  decline: "Not now",
  allowed: "Allowed to receive your content",
  withdraw: "Withdraw permission",
  needsPermission: "Needs permission",
  localEndpoint: "Local endpoint ({host}) — no permission needed.",
  requiredToSave: "Tick the box above to save the API key.",
  required:
    "{host} isn’t allowed to receive your content yet. Agree when you send a message in the side panel, or in Settings → AI providers.",
};

export type ProviderConsentLocaleMessages = typeof providerConsentEnUS;
