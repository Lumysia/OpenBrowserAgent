import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSecretField,
  isSecretStep,
  type FieldSignals,
} from "../src/shared/teach/secret-fields";
import { demonstrationJson } from "../src/shared/teach/skill-files";
import { buildTranscript } from "../src/shared/teach/transcript";
import type { TeachStep } from "../src/shared/teach/types";

const input = (signals: Partial<FieldSignals>): FieldSignals => ({
  tag: "input",
  type: "text",
  ...signals,
});

test("password fields are secret, also after a show-password toggle", () => {
  assert.equal(isSecretField(input({ type: "password" })), true);
  assert.equal(isSecretField(input({ type: "PASSWORD" })), true);
  assert.equal(
    isSecretField(input({ type: "text", wasPassword: true, label: "Show" })),
    true,
  );
});

test("secret autocomplete tokens make a field secret", () => {
  for (const autocomplete of [
    "current-password",
    "new-password",
    "one-time-code",
    "cc-number",
    "cc-csc",
    "cc-exp-month",
    "section-payment billing cc-name",
    "username current-password",
  ])
    assert.equal(
      isSecretField(input({ autocomplete })),
      true,
      `autocomplete ${autocomplete}`,
    );
  for (const autocomplete of ["email", "username", "given-name", "off", "tel"])
    assert.equal(
      isSecretField(input({ autocomplete })),
      false,
      `autocomplete ${autocomplete}`,
    );
});

test("disguised secret fields are found by id, name, label or placeholder", () => {
  const secret: Partial<FieldSignals>[] = [
    { id: "userPassword" },
    { name: "user_pwd" },
    { name: "passcode" },
    { label: "PIN" },
    { label: "Enter your 4-digit PIN" },
    { id: "otp-input" },
    { name: "totpCode" },
    { label: "2FA code" },
    { label: "Verification code" },
    { label: "Security code" },
    { placeholder: "Card number" },
    { name: "creditCardNumber" },
    { label: "CVV" },
    { name: "cvv2" },
    { label: "SSN" },
    { label: "Social security number" },
    { label: "API key" },
    { name: "apiKey" },
    { name: "access_token" },
    { label: "Client secret" },
    { label: "Passwort" },
    { label: "Mot de passe" },
    { label: "密码" },
    { label: "密碼" },
    { label: "パスワード" },
    { label: "비밀번호" },
    { label: "Contraseña" },
    // The languages the UI ships in, and compound words.
    { label: "Kennwort" },
    { label: "Neues Kennwort wiederholen" },
    { label: "Sicherheitscode" },
    { label: "Kartennummer" },
    { label: "Kreditkartennummer" },
    { label: "Clave" },
    { label: "Número de tarjeta" },
    { label: "Código de seguridad" },
    { label: "Código de segurança" },
    { label: "Número do cartão" },
    { label: "Numéro de carte" },
    { label: "Code de vérification" },
    { label: "Пароль" },
    { label: "Введите пароля" },
    { label: "セキュリティコード" },
    { label: "카드번호" },
  ];
  for (const signals of secret)
    assert.equal(isSecretField(input(signals)), true, JSON.stringify(signals));
});

test("a field the page masks with CSS is secret", () => {
  assert.equal(isSecretField(input({ label: "Code", masked: true })), true);
  assert.equal(isSecretField(input({ label: "Code", masked: false })), false);
});

test("a recorded step is judged again from what was kept of it", () => {
  const page = { title: "Sign in", url: "https://app.test/in" };
  const kennwort: TeachStep = {
    id: "1",
    kind: "field",
    at: 1,
    page,
    target: { role: "textbox", name: "Kennwort", tag: "input" },
    field: { inputType: "text", length: 8, secret: false, example: "Geheim-1" },
  };
  const nickname: TeachStep = {
    ...kennwort,
    id: "2",
    target: { role: "textbox", name: "Nickname", tag: "input" },
    field: { inputType: "text", length: 4, secret: false, example: "Kurt" },
  };
  assert.equal(isSecretStep(kennwort), true);
  assert.equal(isSecretStep(nickname), false);
  assert.equal(
    isSecretStep({ ...nickname, field: { ...nickname.field!, secret: true } }),
    true,
  );
  const session = {
    steps: [kennwort, nickname],
    startUrl: page.url,
    startedAt: 1,
    purpose: "",
    varies: "",
    dropped: 0,
  };
  for (const text of [demonstrationJson(session), buildTranscript(session)]) {
    assert.ok(!text.includes("Geheim-1"), text);
    assert.ok(text.includes("Kurt"), text);
  }
});

test("ordinary fields are not secret", () => {
  const ordinary: Partial<FieldSignals>[] = [
    { label: "Email", type: "email", autocomplete: "email" },
    { label: "Full name", name: "fullName" },
    { label: "Shipping address", id: "shipping" },
    { label: "Spinner speed", name: "spinner" },
    { label: "Opinion", name: "opinion" },
    { label: "Hours worked", type: "number" },
    { label: "Search", type: "search", name: "q" },
    { label: "Project", placeholder: "Pick a project" },
    { label: "Comment", name: "comment" },
    { tag: "select", label: "Country" },
  ];
  for (const signals of ordinary)
    assert.equal(isSecretField(input(signals)), false, JSON.stringify(signals));
});
