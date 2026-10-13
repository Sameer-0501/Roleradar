/**
 * SMTP Email Provider.
 *
 * Transactional email provider using nodemailer SMTP transport.
 * Classifies errors into retryable (network, timeout, 429, 5xx) vs permanent (invalid address, rejected recipient).
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { createLogger } from '../../../utils/logger.js';
import type { IEmailProvider, EmailMessage, EmailSendResult } from '../types.js';

const log = createLogger('email:smtp');

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  defaultFrom: string;
}

export class SmtpEmailProvider implements IEmailProvider {
  private transporter: Transporter;
  private defaultFrom: string;

  constructor(config: SmtpConfig) {
    this.defaultFrom = config.defaultFrom;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure ?? (config.port === 465),
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  getProviderName(): string {
    return 'smtp';
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.transporter.verify();
      return { healthy: true, message: 'SMTP connection verified' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { healthy: false, message: `SMTP verification failed: ${msg}` };
    }
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: message.from || this.defaultFrom,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        replyTo: message.replyTo,
        headers: message.idempotencyKey
          ? { 'X-Idempotency-Key': message.idempotencyKey }
          : undefined,
      });

      log.info(
        { to: message.to, subject: message.subject, messageId: info.messageId },
        'EMAIL_SENT_SMTP'
      );

      return {
        success: true,
        providerMessageId: info.messageId,
        isRetryable: false,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = this.classifyRetryable(err);

      log.error(
        { to: message.to, err: errorMsg, isRetryable },
        'EMAIL_SEND_FAILED_SMTP'
      );

      return {
        success: false,
        errorMessage: errorMsg,
        isRetryable,
      };
    }
  }

  private classifyRetryable(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; responseCode?: number; message?: string };

    // Common SMTP permanent error codes (5xx recipient errors)
    if (e.responseCode && e.responseCode >= 500 && e.responseCode < 600) {
      // 550: User unknown / mailbox unavailable
      // 551: User not local
      // 552: Exceeded storage allocation
      // 553: Mailbox name not allowed
      // 554: Transaction failed (permanent)
      if ([550, 551, 552, 553, 554].includes(e.responseCode)) {
        return false;
      }
    }

    // Connection errors and timeouts are retryable
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENOTFOUND', 'ESOCKETTIMEDOUT'];
    if (e.code && retryableCodes.includes(e.code)) {
      return true;
    }

    // Default: treat 4xx SMTP codes as retryable (transient server/rate errors)
    if (e.responseCode && e.responseCode >= 400 && e.responseCode < 500) {
      return true;
    }

    // Check message for timeout/network indicators
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('rate limit') || msg.includes('too many connections')) {
      return true;
    }

    return false;
  }
}
