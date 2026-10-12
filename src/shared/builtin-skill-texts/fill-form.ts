// Design sources: docs/credits.md.
export const fillForm = {
  name: "fill-form",
  description:
    "Fill in or complete any web form: sign-ups, applications, bookings, checkouts, profiles, from details the user gives or a file. Checks every field; submits only when told to.",
  body: `# Fill a form

## 1. Data

- Gather the values from the user's message, attachments (\`read\` "attachment:ID") or files they point to. Never invent personal data.
- Respect what the user rules out ("no newsletter", "don't save my card").

## 2. The form

- \`snapshot\` the form; scroll or use \`find\` so you see every field, section and step. Note required fields, formats (dates, phone numbers) and the options of each select.
- Map each field to a value. If a required value is missing or a choice is ambiguous, ask once with \`ask\`, all questions together. Leave optional fields empty unless the user gave a value.
- Leave consent, marketing and newsletter boxes unticked unless the user asked for them; tick required terms only when the user asked you to submit.

## 3. Fill

- Fill everything in one \`act\` call with several steps. Pick select options by their visible text. Date inputs take YYYY-MM-DD.
- Autocomplete fields: type, wait for the suggestion list, then pick the matching suggestion.

## 4. Check

- \`snapshot\` again and compare every field with the intended value; fix mismatches and validation errors. Multi-step forms: check each step before "Next".

## 5. Submit or stop

- Submit only if the user clearly asked to submit, send, apply, book or order. Filling is not permission to submit.
- If not asked: stop and tell the user the form is filled and waiting for their review. List the values you entered and anything left blank.
- Before submitting something irreversible (payment, order, application), check it meets every constraint the user gave. After submitting, report the confirmation (number or message).
- Keep the form's tab open.
`,
};
