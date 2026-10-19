// Whether a form field is secret: its value is never kept, not even as an
// example the user ticks, and the skill asks for it at run time or leaves
// it to the browser's autofill. Decided from the field's own structure
// (type, autocomplete tokens, id, name, label, placeholder), never from the
// site. Errs on the side of secret.

export type FieldSignals = {
  tag: string;
  type?: string;
  autocomplete?: string;
  id?: string;
  name?: string;
  label?: string;
  placeholder?: string;
  // The field was a password field at some point (a show-password toggle
  // turns it into a text field).
  wasPassword?: boolean;
};

const SECRET_AUTOCOMPLETE = new Set([
  "current-password",
  "new-password",
  "one-time-code",
]);

// Whole words (after splitting camelCase, snake_case and kebab-case).
const SECRET_WORDS = new Set([
  "password",
  "passwd",
  "pwd",
  "pass",
  "passcode",
  "passphrase",
  "pin",
  "otp",
  "totp",
  "2fa",
  "mfa",
  "cvv",
  "cvc",
  "csc",
  "cvv2",
  "ssn",
  "token",
  "secret",
  "apikey",
  "passwort",
  "contraseña",
  "contrasena",
  "senha",
  "mdp",
]);

// Word sequences.
const SECRET_PHRASES = [
  "one time code",
  "one time password",
  "verification code",
  "security code",
  "auth code",
  "authentication code",
  "card number",
  "credit card",
  "cc number",
  "card no",
  "social security",
  "api key",
  "access key",
  "private key",
  "secret key",
  "mot de passe",
  "code de sécurité",
];

// Scripts without spaces between words: a substring is enough.
const SECRET_SUBSTRINGS = [
  "密码",
  "密碼",
  "口令",
  "验证码",
  "驗證碼",
  "安全码",
  "安全碼",
  "卡号",
  "卡號",
  "パスワード",
  "暗証番号",
  "認証コード",
  "セキュリティコード",
  "カード番号",
  "비밀번호",
  "인증번호",
  "카드번호",
];

// "newPassword_2" → "new password 2".
export function fieldWords(value: string | undefined) {
  return (value || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function textIsSecret(value: string | undefined) {
  if (!value) return false;
  if (SECRET_SUBSTRINGS.some((part) => value.includes(part))) return true;
  const words = fieldWords(value);
  if (!words) return false;
  // "2fa", "cvv2" stay whole once digits are split off.
  const joined = ` ${words} `;
  const compactWords = ` ${words.replace(/(\D) (\d)/g, "$1$2")} `;
  return (
    words.split(" ").some((word) => SECRET_WORDS.has(word)) ||
    compactWords
      .trim()
      .split(" ")
      .some((word) => SECRET_WORDS.has(word)) ||
    SECRET_PHRASES.some((phrase) => joined.includes(` ${phrase} `))
  );
}

function autocompleteIsSecret(value: string | undefined) {
  return (value || "")
    .toLowerCase()
    .split(/\s+/)
    .some((token) => SECRET_AUTOCOMPLETE.has(token) || token.startsWith("cc-"));
}

export function isSecretField(field: FieldSignals) {
  if (field.wasPassword || field.type?.toLowerCase() === "password")
    return true;
  if (autocompleteIsSecret(field.autocomplete)) return true;
  return [field.id, field.name, field.label, field.placeholder].some(
    textIsSecret,
  );
}
