# Fix `positions.{LOGIN}` Identity and Snapshot Semantics

Use this prompt with the backend agent/developer who owns the authenticated positions WebSocket producer, pub/sub fan-out, and broker/MT5 position adapter.

## Mobile application context

This issue affects the **RTX5 Mobile App**, built with React Native/Expo for Android and iOS. Position state is shared by the mobile Trade screen and the position/order overlays displayed on the Chart screen. Therefore, a malformed realtime position identity can affect all of the following at once:

- The open-position count and total lots on the Trade screen.
- The individual open-position rows.
- The trade entry/SL/TP lines and labels on the Chart screen.
- Close and modify actions that require the canonical broker position ticket.

This is a backend-fix handoff. The mobile frontend now contains defensive containment so malformed realtime events cannot create hundreds of phantom positions, but that containment does not repair the producer contract. The backend must still emit a stable canonical position identity and unambiguous snapshot/incremental semantics. Do not request a mobile `.env` change or treat frontend polling as the backend fix.

### Current local mobile routing configuration

The following non-secret public routing values were verified from `rtx5-app/.env` on 2026-07-22. The file itself was not changed:

```text
EXPO_PUBLIC_API_BASE_URL=https://superbackend.orrnn.com/api/v2
EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL=https://superbackend.orrnn.com/api/v2
EXPO_PUBLIC_DEMO_API_BASE_URL=https://backend.orrnn.com/api/v1
```

Routing behavior relevant to this issue:

- The mobile app obtains broker records from `GET https://superbackend.orrnn.com/api/v2/broker/servers`.
- `superbackend.orrnn.com` is the shared platform/directory origin, not an automatic broker-session REST or WebSocket fallback.
- The exact HTTPS `server_url` in the selected broker directory row is retained as routing authority. The authenticated REST base is derived as `{server_url}/api/v2`; the corresponding authenticated realtime endpoints come from that validated broker session contract.
- `https://backend.orrnn.com/api/v1` is a separate public demo-service base and is not the source of the normal authenticated `positions.{LOGIN}` channel.
- A feed credential is configured locally but is intentionally omitted. Market-data credentials are unrelated to whether position events contain a canonical ticket, and no token or credential should appear in diagnostics.
- Candle-history environment options are also unrelated to position identity/snapshot semantics.

The backend team must first resolve the broker directory row and active broker session for account `200009`, then inspect that broker-specific `positions.200009` producer and fan-out path. Do not investigate only the shared directory host and assume it directly emits the authenticated position stream.

## How the mobile frontend works now

The current frontend position flow is:

1. The app bootstraps/reconciles the authoritative open ledger from `GET /api/v2/positions/{login}?limit=50&offset=0`.
2. It subscribes to the authenticated account channel `positions.{LOGIN}` for low-latency price, P/L, SL/TP, open, modify, and close updates.
3. REST position rows remain compatible with a legacy `id` alias because some existing deployments still return that shape.
4. Realtime ingress is intentionally stricter: a previously unseen position can be created only when it contains a positive canonical `ticket` or `position_ticket`.
5. A generic `id` or `order_ticket` may update an already-known canonical row only when its normalized value matches that known row. It cannot create a new open position.
6. Invalid/non-object rows and unseen generic identities are rejected from the mobile ledger. Rejection schedules a coalesced REST reconciliation instead of starting a request storm.
7. Only an explicitly marked, clean `positions.snapshot`, `positions.full`, `account.snapshot`, or equivalent authoritative envelope may replace the complete ledger.
8. `position.update`, `positions.update`, `delta`, `partial`, `scoped`, and unmarked/default arrays are merged incrementally; rows absent from them remain open.
9. Position merging preserves client-side pending/open/close convergence markers until the authoritative backend state confirms the mutation.
10. P/L and `price_current` changes do not change structural position identity. The Chart updates existing keyed overlay elements rather than deleting and recreating all trade lines on every tick.

### What the frontend fix now prevents

With 8 canonical positions at `0.01` lots each, a regression fixture sends 800 additional position-shaped realtime records containing distinct generic event IDs. Before the guard, those records deterministically produced `808 positions / 8.08 lots`. The current frontend rejects all 800 unsafe creations and remains at `8 positions / 0.08 lots` while requesting authoritative REST reconciliation.

This makes the mobile UI safe, but it must not be considered the backend resolution. Other clients, analytics consumers, and future mobile versions will remain exposed until the producer/fan-out schema is corrected.

## Confirmed issue

Account `200009` had 8 real open positions, each `0.01` lots. The mobile runtime transiently received the semantic equivalent of 800 additional incremental position-shaped records with distinct generic `id` values.

This deterministically changed the client ledger from:

- 8 open positions
- 0.08 total lots

to:

- 808 open positions
- 8.08 total lots

The canonical REST ledger is loaded from:

```http
GET /api/v2/positions/200009?limit=50&offset=0
```

The WebSocket subscription is:

```json
{"action":"subscribe","channel":"positions.200009"}
```

This is a backend `positions.{LOGIN}` producer/fan-out contract violation, not a chart/UI rendering issue. The mobile identity guard is defensive containment only and is not the root fix.

Evidence caveat: the exact raw offending WebSocket JSON was not persisted in the workspace. Capture the raw envelope safely on the backend during reproduction. The runtime state and regression fixture establish the failure semantics: 8 canonical position tickets followed by 800 unique generic event IDs produced exactly 808 rows / 8.08 lots before ingress validation.

The repository's canonical `Position` schema defines `ticket` as `int64`. `order_ticket` is a separate relationship on a Deal/Order and is not open-position identity.

## Canonical identity requirements

1. Every open-position entity must have one stable positive broker position ticket.
   - Canonical field: `ticket`
   - Temporary legacy alias, only if unavoidable: `position_ticket`
2. Repeated price, P/L, swap, commission, SL/TP, or lifecycle updates for one position must reuse the same position ticket.
3. A generic message/event `id` must never be serialized as position identity.
4. If an event needs its own identifier, keep it at envelope level as `event_id`.
5. `order_ticket` identifies an order relationship and must not be used as the open-position primary key.
6. Do not publish deals, trade-event history, audit rows, closed positions, or a retained pub/sub backlog as current open positions.
7. Deduplicate snapshot rows by canonical position ticket before publishing.
8. Every payload must carry the correct `account_login`, and cross-account rows must be rejected before fan-out.

## Required event shapes

### Full authoritative snapshot

```json
{
  "channel": "positions.200009",
  "type": "positions.snapshot",
  "snapshot": true,
  "sequence": 12345,
  "data": {
    "positions": [
      {
        "ticket": 1001116,
        "account_login": 200009,
        "symbol": "EURUSD",
        "side": "buy",
        "volume": 0.01,
        "price_open": 1.14095,
        "price_current": 1.14130,
        "profit": 0.35,
        "swap": 0,
        "commission": 0,
        "time_create": 1784667082
      }
    ]
  }
}
```

A snapshot must contain the complete current open-position ledger exactly once per ticket. Its ticket set must equal the corresponding REST response at the same committed state. Initial subscription and reconnect snapshots must be explicitly marked as authoritative.

### Incremental single-position update

```json
{
  "channel": "positions.200009",
  "type": "position.update",
  "event_id": "unique-event-id",
  "sequence": 12346,
  "data": {
    "position": {
      "ticket": 1001116,
      "account_login": 200009,
      "price_current": 1.14131,
      "profit": 0.36
    }
  }
}
```

An incremental update may omit unchanged fields, but `ticket` and `account_login` are mandatory.

### Incremental batch

```json
{
  "channel": "positions.200009",
  "type": "positions.update",
  "mode": "incremental",
  "sequence": 12347,
  "data": {
    "positions": [
      {
        "ticket": 1001116,
        "account_login": 200009,
        "price_current": 1.14131,
        "profit": 0.36
      }
    ]
  }
}
```

Rows missing from an incremental batch remain open. An incremental/scoped batch must never be labeled or interpreted as a full replacement.

### Close event

```json
{
  "channel": "positions.200009",
  "type": "position.closed",
  "event_id": "unique-event-id",
  "sequence": 12348,
  "data": {
    "position": {
      "ticket": 1001116,
      "account_login": 200009,
      "status": "closed"
    }
  }
}
```

The closed ticket must be the same canonical ticket used by REST and all prior realtime updates.

## Backend investigation required

Inspect:

1. The `positions.{LOGIN}` initial/reconnect snapshot query.
2. The source table/query and filters for account login plus open status.
3. P/L and current-price update serialization.
4. Event/message ID versus position-ticket field mapping.
5. Whether a generic pub/sub envelope is being flattened into the Position object.
6. Reconnect logic, retained-message behavior, consumer offsets, and backlog replay.
7. Whether full arrays are emitted without explicit `positions.snapshot` metadata.
8. Whether deals/history/audit events are mixed into the open-positions channel.
9. Whether multiple producers or subscriptions fan out the same update with new generic IDs.
10. Snapshot deduplication and monotonic sequence/version handling.

Add safe structured diagnostics containing:

- channel
- event type
- event ID
- canonical position ticket
- account login
- batch row count
- snapshot/incremental mode
- sequence/version
- producer and fan-out component

Never log JWTs, refresh tokens, broker passwords, or market-data credentials.

## Acceptance tests

1. Seed 8 open positions of `0.01` lots.
2. Confirm REST returns exactly 8 unique positive canonical tickets and `0.08` total lots.
3. Subscribe to `positions.{LOGIN}`.
4. Publish 100 price/P/L updates for each position: 800 incremental events total.
5. Assert the unique position-ticket set remains exactly 8 and total volume remains `0.08`.
6. Assert every incremental row includes the same stable ticket used by REST.
7. Assert distinct `event_id` values never change position count.
8. Assert a position row containing only generic `id` or only `order_ticket` fails schema validation and is not published.
9. Assert initial/reconnect snapshots are explicitly marked, deduplicated, and contain only current open positions with no historical backlog.
10. Place one new `0.01` order and assert REST plus WebSocket converge to exactly 9 positions / `0.09` lots.
11. Publish another 100 updates per position and assert the ledger remains 9 / `0.09`.
12. Modify SL/TP and assert the same canonical ticket is updated.
13. Close the new position and assert one terminal event uses that ticket; REST and the next snapshot converge to exactly 8 / `0.08`.
14. Verify another account cannot receive these rows.
15. Add a permanent regression fixture containing 8 canonical rows plus 800 distinct generic event IDs; backend output must contain only the 8 canonical position entities.
16. Test disconnect/reconnect and retained-message replay without count growth.

## Do not solve this by

- Increasing frontend polling.
- Relabeling every array as a full snapshot.
- Suppressing live position updates.
- Using `order_ticket` as position identity.
- Asking clients to retain or deduplicate arbitrary event IDs.
- Replaying position-event history as the current open-position ledger.

## Backend response requested

Return:

1. The confirmed producer/fan-out root cause.
2. A redacted example of the offending envelope before the fix and the corrected envelope after it.
3. Code/config changes made.
4. Tests added and complete results.
5. Deployment environment/version and timestamp.
6. Post-fix proof that REST, initial snapshot, live updates, reconnect, new position, modify, and close all retain one stable ticket per position.
7. Confirmation that no frontend or mobile `.env` change is required.
