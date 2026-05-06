/**
 * Static broker overrides + helpers — names, regulated/popular flags, default
 * server slugs, and label-translation helpers.
 */

export type BrokerFilter = 'all' | 'popular' | 'regulated';

export type BrokerRecord = {
  id: string;
  name: string;
  server: string;
  domain?: string;
  region: string;
  spread: string;
  minDeposit: string;
  popular: boolean;
  regulated: boolean;
};

export const BROKER_OVERRIDES: Record<string, Partial<BrokerRecord>> = {
  'Exness Technologies Ltd': { domain: 'exness.com', region: 'Global', spread: 'from 0.1 pips', minDeposit: '$10', popular: true, regulated: true, server: 'Exness-OrrnnTrial14' },
  'GTC Global Trade Capital Co. Limited': { domain: 'gtcfx.com', region: 'MENA', spread: 'from 0.2 pips', minDeposit: '$50', popular: true, regulated: true, server: 'GTCGlobal-Live01' },
  'Trade Securities Limited': { domain: 'tradesecurities.com', region: 'Asia', spread: 'from 0.3 pips', minDeposit: '$100', popular: false, regulated: true, server: 'TradeSec-OrrnnLive' },
  'GTC Global SA (Pty) Ltd': { domain: 'gtcsa.co.za', region: 'South Africa', spread: 'from 0.2 pips', minDeposit: '$50', popular: false, regulated: true, server: 'GTC-SA-Live' },
  'Flexy Markets Limited': { domain: 'flexymarkets.com', region: 'Global', spread: 'from 0.4 pips', minDeposit: '$100', popular: false, regulated: true, server: 'Flexy-Orrnn-Live' },
  'Ascends Global Markets Limited': { domain: 'ascendsglobalmarkets.com', region: 'Global', spread: 'from 0.4 pips', minDeposit: '$100', popular: false, regulated: true, server: 'Ascends-Orrnn-Live' },
  'Equiti Brokerage (Seychelles) Limited': { domain: 'equiti.com', region: 'Global', spread: 'from 0.1 pips', minDeposit: '$100', popular: true, regulated: true, server: 'Equiti-Global-Live' },
  'Swissquote Bank SA': { domain: 'swissquote.com', region: 'Europe', spread: 'from 0.3 pips', minDeposit: '$1,000', popular: true, regulated: true, server: 'Swissquote-Orrnn' },
  'FP Markets LLC': { domain: 'fpmarkets.com', region: 'Global', spread: 'from 0.0 pips', minDeposit: '$100', popular: true, regulated: true, server: 'FPMarkets-Live' },
  'Vantage International Group Limited': { domain: 'vantagemarkets.com', region: 'Global', spread: 'from 0.1 pips', minDeposit: '$50', popular: true, regulated: true, server: 'Vantage-Orrnn-Live' },
  'AMarkets LLC': { domain: 'amarkets.com', region: 'Global', spread: 'from 0.3 pips', minDeposit: '$100', popular: false, regulated: true, server: 'AMarkets-Live' },
  'MetaQuotes Ltd.': { domain: 'metaquotes.net', region: 'Global', spread: 'n/a', minDeposit: 'n/a', popular: false, regulated: false, server: 'MetaQuotes-Demo' },
};

export function formatServerFromName(name: string) {
  const compact = name.replace(/[^a-zA-Z0-9]/g, '');
  return `${compact.slice(0, 16)}-Live`;
}

export function translateBrokerRegion(region: string, t: (key: string) => string) {
  return t(region);
}

export function translateBrokerSpread(spread: string, t: (key: string) => string) {
  const spreadMatch = spread.match(/^from\s+(.+)\s+pips$/i);
  if (spreadMatch) {
    return `${t('from')} ${spreadMatch[1]} ${t('pips')}`;
  }

  return t(spread);
}
