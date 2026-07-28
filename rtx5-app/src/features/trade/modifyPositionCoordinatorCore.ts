import {
  AmbiguousModifyPositionOutcomeError,
  normalizeReconciledProtectionValue,
  type ModifyPositionRequest,
} from '../../api/positions/modifyPositionWire';
import { parseRetryAfterSeconds } from '../../api/tradingErrors';

export type ModifyPositionCoordinatorPhase =
  | 'idle'
  | 'pending'
  | 'reconciling'
  | 'saved'
  | 'changed_elsewhere'
  | 'rejected'
  | 'unknown'
  | 'position_unavailable'
  | 'superseded'
  | 'rate_limited'
  | 'session_changed';

export type ModifyPositionCoordinatorResultStatus =
  Exclude<ModifyPositionCoordinatorPhase, 'idle' | 'pending' | 'reconciling'>;

export type ModifyPositionCoordinatorInput = Readonly<{
  ticket: number;
  symbol: string;
  accountLogin: number;
  sessionKey: string;
  request: ModifyPositionRequest;
}>;

export type ModifyPositionCoordinatorResult = Readonly<{
  status: ModifyPositionCoordinatorResultStatus;
  ticket: number;
  request: ModifyPositionRequest;
  snapshot?: Record<string, unknown>;
  error?: unknown;
}>;

export type TicketMutationState = Readonly<{
  mutationEpoch: number;
  mutationInFlight: boolean;
  activeIntent?: ModifyPositionRequest;
  confirmedBeforeAttempt?: ModifyPositionRequest;
  queuedLatestIntent?: ModifyPositionRequest;
  hintQueued: boolean;
  refreshSequence: number;
  reconciliationFloorSequence: number;
  latestEligibleSequence: number;
  socketSubscriptionEpoch: number;
  activeAttemptId?: string;
  phase: ModifyPositionCoordinatorPhase;
  retryAfterUntil?: number;
  lastResult?: ModifyPositionCoordinatorResult;
}>;

type PutOutcome =
  | Readonly<{ kind: 'acknowledged' }>
  | Readonly<{ kind: 'rejected'; error: unknown }>
  | Readonly<{ kind: 'unknown'; error: unknown }>
  | Readonly<{ kind: 'hint' }>;

type Deferred = Readonly<{
  promise: Promise<ModifyPositionCoordinatorResult>;
  resolve: (value: ModifyPositionCoordinatorResult) => void;
}>;

type QueuedJob = Readonly<{
  input: ModifyPositionCoordinatorInput;
  deferred: Deferred;
}>;

type ActiveJob = Readonly<{
  input: ModifyPositionCoordinatorInput;
  deferred: Deferred;
  generation: number;
}>;

type TicketEntry = {
  state: TicketMutationState;
  sessionKey: string;
  lastInput?: ModifyPositionCoordinatorInput;
  activeJob?: ActiveJob;
  queuedJob?: QueuedJob;
  idleHintInFlight: boolean;
};

export type ModifyPositionCoordinatorDependencies = Readonly<{
  modify: (input: ModifyPositionCoordinatorInput) => Promise<unknown>;
  readPositions: (
    input: ModifyPositionCoordinatorInput,
  ) => Promise<ReadonlyArray<Record<string, unknown>>>;
  commitPosition: (
    position: Record<string, unknown> | undefined,
    input: ModifyPositionCoordinatorInput,
  ) => void;
  captureConfirmed?: (
    input: ModifyPositionCoordinatorInput,
  ) => ModifyPositionRequest | undefined;
  isSessionCurrent: (sessionKey: string) => boolean;
  now?: () => number;
  createAttemptId?: () => string;
  recordEvent?: (
    phase: string,
    input: ModifyPositionCoordinatorInput,
    details?: Record<string, unknown>,
  ) => void;
  beginProtectedMutation?: () => (() => void);
}>;

const EMPTY_STATE: TicketMutationState = Object.freeze({
  mutationEpoch: 0,
  mutationInFlight: false,
  hintQueued: false,
  refreshSequence: 0,
  reconciliationFloorSequence: 0,
  latestEligibleSequence: 0,
  socketSubscriptionEpoch: 0,
  phase: 'idle',
});

const createDeferred = (): Deferred => {
  let resolve!: (value: ModifyPositionCoordinatorResult) => void;
  const promise = new Promise<ModifyPositionCoordinatorResult>((next) => {
    resolve = next;
  });
  return Object.freeze({ promise, resolve });
};

const errorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const source = error as Record<string, unknown>;
  if (typeof source.status === 'number') return source.status;
  const response = source.response;
  if (response && typeof response === 'object') {
    const status = (response as Record<string, unknown>).status;
    return typeof status === 'number' ? status : undefined;
  }
  return undefined;
};

const retryAfterSeconds = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const source = error as Record<string, unknown>;
  const headers = (
    source.headers && typeof source.headers === 'object'
      ? source.headers
      : source.response && typeof source.response === 'object'
        ? (source.response as Record<string, unknown>).headers
        : null
  ) as Record<string, unknown> | null;
  return parseRetryAfterSeconds(headers?.['retry-after']);
};

const classifyPutError = (error: unknown): PutOutcome => {
  const status = errorStatus(error);
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (
    error instanceof AmbiguousModifyPositionOutcomeError ||
    status === 504 ||
    name === 'AbortError' ||
    /timeout|timed out|network request failed|failed to fetch|load failed|connection reset/i.test(message)
  ) {
    return Object.freeze({ kind: 'unknown', error });
  }
  return status !== undefined
    ? Object.freeze({ kind: 'rejected', error })
    : Object.freeze({ kind: 'unknown', error });
};

const resolveRowTicket = (row: Record<string, unknown>): number | null => {
  const value = row.ticket;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const sameIntent = (
  row: Record<string, unknown>,
  request: ModifyPositionRequest,
): boolean => (
  (
    !Object.prototype.hasOwnProperty.call(request, 'price_sl') ||
    normalizeReconciledProtectionValue(row.price_sl) ===
      normalizeReconciledProtectionValue(request.price_sl)
  ) &&
  (
    !Object.prototype.hasOwnProperty.call(request, 'price_tp') ||
    normalizeReconciledProtectionValue(row.price_tp) ===
      normalizeReconciledProtectionValue(request.price_tp)
  )
);

export class ModifyPositionCoordinatorCore {
  private readonly entries = new Map<string, TicketEntry>();
  private readonly listeners = new Map<string, Set<() => void>>();
  private generation = 0;
  private socketSubscriptionEpoch = 0;
  private fallbackAttemptSequence = 0;

  constructor(private readonly dependencies: ModifyPositionCoordinatorDependencies) {}

  getTicketState(ticket: string | number): TicketMutationState {
    return this.entries.get(String(ticket))?.state ?? EMPTY_STATE;
  }

  subscribe(ticket: string | number, listener: () => void): () => void {
    const key = String(ticket);
    const listeners = this.listeners.get(key) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  submit(input: ModifyPositionCoordinatorInput): Promise<ModifyPositionCoordinatorResult> {
    const entry = this.getOrCreateEntry(input);
    const now = this.now();
    if ((entry.state.retryAfterUntil ?? 0) > now) {
      return Promise.resolve(Object.freeze({
        status: 'rate_limited',
        ticket: input.ticket,
        request: input.request,
      }));
    }

    const deferred = createDeferred();
    if (entry.activeJob) {
      entry.queuedJob?.deferred.resolve(Object.freeze({
        status: 'superseded',
        ticket: entry.queuedJob.input.ticket,
        request: entry.queuedJob.input.request,
      }));
      entry.queuedJob = Object.freeze({ input, deferred });
      this.patchState(entry, {
        queuedLatestIntent: input.request,
      });
      return deferred.promise;
    }

    const activeJob = Object.freeze({
      input,
      deferred,
      generation: this.generation,
    });
    entry.activeJob = activeJob;
    entry.lastInput = input;
    void this.runMutationJob(entry, activeJob);
    return deferred.promise;
  }

  notifyPositionsHint(
    tickets?: ReadonlyArray<string | number>,
    accountLogin?: string | number,
  ): void {
    const ticketSet = tickets?.length
      ? new Set(tickets.map((ticket) => String(ticket)))
      : null;
    for (const [key, entry] of this.entries) {
      if (ticketSet && !ticketSet.has(key)) continue;
      if (
        accountLogin !== undefined &&
        entry.lastInput &&
        String(entry.lastInput.accountLogin) !== String(accountLogin)
      ) {
        continue;
      }
      if (!entry.lastInput) continue;
      this.patchState(entry, { hintQueued: true });
      this.record('websocket_hint', entry.lastInput, {
        mutationEpoch: entry.state.mutationEpoch,
        socketEpoch: entry.state.socketSubscriptionEpoch,
        mutationInFlight: entry.state.mutationInFlight,
      });
      if (!entry.activeJob && !entry.idleHintInFlight) {
        void this.runIdleHint(entry);
      }
    }
  }

  notifySocketSubscription(): void {
    this.socketSubscriptionEpoch += 1;
    for (const entry of this.entries.values()) {
      this.patchState(entry, {
        socketSubscriptionEpoch: this.socketSubscriptionEpoch,
        hintQueued: Boolean(entry.lastInput),
      });
      if (entry.lastInput) {
        this.record('socket_subscription', entry.lastInput, {
          socketEpoch: this.socketSubscriptionEpoch,
        });
      }
      if (entry.lastInput && !entry.activeJob && !entry.idleHintInFlight) {
        void this.runIdleHint(entry);
      }
    }
  }

  resetSession(): void {
    this.generation += 1;
    this.socketSubscriptionEpoch = 0;
    for (const [key, entry] of this.entries) {
      entry.queuedJob?.deferred.resolve(Object.freeze({
        status: 'session_changed',
        ticket: entry.queuedJob.input.ticket,
        request: entry.queuedJob.input.request,
      }));
      this.entries.delete(key);
      this.emit(key);
    }
  }

  private getOrCreateEntry(input: ModifyPositionCoordinatorInput): TicketEntry {
    const key = String(input.ticket);
    const existing = this.entries.get(key);
    if (existing?.sessionKey === input.sessionKey) {
      return existing;
    }
    const entry: TicketEntry = {
      state: Object.freeze({
        ...EMPTY_STATE,
        socketSubscriptionEpoch: this.socketSubscriptionEpoch,
      }),
      sessionKey: input.sessionKey,
      idleHintInFlight: false,
    };
    this.entries.set(key, entry);
    this.emit(key);
    return entry;
  }

  private async runMutationJob(entry: TicketEntry, job: ActiveJob): Promise<void> {
    const releaseBarrier = this.dependencies.beginProtectedMutation?.();
    try {
      await this.runProtectedMutationJob(entry, job);
    } finally {
      releaseBarrier?.();
    }
  }

  private async runProtectedMutationJob(entry: TicketEntry, job: ActiveJob): Promise<void> {
    const { input } = job;
    const mutationEpoch = entry.state.mutationEpoch + 1;
    const attemptId = this.createAttemptId();
    const confirmedBeforeAttempt = this.dependencies.captureConfirmed?.(input);
    entry.lastInput = input;
    this.patchState(entry, {
      mutationEpoch,
      mutationInFlight: true,
      activeIntent: input.request,
      confirmedBeforeAttempt,
      queuedLatestIntent: entry.queuedJob?.input.request,
      hintQueued: false,
      activeAttemptId: attemptId,
      phase: 'pending',
      lastResult: undefined,
    });
    this.record('request_start', input, { mutationEpoch, attemptId });

    let putOutcome: PutOutcome;
    try {
      await this.dependencies.modify(input);
      putOutcome = Object.freeze({ kind: 'acknowledged' });
      this.record('request_end', input, {
        mutationEpoch,
        attemptId,
        outcome: 'acknowledged',
        status: 200,
      });
    } catch (error) {
      putOutcome = classifyPutError(error);
      this.record('request_end', input, {
        mutationEpoch,
        attemptId,
        outcome: putOutcome.kind,
        status: errorStatus(error),
      });
      if (errorStatus(error) === 429) {
        const seconds = retryAfterSeconds(error);
        if (seconds) {
          this.patchState(entry, { retryAfterUntil: this.now() + seconds * 1000 });
        }
      }
    }

    if (!this.isJobCurrent(entry, job, mutationEpoch)) {
      job.deferred.resolve(Object.freeze({
        status: 'session_changed',
        ticket: input.ticket,
        request: input.request,
      }));
      return;
    }

    this.patchState(entry, {
      mutationInFlight: false,
      phase: 'reconciling',
    });
    let result = await this.dispatchReconciliation(
      entry,
      input,
      mutationEpoch,
      putOutcome,
      true,
    );

    if (this.isJobCurrent(entry, job, mutationEpoch) && entry.state.hintQueued) {
      this.patchState(entry, { hintQueued: false });
      const hintedResult = await this.dispatchReconciliation(
        entry,
        input,
        mutationEpoch,
        putOutcome,
        false,
      );
      result = hintedResult ?? result;
    }

    if (!this.isJobCurrent(entry, job, mutationEpoch)) {
      job.deferred.resolve(Object.freeze({
        status: 'session_changed',
        ticket: input.ticket,
        request: input.request,
      }));
      return;
    }

    const finalResult = result ?? Object.freeze({
      status: 'unknown' as const,
      ticket: input.ticket,
      request: input.request,
    });
    this.patchState(entry, {
      activeAttemptId: undefined,
      activeIntent: undefined,
      confirmedBeforeAttempt: undefined,
      phase: finalResult.status === 'superseded' ||
        finalResult.status === 'rate_limited' ||
        finalResult.status === 'session_changed'
        ? 'unknown'
        : finalResult.status,
      lastResult: finalResult,
    });
    job.deferred.resolve(finalResult);
    entry.activeJob = undefined;

    const queued = entry.queuedJob;
    entry.queuedJob = undefined;
    this.patchState(entry, { queuedLatestIntent: undefined });
    if (queued) {
      const nextJob = Object.freeze({
        input: queued.input,
        deferred: queued.deferred,
        generation: this.generation,
      });
      entry.activeJob = nextJob;
      entry.lastInput = queued.input;
      void this.runMutationJob(entry, nextJob);
      return;
    }
    if (entry.state.hintQueued && !entry.idleHintInFlight) {
      void this.runIdleHint(entry);
    }
  }

  private async runIdleHint(entry: TicketEntry): Promise<void> {
    const input = entry.lastInput;
    if (!input || entry.activeJob || entry.idleHintInFlight) return;
    entry.idleHintInFlight = true;
    this.patchState(entry, {
      hintQueued: false,
      phase: 'reconciling',
    });
    const mutationEpoch = entry.state.mutationEpoch;
    await this.dispatchReconciliation(
      entry,
      input,
      mutationEpoch,
      Object.freeze({ kind: 'hint' }),
      false,
    );
    entry.idleHintInFlight = false;
    if (entry.state.hintQueued && !entry.activeJob) {
      this.patchState(entry, { hintQueued: false });
      void this.runIdleHint(entry);
    }
  }

  private async dispatchReconciliation(
    entry: TicketEntry,
    input: ModifyPositionCoordinatorInput,
    mutationEpoch: number,
    putOutcome: PutOutcome,
    mandatory: boolean,
  ): Promise<ModifyPositionCoordinatorResult | null> {
    const sequence = entry.state.refreshSequence + 1;
    const socketEpoch = entry.state.socketSubscriptionEpoch;
    this.patchState(entry, {
      refreshSequence: sequence,
      latestEligibleSequence: sequence,
      ...(mandatory ? { reconciliationFloorSequence: sequence } : {}),
      phase: 'reconciling',
    });
    this.record('reconciliation_start', input, {
      mutationEpoch,
      sequence,
      socketEpoch,
      mandatory,
    });

    try {
      const positions = await this.dependencies.readPositions(input);
      if (!this.isReconciliationEligible(
        entry,
        input,
        mutationEpoch,
        socketEpoch,
        sequence,
      )) {
        return null;
      }
      const snapshot = positions.find((row) => resolveRowTicket(row) === input.ticket);
      let authoritativeSnapshot: Record<string, unknown> | undefined;
      if (snapshot) {
        // Validate the exact target before committing that ticket's authoritative row.
        // Only missing/null are valid clear representations; malformed values
        // must not be silently converted into a confirmed clear.
        authoritativeSnapshot = Object.freeze({
          ...snapshot,
          price_sl: normalizeReconciledProtectionValue(snapshot.price_sl),
          price_tp: normalizeReconciledProtectionValue(snapshot.price_tp),
        });
      }
      // A reconciliation GET returns the whole open-position ledger, but this
      // ticket coordinator owns only its exact target. Committing unrelated
      // rows lets an older GET for ticket A roll back a newer ticket B.
      this.dependencies.commitPosition(authoritativeSnapshot, input);
      this.record('store_commit', input, {
        mutationEpoch,
        sequence,
        attemptId: entry.state.activeAttemptId,
      });
      if (!this.isReconciliationEligible(
        entry,
        input,
        mutationEpoch,
        socketEpoch,
        sequence,
      )) {
        return null;
      }

      let result: ModifyPositionCoordinatorResult;
      if (!snapshot) {
        result = Object.freeze({
          status: 'position_unavailable',
          ticket: input.ticket,
          request: input.request,
        });
      } else if (sameIntent(authoritativeSnapshot ?? snapshot, input.request)) {
        result = Object.freeze({
          status: 'saved',
          ticket: input.ticket,
          request: input.request,
          snapshot: authoritativeSnapshot,
        });
      } else {
        result = Object.freeze({
          status: putOutcome.kind === 'rejected'
            ? 'rejected'
            : putOutcome.kind === 'unknown'
              ? 'unknown'
              : 'changed_elsewhere',
          ticket: input.ticket,
          request: input.request,
          snapshot: authoritativeSnapshot,
          ...(putOutcome.kind === 'rejected' || putOutcome.kind === 'unknown'
            ? { error: putOutcome.error }
            : {}),
        });
      }
      this.patchState(entry, {
        phase: result.status,
        lastResult: result,
      });
      this.record('reconciliation_end', input, {
        mutationEpoch,
        sequence,
        outcome: result.status,
      });
      return result;
    } catch (error) {
      if (!this.isReconciliationEligible(
        entry,
        input,
        mutationEpoch,
        socketEpoch,
        sequence,
      )) {
        return null;
      }
      const result = Object.freeze({
        status: 'unknown' as const,
        ticket: input.ticket,
        request: input.request,
        error,
      });
      this.patchState(entry, {
        phase: 'unknown',
        lastResult: result,
      });
      this.record('reconciliation_end', input, {
        mutationEpoch,
        sequence,
        outcome: 'unknown',
        status: errorStatus(error),
      });
      return result;
    }
  }

  private isJobCurrent(
    entry: TicketEntry,
    job: ActiveJob,
    mutationEpoch: number,
  ): boolean {
    return (
      entry.activeJob === job &&
      job.generation === this.generation &&
      entry.state.mutationEpoch === mutationEpoch &&
      this.dependencies.isSessionCurrent(job.input.sessionKey)
    );
  }

  private isReconciliationEligible(
    entry: TicketEntry,
    input: ModifyPositionCoordinatorInput,
    mutationEpoch: number,
    socketEpoch: number,
    sequence: number,
  ): boolean {
    return (
      entry.sessionKey === input.sessionKey &&
      this.dependencies.isSessionCurrent(input.sessionKey) &&
      entry.state.mutationEpoch === mutationEpoch &&
      entry.state.socketSubscriptionEpoch === socketEpoch &&
      sequence >= entry.state.reconciliationFloorSequence &&
      sequence === entry.state.latestEligibleSequence
    );
  }

  private patchState(entry: TicketEntry, patch: Partial<TicketMutationState>): void {
    entry.state = Object.freeze({ ...entry.state, ...patch });
    const ticket = entry.lastInput?.ticket ?? entry.activeJob?.input.ticket;
    if (ticket !== undefined) this.emit(String(ticket));
  }

  private emit(key: string): void {
    for (const listener of this.listeners.get(key) ?? []) listener();
  }

  private now(): number {
    return this.dependencies.now?.() ?? Date.now();
  }

  private createAttemptId(): string {
    if (this.dependencies.createAttemptId) return this.dependencies.createAttemptId();
    this.fallbackAttemptSequence += 1;
    return `modify-${this.now().toString(36)}-${this.fallbackAttemptSequence.toString(36)}`;
  }

  private record(
    phase: string,
    input: ModifyPositionCoordinatorInput,
    details: Record<string, unknown>,
  ): void {
    this.dependencies.recordEvent?.(phase, input, details);
  }
}
