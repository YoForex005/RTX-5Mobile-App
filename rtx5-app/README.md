# RTX5 Mobile App

## MyProp market data

MyProp quote traffic uses the broker-hosted webterminal path:

- REST API: `https://services.myprop.trade/api/v2`
- Quote feed: `wss://services.myprop.trade/ws/feed`
- Broker ID: `myprop-trade`
- Trading/candle socket: `wss://services.myprop.trade/ws/v2`

The broker service domain is resolved from broker discovery/login state rather than hardcoded into the runtime client. The feed token must be returned by an authenticated broker flow, is stored with the app's secure-storage wrapper, and is appended only when the MyProp quote socket connects. Do not commit broker feed tokens or put them in public Expo environment variables.

MyProp quote subscriptions use `{ "type": "subscribe", "symbols": [...] }`. Watchlist, chart, and other consumers share the existing demand-counted quote service, which unsubscribes unused symbols, resubscribes after reconnect, and reconnects when the app returns to the foreground. Quote metadata such as `source: "rtx_market_data"` and `authority: "rtx5_hub"` is retained for policy/diagnostics but is not rendered as a per-row badge.

Quotes remain displayable after their last update, but trading actions are disabled when the backend marks the quote stale/non-tradable or its age exceeds 15 seconds.

### Verification checklist

- Sign in to the `myprop-trade` broker and confirm the login response supplies a feed token.
- Subscribe to `EURUSD`, `XAUUSD`, and `BTCUSD`; confirm bid/ask ticks arrive while their markets are open.
- Disable the network, restore it, and confirm the socket reconnects and resubscribes.
- Background the app for 30 seconds, return to it, and confirm prices resume.
- Confirm quote rows do not show feed source, authority, sequence, or age debug labels.
- Confirm an explicitly stale/non-tradable quote, or a quote older than 15 seconds, disables order actions without removing its last displayed price.

Run the focused automated checks with:

```powershell
npx.cmd --yes tsx --test src/api/feedAuth.test.ts src/api/ws/quoteTickNormalizer.test.ts src/api/ws/quoteSubscriptionState.test.ts src/features/quotes/liveQuoteSnapshot.test.ts src/market/quotePolicy.test.ts
npm.cmd run typecheck
```
