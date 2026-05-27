S1-video MT5 grid measurement summary

Inputs:
- artifacts/mt5_grid_motion_recheck.mp4
- artifacts/mt5_left_right_20_swipes.mp4

Decoded frame size:
- 720 x 1640 px portrait.
- mt5_grid_motion_recheck.mp4: 33.12 fps, 28.05 s.
- mt5_left_right_20_swipes.mp4: 23.94 fps, 44.99 s.

Measured plot geometry:
- Plot/grid body: x=0..599, y=178..1348.
- Price-axis labels live to the right of the plot border, starting around x=606.
- Bottom trading strip begins at y=1380; bottom nav begins at y=1465.

Grid geometry:
- Vertical grid spacing: 56 px.
- Horizontal major grid lines: y=178, 296, 446, 596, 746, 896, 1046, 1196, 1348.
- Horizontal spacing: top-to-first inner line 118 px, then 150 px between inner major lines, final 152 px to bottom baseline.
- Baseline vertical example from leftright_t00.00_f00000.png:
  x=24, 80, 136, 192, 248, 304, 360, 416, 472, 528, 584.

Grid styling:
- Lines are 1 px light neutral gray, anti-aliased.
- Core sampled colors cluster around RGB 232-235 (#e8e8e8..#ebebeb); mean core sample RGB is about 236,236,236 (#ececec).
- Anti-aliased edge samples extend through about RGB 245 (#f5f5f5).
- Pattern is dashed/dotted: horizontal samples show mostly 6-8 px painted segments with roughly 5-7 px gaps. Vertical samples are also dashed, with interruptions where they intersect candles/wicks/text.

Motion behavior:
- Horizontal panning translates vertical grid lines with chart content; spacing remains 56 px and lines wrap at viewport edges.
- The horizontal major grid remains locked to y positions during horizontal scroll.
- No zoom-level change was observed in either recording: the 56 px vertical period and 150 px horizontal major period stayed constant.
- Redraw is per decoded frame at integer pixel positions. No fade, interpolation, or subpixel blur was observed; new vertical grid lines appear immediately at the entering edge when the phase wraps.

Selected vertical phases:
- leftright 0.00s: offset 24 -> 24 80 136 192 248 304 360 416 472 528 584
- leftright 6.00s: offset 42 -> 42 98 154 210 266 322 378 434 490 546
- leftright 18.00s: offset 5 -> 5 61 117 173 229 285 341 397 453 509 565
- leftright 44.00s: offset 28 -> 28 84 140 196 252 308 364 420 476 532 588
- grid 0.00s: offset 15 -> 15 71 127 183 239 295 351 407 463 519 575
- grid 2.00s: offset 35 -> 35 91 147 203 259 315 371 427 483 539 595
- grid 10.00s: offset 36 -> 36 92 148 204 260 316 372 428 484 540 596
- grid 26.00s: offset 12 -> 12 68 124 180 236 292 348 404 460 516 572

Artifacts:
- .codex-tmp/mt5_grid_measurements/grid_sample_contact_sheet.png
- .codex-tmp/mt5_grid_measurements/leftright_sample_contact_sheet.png
- .codex-tmp/mt5_grid_measurements/leftright_baseline_grid_annotated.png
- .codex-tmp/mt5_grid_measurements/selected_frame_grid_positions.csv
- .codex-tmp/mt5_grid_measurements/grid_grid_motion_measurements.csv
- .codex-tmp/mt5_grid_measurements/leftright_grid_motion_measurements.csv
