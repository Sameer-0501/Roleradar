/**
 * Console Email Provider.
 *
 * Safe provider for development and testing: logs email payloads to logger / console
 * and captures them in-memory for testing assertions without sending actual emails.
 */

import { createLogger } from '../../../utils/logger.js';
import type { IEmailProvider, EmailMessage, EmailSendResult } from '../types.js';

const log = createLogger('email:console');

export class ConsoleEmailProvider implements IEmailProvider {
  private sentMessages: EmailMessage[] = [];

  getProviderName(): string {
    return 'console';
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: 'Console email provider active (safe local mode)' };
  }

  async sendEmail(message: EmailMessage): Promise<EmailSendResult> {
    const messageId = `console-msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Store for test inspection
    this.sentMessages.push(message);

    log.info(
      {
        to: message.to,
        subject: message.subject,
        messageId,
        idempotencyKey: message.idempotencyKey,
      },
      'EMAIL_SENT_CONSOLE [DEV/TEST MODE — NO REAL EMAIL TRANSMITTED]'
    );

    return {
      success: true,
      providerMessageId: messageId,
      isRetryable: false,
    };
  }

  getSentMessages(): EmailMessage[] {
    return [...this.sentMessages];
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }
}
