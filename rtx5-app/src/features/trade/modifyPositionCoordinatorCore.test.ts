import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AmbiguousModifyPositionOutcomeError,
  type ModifyPositionRequest,
} from '../../api/positions/modifyPositionWire';
import { createTradingApiError } from '../../api/tradingErrors';
import {
  ModifyPositionCoordinatorCore,
  type ModifyPositionCoordinatorDependencies,
  type ModifyPositionCoordinatorInput,
} from './modifyPositionCoordinatorCore';

type ControlledPromise<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}>;

const controlledPromise = <T>(): ControlledPromise<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return Object.freeze({ promise, resolve, reject });
};

const waitUntil = async (
  predicate: () => boolean,
  message: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  assert.fail(message);
};

const request = (priceSl: number, priceTp: number): ModifyPositionRequest =>
  Object.freeze({ price_sl: priceSl, price_tp: priceTp });

const input = (
  ticket: number,
  intent: ModifyPositionRequest,
  overrides: Partial<ModifyPositionCoordinatorInput> = {},
): ModifyPositionCoordinatorInput => Object.freeze({
  ticket,
  symbol: 'EURUSD',
  accountLogin: 900001,
  sessionKey: 'broker-a:900001:session-1',
  request: intent,
  ...overrides,
});

const matchingSnapshot = (
  job: ModifyPositionCoordinatorInput,
): Record<string, unknown> => ({
  ticket: job.ticket,
  symbol: job.symbol,
  price_sl: job.request.price_sl,
  price_tp: job.request.price_tp,
});

const coordinator = (
  dependencies: Pick<
    ModifyPositionCoordinatorDependencies,
    'modify' | 'readPositions' | 'commitPosition'
  > & Partial<ModifyPositionCoordinatorDependencies>,
): ModifyPositionCoordinatorCore => new ModifyPositionCoordinatorCore({
  isSessionCurrent: () => true,
  ...dependencies,
});

test('same-ticket jobs serialize and retain only the latest queued intent', async () => {
  const modifyGates = [
    controlledPromise<void>(),
    controlledPromise<void>(),
  ];
  const modifyCalls: ModifyPositionCoordinatorInput[] = [];
  const events: string[] = [];

  const core = coordinator({
    modify: (job) => {
      const gate = modifyGates[modifyCalls.length];
      modifyCalls.push(job);
      events.push(`modify:${job.request.price_sl}`);
      return gate.promise;
    },
    readPositions: async (job) => {
      events.push(`read:${job.request.price_sl}`);
      return [matchingSnapshot(job)];
    },
    commitPosition: () => {},
  });

  const firstInput = input(101, request(1.081, 1.091));
  const supersededInput = input(101, request(1.082, 1.092));
  const latestInput = input(101, request(1.083, 1.093));

  const first = core.submit(firstInput);
  await waitUntil(() => modifyCalls.length === 1, 'first mutation did not start');

  const superseded = core.submit(supersededInput);
  const latest = core.submit(latestInput);
  assert.equal(modifyCalls.length, 1, 'same-ticket PUTs must not overlap');
  assert.equal((await superseded).status, 'superseded');
  assert.deepEqual(
    core.getTicketState(101).queuedLatestIntent,
    latestInput.request,
  );

  modifyGates[0].resolve(undefined);
  assert.equal((await first).status, 'saved');
  await waitUntil(() => modifyCalls.length === 2, 'latest queued mutation did not start');
  assert.deepEqual(modifyCalls[1].request, latestInput.request);

  modifyGates[1].resolve(undefined);
  assert.equal((await latest).status, 'saved');
  assert.deepEqual(events, [
    'modify:1.081',
    'read:1.081',
    'modify:1.083',
    'read:1.083',
  ]);
  assert.equal(core.getTicketState(101).mutationEpoch, 2);
  assert.equal(core.getTicketState(101).phase, 'saved');
  assert.equal(core.getTicketState(101).queuedLatestIntent, undefined);
});

test('different tickets may execute concurrently', async () => {
  const gates = new Map([
    [201, controlledPromise<void>()],
    [202, controlledPromise<void>()],
  ]);
  let activeModifications = 0;
  let maximumActiveModifications = 0;
  const started: number[] = [];

  const core = coordinator({
    modify: async (job) => {
      started.push(job.ticket);
      activeModifications += 1;
      maximumActiveModifications = Math.max(
        maximumActiveModifications,
        activeModifications,
      );
      await gates.get(job.ticket)?.promise;
      activeModifications -= 1;
    },
    readPositions: async (job) => [matchingSnapshot(job)],
    commitPosition: () => {},
  });

  const first = core.submit(input(201, request(1.07, 1.1)));
  const second = core.submit(input(202, request(1.08, 1.11)));
  await waitUntil(
    () => started.length === 2,
    'different-ticket mutations did not start concurrently',
  );
  assert.equal(maximumActiveModifications, 2);

  gates.get(202)?.resolve(undefined);
  assert.equal((await second).status, 'saved');
  assert.equal(core.getTicketState(201).mutationInFlight, true);

  gates.get(201)?.resolve(undefined);
  assert.equal((await first).status, 'saved');
  assert.deepEqual(new Set(started), new Set([201, 202]));
});

test('out-of-order different-ticket GETs commit only their exact targets', async () => {
  const firstRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const secondRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const readsStarted: number[] = [];
  const ledger = new Map<number, ModifyPositionRequest>([
    [301, request(1.01, 1.11)],
    [302, request(1.02, 1.12)],
  ]);

  const core = coordinator({
    modify: async () => {},
    readPositions: (job) => {
      readsStarted.push(job.ticket);
      return job.ticket === 301 ? firstRead.promise : secondRead.promise;
    },
    commitPosition: (position, job) => {
      if (!position) {
        ledger.delete(job.ticket);
        return;
      }
      ledger.set(job.ticket, request(
        Number(position.price_sl),
        Number(position.price_tp),
      ));
    },
  });

  const firstJob = input(301, request(1.03, 1.13));
  const secondJob = input(302, request(1.04, 1.14));
  const first = core.submit(firstJob);
  const second = core.submit(secondJob);
  await waitUntil(() => readsStarted.length === 2, 'both ticket GETs did not start');

  secondRead.resolve([
    { ticket: 301, price_sl: 1.01, price_tp: 1.11 },
    matchingSnapshot(secondJob),
  ]);
  assert.equal((await second).status, 'saved');
  assert.deepEqual(ledger.get(302), secondJob.request);

  // This older whole-ledger response still contains ticket 302's old values.
  // Ticket 301's coordinator must not be allowed to roll ticket 302 backward.
  firstRead.resolve([
    matchingSnapshot(firstJob),
    { ticket: 302, price_sl: 1.02, price_tp: 1.12 },
  ]);
  assert.equal((await first).status, 'saved');
  assert.deepEqual(ledger.get(301), firstJob.request);
  assert.deepEqual(ledger.get(302), secondJob.request);
});

test('exact-target absence removes only that ticket', async () => {
  const missingJob = input(401, request(1.05, 1.15));
  const otherTicketState = request(1.06, 1.16);
  const ledger = new Map<number, ModifyPositionRequest>([
    [missingJob.ticket, request(1.01, 1.11)],
    [402, otherTicketState],
  ]);

  const core = coordinator({
    modify: async () => {},
    readPositions: async () => [{
      ticket: 402,
      price_sl: otherTicketState.price_sl,
      price_tp: otherTicketState.price_tp,
    }],
    commitPosition: (position, job) => {
      if (!position) {
        ledger.delete(job.ticket);
        return;
      }
      ledger.set(job.ticket, request(
        Number(position.price_sl),
        Number(position.price_tp),
      ));
    },
  });

  const result = await core.submit(missingJob);
  assert.equal(result.status, 'position_unavailable');
  assert.equal(ledger.has(missingJob.ticket), false);
  assert.deepEqual(ledger.get(402), otherTicketState);
});

test('coordinator rate-limit state requires a strict positive integer Retry-After', async () => {
  const cases = [
    { retryAfter: '17', expectedUntil: 18_000 },
    { retryAfter: '1.5', expectedUntil: undefined },
    { retryAfter: '60junk', expectedUntil: undefined },
    { retryAfter: '-1', expectedUntil: undefined },
  ] as const;

  for (const scenario of cases) {
    const job = input(450, request(1.07, 1.17));
    const core = new ModifyPositionCoordinatorCore({
      modify: async () => {
        throw createTradingApiError(
          429,
          { error: 'RATE_LIMITED', message: 'Wait before retrying.' },
          { 'retry-after': scenario.retryAfter },
        );
      },
      readPositions: async () => [matchingSnapshot(job)],
      commitPosition: () => {},
      isSessionCurrent: () => true,
      now: () => 1_000,
    });

    await core.submit(job);
    assert.equal(
      core.getTicketState(job.ticket).retryAfterUntil,
      scenario.expectedUntil,
      scenario.retryAfter,
    );
  }
});

test('success, structured rejection, and ambiguous PUT outcomes all reconcile', async () => {
  const cases = [
    {
      name: 'acknowledged',
      modify: async () => {},
      expectedStatus: 'saved',
      matching: true,
    },
    {
      name: 'structured rejection',
      modify: async () => {
        throw Object.assign(new Error('invalid stops'), { status: 422 });
      },
      expectedStatus: 'rejected',
      matching: false,
    },
    {
      name: 'ambiguous response',
      modify: async () => {
        throw new AmbiguousModifyPositionOutcomeError('empty 200 response', 200);
      },
      expectedStatus: 'unknown',
      matching: false,
    },
  ] as const;

  for (const scenario of cases) {
    let reads = 0;
    let commits = 0;
    const job = input(301, request(1.08, 1.12));
    const core = coordinator({
      modify: scenario.modify,
      readPositions: async () => {
        reads += 1;
        return [{
          ticket: job.ticket,
          price_sl: scenario.matching ? job.request.price_sl : 1.075,
          price_tp: scenario.matching ? job.request.price_tp : 1.125,
        }];
      },
      commitPosition: () => {
        commits += 1;
      },
    });

    const result = await core.submit(job);
    assert.equal(result.status, scenario.expectedStatus, scenario.name);
    assert.equal(reads, 1, `${scenario.name} must perform one mandatory GET`);
    assert.equal(commits, 1, `${scenario.name} must commit the eligible REST snapshot`);
    assert.equal(core.getTicketState(job.ticket).reconciliationFloorSequence, 1);
  }
});

test('a socket-epoch-stale hint GET cannot commit and is replaced by a current GET', async () => {
  const staleRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const currentRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  let reads = 0;
  const commits: Array<Record<string, unknown> | undefined> = [];
  const job = input(401, request(1.08, 1.12));

  const core = coordinator({
    modify: async () => {},
    readPositions: async (currentJob) => {
      reads += 1;
      if (reads === 1) return [matchingSnapshot(currentJob)];
      if (reads === 2) return staleRead.promise;
      return currentRead.promise;
    },
    commitPosition: (position) => {
      commits.push(position);
    },
  });

  assert.equal((await core.submit(job)).status, 'saved');
  commits.length = 0;

  core.notifyPositionsHint([job.ticket], job.accountLogin);
  await waitUntil(() => reads === 2, 'idle hint GET did not start');
  core.notifySocketSubscription();

  staleRead.resolve([{
    ticket: job.ticket,
    price_sl: 1.01,
    price_tp: 1.2,
  }]);
  await waitUntil(() => reads === 3, 'current socket-epoch GET did not replace stale GET');
  assert.equal(commits.length, 0, 'stale GET must be side-effect free');

  currentRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => commits.length === 1, 'current GET did not commit');
  await waitUntil(
    () => core.getTicketState(job.ticket).phase === 'saved',
    'current hint reconciliation did not settle',
  );
  const state = core.getTicketState(job.ticket);
  assert.equal(state.socketSubscriptionEpoch, 1);
  assert.equal(state.refreshSequence, 3);
  assert.equal(state.latestEligibleSequence, 3);
});

test('websocket hints during a mutation coalesce into one post-reconciliation GET', async () => {
  const modifyGate = controlledPromise<void>();
  const mandatoryRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const hintedRead = controlledPromise<ReadonlyArray<Record<string, unknown>>>();
  const job = input(501, request(1.08, 1.12));
  let modifyCalls = 0;
  let reads = 0;
  let commits = 0;

  const core = coordinator({
    modify: async () => {
      modifyCalls += 1;
      await modifyGate.promise;
    },
    readPositions: () => {
      reads += 1;
      return reads === 1 ? mandatoryRead.promise : hintedRead.promise;
    },
    commitPosition: () => {
      commits += 1;
    },
  });

  const resultPromise = core.submit(job);
  await waitUntil(() => modifyCalls === 1, 'mutation did not start');
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifySocketSubscription();
  assert.equal(reads, 0, 'hint must not dispatch a GET while PUT is active');

  modifyGate.resolve(undefined);
  await waitUntil(() => reads === 1, 'mandatory reconciliation did not start');
  core.notifyPositionsHint([job.ticket], job.accountLogin);
  core.notifyPositionsHint([job.ticket], job.accountLogin);

  mandatoryRead.resolve([matchingSnapshot(job)]);
  await waitUntil(() => reads === 2, 'coalesced hint GET did not start');
  hintedRead.resolve([matchingSnapshot(job)]);

  assert.equal((await resultPromise).status, 'saved');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 2, 'multiple websocket hints must coalesce to one extra GET');
  assert.equal(commits, 2);
  assert.equal(core.getTicketState(job.ticket).hintQueued, false);
});

test('session reset invalidates active work and resolves queued work without reconciliation', async () => {
  const modifyGate = controlledPromise<void>();
  let currentSession = true;
  let reads = 0;
  let releases = 0;
  const firstInput = input(601, request(1.08, 1.12));
  const queuedInput = input(601, request(1.081, 1.121));

  const core = new ModifyPositionCoordinatorCore({
    modify: () => modifyGate.promise,
    readPositions: async () => {
      reads += 1;
      return [];
    },
    commitPosition: () => {},
    isSessionCurrent: () => currentSession,
    beginProtectedMutation: () => () => {
      releases += 1;
    },
  });

  const active = core.submit(firstInput);
  await waitUntil(
    () => core.getTicketState(firstInput.ticket).mutationInFlight,
    'active mutation did not enter pending state',
  );
  const queued = core.submit(queuedInput);

  currentSession = false;
  core.resetSession();
  assert.equal((await queued).status, 'session_changed');
  assert.equal(core.getTicketState(firstInput.ticket).phase, 'idle');

  modifyGate.resolve(undefined);
  assert.equal((await active).status, 'session_changed');
  assert.equal(reads, 0);
  await waitUntil(() => releases === 1, 'session-reset job did not release its mutation barrier');
  assert.equal(releases, 1);
});

test('unsubscribing every view does not cancel an already-started ticket job', async () => {
  const modifyGate = controlledPromise<void>();
  let modifyCalls = 0;
  let reads = 0;
  let commits = 0;
  let releases = 0;
  let notifications = 0;
  const job = input(701, request(1.08, 1.12));

  const core = new ModifyPositionCoordinatorCore({
    modify: async () => {
      modifyCalls += 1;
      await modifyGate.promise;
    },
    readPositions: async (currentJob) => {
      reads += 1;
      return [matchingSnapshot(currentJob)];
    },
    commitPosition: () => {
      commits += 1;
    },
    isSessionCurrent: () => true,
    beginProtectedMutation: () => () => {
      releases += 1;
    },
  });

  const unsubscribe = core.subscribe(job.ticket, () => {
    notifications += 1;
  });
  const resultPromise = core.submit(job);
  await waitUntil(() => modifyCalls === 1, 'mutation did not start');
  unsubscribe();

  modifyGate.resolve(undefined);
  assert.equal((await resultPromise).status, 'saved');
  assert.ok(notifications > 0, 'subscriber should observe the job before unmount');
  assert.equal(reads, 1);
  assert.equal(commits, 1);
  await waitUntil(() => releases === 1, 'completed job did not release its mutation barrier');
  assert.equal(releases, 1);
  assert.equal(core.getTicketState(job.ticket).phase, 'saved');
});
