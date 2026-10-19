import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isSecretField,
  type FieldSignals,
} from "../src/shared/teach/secret-fields";

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
  ];
  for (const signals of secret)
    assert.equal(isSecretField(input(signals)), true, JSON.stringify(signals));
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
