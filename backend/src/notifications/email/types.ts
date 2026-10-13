/**
 * Email Provider Types and Interfaces.
 *
 * Provides a clean adapter contract for transactional email delivery.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
  /** Deterministic idempotency key for email providers that support it */
  idempotencyKey?: string;
  /** Categorization tag (e.g. "instant-job-alert", "daily-digest") */
  category?: string;
}

export interface EmailSendResult {
  success: boolean;
  /** Provider message reference ID (e.g., SMTP Message-ID, Resend email ID) */
  providerMessageId?: string;
  /** Human-readable error message if sending failed */
  errorMessage?: string;
  /** Whether the failure is retryable (transient network/server error) */
  isRetryable: boolean;
}

export interface IEmailProvider {
  /** Return human-readable provider name (e.g. "console", "smtp", "resend") */
  getProviderName(): string;

  /** Check connectivity / credentials of the provider */
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;

  /** Send an email message */
  sendEmail(message: EmailMessage): Promise<EmailSendResult>;
}
