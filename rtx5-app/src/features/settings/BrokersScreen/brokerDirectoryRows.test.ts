import assert from 'node:assert/strict';
import test from 'node:test';
import type { BrokerServer } from '../../../api/broker';
import {
  buildBrokerDirectoryRows,
  normalizeBrokerLogoUrl,
  resolveBrokerLogoUrl,
  sortBrokerDirectoryRows,
} from './brokerDirectoryRows';

const broker = (
  overrides: Partial<BrokerServer> & Pick<BrokerServer, 'broker_id' | 'broker_name'>,
): BrokerServer => {
  const { broker_id, broker_name, ...rest } = overrides;
  return {
    id: 1,
    protocol: 'https',
    region: 'Global',
    server: '203.0.113.10:443',
    server_ip: '203.0.113.10',
    server_port: 443,
    created_at: 1,
    ...rest,
    broker_id,
    broker_name,
  };
};

test('broker logo URLs normalize every backend-supported URL shape', () => {
  assert.equal(
    normalizeBrokerLogoUrl(' http://cdn.example.com/logo.png '),
    'https://cdn.example.com/logo.png',
  );
  assert.equal(
    normalizeBrokerLogoUrl('//cdn.example.com/logo.png'),
    'https://cdn.example.com/logo.png',
  );
  assert.equal(
    normalizeBrokerLogoUrl('/brokers/example/logo'),
    'https://superbackend.orrnn.com/brokers/example/logo',
  );
  assert.equal(
    normalizeBrokerLogoUrl('assets/logo.png'),
    'https://superbackend.orrnn.com/api/v1/assets/logo.png',
  );
});

test('broker logo resolver honors direct and nested backend fields', () => {
  assert.equal(
    resolveBrokerLogoUrl(broker({
      broker_id: 'direct',
      broker_name: 'Direct Broker',
      logo_url: 'https://cdn.example.com/direct.png',
    })),
    'https://cdn.example.com/direct.png',
  );

  const nested = broker({ broker_id: 'nested', broker_name: 'Nested Broker' }) as BrokerServer & {
    branding: { image_url: string };
  };
  nested.branding = { image_url: '/images/nested.png' };
  assert.equal(
    resolveBrokerLogoUrl(nested),
    'https://superbackend.orrnn.com/images/nested.png',
  );
});

test('shared broker rows remove disabled and duplicate entries and keep backend logos', () => {
  const rows = buildBrokerDirectoryRows([
    broker({
      id: 2,
      broker_id: 'myprop-trade',
      broker_name: 'MyProp',
      logo_url: ' https://cdn.example.com/myprop.png ',
      services_domain: 'services.myprop.trade',
    }),
    broker({
      id: 3,
      broker_id: 'myprop-trade',
      broker_name: 'Duplicate MyProp',
      logo_url: 'https://cdn.example.com/duplicate.png',
    }),
    broker({
      id: 4,
      broker_id: 'disabled',
      broker_name: 'Disabled Broker',
      enabled: false,
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'MyProp');
  assert.equal(rows[0].logoUrl, 'https://cdn.example.com/myprop.png');
  assert.equal(rows[0].domain, 'myprop.trade');
});

test('shared broker ordering pins MetaQuotes then sorts names', () => {
  const rows = buildBrokerDirectoryRows([
    broker({ id: 1, broker_id: 'zeta', broker_name: 'Zeta Broker' }),
    broker({ id: 2, broker_id: 'metaquotes', broker_name: 'MetaQuotes Ltd.' }),
    broker({ id: 3, broker_id: 'alpha', broker_name: 'Alpha Broker' }),
  ]);

  assert.deepEqual(
    sortBrokerDirectoryRows(rows).map((row) => row.name),
    ['MetaQuotes Ltd.', 'Alpha Broker', 'Zeta Broker'],
  );
});
