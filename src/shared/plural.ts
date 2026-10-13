// Messages with a count. Each locale gives the CLDR plural categories its
// language uses (`other` always); formatCount in i18n.ts picks the form.
export type Plural = { other: string } & Partial<
  Record<Intl.LDMLPluralRule, string>
>;

export function plural(forms: Plural): Plural {
  return forms;
}
