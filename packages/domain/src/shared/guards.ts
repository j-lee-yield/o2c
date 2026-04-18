import { TransitionError } from "./state-machine.js";

export function requireMetadataFlag(
  metadataKey: string,
  message: string
): (metadata?: Record<string, unknown>) => void {
  return (metadata) => {
    if (metadata?.[metadataKey] !== true) {
      throw new TransitionError(message);
    }
  };
}

export function requireNonEmptyString(value: string | undefined, message: string): void {
  if (!value || value.trim().length === 0) {
    throw new TransitionError(message);
  }
}
