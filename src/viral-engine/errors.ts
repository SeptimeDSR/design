export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "ambiguous_ref"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "confirmation_required";

export const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  ambiguous_ref: 409,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  confirmation_required: 428,
};

// Erreur métier commune à toutes les portes : l'API la traduit en statut HTTP, le MCP en isError.
export class FactoryError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}
