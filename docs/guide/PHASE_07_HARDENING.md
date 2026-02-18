# Phase 07 - Hardening and Reliability

## Objective
Harden RTX5 for secure, observable, and stable beta operation.

## In Scope
- Security control implementation checks.
- Feature flags and kill switches.
- Sentry and Crashlytics release instrumentation.
- Performance and memory profiling.
- Accessibility and resilience checks.

## Out of Scope
- New feature development.

## Exact Implementation Tasks
1. Validate secure token storage and biometric app lock.
2. Enable cert pinning for production API domains.
3. Enforce root/jailbreak detection policy.
4. Add redaction middleware for logs and analytics.
5. Connect release tags to Sentry and Crashlytics.
6. Add remote kill-switch consumption in UI guards.
7. Run performance profiling under high quote throughput.
8. Fix all release-blocking defects.

## API Dependencies
- Feature flags endpoint (`/v1/flags/mobile`).
- Error tracking DSN/config values.

## Acceptance Checklist
- [ ] Security checklist in `SECURITY.md` passes.
- [ ] Observability events are visible in staging tools.
- [ ] Critical journeys meet performance thresholds.
- [ ] No open P0/P1 issues remain.

## Test Checklist
- [ ] Unit: redaction and kill-switch guards.
- [ ] Integration: app lock lifecycle.
- [ ] E2E: degraded network and reconnect scenarios.

## Exit Criteria
- Release readiness sign-off from security, QA, and mobile leads.

