import { redactDiagnosticValue } from './securityRedaction';

type RedactableConsoleMethod = 'debug' | 'error' | 'info' | 'log' | 'warn';
type ConsoleTarget = Record<RedactableConsoleMethod, (...args: unknown[]) => void>;

const METHODS: readonly RedactableConsoleMethod[] = ['debug', 'error', 'info', 'log', 'warn'];
const installedTargets = new WeakSet<object>();

/**
 * Last-line defense for legacy diagnostics. Individual call sites should still
 * redact deliberately, but no console argument may bypass the central scrubber.
 */
export const installSecurityRedactedConsole = (
  target: ConsoleTarget = console as unknown as ConsoleTarget,
): void => {
  if (installedTargets.has(target)) return;
  installedTargets.add(target);

  for (const method of METHODS) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]) => {
      original(...args.map(redactDiagnosticValue));
    };
  }
};
