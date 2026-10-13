/**
 * Email Provider Factory.
 *
 * Resolves the active IEmailProvider implementation based on application config.
 */

import { config } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';
import type { IEmailProvider } from './types.js';
import { ConsoleEmailProvider } from './providers/console-provider.js';
import { SmtpEmailProvider } from './providers/smtp-provider.js';
import { ResendEmailProvider } from './providers/resend-provider.js';

const log = createLogger('email:factory');

let cachedProvider: IEmailProvider | null = null;

export function getEmailProvider(): IEmailProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  // Safe development / console mode
  if (config.emailMode === 'console' || config.emailMode === 'development') {
    log.info('Using ConsoleEmailProvider (safe local development mode)');
    cachedProvider = new ConsoleEmailProvider();
    return cachedProvider;
  }

  // Production mode: require configured provider and credentials
  if (config.emailMode === 'production') {
    if (config.emailProvider === 'resend') {
      if (!config.resendApiKey) {
        throw new Error(
          'Configuration Error: EMAIL_MODE=production with EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set.'
        );
      }
      log.info('Using ResendEmailProvider');
      cachedProvider = new ResendEmailProvider({
        apiKey: config.resendApiKey,
        defaultFrom: config.emailFrom,
      });
      return cachedProvider;
    }

    if (config.emailProvider === 'smtp') {
      if (!config.smtp.host) {
        throw new Error(
          'Configuration Error: EMAIL_MODE=production with EMAIL_PROVIDER=smtp requires SMTP_HOST to be set.'
        );
      }
      log.info({ host: config.smtp.host, port: config.smtp.port }, 'Using SmtpEmailProvider');
      cachedProvider = new SmtpEmailProvider({
        host: config.smtp.host,
        port: config.smtp.port,
        user: config.smtp.user,
        pass: config.smtp.pass,
        secure: config.smtp.secure,
        defaultFrom: config.emailFrom,
      });
      return cachedProvider;
    }

    throw new Error(
      `Configuration Error: EMAIL_MODE=production requires EMAIL_PROVIDER to be 'smtp' or 'resend', got '${config.emailProvider}'.`
    );
  }

  cachedProvider = new ConsoleEmailProvider();
  return cachedProvider;
}

/**
 * Override the active email provider (useful for testing).
 */
export function setEmailProviderForTesting(provider: IEmailProvider | null): void {
  cachedProvider = provider;
}
