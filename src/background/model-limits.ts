import {
  learnedRefusals,
  withRefusal,
  type ModelRef,
  type ModelRefusal,
} from "../shared/model-limits";
import { storage } from "../shared/storage";

// What the configured model `ref` refused in earlier runs. A model that is
// not configured (no ref) starts with nothing, and so does one whose
// learned limits can't be read: its request then fails and learns again.
export async function knownRefusals(
  ref: ModelRef | undefined,
): Promise<Set<ModelRefusal>> {
  if (!ref) return new Set();
  try {
    return new Set(
      learnedRefusals(await storage.learnedModelLimits.get(), ref),
    );
  } catch {
    return new Set();
  }
}

// Keeps a refusal for the next runs, until the model is edited. One that
// can't be stored still holds for the run that met it.
export async function rememberRefusal(
  ref: ModelRef | undefined,
  refusal: ModelRefusal,
) {
  if (!ref) return;
  await storage.learnedModelLimits
    .update((learned) => withRefusal(learned, ref, refusal))
    .catch((error) =>
      console.warn("Remembering a model's refusal failed", error),
    );
}
