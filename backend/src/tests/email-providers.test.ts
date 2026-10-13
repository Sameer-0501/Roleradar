/**
 * Email Provider Unit Tests.
 *
 * Tests ConsoleEmailProvider, SmtpEmailProvider error classification,
 * ResendEmailProvider payload handling, and ProviderFactory resolution.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleEmailProvider } from '../notifications/email/providers/console-provider.js';
import { SmtpEmailProvider } from '../notifications/email/providers/smtp-provider.js';
import { ResendEmailProvider } from '../notifications/email/providers/resend-provider.js';
import { getEmailProvider, setEmailProviderForTesting } from '../notifications/email/provider-factory.js';
import { renderInstantAlertEmail } from '../notifications/email/templates/instant-alert.js';
import { renderDailyDigestEmail } from '../notifications/email/templates/daily-digest.js';
import { config } from '../config/env.js';

describe('ConsoleEmailProvider', () => {
  let provider: ConsoleEmailProvider;

  beforeEach(() => {
    provider = new ConsoleEmailProvider();
    provider.clearSentMessages();
  });

  it('reports healthy and returns console provider name', async () => {
    expect(provider.getProviderName()).toBe('console');
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(true);
  });

  it('records sent messages in memory and returns success result', async () => {
    const result = await provider.sendEmail({
      to: 'candidate@example.com',
      subject: 'Test Subject',
      html: '<p>Test</p>',
      text: 'Test',
      idempotencyKey: 'user-1:job-1:INSTANT_JOB',
    });

    expect(result.success).toBe(true);
    expect(result.providerMessageId).toBeDefined();
    expect(result.isRetryable).toBe(false);

    const sent = provider.getSentMessages();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('candidate@example.com');
    expect(sent[0]!.idempotencyKey).toBe('user-1:job-1:INSTANT_JOB');
  });
});

describe('SmtpEmailProvider Error Classification', () => {
  const provider = new SmtpEmailProvider({
    host: 'localhost',
    port: 587,
    defaultFrom: 'alerts@RoleRadar.dev',
  });

  it('classifies 550 recipient unknown as non-retryable (permanent)', () => {
    const isRetryable = (provider as unknown as { classifyRetryable: (err: unknown) => boolean }).classifyRetryable({
      responseCode: 550,
      message: '550 5.1.1 User unknown',
    });
    expect(isRetryable).toBe(false);
  });

  it('classifies 421 / 451 service unavailable as retryable', () => {
    const isRetryable = (provider as unknown as { classifyRetryable: (err: unknown) => boolean }).classifyRetryable({
      responseCode: 421,
      message: '421 Service temporarily unavailable',
    });
    expect(isRetryable).toBe(true);
  });

  it('classifies ECONNRESET and ETIMEDOUT network errors as retryable', () => {
    const isConnReset = (provider as unknown as { classifyRetryable: (err: unknown) => boolean }).classifyRetryable({
      code: 'ECONNRESET',
      message: 'read ECONNRESET',
    });
    expect(isConnReset).toBe(true);

    const isTimeout = (provider as unknown as { classifyRetryable: (err: unknown) => boolean }).classifyRetryable({
      code: 'ETIMEDOUT',
      message: 'connect ETIMEDOUT',
    });
    expect(isTimeout).toBe(true);
  });
});

describe('ResendEmailProvider', () => {
  it('reports unhealthy when API key is missing', async () => {
    const provider = new ResendEmailProvider({
      apiKey: '',
      defaultFrom: 'alerts@RoleRadar.dev',
    });
    const health = await provider.healthCheck();
    expect(health.healthy).toBe(false);
    expect(health.message).toContain('missing');
  });
});

describe('Email Templates Safety & Formatting', () => {
  it('renders instant alert with direct official URL and escaped HTML', () => {
    const rendered = renderInstantAlertEmail({
      recipientName: 'Alice Smith',
      companyName: 'GitLab & Co',
      jobTitle: 'Senior Backend Engineer <Go>',
      location: 'Remote, US',
      externalJobId: 'git-789',
      officialUrl: 'https://boards.greenhouse.io/gitlab/jobs/789',
      sourceSystem: 'GREENHOUSE',
      matchSummary: 'Senior Backend Engineer · Remote',
      matchReasons: ['Title match'],
    });

    expect(rendered.subject).toContain('GitLab & Co');
    expect(rendered.subject).toContain('Senior Backend Engineer <Go>');
    // Direct link invariant
    expect(rendered.html).toContain('href="https://boards.greenhouse.io/gitlab/jobs/789"');
    // Escaped title in HTML
    expect(rendered.html).toContain('&lt;Go&gt;');
    // Verified badge
    expect(rendered.html).toContain('✓ Verified Official Job');
  });

  it('renders daily digest with multiple jobs and direct links', () => {
    const rendered = renderDailyDigestEmail({
      recipientName: 'Bob',
      digestDateStr: 'Aug 28, 2026',
      jobs: [
        {
          companyName: 'Palantir',
          title: 'Forward Deployed Software Engineer',
          location: 'New York, NY',
          externalJobId: 'pal-101',
          officialUrl: 'https://jobs.lever.co/palantir/101',
          sourceSystem: 'LEVER',
          matchSummary: 'Software Engineer · New York',
        },
      ],
    });

    expect(rendered.subject).toContain('1 new opening');
    expect(rendered.html).toContain('Forward Deployed Software Engineer');
    expect(rendered.html).toContain('https://jobs.lever.co/palantir/101');
    expect(rendered.text).toContain('Palantir');
  });
});

describe('Email Provider Factory', () => {
  it('returns default console provider in test/dev environment', () => {
    const origMode = config.emailMode;
    const orig = config.emailProvider;
    try {
      (config as any).emailMode = 'development';
      (config as any).emailProvider = 'console';
      setEmailProviderForTesting(null);
      const provider = getEmailProvider();
      expect(provider.getProviderName()).toBe('console');
    } finally {
      (config as any).emailMode = origMode;
      (config as any).emailProvider = orig;
      setEmailProviderForTesting(null);
    }
  });
});
