type GoogleError = {
  error?: { status?: unknown; message?: unknown; details?: unknown };
};

const reasonCodes: Record<string, string> = {
  SERVICE_DISABLED: "CAPTCHA_API_DISABLED",
  API_KEY_INVALID: "CAPTCHA_API_KEY_INVALID",
  API_KEY_SERVICE_BLOCKED: "CAPTCHA_API_KEY_RESTRICTED",
  API_KEY_HTTP_REFERRER_BLOCKED: "CAPTCHA_API_KEY_RESTRICTED",
  API_KEY_IP_ADDRESS_BLOCKED: "CAPTCHA_API_KEY_RESTRICTED",
  CONSUMER_INVALID: "CAPTCHA_PROJECT_INVALID",
  PROJECT_INVALID: "CAPTCHA_PROJECT_INVALID",
  PROJECT_DELETED: "CAPTCHA_PROJECT_INVALID",
  BILLING_DISABLED: "CAPTCHA_BILLING_REQUIRED",
  BILLING_NOT_ACTIVE: "CAPTCHA_BILLING_REQUIRED",
  RATE_LIMIT_EXCEEDED: "CAPTCHA_SERVICE_LIMIT",
};

export function captchaApiErrorCode(status: number, body: unknown): string {
  const error = (body as GoogleError | null)?.error;
  if (Array.isArray(error?.details)) {
    for (const detail of error.details) {
      if (detail && typeof detail === "object" && "reason" in detail
        && typeof detail.reason === "string" && Object.hasOwn(reasonCodes, detail.reason)) return reasonCodes[detail.reason];
    }
  }
  // Google can report an invalid API key without an ErrorInfo detail object.
  if (typeof error?.message === "string" && /api key not valid/i.test(error.message)) return "CAPTCHA_API_KEY_INVALID";
  if (typeof error?.message === "string" && /requests from this (?:referer|referrer) are blocked/i.test(error.message)) return "CAPTCHA_API_KEY_RESTRICTED";
  if (status === 429 || error?.status === "RESOURCE_EXHAUSTED") return "CAPTCHA_SERVICE_LIMIT";
  if (status === 401 || error?.status === "UNAUTHENTICATED") return "CAPTCHA_API_KEY_INVALID";
  if (status === 403 || error?.status === "PERMISSION_DENIED") return "CAPTCHA_API_PERMISSION";
  if (status === 404) return "CAPTCHA_PROJECT_INVALID";
  return "CAPTCHA_SERVICE_ERROR";
}

export function captchaTokenErrorCode(valid: boolean | undefined, invalidReason: string | undefined): string {
  if (valid === true) return "CAPTCHA_REJECTED";
  if (invalidReason === "EXPIRED" || invalidReason === "DUPE") return "CAPTCHA_TOKEN_EXPIRED";
  if (invalidReason === "BROWSER_ERROR") return "CAPTCHA_BROWSER_ERROR";
  return "CAPTCHA_TOKEN_INVALID";
}

export function captchaFailureMessage(code: string): string {
  const message = code.startsWith("CAPTCHA_API_") || code === "CAPTCHA_PROJECT_INVALID" || code === "CAPTCHA_BILLING_REQUIRED"
    ? "Owner sign-in security needs a configuration update. Please contact the archive owner."
    : code === "CAPTCHA_SERVICE_LIMIT" || code === "CAPTCHA_SERVICE_ERROR"
      ? "The security service is temporarily unavailable. Please try again later."
      : "The security check was not accepted. Please try again.";
  return `${message} Reference: ${code}.`;
}
