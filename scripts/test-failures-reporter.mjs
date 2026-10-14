// A node:test reporter that writes one JSON line per failed test (suites
// excluded), so scripts can read results without parsing display text.
//
//   node --test --test-reporter=./scripts/test-failures-reporter.mjs ...
export default async function* failuresReporter(source) {
  for await (const event of source) {
    if (event.type !== "test:fail") continue;
    if (event.data.details?.type === "suite") continue;
    yield `${JSON.stringify({ name: event.data.name, file: event.data.file })}\n`;
  }
}
