import assert from 'node:assert/strict';
import test from 'node:test';
import { ENHANCED_DRAWING_TOOLS_JS } from './enhancedDrawingToolsString';

type ChartPoint = { x: number; y: number };
type ChartClickParam = { point: ChartPoint; time: number };
type WebViewMessage = {
  drawings?: Array<{ hidden?: boolean; kind: string; points: Array<{ price: number; time: number }> }>;
  tool?: string;
  type: string;
};

type Listener<T> = (payload: T) => void;

function createFakeChartEnvironment({
  nullCoordinateTimeFromX = Number.POSITIVE_INFINITY,
  touch = false,
}: { nullCoordinateTimeFromX?: number; touch?: boolean } = {}) {
  const clickListeners: Array<Listener<ChartClickParam>> = [];
  const moveListeners: Array<Listener<ChartClickParam>> = [];
  const messages: WebViewMessage[] = [];
  const appliedOptions: unknown[] = [];
  const priceScaleActions: unknown[] = [];
  const timeScaleActions: string[] = [];
  const attachedPrimitives: unknown[] = [];
  const detachedPrimitives: unknown[] = [];
  const hostListeners: Record<string, Array<Listener<any>>> = {};
  const createElement = () => {
    const element: any = {
      children: [] as any[],
      parentNode: null as any,
      style: {} as Record<string, string>,
      textContent: '',
      appendChild: (child: any) => {
        child.parentNode = element;
        element.children.push(child);
      },
      removeChild: (child: any) => {
        element.children = element.children.filter((item: any) => item !== child);
        child.parentNode = null;
      },
      setAttribute: (name: string, value: string) => {
        element[name] = value;
      },
    };
    return element;
  };
  const host = createElement();
  Object.assign(host, {
    addEventListener: (name: string, listener: Listener<any>) => {
      hostListeners[name] = [...(hostListeners[name] ?? []), listener];
    },
    getBoundingClientRect: () => ({ height: 320, left: 0, top: 0, width: 360 }),
    removeEventListener: (name: string, listener: Listener<any>) => {
      hostListeners[name] = (hostListeners[name] ?? []).filter((item) => item !== listener);
    },
  });

  const seriesData = Array.from({ length: 30 }, (_, index) => ({
    close: 4,
    high: 5,
    low: 1,
    open: 2,
    time: index + 1,
  }));
  const timeScale = {
    coordinateToLogical: (x: number) => x / 10,
    coordinateToTime: (x: number) => (x >= nullCoordinateTimeFromX ? null : Math.max(1, Math.round(x / 10))),
    fitContent: () => timeScaleActions.push('fitContent'),
    logicalToCoordinate: (logical: number) => logical * 10,
    scrollToRealTime: () => timeScaleActions.push('scrollToRealTime'),
    timeToCoordinate: (time: number) => (time > seriesData[seriesData.length - 1].time ? null : time * 10),
    timeToIndex: (time: number) => time,
  };
  const chart = {
    applyOptions: (options: unknown) => appliedOptions.push(options),
    priceScale: (id: string) => ({
      applyOptions: (options: unknown) => priceScaleActions.push({ id, options }),
    }),
    subscribeClick: (listener: Listener<ChartClickParam>) => {
      clickListeners.push(listener);
    },
    subscribeCrosshairMove: (listener: Listener<ChartClickParam>) => {
      moveListeners.push(listener);
    },
    timeScale: () => timeScale,
    unsubscribeClick: (listener: Listener<ChartClickParam>) => {
      const index = clickListeners.indexOf(listener);
      if (index >= 0) clickListeners.splice(index, 1);
    },
    unsubscribeCrosshairMove: (listener: Listener<ChartClickParam>) => {
      const index = moveListeners.indexOf(listener);
      if (index >= 0) moveListeners.splice(index, 1);
    },
  };
  const series = {
    attachPrimitive: (primitive: any) => {
      attachedPrimitives.push(primitive);
      if (typeof primitive.attached === 'function') {
        primitive.attached({ chart, requestUpdate: () => undefined, series });
      }
    },
    coordinateToPrice: (y: number) => 100 - y / 10,
    data: () => seriesData,
    dataByIndex: (index: number) => ({
      close: 4,
      high: 5,
      low: 1,
      open: 2,
      time: index,
    }),
    detachPrimitive: (primitive: any) => {
      detachedPrimitives.push(primitive);
      const index = attachedPrimitives.indexOf(primitive);
      if (index >= 0) attachedPrimitives.splice(index, 1);
      if (typeof primitive.detached === 'function') {
        primitive.detached();
      }
    },
    options: () => ({ priceFormat: { precision: 5 } }),
    priceToCoordinate: (price: number) => (100 - price) * 10,
  };

  const fakeWindow: any = {
    LightweightCharts: {
      CrosshairMode: {
        MagnetOHLC: 3,
        Normal: 0,
      },
    },
    ReactNativeWebView: {
      postMessage: (raw: string) => messages.push(JSON.parse(raw)),
    },
  };
  if (touch) {
    fakeWindow.ontouchstart = null;
  }

  (globalThis as any).window = fakeWindow;
  (globalThis as any).LightweightCharts = fakeWindow.LightweightCharts;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: touch ? { maxTouchPoints: 1 } : { maxTouchPoints: 0 },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: touch ? { createElement, getElementById: () => host } : undefined,
  });

  new Function(ENHANCED_DRAWING_TOOLS_JS)();
  const DrawingToolsManager = fakeWindow.DrawingToolsManager;
  const manager = new DrawingToolsManager(chart, series);

  const latestDrawings = () => {
    const drawingMessages = messages.filter((message) => message.type === 'DRAWINGS_CHANGED');
    return drawingMessages[drawingMessages.length - 1]?.drawings ?? [];
  };
  const listenerCounts = () => ({
    click: clickListeners.length,
    crosshairMove: moveListeners.length,
    touchCancel: hostListeners.touchcancel?.length ?? 0,
    touchEnd: hostListeners.touchend?.length ?? 0,
    touchMove: hostListeners.touchmove?.length ?? 0,
    touchStart: hostListeners.touchstart?.length ?? 0,
  });
  const toolsChanged = () => messages.filter((message) => message.type === 'TOOL_ACTIVE_CHANGED');
  const click = (x: number, y: number, time = Math.max(1, Math.round(x / 10))) => {
    clickListeners.slice().forEach((listener) => listener({ point: { x, y }, time }));
  };
  const move = (x: number, y: number, time = Math.max(1, Math.round(x / 10))) => {
    moveListeners.slice().forEach((listener) => listener({ point: { x, y }, time }));
  };
  const touchEvent = (x: number, y: number, identifier = 1, emptyChangedTouches = false) => {
    const touchPoint = { clientX: x, clientY: y, identifier };
    const event: any = {
      preventDefaultCalls: 0,
      stopImmediatePropagationCalls: 0,
      stopPropagationCalls: 0,
      changedTouches: emptyChangedTouches ? [] : [touchPoint],
      touches: [touchPoint],
    };
    event.preventDefault = () => { event.preventDefaultCalls += 1; };
    event.stopImmediatePropagation = () => { event.stopImmediatePropagationCalls += 1; };
    event.stopPropagation = () => { event.stopPropagationCalls += 1; };
    return event;
  };
  const touchStart = (x: number, y: number) => {
    const event = touchEvent(x, y);
    (hostListeners.touchstart ?? []).slice().forEach((listener) => listener(event));
    return event;
  };
  const touchMove = (x: number, y: number) => {
    const event = touchEvent(x, y);
    (hostListeners.touchmove ?? []).slice().forEach((listener) => listener(event));
    return event;
  };
  const touchEnd = (x: number, y: number, options: { emptyChangedTouches?: boolean } = {}) => {
    const event = touchEvent(x, y, 1, options.emptyChangedTouches === true);
    event.touches = [];
    (hostListeners.touchend ?? []).slice().forEach((listener) => listener(event));
    return event;
  };

  return {
    appliedOptions,
    attachedPrimitives,
    click,
    detachedPrimitives,
    host,
    latestDrawings,
    listenerCounts,
    manager,
    move,
    priceScaleActions,
    timeScaleActions,
    toolsChanged,
    touchEnd,
    touchMove,
    touchStart,
  };
}

function createFakeBitmapTarget() {
  const roundRects: Array<{ height: number; width: number; x: number; y: number }> = [];
  const lines: Array<{ x: number; y: number }> = [];
  const context = {
    arc: () => undefined,
    beginPath: () => undefined,
    fill: () => undefined,
    fillText: () => undefined,
    lineTo: (x: number, y: number) => lines.push({ x, y }),
    measureText: (text: string) => ({ width: text.length * 7 }),
    moveTo: () => undefined,
    restore: () => undefined,
    roundRect: (x: number, y: number, width: number, height: number) => {
      roundRects.push({ height, width, x, y });
    },
    save: () => undefined,
    stroke: () => undefined,
  };

  return {
    lines,
    roundRects,
    target: {
      useBitmapCoordinateSpace: (callback: (scope: any) => void) => callback({
        bitmapSize: { height: 320, width: 360 },
        context,
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
      }),
    },
  };
}

test('Crosshair stays passive and does not create drawing records', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('crosshair');
  harness.click(10, 100);
  harness.click(20, 90);

  assert.equal(harness.manager.getActiveTool(), 'crosshair');
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Crosshair touch mode keeps cursor overlay hidden without drawing records', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('crosshair');
  const startEvent = harness.touchStart(120, 140);
  const moveEvent = harness.touchMove(180, 140);
  const endEvent = harness.touchEnd(180, 140);

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.equal(overlay, undefined);
  assert.equal(harness.host.style.touchAction, 'manipulation');
  assert.equal(startEvent.preventDefaultCalls, 0);
  assert.equal(moveEvent.preventDefaultCalls, 0);
  assert.equal(endEvent.preventDefaultCalls, 0);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Trend Line creates a two-point line and returns to crosshair', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.move(20, 90);
  harness.click(20, 90);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(harness.manager.getActiveTool(), 'crosshair');
});

test('Trend Line supports direct mobile drag input without chart pan interference', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('trendline');
  const startEvent = harness.touchStart(10, 100);
  const moveEvent = harness.touchMove(40, 80);
  const endEvent = harness.touchEnd(40, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(harness.manager.getActiveTool(), 'crosshair');
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(moveEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
  assert.equal(harness.host.style.touchAction, 'manipulation');
});

test('Direct touch box tools commit in empty chart space even when touchend has no changed touch', () => {
  const harness = createFakeChartEnvironment({ nullCoordinateTimeFromX: 250, touch: true });

  harness.manager.setActiveTool('measure');
  harness.touchStart(20, 120);
  harness.touchEnd(20, 120, { emptyChangedTouches: true });
  harness.touchStart(320, 80);
  harness.touchEnd(320, 80, { emptyChangedTouches: true });

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'measure');
  assert.equal(drawings[0].points.length, 2);
  assert.ok(drawings[0].points[1].time > drawings[0].points[0].time);
  assert.notEqual(drawings[0].points[1].price, drawings[0].points[0].price);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.roundRects.some((rect) => rect.width > 250 && rect.height > 30));
});

test('Fib Zone creates a two-point box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fib');
  assert.equal(drawings[0].points.length, 2);
});

test('Highlight Box creates a two-point box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('brush');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].points.length, 2);
});

test('Text Label creates a one-point label drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('text');
  harness.click(10, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'text');
  assert.equal(drawings[0].points.length, 1);
});

test('Pattern Path creates a three-point polyline drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('patterns');
  harness.click(10, 100);
  harness.click(20, 90);
  harness.click(30, 95);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'patterns');
  assert.equal(drawings[0].points.length, 3);
});

test('Pitchfork direct touch commits three anchors in empty chart space', () => {
  const harness = createFakeChartEnvironment({ nullCoordinateTimeFromX: 250, touch: true });

  harness.manager.setActiveTool('pitchfork');
  harness.touchStart(20, 120);
  harness.touchEnd(20, 120, { emptyChangedTouches: true });
  harness.touchStart(160, 90);
  harness.touchEnd(160, 90, { emptyChangedTouches: true });
  harness.touchStart(320, 110);
  harness.touchEnd(320, 110, { emptyChangedTouches: true });

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'pitchfork');
  assert.equal(drawings[0].points.length, 3);
  assert.ok(drawings[0].points[2].time > drawings[0].points[1].time);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 3);
});

test('Long Position creates a two-point position box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('prediction');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'prediction');
  assert.equal(drawings[0].points.length, 2);
});

test('Pitchfork creates a three-point pitchfork drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('pitchfork');
  harness.click(10, 100);
  harness.click(20, 90);
  harness.click(30, 95);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'pitchfork');
  assert.equal(drawings[0].points.length, 3);
});

test('Sticker creates a one-point sticker drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('smiley');
  harness.click(10, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'smiley');
  assert.equal(drawings[0].points.length, 1);
});

test('Measure Range creates a two-point measurement box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('measure');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'measure');
  assert.equal(drawings[0].points.length, 2);
});

test('Serialized drawings restore each registered drawing tool through the runtime registry', async (t) => {
  const cases = [
    { kind: 'trendline', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'patterns', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'fib', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'brush', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'text', points: [{ time: 1, price: 90 }], text: 'TXT' },
    { kind: 'prediction', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'pitchfork', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'smiley', points: [{ time: 1, price: 90 }], text: ':)' },
    { kind: 'measure', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
  ];

  for (const restoreCase of cases) {
    await t.test(restoreCase.kind, () => {
      const harness = createFakeChartEnvironment();

      harness.manager.setSerializedDrawings([
        {
          hidden: true,
          id: `${restoreCase.kind}_saved`,
          kind: restoreCase.kind,
          label: `${restoreCase.kind} saved`,
          points: restoreCase.points,
          text: restoreCase.text,
        },
      ]);

      const drawings = harness.latestDrawings();
      assert.equal(drawings.length, 1);
      assert.equal(drawings[0].kind, restoreCase.kind);
      assert.equal(drawings[0].points.length, restoreCase.points.length);
      assert.equal(drawings[0].hidden, true);
    });
  }
});

test('Serialized drawings ignore unknown or incomplete drawing records safely', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    { id: 'unknown_saved', kind: 'unknown', label: 'Unknown', points: [{ time: 1, price: 90 }] },
    { id: 'trendline_incomplete', kind: 'trendline', label: 'Incomplete', points: [{ time: 1, price: 90 }] },
    { id: 'bad_price', kind: 'text', label: 'Bad Price', points: [{ time: 1, price: Number.NaN }] },
  ]);

  assert.deepEqual(harness.latestDrawings(), []);
});

test('Zoom To Fit delegates to chart time and price scale APIs', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.zoomToFit();

  assert.deepEqual(harness.timeScaleActions, ['fitContent', 'scrollToRealTime']);
  assert.deepEqual(harness.priceScaleActions, [{ id: 'right', options: { autoScale: true } }]);
});

test('Magnet Mode keeps the visible chart crosshair hidden', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setMagnetMode(true);
  harness.manager.setMagnetMode(false);

  const hiddenCrosshairOptions = {
    crosshair: {
      mode: 2,
      vertLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
      horzLine: { visible: false, labelVisible: false, color: 'transparent', width: 0 },
    },
  };

  assert.deepEqual(harness.appliedOptions.slice(-2), [
    hiddenCrosshairOptions,
    hiddenCrosshairOptions,
  ]);
});

test('Stay in Drawing Mode keeps the same tool active after completion', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setStayInDrawingMode(true);
  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);

  assert.equal(harness.manager.getActiveTool(), 'trendline');
  assert.equal(harness.latestDrawings().length, 1);
});

test('Lock All Drawings blocks selecting drawing tools until unlocked', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.manager.setDrawingsLocked(true);
  harness.manager.setActiveTool('trendline');

  assert.equal(harness.manager.getActiveTool(), 'crosshair');

  harness.manager.setDrawingsLocked(false);
  harness.manager.setActiveTool('trendline');

  assert.equal(harness.manager.getActiveTool(), 'trendline');
});

test('Hide All Drawings toggles persisted hidden state for existing drawings', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);
  harness.manager.setDrawingsHidden(true);

  assert.equal(harness.latestDrawings()[0].hidden, true);

  harness.manager.setDrawingsHidden(false);

  assert.equal(harness.latestDrawings()[0].hidden, false);
});

test('Clear Drawings removes drawings and returns to crosshair', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);
  harness.manager.removeAllDrawings();

  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.getActiveTool(), 'crosshair');
});

test('Repeated tool switching does not duplicate native chart listeners', () => {
  const harness = createFakeChartEnvironment();
  const initialCounts = harness.listenerCounts();

  for (let index = 0; index < 25; index += 1) {
    harness.manager.setActiveTool('trendline');
    harness.manager.setActiveTool('fib');
    harness.manager.setActiveTool('measure');
    harness.manager.setActiveTool('text');
    harness.manager.setActiveTool('crosshair');
  }

  assert.deepEqual(harness.listenerCounts(), initialCounts);

  harness.manager.remove();

  assert.deepEqual(harness.listenerCounts(), {
    click: 0,
    crosshairMove: 0,
    touchCancel: 0,
    touchEnd: 0,
    touchMove: 0,
    touchStart: 0,
  });
});

test('Direct touch bridge stays single-bound through repeated drawing activation', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  assert.deepEqual(harness.listenerCounts(), {
    click: 0,
    crosshairMove: 0,
    touchCancel: 1,
    touchEnd: 1,
    touchMove: 1,
    touchStart: 1,
  });

  for (let index = 0; index < 25; index += 1) {
    harness.manager.setActiveTool('trendline');
    harness.manager.setActiveTool('fib');
    harness.manager.setActiveTool('crosshair');
  }

  assert.deepEqual(harness.listenerCounts(), {
    click: 0,
    crosshairMove: 0,
    touchCancel: 1,
    touchEnd: 1,
    touchMove: 1,
    touchStart: 1,
  });

  harness.manager.remove();

  assert.deepEqual(harness.listenerCounts(), {
    click: 0,
    crosshairMove: 0,
    touchCancel: 0,
    touchEnd: 0,
    touchMove: 0,
    touchStart: 0,
  });
});
