import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BrokerDirectorySchemaError,
  parseBrokerDirectoryListingPayload,
  parseBrokerDirectoryPayload,
} from './broker';

const richDirectoryRecord = () => ({
  id: 7,
  broker_id: 'alpha-broker',
  broker_name: 'Alpha Broker',
  enabled: true,
  active: true,
  license_active: true,
  config_version: 'cfg-7',
  services_domain: 'services.alpha-broker.com',
  server_url: 'https://services.alpha-broker.com/api/v2',
  market_api_url: 'https://services.alpha-broker.com/api/v2',
  feed_wss_url: 'wss://services.alpha-broker.com/ws/feed',
  feed_status_https_url: 'https://services.alpha-broker.com/ws/feed/status',
  trade_wss_url: 'wss://services.alpha-broker.com/ws/v2',
  logo_url: 'https://cdn.alpha-broker.com/logo.png',
  protocol: 'mt5',
  region: 'eu-west',
  server: 'AlphaBroker-Live',
  server_ip: 'broker-server-7',
  server_port: 443,
  created_at: 1_768_435_200,
});

const rawV2Record = (overrides: Record<string, unknown> = {}) => ({
  id: 73,
  broker_id: 'gta_broker',
  broker_name: 'Grow Trading Academy',
  enabled: true,
  active: true,
  server_url: 'https://services.growtradingacademy.com',
  // Raw-v2 routing must ignore this alias and use server_url exactly.
  market_api_url: 'https://services.growtradingacademy.com',
  feed_wss_url: 'wss://services.growtradingacademy.com/ws/feed',
  feed_ws_url: 'wss://services.growtradingacademy.com/ws/feed',
  feed_status_https_url: 'https://services.growtradingacademy.com/ws/feed/status',
  feed_status_url: 'https://services.growtradingacademy.com/ws/feed/status',
  logo_url: 'https://cdn.example.com/gta.png',
  protocol: 'https',
  region: 'Global',
  server: 'services.growtradingacademy.com:443',
  server_ip: '103.91.186.142',
  server_port: 443,
  created_at: 1_779_862_635,
  ...overrides,
});

const expectSchemaError = (run: () => unknown, code: string) => {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof BrokerDirectorySchemaError);
    assert.equal(error.code, code);
    return true;
  });
};

test('versioned rich directory parser returns only exact validated endpoints', () => {
  const records = parseBrokerDirectoryPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  });

  assert.equal(records.length, 1);
  assert.equal(Object.isFrozen(records[0]), true);
  assert.equal(records[0].schema_version, 'broker-directory.rich.v1');
  assert.equal(records[0].config_version, 'cfg-7');
  assert.equal(records[0].services_domain, 'services.alpha-broker.com');
  assert.equal(records[0].market_api_url, 'https://services.alpha-broker.com/api/v2');
  assert.equal(records[0].feed_wss_url, 'wss://services.alpha-broker.com/ws/feed');
  assert.equal(
    records[0].feed_status_https_url,
    'https://services.alpha-broker.com/ws/feed/status',
  );
  assert.equal(records[0].trade_wss_url, 'wss://services.alpha-broker.com/ws/v2');
});

test('listing parser exposes approved entries only for the supported rich envelope', () => {
  const result = parseBrokerDirectoryListingPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [richDirectoryRecord()],
  });

  assert.equal(result.mode, 'approved');
  assert.equal(result.warningCode, undefined);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].kind, 'approved');
  assert.equal(result.approvedServers.length, 1);
  assert.equal(result.approvedServers[0].broker_id, 'alpha-broker');
});

test('live-shaped raw v2 Achiever, GTA, MyProp, and Orrnn Demo rows remain selectable', () => {
  const liveLikeRows = [
    rawV2Record({
      id: 79,
      broker_id: 'achiever-financials',
      broker_name: 'Achiever Financials LTD',
      server_url: 'https://service.achieverfinancials.com',
      market_api_url: 'https://service.achieverfinancials.com',
      feed_wss_url: 'wss://service.achieverfinancials.com/ws/feed',
      feed_ws_url: 'wss://service.achieverfinancials.com/ws/feed',
      feed_status_https_url: 'https://service.achieverfinancials.com/ws/feed/status',
      feed_status_url: 'https://service.achieverfinancials.com/ws/feed/status',
      server: 'service.achieverfinancials.com:443',
      server_ip: '66.23.232.22',
      created_at: 1_782_480_612,
      future_capability: { version: 2 },
      notes: 'Historical fixture 203.0.113.10 is not a routing field.',
    }),
    rawV2Record(),
    rawV2Record({
      id: 77,
      broker_id: 'myprop-trade',
      broker_name: 'MyProp',
      server_url: 'https://services.myprop.trade/',
      market_api_url: 'https://alternate.example/api/v2',
      feed_wss_url: 'wss://services.myprop.trade/ws/feed',
      feed_ws_url: 'wss://services.myprop.trade/ws/feed',
      feed_status_https_url: 'https://services.myprop.trade/ws/feed/status',
      feed_status_url: 'https://services.myprop.trade/ws/feed/status',
      server: 'services.myprop.trade:443',
      server_ip: '185.204.168.202',
      created_at: 1_780_582_167,
    }),
    rawV2Record({
      id: 80,
      broker_id: 'orrnn-demo',
      broker_name: 'Orrnn Broker demo',
      server_url: 'https://demobackend.orrnn.com',
      market_api_url: 'https://demobackend.orrnn.com',
      feed_wss_url: 'wss://demobackend.orrnn.com/ws/feed',
      feed_ws_url: 'wss://demobackend.orrnn.com/ws/feed',
      feed_status_https_url: 'https://demobackend.orrnn.com/ws/feed/status',
      feed_status_url: 'https://demobackend.orrnn.com/ws/feed/status',
      server: 'demobackend.orrnn.com:443',
      server_ip: '69.197.178.27',
      created_at: 1_784_199_260,
    }),
  ];

  const result = parseBrokerDirectoryListingPayload(liveLikeRows);

  assert.equal(result.mode, 'v2');
  assert.equal(result.warningCode, undefined);
  assert.deepEqual(result.approvedServers, []);
  assert.equal(result.entries.every((entry) => entry.kind === 'v2_server'), true);
  assert.deepEqual(
    result.selectableServers.map((record) => [record.broker_id, record.server_url]),
    [
      ['achiever-financials', 'https://service.achieverfinancials.com'],
      ['gta_broker', 'https://services.growtradingacademy.com'],
      ['myprop-trade', 'https://services.myprop.trade'],
      ['orrnn-demo', 'https://demobackend.orrnn.com'],
    ],
  );
  // REST base is derived from the exact service-root server_url.
  assert.equal(
    result.selectableServers[2].market_api_url,
    'https://services.myprop.trade/api/v2',
  );
  assert.equal('future_capability' in result.selectableServers[0], false);
  assert.equal('notes' in result.selectableServers[0], false);

  // The strict rich-envelope parser remains strict for the same raw array.
  expectSchemaError(() => parseBrokerDirectoryPayload(liveLikeRows), 'missing_schema_version');
});

test('raw v2 requires enabled true and excludes disabled or explicitly inactive rows', () => {
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([
      rawV2Record({ enabled: undefined }),
    ]),
    'missing_enabled_approval',
  );

  const activeAbsent = rawV2Record({
    id: 81,
    broker_id: 'active-omitted',
    broker_name: 'Active Omitted Broker',
  });
  Reflect.deleteProperty(activeAbsent, 'active');

  const result = parseBrokerDirectoryListingPayload([
    rawV2Record({ id: 82, broker_id: 'disabled', enabled: false }),
    rawV2Record({ id: 83, broker_id: 'inactive', active: false }),
    rawV2Record({ id: 84, broker_id: 'null-active', active: null }),
    rawV2Record({ id: 85, broker_id: 'inactive-status', status: 'inactive' }),
    activeAbsent,
  ]);

  assert.deepEqual(
    result.selectableServers.map((record) => record.broker_id),
    ['active-omitted'],
  );
  assert.equal('active' in result.selectableServers[0], false);
});

test('raw v2 requires server metadata and an HTTPS protocol declaration', () => {
  for (const field of ['server', 'server_ip', 'protocol'] as const) {
    expectSchemaError(
      () => parseBrokerDirectoryListingPayload([
        rawV2Record({ [field]: ' ' }),
      ]),
      `missing_${field}`,
    );
  }

  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([
      rawV2Record({ protocol: 'http' }),
    ]),
    'invalid_protocol',
  );

  const caseInsensitive = parseBrokerDirectoryListingPayload([
    rawV2Record({ protocol: 'HTTPS' }),
  ]);
  assert.equal(caseInsensitive.selectableServers[0].protocol, 'https');
});

test('TEST-NET 203.0.113.0/24 rows are hidden from known endpoint and IP fields', () => {
  const result = parseBrokerDirectoryListingPayload([
    rawV2Record({ id: 10, broker_id: 'bad-ip', server_ip: '203.0.113.10' }),
    rawV2Record({ id: 11, broker_id: 'bad-server', server: '203.0.113.11:443' }),
    rawV2Record({ id: 12, broker_id: 'bad-url', server_url: 'https://203.0.113.12:443' }),
    rawV2Record({ id: 13, broker_id: 'bad-feed', feed_url: 'ws://203.0.113.13/ws/feed' }),
    rawV2Record({
      id: 14,
      broker_id: 'bad-nested',
      domains: { services: '203.0.113.14' },
    }),
    rawV2Record({ id: 200, broker_id: 'bad-other-octet', server_ip: '203.0.113.200' }),
    rawV2Record(),
  ]);

  assert.equal(result.mode, 'v2');
  assert.deepEqual(
    result.selectableServers.map((record) => record.broker_id),
    ['gta_broker'],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.kind === 'v2_server' ? entry.server.broker_id : ''),
    ['gta_broker'],
  );
});

test('documented legacy value wrapper is identity-only and unknown envelopes still fail', () => {
  const legacyResult = parseBrokerDirectoryListingPayload({
    value: [{
      id: 'legacy-7',
      broker_id: 'legacy-broker',
      broker_name: 'Legacy Broker',
      server_url: 'https://unapproved.example',
    }],
  });

  assert.equal(legacyResult.mode, 'identity_only');
  assert.deepEqual(legacyResult.entries, [{
    kind: 'identity_only',
    id: 'legacy-7',
    brokerId: 'legacy-broker',
    brokerName: 'Legacy Broker',
  }]);
  assert.deepEqual(legacyResult.approvedServers, []);

  expectSchemaError(
    () => parseBrokerDirectoryListingPayload({ brokers: [richDirectoryRecord()] }),
    'missing_schema_version',
  );
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload({
      schema_version: 'broker-directory.rich.v2',
      brokers: [richDirectoryRecord()],
    }),
    'unsupported_schema_version',
  );
});

test('one malformed or explicitly disabled raw-v2 record cannot hide a valid broker', () => {
  const result = parseBrokerDirectoryListingPayload([
    null,
    { id: 1, broker_id: '', broker_name: 'Malformed Broker' },
    rawV2Record({
      id: 2,
      broker_id: 'disabled-broker',
      broker_name: 'Disabled Broker',
      enabled: false,
    }),
    rawV2Record(),
  ]);

  assert.equal(result.mode, 'v2');
  assert.deepEqual(result.selectableServers.map((record) => record.broker_id), ['gta_broker']);
  expectSchemaError(
    () => parseBrokerDirectoryListingPayload([null, { broker_id: 'missing-id' }]),
    'malformed_record',
  );
});

test('unversioned arrays and envelopes fail closed as release-contract blockers', () => {
  const liveRow = {
    ...richDirectoryRecord(),
    enabled: undefined,
    active: undefined,
    config_version: undefined,
  };
  expectSchemaError(() => parseBrokerDirectoryPayload([liveRow]), 'missing_schema_version');
  expectSchemaError(
    () => parseBrokerDirectoryPayload({ brokers: [liveRow] }),
    'missing_schema_version',
  );
});

test('unknown schema versions and missing per-record approvals fail closed', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v2',
      brokers: [richDirectoryRecord()],
    }),
    'unsupported_schema_version',
  );
  for (const [field, code] of [
    ['enabled', 'missing_enabled_approval'],
    ['active', 'missing_active_approval'],
    ['license_active', 'missing_license_approval'],
    ['config_version', 'missing_config_version'],
  ] as const) {
    expectSchemaError(
      () => parseBrokerDirectoryPayload({
        schema_version: 'broker-directory.rich.v1',
        brokers: [{ ...richDirectoryRecord(), [field]: undefined }],
      }),
      code,
    );
  }
});

test('opaque broker handles are rejected instead of producing client domains', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [{
        ...richDirectoryRecord(),
        market_api_url: undefined,
        feed_wss_url: undefined,
        feed_status_https_url: undefined,
        server: 'broker-server-7',
      }],
    }),
    'opaque_or_missing_endpoints',
  );
});

test('invalid records are rejected without hiding unrelated valid brokers', () => {
  const records = parseBrokerDirectoryPayload({
    schema_version: 'broker-directory.rich.v1',
    brokers: [
      richDirectoryRecord(),
      { ...richDirectoryRecord(), broker_id: 'disabled-broker', enabled: false },
    ],
  });
  assert.deepEqual(records.map((record) => record.broker_id), ['alpha-broker']);

  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [
        { ...richDirectoryRecord(), broker_id: 'disabled-broker', enabled: false },
      ],
    }),
    'disabled',
  );
});

test('ambiguous record collections and conflicting endpoint aliases are rejected', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [],
      value: [],
    }),
    'ambiguous_directory_records',
  );
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [{
        ...richDirectoryRecord(),
        feed_ws_url: 'wss://services.alpha-broker.com/ws/another-feed',
      }],
    }),
    'conflicting_endpoint_fields',
  );
});

test('malformed display metadata is rejected rather than defaulted', () => {
  expectSchemaError(
    () => parseBrokerDirectoryPayload({
      schema_version: 'broker-directory.rich.v1',
      brokers: [{ ...richDirectoryRecord(), broker_name: '' }],
    }),
    'missing_broker_name',
  );
});
