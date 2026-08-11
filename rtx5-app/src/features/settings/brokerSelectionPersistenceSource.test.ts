import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('every broker picker persists its validated logged-out selection before detail navigation', () => {
  const sources = [
    readSource('src/features/settings/BrokersScreen/BrokersScreen.tsx'),
    readSource('src/features/settings/BrokersLaunchHost.tsx'),
    readSource('app/settings/brokers.tsx'),
  ];

  for (const source of sources) {
    const healthGate = source.indexOf('selectedBrokerHealthGate.run({');
    const available = source.indexOf('onAvailable:', healthGate);
    const persistSelection = source.indexOf(
      'setBrokerConnection(broker.brokerId, broker.serverUrl, broker.logoUrl)',
      available,
    );
    const directDetail = source.indexOf('showBrokerDetailLaunch(', available);
    const delegatedDetail = source.indexOf('openBrokerDetail(selection)', available);
    const openDetail = [directDetail, delegatedDetail]
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)[0] ?? -1;
    assert.ok(healthGate >= 0, 'broker selection must pass the health gate');
    assert.ok(persistSelection > available, 'validated selection must be persisted');
    assert.ok(openDetail > persistSelection, 'selection must persist before Broker Detail opens');
  }
});
