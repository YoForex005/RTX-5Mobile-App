# UI Parity Screen Map

This file maps each screenshot in `/Users/epic1st/Documents/rtx5 mobileapp/screenshots` to target frontend implementation scope and acceptance criteria.

| Screenshot | Target Screen | Components to Implement | Acceptance Criteria | Primary Phase |
|---|---|---|---|---|
| `IMG_3019.PNG` | Trade tab (XAU positions) | Summary header, positions list rows, tab shell | Metrics and rows match style and hierarchy | Phase 04 |
| `IMG_3020.PNG` | Settings hub | Grouped settings rows, account card, icons | Section groups and row affordances match | Phase 06 |
| `IMG_3024.PNG` | Trade tab (XAU variant) | Live values, position row formatting | Live values refresh and formatting parity | Phase 04 |
| `IMG_3025.PNG` | Trade tab (BTC list) | Dense positions list with red/blue PnL | Row spacing and PnL color semantics match | Phase 04 |
| `IMG_3026.PNG` | History positions | Segmented control, rows, totals footer | Positions tab and footer totals match | Phase 05 |
| `IMG_3027.PNG` | History filter modal | Date-range presets, symbol filter, report entry | Filter options and selected state parity | Phase 05 |
| `IMG_3028.PNG` | History orders | Orders list and status column | Orders rows reflect filled/canceled states | Phase 05 |
| `IMG_3029.PNG` | History sort menu | Sort sheet options and direction indicator | Sort menu fields match list and behavior | Phase 05 |
| `IMG_3030.PNG` | History deals | Deals rows and totals footer | Deals tab content and totals parity | Phase 05 |
| `IMG_3031.PNG` | Trade position context menu | Action sheet + expanded row details | Long-press opens correct action set | Phase 04 |
| `IMG_3032.PNG` | One-click trading terms | Legal modal, toggle, accept CTA | Trading shortcut blocked until accepted | Phase 04 |
| `IMG_3033.PNG` | Bulk operations full menu | Bulk ops sheet with symbol-specific actions | Full action list appears per position scope | Phase 04 |
| `IMG_3034.PNG` | Bulk operations compact menu | Reduced bulk actions + cancel | Compact variant renders correctly | Phase 04 |
| `IMG_3035.PNG` | Market execution ticket | Order type, lot step controls, SL/TP, Buy/Sell CTA | Market ticket fields, CTA layout, independent buy/sell pressed-side feedback, side-specific BUY/SELL success popup, uniform live execution graph guide spacing, compact right-axis label gap, lowest-guide value parity, and rounded pencil-style generated traces | Phase 04 |
| `IMG_3036.PNG` | Ticket order type menu | Expanded order type selector | All supported order types selectable | Phase 04 |
| `IMG_3037.PNG` | Pending order ticket (Buy Limit) | Pending ticket fields, draggable trigger graph, + Place CTA | Pending fields, trigger-line graph interaction, validation, and state parity | Phase 04 |
| `IMG_3038.PNG` | Stop limit ticket + expiration | Expiration options and stop-limit inputs | Expiration and stop-limit flows work | Phase 04 |
| `IMG_3039.PNG` | Chart base screen | Candle surface, axes, top tools, radial quick menu | Chart baseline layout, direct `SL/TP` toolbar affordance opening below the chart toolbar with a small heading gap while covering the `SELL / lot / BUY` footer area while open, the trade-sheet header keeps the symbol plus red `SL`, green `TP`, and blue arrow shortcuts visible, keyboard-active lot editing keeps the chart fixed while only `SELL / lot / BUY` lifts above the keyboard, independent buy/sell pressed-side feedback, side-specific BUY/SELL success popup, exclusive smooth on-chart trade-line dragging with stable candle scale and live right-axis value updates, active-tab pending-order labels, persistent `SL/TP` chart lines, uniform lower-guide spacing, compact right-axis label gap, lowest-guide value, and rounded pencil-style generated traces in the shared live execution graph, draggable radial/OHLC overlays, and drawing-tools popup match | Phase 03 |
| `IMG_3040.PNG` | Objects manager | Lock/hide controls, add object/text rows | Objects manager controls functional | Phase 03 |
| `IMG_3041.PNG` | Chart action sheet | Indicators/Objects/Settings actions | Action sheet opens from chart context | Phase 03 |
| `IMG_3042.PNG` | Chart timeframe bar | Timeframe quick-select row | Quick timeframe selection parity | Phase 03 |
| `IMG_3043.PNG` | Timeframe picker modal | Minute/hour/day options grid | Picker options and active state parity | Phase 03 |
| `IMG_3044.PNG` | Quotes list mode | Search bar, quote cards, bid/ask display | List mode rendering and updates match | Phase 02 |
| `IMG_3045.PNG` | Quotes context menu | Chart/Details/Statistics/Delete actions | Long-press menu options match exactly | Phase 02 |
| `IMG_3046.PNG` | Quotes table mode | Column headers and dense tabular rows | Table mode columns and data parity | Phase 02 |
| `IMG_3047.PNG` | Quotes edit/reorder mode | Edit controls and reorder handles | Edit state and reorder affordance match | Phase 02 |
| `IMG_3048.PNG` | Symbol details screen | Symbol metadata list and sessions section | Detail fields and session table parity | Phase 02 |
| `IMG_3049.PNG` | Quotes swipe actions | Swipe reveal with delete/stat action buttons | Swipe action behavior and visual match | Phase 02 |
| `IMG_3050.PNG` | Mailbox list | Message rows, unread indicator, timestamps | Mailbox rows and unread states parity | Phase 06 |
| `IMG_3051.PNG` | Account details | Account card, company row, action rows | Account details structure and actions parity | Phase 06 |
| `IMG_3052.PNG` | News list/categories | News feed rows with provider/timestamp | News list grouping and metadata parity | Phase 06 |
| `IMG_3053.PNG` | Brokers directory | Search, broker rows, info actions | Broker list search and row affordance parity | Phase 06 |

## Coverage Rule
Every implemented screen must reference at least one row in this map and at least one acceptance checklist item in the matching phase file.

