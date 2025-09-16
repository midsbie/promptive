const UNKNOWN_ERROR = "Unknown error";

export function resolveErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error == null) return UNKNOWN_ERROR;

  try {
    return JSON.stringify(error) || UNKNOWN_ERROR;
  } catch {
    return String(error);
  }
}
