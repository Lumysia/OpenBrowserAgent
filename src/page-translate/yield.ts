// Lets the page handle input and paint between slices of work.
type Scheduler = { yield?: () => Promise<void> };

export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: Scheduler }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}
