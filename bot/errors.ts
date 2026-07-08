/**
 * Shared error-message normalization helper. Was previously duplicated
 * identically in dispatcher.ts and heartbeat.ts — consolidated here per
 * final review (DRY).
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
