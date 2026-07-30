import assert from 'node:assert/strict';
import test from 'node:test';
import { ENHANCED_DRAWING_TOOLS_JS } from './enhancedDrawingToolsString';

type ChartPoint = { x: number; y: number };
type ChartClickParam = { point: ChartPoint; time: number };
type WebViewMessage = {
  active?: boolean;
  candle?: { close: number | null; high: number | null; low: number | null; open: number | null; time: number | null };
  drawings?: Array<any>;
  drawingActive?: boolean;
  recordId?: string;
  text?: string;
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
      addEventListener: () => undefined,
      appendChild: (child: any) => {
        child.parentNode = element;
        element.children.push(child);
      },
      focus: () => {
        element.focused = true;
      },
      removeChild: (child: any) => {
        element.children = element.children.filter((item: any) => item !== child);
        child.parentNode = null;
      },
      removeEventListener: () => undefined,
      select: () => {
        element.selectedText = true;
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
        Hidden: 2,
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
    value: touch
      ? {
        addEventListener: () => undefined,
        createElement,
        getElementById: () => host,
        removeEventListener: () => undefined,
      }
      : undefined,
  });

  new Function(ENHANCED_DRAWING_TOOLS_JS)();
  const DrawingToolsManager = fakeWindow.DrawingToolsManager;
  const manager = new DrawingToolsManager(chart, series);

  const drawingMessages = () => messages.filter((message) => message.type === 'DRAWINGS_CHANGED');
  const latestDrawings = () => {
    const drawingMessageList = drawingMessages();
    return drawingMessageList[drawingMessageList.length - 1]?.drawings ?? [];
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
  const crosshairMessages = () => messages.filter((message) => message.type === 'CHART_CROSSHAIR_CANDLE');
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
    crosshairMessages,
    detachedPrimitives,
    drawingMessages,
    host,
    latestDrawings,
    listenerCounts,
    manager,
    messages,
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
  const ellipses: Array<{ centerX: number; centerY: number; radiusX: number; radiusY: number }> = [];
  const fillRects: Array<{ height: number; width: number; x: number; y: number }> = [];
  const moves: Array<{ x: number; y: number }> = [];
  const roundRects: Array<{ height: number; width: number; x: number; y: number }> = [];
  const texts: Array<{ text: string; x: number; y: number }> = [];
  const lines: Array<{ x: number; y: number }> = [];
  const context = {
    arc: () => undefined,
    beginPath: () => undefined,
    clip: () => undefined,
    ellipse: (centerX: number, centerY: number, radiusX: number, radiusY: number) => {
      ellipses.push({ centerX, centerY, radiusX, radiusY });
    },
    fill: () => undefined,
    fillRect: (x: number, y: number, width: number, height: number) => {
      fillRects.push({ height, width, x, y });
    },
    fillText: (text: string, x: number, y: number) => {
      texts.push({ text, x, y });
    },
    lineTo: (x: number, y: number) => lines.push({ x, y }),
    measureText: (text: string) => ({ width: text.length * 7 }),
    moveTo: (x: number, y: number) => moves.push({ x, y }),
    rect: () => undefined,
    restore: () => undefined,
    roundRect: (x: number, y: number, width: number, height: number) => {
      roundRects.push({ height, width, x, y });
    },
    save: () => undefined,
    setLineDash: () => undefined,
    stroke: () => undefined,
  };

  return {
    ellipses,
    fillRects,
    lines,
    moves,
    roundRects,
    texts,
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

test('Crosshair touch mode shows and locks the professional cursor overlay without drawing records', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('crosshair');
  const startEvent = harness.touchStart(120, 140);
  const endEvent = harness.touchEnd(120, 140);
  harness.click(120, 140);

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  assert.equal(overlay.style.display, 'block');
  assert.ok(overlay.children.some((child: any) => child.textContent === 'LOCK'));
  // Crosshair mode locks touch-action so the WebView never claims a drawing
  // drag-edit as a native gesture (which fired pointercancel mid-drag).
  assert.equal(harness.host.style.touchAction, 'none');
  assert.equal(startEvent.preventDefaultCalls, 0);
  assert.equal(endEvent.preventDefaultCalls, 0);
  assert.equal(harness.latestDrawings().length, 0);
  assert.ok(harness.crosshairMessages().some((message) => message.active === true));
  assert.deepEqual(harness.latestDrawings(), []);

  harness.touchStart(120, 140);
  harness.touchMove(124, 144);
  harness.touchEnd(124, 144);
  harness.click(124, 144);

  assert.equal(overlay.style.display, 'none');
  assert.ok(harness.crosshairMessages().some((message) => message.active === false));
});

test('No drawing tool selected leaves chart touches passive and hides drawing UI', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  assert.equal(harness.manager.getActiveTool(), 'none');
  const startEvent = harness.touchStart(120, 140);
  const moveEvent = harness.touchMove(124, 144);
  const endEvent = harness.touchEnd(124, 144);
  harness.move(124, 144);
  harness.click(124, 144);

  assert.equal(startEvent.preventDefaultCalls, 0);
  assert.equal(moveEvent.preventDefaultCalls, 0);
  assert.equal(endEvent.preventDefaultCalls, 0);
  assert.equal(harness.host.style.touchAction, 'none');
  assert.equal(harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true'), undefined);
  assert.deepEqual(harness.crosshairMessages(), []);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Magnet mode snaps drawing anchors to nearby OHLC prices', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({
    snap: { enabled: true, type: 'ohlc-nearest', thresholdPx: 18 },
  });
  harness.manager.setActiveTool('trendline');
  harness.click(10, 954);
  harness.click(20, 954);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points[0].price, 5);
  assert.equal(drawings[0].points[1].price, 5);
});

test('Serialized drawings stay visible regardless of the selected drawing tool', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_saved',
      kind: 'textLevel',
      label: 'Entry',
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
    },
    {
      hidden: false,
      id: 'fib_saved',
      kind: 'fib',
      label: 'Fib',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
    },
  ]);

  const textLevelPrimitive: any = harness.attachedPrimitives[0];
  const fibPrimitive: any = harness.attachedPrimitives[1];
  // TradingView parity: restored drawings render immediately, before any
  // drawing tool is armed.
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);
  assert.equal(harness.latestDrawings().length, 2);
  assert.equal(harness.latestDrawings()[0].hidden, false);

  harness.manager.setActiveTool('textLevel');
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);

  harness.manager.setActiveTool('fib');
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);

  harness.manager.setActiveTool('none');
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);

  harness.manager.setDrawingsHidden(true);
  assert.equal(textLevelPrimitive._options.visible, false);
  assert.equal(fibPrimitive._options.visible, false);

  harness.manager.setDrawingsHidden(false);
  assert.equal(textLevelPrimitive._options.visible, true);
  assert.equal(fibPrimitive._options.visible, true);
});

test('Trend Line creates a two-point line and keeps only that tool selected', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.move(20, 90);
  harness.click(20, 90);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'trendline');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].type, 'trendline');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].style.color, '#2962FF');
  assert.equal(typeof drawings[0].createdAt, 'number');
  assert.equal(typeof drawings[0].updatedAt, 'number');
  assert.equal(harness.manager.getActiveTool(), 'trendline');
  const toolMessages = harness.toolsChanged();
  assert.equal(toolMessages[toolMessages.length - 1]?.drawingActive, false);
});

test('Trend Line can be selected and deleted from crosshair mode', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(20, 90);
  harness.manager.setActiveTool('crosshair');
  (harness.manager as any)._ignoreCrosshairClickUntil = 0;
  harness.click(15, 95);

  assert.equal(harness.latestDrawings()[0].selected, true);
  (harness.manager as any)._handleKeyDown({ key: 'Delete', preventDefault: () => undefined });

  assert.equal(harness.latestDrawings().length, 0);
});

test('Trend Line direct mobile editing moves endpoints and whole lines without React move spam', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('trendline');
  harness.touchStart(10, 100);
  harness.touchMove(100, 60);
  harness.touchEnd(100, 60);
  assert.equal(harness.latestDrawings().length, 1);

  harness.manager.setActiveTool('crosshair');
  harness.touchStart(10, 100);
  const messagesBeforeEndpointMove = harness.drawingMessages().length;
  harness.touchMove(20, 110);
  assert.equal(harness.drawingMessages().length, messagesBeforeEndpointMove);
  harness.touchEnd(20, 110);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].points[0].time, 2);
  assert.equal(drawings[0].points[0].price, 89);
  assert.equal(drawings[0].points[1].time, 10);
  assert.equal(drawings[0].points[1].price, 94);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  harness.touchStart(60, 85);
  const messagesBeforeBodyMove = harness.drawingMessages().length;
  harness.touchMove(70, 95);
  assert.equal(harness.drawingMessages().length, messagesBeforeBodyMove);
  harness.touchEnd(70, 95);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 3);
  assert.equal(drawings[0].points[0].price, 88);
  assert.equal(drawings[0].points[1].time, 11);
  assert.equal(drawings[0].points[1].price, 93);
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
  assert.equal(harness.manager.getActiveTool(), 'trendline');
  const toolMessages = harness.toolsChanged();
  assert.equal(toolMessages[toolMessages.length - 1]?.drawingActive, false);
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(moveEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
  assert.equal(harness.host.style.touchAction, 'none');
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

  harness.manager.setActiveTool('measure');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.roundRects.some((rect) => rect.width > 250 && rect.height > 30));
});

test('Fibonacci Retracement creates standard 0-1 retracement levels without default zones', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({ symbol: 'BTCUSD', timeframe: 'M1' });
  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fib');
  assert.equal(drawings[0].type, 'fibRetracement');
  assert.equal(drawings[0].symbol, 'BTCUSD');
  assert.equal(drawings[0].timeframe, 'M1');
  assert.equal(drawings[0].points.length, 2);
  assert.ok(drawings[0].levels.some((level: any) => level.value === 0.618));
  assert.ok(drawings[0].levels.some((level: any) => level.value === 0.786));
  assert.equal(drawings[0].levels.some((level: any) => level.value === 0.65), false);
  assert.equal(drawings[0].levels.some((level: any) => level.value > 1), false);
  assert.equal(drawings[0].goldenPocket.enabled, false);
  assert.equal(drawings[0].extendMode, 'none');

  harness.manager.setActiveTool('fib');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const prices = primitive.getLevelPrices();
  assert.equal(prices.find((level: any) => level.value === 0).price, 90);
  assert.equal(prices.find((level: any) => level.value === 0.5).price, 91);
  assert.equal(prices.find((level: any) => level.value === 1).price, 92);
  assert.equal(Number(prices.find((level: any) => level.value === 0.618).price.toFixed(3)), 91.236);
  assert.equal(Number(prices.find((level: any) => level.value === 0.786).price.toFixed(3)), 91.572);

  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);
  assert.ok(drawTarget.fillRects.length > 0);
  assert.ok(drawTarget.lines.length >= drawings[0].levels.length);
});

test('Fibonacci Retracement stacks crowded horizontal level labels without overlap', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 300);
  harness.click(30, 310);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);

  const labelRects = drawTarget.roundRects.filter((rect) => rect.width > 24 && rect.height > 8);
  assert.ok(labelRects.length >= 5);
  const sorted = labelRects.slice().sort((a, b) => a.y - b.y);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    assert.ok(current.y >= previous.y + previous.height);
  }
});

test('Fibonacci Retracement calculates bearish direction accurately on restore', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    id: 'fib_bearish',
    kind: 'fib',
    label: 'Bearish Fib',
    points: [{ time: 1, price: 200 }, { time: 3, price: 100 }],
  }]);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const prices = primitive.getLevelPrices();
  assert.equal(prices.find((level: any) => level.value === 0).price, 200);
  assert.equal(prices.find((level: any) => level.value === 0.5).price, 150);
  assert.equal(prices.find((level: any) => level.value === 1).price, 100);
  assert.equal(Number(prices.find((level: any) => level.value === 0.618).price.toFixed(1)), 138.2);
  assert.equal(prices.some((level: any) => level.value > 1), false);
});

test('Fibonacci Retracement supports mobile anchor and body editing without React move spam', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('fib');
  harness.touchStart(10, 100);
  harness.touchMove(120, 60);
  harness.touchEnd(120, 60);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fib');

  harness.manager.setActiveTool('crosshair');
  harness.touchStart(120, 60);
  const messagesBeforeAnchorMove = harness.drawingMessages().length;
  harness.touchMove(130, 70);
  assert.equal(harness.drawingMessages().length, messagesBeforeAnchorMove);
  harness.touchEnd(130, 70);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].points[1].time, 13);
  assert.equal(drawings[0].points[1].price, 93);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal((harness.manager as any)._hitTestEditableDrawingAtPoint({ x: 70, y: 85 })?.part, 'body');

  harness.touchStart(70, 85);
  const messagesBeforeBodyMove = harness.drawingMessages().length;
  harness.touchMove(80, 95);
  assert.equal(harness.drawingMessages().length, messagesBeforeBodyMove);
  harness.touchEnd(80, 95);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 2);
  assert.equal(drawings[0].points[0].price, 89);
  assert.equal(drawings[0].points[1].time, 14);
  assert.equal(drawings[0].points[1].price, 92);
});

test('Highlight Box creates a two-point box drawing with persistence metadata', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('brush');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].type, 'highlightBox');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].label, 'Highlight');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].extendUntil, 'none');
  assert.equal(drawings[0].zoneType, 'neutral');
  assert.equal(drawings[0].style.fillColor, 'rgba(41, 98, 255, 0.15)');
  assert.equal(drawings[0].style.borderColor, '#2962FF');
  assert.deepEqual(drawings[0].alertMetadata.supportedEvents, [
    'enter-zone',
    'exit-zone',
    'touch-top',
    'touch-bottom',
    'close-inside',
    'close-beyond',
  ]);
  assert.equal(drawings[0].alertMetadata.priceTop, 92);
  assert.equal(drawings[0].alertMetadata.priceBottom, 90);
  assert.equal(typeof drawings[0].createdAt, 'number');
  assert.equal(typeof drawings[0].updatedAt, 'number');
  assert.equal(harness.manager.getActiveTool(), 'brush');
});

test('Rectangle creates a separate two-point shape drawing without highlight metadata', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('rectangle');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'rectangle');
  assert.equal(drawings[0].type, 'rectangle');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].label, 'Rectangle');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].zoneType, undefined);
  assert.equal(drawings[0].extendUntil, undefined);
  assert.equal(drawings[0].alertMetadata, undefined);
  assert.equal(drawings[0].style.fillColor, 'rgba(100, 116, 139, 0.12)');
  assert.equal(drawings[0].style.borderColor, '#64748B');
  assert.equal(drawings[0].style.showLabel, false);
  assert.equal(harness.manager.getActiveTool(), 'rectangle');
});

test('Rectangle restore keeps shape styling independent from Highlight Box records', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      id: 'saved_rectangle',
      kind: 'rectangle',
      label: 'Rectangle saved',
      points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
      style: {
        borderColor: '#334155',
        borderStyle: 'dashed',
        fillColor: 'rgba(51, 65, 85, 0.12)',
        showLabel: true,
      },
      type: 'rectangle',
    },
    {
      id: 'saved_highlight',
      kind: 'brush',
      label: 'Demand zone',
      points: [{ time: 2, price: 88 }, { time: 4, price: 92 }],
      type: 'highlightBox',
      zoneType: 'demand',
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 2);
  assert.equal(drawings[0].kind, 'rectangle');
  assert.equal(drawings[0].type, 'rectangle');
  assert.equal(drawings[0].zoneType, undefined);
  assert.equal(drawings[0].style.borderStyle, 'dashed');
  assert.equal(drawings[1].kind, 'brush');
  assert.equal(drawings[1].type, 'highlightBox');
  assert.equal(drawings[1].zoneType, 'demand');

  const primitive: any = harness.attachedPrimitives[0];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 45, y: 70 }, { isTouch: false })?.part, 'body');
});

test('Circle / Ellipse creates a separate two-point oval drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('ellipse');
  harness.click(10, 120);
  harness.move(70, 60);
  harness.click(70, 60);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'ellipse');
  assert.equal(drawings[0].type, 'ellipse');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].label, 'Circle / Ellipse');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].zoneType, undefined);
  assert.equal(drawings[0].extendUntil, undefined);
  assert.equal(drawings[0].alertMetadata, undefined);
  assert.equal(drawings[0].style.fillColor, 'rgba(139, 92, 246, 0.12)');
  assert.equal(drawings[0].style.borderColor, '#8B5CF6');
  assert.equal(drawings[0].style.showLabel, false);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.equal(drawTarget.ellipses.length, 1);
  assert.equal(primitive.hitTest({ x: 40, y: 90 }, { isTouch: false })?.part, 'body');
});

test('Circle / Ellipse restore keeps oval styling and resize handles', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      id: 'saved_ellipse',
      kind: 'ellipse',
      label: 'Ellipse saved',
      points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
      style: {
        borderColor: '#7C3AED',
        borderStyle: 'dashed',
        fillColor: 'rgba(124, 58, 237, 0.12)',
        showLabel: true,
      },
      type: 'ellipse',
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'ellipse');
  assert.equal(drawings[0].type, 'ellipse');
  assert.equal(drawings[0].style.borderStyle, 'dashed');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  assert.equal(primitive.getHandleCoordinates().length, 8);
  assert.equal(primitive.hitTest({ x: 10, y: 100 }, { isTouch: false })?.part, 'bottom-left');
});

test('Freehand Brush creates and restores a multi-point path', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('freehand');
  harness.click(10, 100);
  harness.move(20, 94);
  harness.move(30, 98);
  harness.move(40, 90);
  harness.click(50, 88);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'freehand');
  assert.equal(drawings[0].type, 'freehand');
  assert.equal(drawings[0].label, 'Freehand Brush 1');
  assert.equal(drawings[0].points.length, 5);
  assert.equal(drawings[0].style.color, '#EC4899');
  assert.equal(drawings[0].style.width, 3);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 4);
  assert.equal(primitive.hitTest({ x: 30, y: 98 }, { isTouch: false })?.part, 'body');

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'freehand_saved',
      kind: 'freehand',
      label: 'Saved path',
      points: drawings[0].points,
      style: { color: '#BE185D', lineStyle: 'dashed', width: 4 },
      type: 'freehand',
    },
  ]);

  drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'freehand');
  assert.equal(drawings[0].points.length, 5);
  assert.equal(drawings[0].style.lineStyle, 'dashed');
});

test('Freehand Brush supports direct mobile drag creation without trimming path points', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('freehand');
  const startEvent = harness.touchStart(10, 100);
  harness.touchMove(20, 96);
  harness.touchMove(30, 94);
  harness.touchMove(40, 92);
  const endEvent = harness.touchEnd(50, 90);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'freehand');
  assert.ok(drawings[0].points.length >= 5);
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
});

test('Highlight Box restore preserves serialized zone metadata and alert settings', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    alertMetadata: {
      id: 'supply-alert-1',
      supportedEvents: ['enter-zone'],
      triggerOnce: true,
    },
    createdAt: 1000,
    extendMode: 'right',
    extendUntil: 'price-touch',
    hidden: true,
    id: 'supply_zone_saved',
    kind: 'brush',
    label: 'London supply',
    locked: true,
    paneId: 'main',
    points: [{ time: 1, price: 95 }, { time: 4, price: 90 }],
    selected: true,
    style: {
      borderColor: '#EF5350',
      borderStyle: 'dashed',
      fillColor: 'rgba(239, 83, 80, 0.14)',
      showMidline: true,
    },
    type: 'highlightBox',
    updatedAt: 2000,
    zoneType: 'supply',
  }]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].id, 'supply_zone_saved');
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].type, 'highlightBox');
  assert.equal(drawings[0].label, 'London supply');
  assert.equal(drawings[0].zoneType, 'supply');
  assert.equal(drawings[0].extendMode, 'right');
  assert.equal(drawings[0].extendUntil, 'price-touch');
  assert.equal(drawings[0].hidden, true);
  assert.equal(drawings[0].locked, true);
  assert.equal(drawings[0].selected, true);
  assert.equal(drawings[0].createdAt, 1000);
  assert.equal(drawings[0].updatedAt, 2000);
  assert.deepEqual(drawings[0].alertMetadata, {
    id: 'supply-alert-1',
    supportedEvents: ['enter-zone'],
    triggerOnce: true,
  });
  assert.equal(drawings[0].style.borderStyle, 'dashed');
  assert.equal(drawings[0].style.showMidline, true);
});

test('Highlight Box right extension renders to the pane edge without moving anchors', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    extendMode: 'right',
    id: 'extended_demand_zone',
    kind: 'brush',
    label: 'Extended demand',
    points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
    style: { showLabel: false },
    type: 'highlightBox',
    zoneType: 'demand',
  }]);

  harness.manager.setActiveTool('brush');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const renderer = primitive.paneViews()[0].renderer();
  const drawTarget = createFakeBitmapTarget();
  renderer.draw(drawTarget.target);

  const geometry = primitive.getGeometry();
  assert.deepEqual(primitive.getPoints(), [{ time: 1, price: 90 }, { time: 8, price: 96 }]);
  assert.equal(geometry.anchorRect.anchorLeft, 10);
  assert.equal(geometry.anchorRect.anchorRight, 80);
  assert.equal(geometry.visibleRect.left, 10);
  assert.equal(geometry.visibleRect.right, 360);
  assert.ok(drawTarget.roundRects.some((rect) => rect.x === 10 && rect.width >= 349));
});

test('Highlight Box hit testing prefers handles over body and extended fill', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    extendMode: 'right',
    id: 'editable_box',
    kind: 'brush',
    label: 'Editable Box',
    points: [{ time: 1, price: 90 }, { time: 8, price: 96 }],
    selected: true,
    style: { showLabel: false },
    type: 'highlightBox',
  }]);

  harness.manager.setActiveTool('brush');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const hitContext = { isTouch: false, manager: harness.manager };
  assert.equal(primitive.hitTest({ x: 10, y: 40 }, hitContext)?.part, 'top-left');
  assert.equal(primitive.hitTest({ x: 45, y: 70 }, hitContext)?.part, 'body');
  assert.equal(primitive.hitTest({ x: 200, y: 70 }, hitContext)?.part, 'body');
});

test('Highlight Box edge and corner resize math updates only the intended boundaries', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([{
    id: 'resize_math_box',
    kind: 'brush',
    label: 'Resize Math',
    points: [{ time: 5, price: 90 }, { time: 1, price: 100 }],
    type: 'highlightBox',
  }]);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const originalPoints = [{ time: 5, price: 90 }, { time: 1, price: 100 }];

  assert.deepEqual(
    primitive.buildEditPoints('top-left', originalPoints, originalPoints[1], { time: 2, price: 110 }),
    [{ time: 5, price: 90 }, { time: 2, price: 110 }],
  );
  assert.deepEqual(
    primitive.buildEditPoints('right', originalPoints, originalPoints[0], { time: 7, price: 95 }),
    [{ time: 7, price: 90 }, { time: 1, price: 100 }],
  );
  assert.deepEqual(
    primitive.buildEditPoints('bottom', originalPoints, originalPoints[0], { time: 3, price: 80 }),
    [{ time: 5, price: 80 }, { time: 1, price: 100 }],
  );
});

test('Highlight Box direct mobile drag creation and resize avoid React move spam', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('brush');
  const startEvent = harness.touchStart(10, 100);
  const messagesBeforeCreateMove = harness.drawingMessages().length;
  const moveEvent = harness.touchMove(80, 40);
  assert.equal(harness.drawingMessages().length, messagesBeforeCreateMove);
  const endEvent = harness.touchEnd(80, 40);

  let drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'brush');
  assert.equal(drawings[0].type, 'highlightBox');
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].points[1].time, 8);
  assert.equal(drawings[0].points[1].price, 96);
  assert.equal(startEvent.preventDefaultCalls, 1);
  assert.equal(moveEvent.preventDefaultCalls, 1);
  assert.equal(endEvent.preventDefaultCalls, 1);
  assert.equal(harness.manager.getActiveTool(), 'brush');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  harness.manager.setActiveTool('crosshair');
  const editStartEvent = harness.touchStart(80, 40);
  const messagesBeforeResizeMove = harness.drawingMessages().length;
  const editMoveEvent = harness.touchMove(90, 30);
  assert.equal(harness.drawingMessages().length, messagesBeforeResizeMove);
  const editEndEvent = harness.touchEnd(90, 30);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].points[1].time, 9);
  assert.equal(drawings[0].points[1].price, 97);
  assert.equal(editStartEvent.preventDefaultCalls, 1);
  assert.equal(editMoveEvent.preventDefaultCalls, 1);
  assert.equal(editEndEvent.preventDefaultCalls, 1);

  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const bodyStartEvent = harness.touchStart(45, 70);
  const messagesBeforeBodyMove = harness.drawingMessages().length;
  const bodyMoveEvent = harness.touchMove(55, 60);
  assert.equal(harness.drawingMessages().length, messagesBeforeBodyMove);
  const bodyEndEvent = harness.touchEnd(55, 60);

  drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 2);
  assert.equal(drawings[0].points[0].price, 91);
  assert.equal(drawings[0].points[1].time, 10);
  assert.equal(drawings[0].points[1].price, 98);
  assert.equal(bodyStartEvent.preventDefaultCalls, 1);
  assert.equal(bodyMoveEvent.preventDefaultCalls, 1);
  assert.equal(bodyEndEvent.preventDefaultCalls, 1);
});

test('Text Label creates a one-point label drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('text');
  harness.click(10, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'text');
  assert.equal(drawings[0].points.length, 1);
  assert.equal(drawings[0].style.textColor, '#FFFFFF');
});

test('Show object descriptions does not hide Text Label or Sticker object content', () => {
  for (const tool of ['text', 'smiley']) {
    const harness = createFakeChartEnvironment();
    harness.manager.setActiveTool(tool);
    harness.click(10, 100);
    const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
    const renderTexts = () => {
      primitive.updateAllViews();
      const drawTarget = createFakeBitmapTarget();
      primitive.paneViews()[0].renderer().draw(drawTarget.target);
      return drawTarget.texts;
    };

    assert.ok(renderTexts().length > 0);
    harness.manager.setShowObjectDescriptions(false);
    assert.ok(renderTexts().length > 0);
  }
});

test('Text Level creates a snapped one-point price level drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({ symbol: 'GBPUSD', timeframe: 'M5' });
  harness.manager.setActiveTool('textLevel');
  harness.click(120, 100, 12);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'textLevel');
  assert.equal(drawings[0].type, 'textLevel');
  assert.equal(drawings[0].symbol, 'GBPUSD');
  assert.equal(drawings[0].timeframe, 'M5');
  assert.equal(drawings[0].points.length, 1);
  assert.equal(drawings[0].points[0].time, 12);
  assert.equal(drawings[0].points[0].price, 90);
  assert.equal(drawings[0].text, 'Level');
  assert.equal(drawings[0].levelLine.enabled, true);
  assert.equal(drawings[0].levelLine.extendMode, 'right');
  assert.equal(drawings[0].labelPosition, 'right');
  assert.equal(drawings[0].showPrice, true);
  assert.equal(drawings[0].showPriceAxisLabel, true);
  assert.equal(drawings[0].levelType, 'neutral');
  assert.deepEqual(drawings[0].labelOffset, { x: 0, y: 0 });

  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.priceAxisViews()[0].text(), '90.00000');
  assert.ok(primitive.getGeometry().labelBox.width > 0);
});

test('Show object descriptions hides Text Level labels without changing its saved options', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setSerializedDrawings([{
    id: 'text-level-description-test',
    kind: 'textLevel',
    label: 'Entry',
    points: [{ time: 1, price: 90 }],
    text: 'Entry',
    levelLine: {
      enabled: true,
      extendMode: 'right',
      lineColor: '#2962FF',
      lineStyle: 'solid',
      lineWidth: 1,
      opacity: 0.9,
    },
    showPrice: false,
    showPriceAxisLabel: true,
  }]);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const renderTexts = () => {
    primitive.updateAllViews();
    const drawTarget = createFakeBitmapTarget();
    primitive.paneViews()[0].renderer().draw(drawTarget.target);
    return drawTarget.texts;
  };
  const priceAxisView = primitive.priceAxisViews()[0];
  const labelBox = primitive.getGeometry().labelBox;
  const labelCenter = {
    x: (labelBox.left + labelBox.right) / 2,
    y: (labelBox.top + labelBox.bottom) / 2,
  };

  assert.ok(renderTexts().length > 0);
  assert.equal(priceAxisView.visible(), true);
  assert.equal(primitive.hitTest(labelCenter, { isTouch: false })?.part, 'label');

  harness.manager.setShowObjectDescriptions(false);
  assert.equal(renderTexts().length, 0);
  assert.equal(priceAxisView.visible(), false);
  assert.notEqual(primitive.hitTest(labelCenter, { isTouch: false })?.part, 'label');

  harness.manager.setShowObjectDescriptions(true);
  assert.ok(renderTexts().length > 0);
  assert.equal(priceAxisView.visible(), true);
  assert.equal(primitive.hitTest(labelCenter, { isTouch: false })?.part, 'label');
  assert.equal(primitive._options.showPrice, false);
  assert.equal(primitive._options.showPriceAxisLabel, true);
});

test('Text Level touch drag moves the level price without changing its time anchor', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_saved',
      kind: 'textLevel',
      label: 'Entry',
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
      levelLine: { enabled: true, extendMode: 'right', lineColor: '#2962FF', lineWidth: 1, lineStyle: 'solid', opacity: 0.9 },
      showPriceAxisLabel: true,
    },
  ]);
  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  harness.touchStart(180, 100);
  const messagesBeforeMove = harness.drawingMessages().length;
  harness.touchMove(180, 80);
  assert.equal(harness.drawingMessages().length, messagesBeforeMove);
  harness.touchEnd(180, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 92);
});

test('Text Level touch drag on the label stores label offset without moving the level', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_label_saved',
      kind: 'textLevel',
      label: 'Entry',
      labelOffset: { x: 0, y: 0 },
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
      levelLine: { enabled: true, extendMode: 'right', lineColor: '#2962FF', lineWidth: 1, lineStyle: 'solid', opacity: 0.9 },
      showPriceAxisLabel: true,
    },
  ]);
  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const labelBox = primitive.getGeometry().labelBox;
  const labelX = (labelBox.left + labelBox.right) / 2;
  const labelY = (labelBox.top + labelBox.bottom) / 2;

  harness.touchStart(labelX, labelY);
  const messagesBeforeMove = harness.drawingMessages().length;
  harness.touchMove(labelX - 30, labelY + 20);
  assert.equal(harness.drawingMessages().length, messagesBeforeMove);
  harness.touchEnd(labelX - 30, labelY + 20);

  const drawings = harness.latestDrawings();
  assert.equal(drawings[0].points[0].time, 1);
  assert.equal(drawings[0].points[0].price, 90);
  assert.ok(drawings[0].labelOffset.x < 0);
  assert.ok(drawings[0].labelOffset.y > 0);
});

test('Text Level mobile tap on the label opens native editing and sanitizes persisted text', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'text_level_edit_saved',
      kind: 'textLevel',
      label: 'Entry',
      points: [{ time: 1, price: 90 }],
      text: 'Entry',
      levelLine: { enabled: true, extendMode: 'right', lineColor: '#2962FF', lineWidth: 1, lineStyle: 'solid', opacity: 0.9 },
      showPriceAxisLabel: true,
    },
  ]);
  harness.manager.setActiveTool('crosshair');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);

  const labelBox = primitive.getGeometry().labelBox;
  const labelX = (labelBox.left + labelBox.right) / 2;
  const labelY = (labelBox.top + labelBox.bottom) / 2;

  harness.touchStart(labelX, labelY);
  harness.touchEnd(labelX, labelY);

  const editRequests = harness.messages.filter((message) => message.type === 'DRAWING_TEXT_EDIT_REQUEST');
  assert.equal(editRequests.length, 1);
  assert.equal(editRequests[0].recordId, 'text_level_edit_saved');
  assert.equal(editRequests[0].text, 'Entry');

  (harness.manager as any).applyTextRecordEdit(
    'text_level_edit_saved',
    '<b>Breakout</b>\n<script>x</script>',
  );

  const drawings = harness.latestDrawings();
  assert.equal(drawings[0].text, 'Breakout x');
  assert.equal(drawings[0].label, 'Breakout x');
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
  assert.equal(drawings[0].style.color, '#A855F7');
  assert.equal(drawings[0].style.lineStyle, 'solid');
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

  harness.manager.setActiveTool('pitchfork');
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
  assert.equal(drawings[0].style.borderColor, '#10B981');
  assert.equal(drawings[0].style.borderStyle, 'solid');
});

test('Horizontal and Vertical Line create full-axis line drawings from one tap', () => {
  const horizontalHarness = createFakeChartEnvironment();

  horizontalHarness.manager.setActiveTool('horizontalLine');
  horizontalHarness.click(20, 120);

  let drawings = horizontalHarness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'horizontalLine');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].points[0].price, drawings[0].points[1].price);
  assert.equal(drawings[0].extendMode, 'both');

  const verticalHarness = createFakeChartEnvironment();
  verticalHarness.manager.setActiveTool('verticalLine');
  verticalHarness.click(30, 110);

  drawings = verticalHarness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'verticalLine');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].points[0].time, drawings[0].points[1].time);
  assert.equal(drawings[0].extendMode, 'both');
});

test('Show object descriptions hides and restores an existing horizontal-line price label', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setActiveTool('horizontalLine');
  harness.click(20, 120);

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  const renderTexts = () => {
    primitive.updateAllViews();
    const drawTarget = createFakeBitmapTarget();
    primitive.paneViews()[0].renderer().draw(drawTarget.target);
    return drawTarget.texts;
  };

  assert.ok(renderTexts().length > 0);

  harness.manager.setShowObjectDescriptions(false);
  assert.equal(harness.manager.getShowObjectDescriptions(), false);
  assert.equal(renderTexts().length, 0);

  harness.manager.setShowObjectDescriptions(true);
  assert.equal(harness.manager.getShowObjectDescriptions(), true);
  assert.ok(renderTexts().length > 0);
});

test('Show object descriptions remains off for restored and newly created drawings', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setActiveTool('horizontalLine');
  harness.click(20, 120);
  const serializedDrawings = harness.latestDrawings();

  harness.manager.setShowObjectDescriptions(false);
  harness.manager.setSerializedDrawings(serializedDrawings);

  const restoredPrimitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  restoredPrimitive.updateAllViews();
  const restoredTarget = createFakeBitmapTarget();
  restoredPrimitive.paneViews()[0].renderer().draw(restoredTarget.target);
  assert.equal(restoredTarget.texts.length, 0);

  harness.manager.setActiveTool('horizontalLine');
  harness.click(30, 110);
  const newPrimitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  newPrimitive.updateAllViews();
  const newTarget = createFakeBitmapTarget();
  newPrimitive.paneViews()[0].renderer().draw(newTarget.target);
  assert.equal(newTarget.texts.length, 0);

  harness.manager.setShowObjectDescriptions(true);
  const restoredAfterEnable = createFakeBitmapTarget();
  restoredPrimitive.paneViews()[0].renderer().draw(restoredAfterEnable.target);
  const newAfterEnable = createFakeBitmapTarget();
  newPrimitive.paneViews()[0].renderer().draw(newAfterEnable.target);
  assert.ok(restoredAfterEnable.texts.length > 0);
  assert.ok(newAfterEnable.texts.length > 0);
});

test('Show object descriptions hides generated labels across complex drawing renderers', () => {
  const scenarios = [
    { points: [[10, 100], [40, 70]], tool: 'fib' },
    { points: [[10, 100], [40, 70]], tool: 'prediction' },
    { points: [[10, 100], [20, 80], [30, 110], [40, 70], [50, 90], [60, 60]], tool: 'elliottWave' },
    { points: [[10, 100], [20, 70], [30, 95], [40, 60], [50, 85]], tool: 'xabcd' },
  ] as const;

  for (const scenario of scenarios) {
    const harness = createFakeChartEnvironment();
    harness.manager.setActiveTool(scenario.tool);
    scenario.points.forEach(([x, y]) => harness.click(x, y));

    const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
    const renderTexts = () => {
      primitive.updateAllViews();
      const drawTarget = createFakeBitmapTarget();
      primitive.paneViews()[0].renderer().draw(drawTarget.target);
      return drawTarget.texts;
    };

    assert.ok(renderTexts().length > 0, `${scenario.tool} should render descriptions by default`);
    harness.manager.setShowObjectDescriptions(false);
    assert.equal(renderTexts().length, 0, `${scenario.tool} should hide its descriptions`);
    harness.manager.setShowObjectDescriptions(true);
    assert.ok(renderTexts().length > 0, `${scenario.tool} should restore its descriptions`);
  }
});

test('Show object descriptions updates an already attached drawing preview', () => {
  const harness = createFakeChartEnvironment();
  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.move(40, 70);

  const preview: any = harness.manager._tools.fib._preview;
  const renderTexts = () => {
    preview.updateAllViews();
    const drawTarget = createFakeBitmapTarget();
    preview.paneViews()[0].renderer().draw(drawTarget.target);
    return drawTarget.texts;
  };

  assert.ok(renderTexts().length > 0);
  harness.manager.setShowObjectDescriptions(false);
  assert.equal(renderTexts().length, 0);
});

test('Horizontal Ray creates a one-tap right-extended price ray', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('horizontalRay');
  harness.click(20, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'horizontalRay');
  assert.equal(drawings[0].type, 'horizontalRay');
  assert.equal(drawings[0].label, 'Horizontal Ray 1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].points[0].price, drawings[0].points[1].price);
  assert.equal(drawings[0].points[1].time, drawings[0].points[0].time + 1);
  assert.equal(drawings[0].extendMode, 'right');
  assert.equal(drawings[0].style.color, '#0EA5E9');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 180, y: 120 }, { isTouch: false })?.part, 'body');
});

test('Horizontal Ray supports direct mobile one-tap input', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('horizontalRay');
  const startEvent = harness.touchStart(20, 120);
  harness.touchEnd(20, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'horizontalRay');
  assert.equal(drawings[0].extendMode, 'right');
  assert.equal(startEvent.preventDefaultCalls, 1);
});

test('Ray creates a right-extended two-point drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('ray');
  harness.click(10, 100);
  harness.move(40, 70);
  harness.click(40, 70);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'ray');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'right');
});

test('Extended Line creates a both-way extended two-point drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('extendedLine');
  harness.click(10, 100);
  harness.move(40, 70);
  harness.click(40, 70);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'extendedLine');
  assert.equal(drawings[0].type, 'extendedLine');
  assert.equal(drawings[0].label, 'Extended Line 1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'both');
  assert.equal(drawings[0].style.color, '#7C3AED');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 70, y: 40 }, { isTouch: false })?.part, 'body');
});

test('Arrow / Marker creates a finite two-point drawing with an arrowhead', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('arrow');
  harness.click(10, 100);
  harness.move(40, 70);
  harness.click(40, 70);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'arrow');
  assert.equal(drawings[0].type, 'arrow');
  assert.equal(drawings[0].label, 'Arrow / Marker 1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].extendMode, 'none');
  assert.equal(drawings[0].style.color, '#F97316');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 3);
});

test('Fibonacci Extension creates extension levels beyond one', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fibExtension');
  harness.click(10, 100);
  harness.move(30, 80);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'fibExtension');
  assert.equal(drawings[0].type, 'fibExtension');
  assert.equal(drawings[0].extendMode, 'right');
  assert.ok(drawings[0].levels.some((level: any) => level.value > 1));
});

test('Parallel Channel creates three anchors and renders parallel rails', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('parallelChannel');
  harness.click(50, 220);
  harness.click(160, 120);
  harness.click(300, 180);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'parallelChannel');
  assert.equal(drawings[0].points.length, 3);
  assert.equal(drawings[0].extendMode, 'right');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);

  const strokeStarts = drawTarget.moves.slice(-3);
  const strokeEnds = drawTarget.lines.slice(-3);
  assert.equal(strokeStarts.length, 3);
  assert.equal(strokeEnds.length, 3);
  const slope = (start: { x: number; y: number }, end: { x: number; y: number }) =>
    (end.y - start.y) / (end.x - start.x);
  const baseSlope = slope(strokeStarts[0], strokeEnds[0]);
  assert.ok(Math.abs(slope(strokeStarts[1], strokeEnds[1]) - baseSlope) < 0.000001);
  assert.ok(Math.abs(slope(strokeStarts[2], strokeEnds[2]) - baseSlope) < 0.000001);
});

test('Short Position creates a two-point short box drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('shortPosition');
  harness.click(10, 100);
  harness.click(30, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'shortPosition');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.borderColor, '#F43F5E');
  assert.equal(drawings[0].style.borderStyle, 'solid');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  assert.match(primitive._options.label, /^Short /);
});

test('Position drawings restore risk-reward plans with zones, labels and editable anchors', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'long_plan_saved',
      kind: 'prediction',
      label: 'Long plan',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      position: { stopPrice: 88, accountSize: 10000, riskPercent: 1 },
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].position.stopPrice, 88);
  assert.equal(drawings[0].position.accountSize, 10000);

  harness.manager.setActiveTool('prediction');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('Long RR 2.00'));
  // Prices format at the series precision (5 in this fake environment).
  assert.ok(texts.includes('Target 94.00000 (+4.0000)'));
  assert.ok(texts.includes('Stop 88.00000 (-2.0000)'));

  assert.equal(primitive.hitTest({ x: 10, y: 100 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 30, y: 60 }, { isTouch: false })?.part, 'p2');
  assert.equal(primitive.hitTest({ x: 20, y: 110 }, { isTouch: false })?.part, 'body');
  assert.equal(primitive.hitTest({ x: 200, y: 200 }, { isTouch: false }), null);
});

test('Short position restore defaults the stop to a 1:1 mirror above the entry', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'short_plan_saved',
      kind: 'shortPosition',
      label: 'Short plan',
      points: [{ time: 1, price: 94 }, { time: 3, price: 90 }],
    },
  ]);

  harness.manager.setActiveTool('shortPosition');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('Short RR 1.00'));
  assert.ok(texts.includes('Target 90.00000 (+4.0000)'));
  assert.ok(texts.includes('Stop 98.00000 (-4.0000)'));
});

test('Pitchfork creates a three-point pitchfork drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('pitchfork');
  harness.click(50, 220);
  harness.click(160, 120);
  harness.click(300, 180);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'pitchfork');
  assert.equal(drawings[0].points.length, 3);
  assert.equal(drawings[0].style.color, '#8B5CF6');
  assert.equal(drawings[0].style.lineStyle, 'solid');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);

  const segments = drawTarget.moves.slice(0, 3).map((start, index) => ({
    end: drawTarget.lines[index],
    start,
  }));
  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map((segment) => Math.round(segment.start.x)), [50, 160, 300]);
  assert.deepEqual(segments.map((segment) => Math.round(segment.start.y)), [220, 120, 180]);

  const slope = (segment: { end: { x: number; y: number }; start: { x: number; y: number } }) =>
    (segment.end.y - segment.start.y) / (segment.end.x - segment.start.x);
  const medianSlope = slope(segments[0]);
  assert.ok(Math.abs(slope(segments[1]) - medianSlope) < 0.000001);
  assert.ok(Math.abs(slope(segments[2]) - medianSlope) < 0.000001);
  for (const segment of segments) {
    assert.ok(segment.end.x >= 0 && segment.end.x <= 360);
    assert.ok(segment.end.y >= 0 && segment.end.y <= 320);
  }
});

test('Sticker creates a one-point sticker drawing', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('smiley');
  harness.click(10, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'smiley');
  assert.equal(drawings[0].points.length, 1);
  assert.equal(drawings[0].style.backgroundColor, 'rgba(245, 158, 11, 0.94)');
});

test('Scale creates a two-point measurement box with TradingView-style details', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setCrosshairConfig({ symbol: 'AUDJPY', timeframe: 'M1' });
  harness.manager.setActiveTool('measure');
  harness.click(10, 100);
  harness.click(30, 80);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'measure');
  assert.equal(drawings[0].symbol, 'AUDJPY');
  assert.equal(drawings[0].timeframe, 'M1');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.borderColor, '#94A3B8');
  assert.equal(drawings[0].style.borderStyle, 'solid');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  assert.match(primitive._options.label, /\+2\.0000 \(\+2\.22%\) \/ 2 bars \/ 2s/);
});

test('Gann Fan creates a two-point fan of angle rays', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('gannFan');
  harness.click(20, 200);
  harness.move(120, 120);
  harness.click(120, 120);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'gannFan');
  assert.equal(drawings[0].type, 'gannFan');
  assert.equal(drawings[0].paneId, 'main');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.color, '#EAB308');
  assert.equal(harness.manager.getActiveTool(), 'gannFan');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 5);
  assert.equal(primitive.hitTest({ x: 20, y: 200 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 120, y: 120 }, { isTouch: false })?.part, 'p2');
});

test('Regression Channel fits a two-point channel over the candle range', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('regressionChannel');
  harness.click(20, 200);
  harness.move(200, 100);
  harness.click(200, 100);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'regressionChannel');
  assert.equal(drawings[0].type, 'regressionChannel');
  assert.equal(drawings[0].points.length, 2);
  assert.equal(drawings[0].style.color, '#0EA5E9');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  primitive.paneViews()[0].renderer().draw(createFakeBitmapTarget().target);
  assert.equal(primitive.hitTest({ x: 20, y: 200 }, { isTouch: false })?.part, 'p1');
});

test('Elliott Wave creates a six-point numbered impulse polyline', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('elliottWave');
  harness.click(10, 200);
  harness.click(40, 150);
  harness.click(70, 180);
  harness.click(110, 90);
  harness.click(150, 130);
  harness.click(200, 60);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'elliottWave');
  assert.equal(drawings[0].type, 'elliottWave');
  assert.equal(drawings[0].points.length, 6);
  assert.equal(drawings[0].style.color, '#6366F1');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 5);
  assert.ok(drawTarget.texts.map((entry) => entry.text).includes('5'));
  assert.equal(primitive.hitTest({ x: 10, y: 200 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 200, y: 60 }, { isTouch: false })?.part, 'p6');
});

test('Elliott Wave restores custom wave labels and serializes them back to the host', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'elliott_saved',
      kind: 'elliottWave',
      label: 'Elliott saved',
      points: [
        { time: 1, price: 90 },
        { time: 2, price: 94 },
        { time: 3, price: 91 },
        { time: 4, price: 96 },
        { time: 5, price: 93 },
        { time: 6, price: 98 },
      ],
      waves: [
        { id: 'wave_1', label: '0', visible: false },
        { id: 'wave_2', label: 'A', visible: true },
        { id: 'wave_3', label: 'B', visible: true },
        { id: 'wave_4', label: 'C', visible: true },
        { id: 'wave_5', label: 'D', visible: true },
        { id: 'wave_6', label: 'E', visible: true },
      ],
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].waves.length, 6);
  assert.equal(drawings[0].waves[0].visible, false);
  assert.equal(drawings[0].waves[1].label, 'A');

  harness.manager.setActiveTool('elliottWave');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('E'));
  assert.equal(texts.includes('0'), false);
  assert.equal(texts.includes('5'), false);
});

test('XABCD Harmonic creates a five-point pattern with ratio labels', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('xabcd');
  harness.click(10, 80);
  harness.click(60, 220);
  harness.click(110, 110);
  harness.click(160, 200);
  harness.click(210, 60);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].kind, 'xabcd');
  assert.equal(drawings[0].type, 'xabcd');
  assert.equal(drawings[0].points.length, 5);
  assert.equal(drawings[0].style.color, '#DB2777');

  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  assert.ok(drawTarget.lines.length >= 4);
  assert.ok(drawTarget.texts.map((entry) => entry.text).includes('X'));
  assert.ok(drawTarget.texts.map((entry) => entry.text).includes('D'));
  assert.equal(primitive.hitTest({ x: 10, y: 80 }, { isTouch: false })?.part, 'p1');
  assert.equal(primitive.hitTest({ x: 210, y: 60 }, { isTouch: false })?.part, 'p5');
});

test('XABCD Harmonic restores ratio targets and renders measured / target labels', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'xabcd_saved',
      kind: 'xabcd',
      label: 'XABCD saved',
      points: [
        { time: 1, price: 90 },
        { time: 2, price: 96 },
        { time: 3, price: 92 },
        { time: 4, price: 95 },
        { time: 5, price: 99 },
      ],
      ratios: [
        { id: 'ratio_ab', target: 0.618, visible: true },
        { id: 'ratio_bc', target: null, visible: false },
        { id: 'ratio_cd', target: null, visible: true },
      ],
    },
  ]);

  const drawings = harness.latestDrawings();
  assert.equal(drawings.length, 1);
  assert.equal(drawings[0].ratios.length, 3);
  assert.equal(drawings[0].ratios[0].target, 0.618);
  assert.equal(drawings[0].ratios[1].visible, false);

  harness.manager.setActiveTool('xabcd');
  const primitive: any = harness.attachedPrimitives[harness.attachedPrimitives.length - 1];
  primitive.updateAllViews();
  const drawTarget = createFakeBitmapTarget();
  primitive.paneViews()[0].renderer().draw(drawTarget.target);
  const texts = drawTarget.texts.map((entry) => entry.text);
  assert.ok(texts.includes('0.667 / 0.618'));
  assert.ok(texts.includes('1.333'));
  assert.equal(texts.includes('0.750'), false);
  assert.ok(texts.includes('X'));
  assert.ok(texts.includes('D'));
});

test('Serialized style restores for object-menu drawing tools', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setSerializedDrawings([
    {
      hidden: false,
      id: 'patterns_saved',
      kind: 'patterns',
      label: 'Pattern saved',
      points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }],
      style: { color: '#14B8A6', width: 5, lineStyle: 'dashed', opacity: 0.55 },
    },
    {
      hidden: false,
      id: 'text_saved',
      kind: 'text',
      label: 'Text saved',
      points: [{ time: 1, price: 90 }],
      text: 'TXT',
      style: { backgroundColor: '#111827', textColor: '#F59E0B', anchorLineColor: '#F59E0B', fontSize: 13, opacity: 0.66 },
    },
    {
      hidden: false,
      id: 'long_saved',
      kind: 'prediction',
      label: 'Long saved',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      style: { fillColor: 'rgba(20, 184, 166, 0.22)', borderColor: '#14B8A6', borderWidth: 4, borderStyle: 'dotted', opacity: 0.44 },
    },
    {
      hidden: false,
      id: 'short_saved',
      kind: 'shortPosition',
      label: 'Short saved',
      points: [{ time: 1, price: 90 }, { time: 3, price: 86 }],
      style: { fillColor: 'rgba(239, 68, 68, 0.22)', borderColor: '#EF4444', borderWidth: 3, borderStyle: 'dashed', opacity: 0.5 },
    },
    {
      hidden: false,
      id: 'pitchfork_saved',
      kind: 'pitchfork',
      label: 'Pitchfork saved',
      points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }],
      style: { color: '#EC4899', width: 4, lineStyle: 'dotted', opacity: 0.6 },
    },
    {
      hidden: false,
      id: 'sticker_saved',
      kind: 'smiley',
      label: 'Sticker saved',
      points: [{ time: 1, price: 90 }],
      text: ':)',
      style: { color: '#F59E0B', textColor: '#111827', opacity: 0.7 },
    },
    {
      hidden: false,
      id: 'measure_saved',
      kind: 'measure',
      label: 'Scale saved',
      points: [{ time: 1, price: 90 }, { time: 3, price: 94 }],
      style: { fillColor: 'rgba(100, 116, 139, 0.32)', borderColor: '#64748B', borderWidth: 2, borderStyle: 'dashed', opacity: 0.35 },
    },
  ]);

  const [
    patternPrimitive,
    textPrimitive,
    longPrimitive,
    shortPrimitive,
    pitchforkPrimitive,
    stickerPrimitive,
    measurePrimitive,
  ] = harness.attachedPrimitives as any[];

  assert.equal(patternPrimitive._options.color, '#14B8A6');
  assert.equal(patternPrimitive._options.width, 5);
  assert.equal(patternPrimitive._options.lineStyle, 'dashed');
  assert.equal(patternPrimitive._options.opacity, 0.55);

  assert.equal(textPrimitive._options.backgroundColor, '#111827');
  assert.equal(textPrimitive._options.textColor, '#F59E0B');
  assert.equal(textPrimitive._options.anchorColor, '#F59E0B');
  assert.equal(textPrimitive._options.fontSize, 13);
  assert.equal(textPrimitive._options.opacity, 0.66);

  assert.equal(longPrimitive._options.fillColor, 'rgba(20, 184, 166, 0.22)');
  assert.equal(longPrimitive._options.borderColor, '#14B8A6');
  assert.equal(longPrimitive._options.borderWidth, 4);
  assert.equal(longPrimitive._options.borderStyle, 'dotted');
  assert.equal(longPrimitive._options.opacity, 0.44);

  assert.equal(shortPrimitive._options.fillColor, 'rgba(239, 68, 68, 0.22)');
  assert.equal(shortPrimitive._options.borderColor, '#EF4444');
  assert.equal(shortPrimitive._options.borderWidth, 3);
  assert.equal(shortPrimitive._options.borderStyle, 'dashed');
  assert.equal(shortPrimitive._options.opacity, 0.5);

  assert.equal(pitchforkPrimitive._options.color, '#EC4899');
  assert.equal(pitchforkPrimitive._options.width, 4);
  assert.equal(pitchforkPrimitive._options.lineStyle, 'dotted');
  assert.equal(pitchforkPrimitive._options.opacity, 0.6);

  assert.equal(stickerPrimitive._options.backgroundColor, '#F59E0B');
  assert.equal(stickerPrimitive._options.textColor, '#111827');
  assert.equal(stickerPrimitive._options.anchorColor, '#F59E0B');
  assert.equal(stickerPrimitive._options.opacity, 0.7);

  assert.equal(measurePrimitive._options.fillColor, 'rgba(100, 116, 139, 0.32)');
  assert.equal(measurePrimitive._options.borderColor, '#64748B');
  assert.equal(measurePrimitive._options.borderWidth, 2);
  assert.equal(measurePrimitive._options.borderStyle, 'dashed');
  assert.equal(measurePrimitive._options.opacity, 0.35);
});

test('Serialized drawings restore each registered drawing tool through the runtime registry', async (t) => {
  const cases = [
    { kind: 'trendline', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'horizontalLine', points: [{ time: 1, price: 90 }, { time: 3, price: 90 }] },
    { kind: 'horizontalRay', points: [{ time: 1, price: 90 }, { time: 3, price: 90 }] },
    { kind: 'verticalLine', points: [{ time: 1, price: 90 }, { time: 1, price: 94 }] },
    { kind: 'ray', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'extendedLine', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'arrow', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'patterns', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'fib', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'fibExtension', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'ellipse', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'freehand', points: [{ time: 1, price: 90 }, { time: 2, price: 92 }, { time: 3, price: 94 }] },
    { kind: 'brush', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'text', points: [{ time: 1, price: 90 }], text: 'TXT' },
    { kind: 'textLevel', points: [{ time: 1, price: 90 }], text: 'Entry' },
    { kind: 'parallelChannel', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'prediction', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'shortPosition', points: [{ time: 1, price: 90 }, { time: 3, price: 86 }] },
    { kind: 'pitchfork', points: [{ time: 1, price: 90 }, { time: 2, price: 93 }, { time: 3, price: 91 }] },
    { kind: 'gannFan', points: [{ time: 1, price: 90 }, { time: 3, price: 94 }] },
    { kind: 'regressionChannel', points: [{ time: 1, price: 90 }, { time: 5, price: 94 }] },
    { kind: 'elliottWave', points: [{ time: 1, price: 90 }, { time: 2, price: 94 }, { time: 3, price: 91 }, { time: 4, price: 96 }, { time: 5, price: 93 }, { time: 6, price: 98 }] },
    { kind: 'xabcd', points: [{ time: 1, price: 90 }, { time: 2, price: 96 }, { time: 3, price: 92 }, { time: 4, price: 95 }, { time: 5, price: 99 }] },
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

  assert.equal(harness.manager.getActiveTool(), 'none');

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

test('Clear Drawings removes drawings and returns to inactive mode', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);
  harness.manager.removeAllDrawings();

  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.getActiveTool(), 'none');
});

test('Undo and redo drawing actions restore drawing snapshots', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('trendline');
  harness.click(10, 100);
  harness.click(30, 80);

  const created = harness.latestDrawings()[0];
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.manager.undoDrawingAction(), true);

  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.redoDrawingAction(), true);
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.latestDrawings()[0].id, created.id);
  assert.equal(harness.latestDrawings()[0].kind, 'trendline');
});

test('Undo and redo drawing actions cover clear drawings', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(40, 70);
  assert.equal(harness.latestDrawings().length, 1);

  harness.manager.removeAllDrawings();
  assert.deepEqual(harness.latestDrawings(), []);
  assert.equal(harness.manager.undoDrawingAction(), true);

  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.latestDrawings()[0].kind, 'fib');
  assert.equal(harness.manager.redoDrawingAction(), true);
  assert.deepEqual(harness.latestDrawings(), []);
});

test('Manager teardown detaches drawings without clearing persisted host state', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(40, 70);

  assert.equal(harness.latestDrawings().length, 1);
  const messagesBeforeTeardown = harness.drawingMessages().length;
  harness.manager.remove();

  assert.equal(harness.drawingMessages().length, messagesBeforeTeardown);
  assert.equal(harness.latestDrawings().length, 1);
  assert.ok(harness.detachedPrimitives.length > 0);
});

test('Manager can republish current drawings for host-side objects sync', () => {
  const harness = createFakeChartEnvironment();

  harness.manager.setActiveTool('fib');
  harness.click(10, 100);
  harness.click(40, 70);

  const messagesBeforePublish = harness.drawingMessages().length;
  harness.manager.publishDrawingsToHost();

  assert.equal(harness.drawingMessages().length, messagesBeforePublish + 1);
  assert.equal(harness.latestDrawings().length, 1);
  assert.equal(harness.latestDrawings()[0].kind, 'fib');
  assert.equal(harness.latestDrawings()[0].type, 'fibRetracement');
});

test('setSerializedDrawings clears locked crosshair overlay before replaying records', () => {
  const harness = createFakeChartEnvironment({ touch: true });

  harness.manager.setActiveTool('crosshair');
  harness.touchStart(120, 140);
  harness.touchEnd(120, 140);
  harness.click(120, 140);

  const overlay = harness.host.children.find((child: any) => child['data-rtx5-crosshair-overlay'] === 'true');
  assert.ok(overlay);
  assert.equal(overlay.style.display, 'block');

  harness.manager.setSerializedDrawings([]);

  assert.equal(overlay.style.display, 'none');
  assert.ok(harness.crosshairMessages().some((message) => message.active === false));
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
    click: 1,
    crosshairMove: 1,
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
    click: 1,
    crosshairMove: 1,
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
