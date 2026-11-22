import { HttpException, HttpStatus } from "@nestjs/common";

/** Every API error body is `{ error, message }`: a stable machine code and a human sentence. */
export class ApiError extends HttpException {
  constructor(status: HttpStatus, code: string, message: string) {
    super({ error: code, message }, status);
  }
}

export const unauthenticated = () =>
  new ApiError(HttpStatus.UNAUTHORIZED, "unauthenticated", "Sign in to continue.");
export const forbidden = (message = "You do not have permission to do that.") =>
  new ApiError(HttpStatus.FORBIDDEN, "forbidden", message);
export const notFound = (message = "Not found.") =>
  new ApiError(HttpStatus.NOT_FOUND, "not_found", message);
export const conflict = (code: string, message: string) =>
  new ApiError(HttpStatus.CONFLICT, code, message);
export const badRequest = (code: string, message: string) =>
  new ApiError(HttpStatus.BAD_REQUEST, code, message);
export const authNotConfigured = () =>
  new ApiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    "auth_not_configured",
    "Accounts are unavailable: the API has no database configured (DATABASE_URL).",
  );
