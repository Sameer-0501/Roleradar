/**
 * Resend Email Provider.
 *
 * Transactional email provider using Resend's REST API.
 */

import { createLogger } from '../../../utils/logger.js';
import type { IEmailProvider, EmailMessage, EmailSendResult } from '../types.js';

const log = createLogger('email:resend');

export interface ResendConfig {
  apiKey: string;
  defaultFrom: string;
}

export class ResendEmailProvider implements IEmailProvider {
  private apiKey: string;
  private defaultFrom: string;

  constructor(config: ResendConfig) {
    this.apiKey = config.apiKey;
    this.defaultFrom = config.defaultFrom;
  }

  getProviderName(): string {
    return 'resend';
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.apiKey || this.apiKey.trim() === '') {
      return { healthy: false, message: 'Resend API key is missing or empty' };
    }

    try {
      const res = await fetch('https://api.resend.com/api-keys', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      if (res.status === 401 || res.status === 403) {
        return { healthy: false, message: 'Invalid Resend API key (authentication failed)' };
      }

      return { healthy: true, message: 'Resend API connection verified' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { healthy: false, message: `Resend health check failed: ${msg}` };
    }
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      };

      if (message.idempotencyKey) {
        headers['Idempotency-Key'] = message.idempotencyKey;
      }

      let res: Response;
      try {
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            from: message.from || this.defaultFrom,
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
            reply_to: message.replyTo,
            tags: message.category ? [{ name: 'category', value: message.category }] : undefined,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };

      if (!res.ok) {
        const errorMsg = data.message || `Resend API returned HTTP ${res.status}`;
        const isRetryable = res.status === 429 || res.status >= 500;

        log.error(
          { to: message.to, status: res.status, err: errorMsg, isRetryable },
          'EMAIL_SEND_FAILED_RESEND'
        );

        return {
          success: false,
          errorMessage: errorMsg,
          isRetryable,
        };
      }

      log.info(
        { to: message.to, subject: message.subject, id: data.id },
        'EMAIL_SENT_RESEND'
      );

      return {
        success: true,
        providerMessageId: data.id,
        isRetryable: false,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = true; // Network timeouts / fetch failures are retryable

      log.error({ to: message.to, err: errorMsg }, 'EMAIL_SEND_ERROR_RESEND');

      return {
        success: false,
        errorMessage: errorMsg,
        isRetryable,
      };
    }
  }
}
