import { config } from '../config/env.js';

export function enforceEmailSafety() {
  if (config.emailProvider !== 'console') {
    throw new Error("SAFETY ERROR: automated Phase 19 audit/simulation cannot use a production SMTP provider. Use ConsoleEmailProvider.");
  }
}
