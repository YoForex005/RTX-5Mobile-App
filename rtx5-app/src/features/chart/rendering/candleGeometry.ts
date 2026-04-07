export type CandleSpan = {
  center: number;
  left: number;
  right: number;
  width: number;
};

export type CandleGeometry = {
  index: number;
  roundedX: number;
  xCenter: number;
  bodyLeft: number;
  bodyRight: number;
  bodyWidth: number;
  bodyTop: number;
  bodyBottom: number;
  wickX: number;
  wickLeft: number;
  wickRight: number;
  wickWidth: number;
  wickTop: number;
  wickBottom: number;
  upperWickBodyY: number;
  lowerWickBodyY: number;
};

export type CandleGeometryInput = {
  index: number;
  roundedX: number;
  bodyWidth: number;
  wickWidth: number;
  openY: number;
  closeY: number;
  highY: number;
  lowY: number;
  wickMinLeft?: number | null;
};

export const CANDLE_CENTER_EPSILON = 1e-6;

export const clampBitmapWidth = (width: number) => Math.max(1, Math.floor(width));

export const scaleToBitmapCoordinate = (value: number, pixelRatio: number) =>
  Math.round(value * pixelRatio);

export const getEffectiveBitmapBarSpacing = (
  barSpacing: number,
  conflationFactor: number = 1,
) => Math.max(barSpacing * Math.max(1, conflationFactor), 0);

export const getOptimalCandlestickBodyWidth = (barSpacing: number, pixelRatio: number) => {
  const barSpacingSpecialCaseFrom = 2.5;
  const barSpacingSpecialCaseTo = 4;
  const barSpacingSpecialCaseCoeff = 3;

  if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
    return clampBitmapWidth(barSpacingSpecialCaseCoeff * pixelRatio);
  }

  const barSpacingReducingCoeff = 0.2;
  const coeff =
    1 -
    (barSpacingReducingCoeff *
      Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo)) /
      (Math.PI * 0.5);
  const requestedWidth = Math.floor(barSpacing * coeff * pixelRatio);
  const scaledBarSpacing = Math.floor(barSpacing * pixelRatio);
  const optimalWidth = Math.min(requestedWidth, scaledBarSpacing);
  return Math.max(Math.floor(pixelRatio), optimalWidth);
};

export const getOptimalCandlestickWickWidth = (
  barSpacing: number,
  pixelRatio: number,
  bodyWidth: number,
) => {
  const pixelAlignedWidth = Math.floor(pixelRatio);
  const requestedWidth = Math.min(
    pixelAlignedWidth,
    Math.floor(barSpacing * pixelRatio),
  );

  return Math.max(pixelAlignedWidth, Math.min(requestedWidth, bodyWidth));
};

export const normalizeCandlestickBodyWidth = (bodyWidth: number, wickWidth: number) => {
  if (bodyWidth >= 2 && (wickWidth % 2) !== (bodyWidth % 2)) {
    return bodyWidth - 1;
  }

  return bodyWidth;
};

export const getCandlestickBorderWidth = (bodyWidth: number, pixelRatio: number) => {
  let borderWidth = Math.floor(pixelRatio);
  if (bodyWidth <= 2 * borderWidth) {
    borderWidth = Math.floor((bodyWidth - 1) * 0.5);
  }

  const normalizedBorderWidth = Math.max(Math.floor(pixelRatio), borderWidth);
  if (bodyWidth <= normalizedBorderWidth * 2) {
    return Math.max(Math.floor(pixelRatio), Math.floor(pixelRatio));
  }

  return normalizedBorderWidth;
};

export const createSpanFromRoundedX = (
  roundedX: number,
  width: number,
  minLeft?: number | null,
): CandleSpan => {
  const normalizedWidth = clampBitmapWidth(width);
  const center = roundedX + (normalizedWidth % 2 === 0 ? 0 : 0.5);
  return createCenteredSpan(center, normalizedWidth, minLeft);
};

export const createCenteredSpan = (
  center: number,
  width: number,
  minLeft?: number | null,
): CandleSpan => {
  const requestedWidth = clampBitmapWidth(width);
  const minAllowedLeft = minLeft ?? Number.NEGATIVE_INFINITY;
  const requiresOddWidth = Math.abs(center % 1) > CANDLE_CENTER_EPSILON;
  const minCenteredWidth = requiresOddWidth ? 1 : 2;

  let nextWidth = requestedWidth;
  if ((nextWidth % 2 === 1) !== requiresOddWidth) {
    nextWidth = Math.max(0, nextWidth - 1);
  }
  let span = createCenteredSpanAtWidth(center, nextWidth);

  while (span.left < minAllowedLeft && nextWidth > minCenteredWidth) {
    nextWidth -= 2;
    span = createCenteredSpanAtWidth(center, nextWidth);
  }

  if (span.left < minAllowedLeft) {
    span = {
      center,
      left: Math.round(center),
      right: Math.round(center) - 1,
      width: 0,
    };
  }

  return span;
};

export const createCandleGeometry = ({
  index,
  roundedX,
  bodyWidth,
  wickWidth,
  openY,
  closeY,
  highY,
  lowY,
  wickMinLeft,
}: CandleGeometryInput): CandleGeometry => {
  const body = createSpanFromRoundedX(roundedX, bodyWidth);
  const wick = createCenteredSpan(body.center, wickWidth, wickMinLeft);
  const bodyTop = Math.round(Math.min(openY, closeY));
  const bodyBottom = Math.round(Math.max(openY, closeY));
  const wickTop = Math.round(highY);
  const wickBottom = Math.round(lowY);

  return {
    index,
    roundedX,
    xCenter: body.center,
    bodyLeft: body.left,
    bodyRight: body.right,
    bodyWidth: body.width,
    bodyTop,
    bodyBottom,
    wickX: body.center,
    wickLeft: wick.left,
    wickRight: wick.right,
    wickWidth: wick.width,
    wickTop,
    wickBottom,
    upperWickBodyY: bodyTop,
    lowerWickBodyY: bodyBottom,
  };
};

export const getBodyCenterFromGeometry = (geometry: Pick<CandleGeometry, 'bodyLeft' | 'bodyWidth'>) =>
  geometry.bodyLeft + geometry.bodyWidth / 2;

export const getCandleGeometryInvariantDelta = (
  geometry: Pick<CandleGeometry, 'bodyLeft' | 'bodyWidth' | 'wickX'>,
) => Math.abs(getBodyCenterFromGeometry(geometry) - geometry.wickX);

export const hasCenteredWickInvariant = (
  geometry: Pick<CandleGeometry, 'bodyLeft' | 'bodyWidth' | 'wickX'>,
  epsilon: number = CANDLE_CENTER_EPSILON,
) => getCandleGeometryInvariantDelta(geometry) < epsilon;

export const formatCandleGeometryInvariantMessage = (
  geometry: CandleGeometry,
  epsilon: number = CANDLE_CENTER_EPSILON,
) =>
  [
    'RTX5 candle geometry invariant violated',
    `index=${geometry.index}`,
    `epsilon=${epsilon}`,
    `roundedX=${geometry.roundedX}`,
    `xCenter=${geometry.xCenter}`,
    `bodyLeft=${geometry.bodyLeft}`,
    `bodyRight=${geometry.bodyRight}`,
    `bodyWidth=${geometry.bodyWidth}`,
    `bodyTop=${geometry.bodyTop}`,
    `bodyBottom=${geometry.bodyBottom}`,
    `wickX=${geometry.wickX}`,
    `wickLeft=${geometry.wickLeft}`,
    `wickRight=${geometry.wickRight}`,
    `wickWidth=${geometry.wickWidth}`,
    `wickTop=${geometry.wickTop}`,
    `wickBottom=${geometry.wickBottom}`,
  ].join(' ');

const createCenteredSpanAtWidth = (center: number, width: number): CandleSpan => {
  const normalizedWidth = Math.max(0, Math.floor(width));
  if (normalizedWidth === 0) {
    return {
      center,
      left: Math.round(center),
      right: Math.round(center) - 1,
      width: 0,
    };
  }
  const left = Math.round(center - normalizedWidth / 2);

  return {
    center: left + normalizedWidth / 2,
    left,
    right: left + normalizedWidth - 1,
    width: normalizedWidth,
  };
};
