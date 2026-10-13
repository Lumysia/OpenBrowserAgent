import type { DictionaryEntry } from "../../shared/smart-bar-dictionary";
import type { SmartBarMessages } from "../../shared/smart-bar-protocol";
import { Badge } from "../../ui/components";

// A dictionary entry for a short selection, then its translation. The
// headword and examples are in the selection's language (`sourceLanguage`).
export function SmartBarDictionaryCard({
  entry,
  labels,
  sourceLanguage,
}: {
  entry: DictionaryEntry;
  labels: SmartBarMessages["dictionary"];
  sourceLanguage?: string;
}) {
  const senses = [
    ...(entry.contextMeaning
      ? [{ text: entry.contextMeaning, inContext: true }]
      : []),
    ...entry.otherMeanings.map((text) => ({ text, inContext: false })),
  ];
  const related = [
    { label: labels.synonyms, items: entry.synonyms },
    { label: labels.collocations, items: entry.collocations },
  ].filter(({ items }) => items.length);
  return (
    <div
      className="smart-bar-dictionary"
      role="group"
      aria-label={labels.entry}
    >
      <div className="smart-bar-dictionary-head">
        <span className="smart-bar-dictionary-headword" lang={sourceLanguage}>
          {entry.headword}
        </span>
        {entry.pronunciation && (
          <span className="smart-bar-dictionary-pronunciation">
            <span className="visually-hidden">{labels.pronunciation}: </span>
            {entry.pronunciation}
          </span>
        )}
        {entry.partOfSpeech && (
          <Badge className="smart-bar-dictionary-tag">
            {entry.partOfSpeech}
          </Badge>
        )}
      </div>
      {!!senses.length && (
        <ol className="smart-bar-dictionary-senses">
          {senses.map((sense, index) => (
            <li key={index} data-in-context={sense.inContext || undefined}>
              {sense.inContext && (
                <span className="smart-bar-dictionary-context">
                  {labels.inContext}
                </span>
              )}
              {sense.text}
            </li>
          ))}
        </ol>
      )}
      {!!entry.examples.length && (
        <div className="smart-bar-dictionary-section">
          <span className="smart-bar-dictionary-label">{labels.examples}</span>
          <ul className="smart-bar-dictionary-examples">
            {entry.examples.map((example, index) => (
              <li key={index}>
                <span
                  className="smart-bar-dictionary-example"
                  lang={sourceLanguage}
                >
                  {example.text}
                </span>
                {example.translation && (
                  <span className="smart-bar-dictionary-muted">
                    {example.translation}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {related.map(({ label, items }) => (
        <p key={label} className="smart-bar-dictionary-related">
          <span className="smart-bar-dictionary-label">{label}</span>
          <span lang={sourceLanguage}>{items.join(" · ")}</span>
        </p>
      ))}
      {entry.translation && (
        <p className="smart-bar-dictionary-translation">
          <span className="visually-hidden">{labels.translation}: </span>
          {entry.translation}
        </p>
      )}
    </div>
  );
}
