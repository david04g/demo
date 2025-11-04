import { Candle } from "@/lib/types";

type Series = number[];

export const SMA = (series: Series, period: number): Series => {
  const result: number[] = Array(series.length).fill(NaN);
  if (period <= 0) return result;
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    if (!Number.isFinite(value)) {
      sum = 0;
      continue;
    }
    sum += value;
    if (i >= period) {
      sum -= series[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
};

export const EMA = (series: Series, period: number): Series => {
  const result: number[] = Array(series.length).fill(NaN);
  if (period <= 0) return result;
  const multiplier = 2 / (period + 1);
  let ema = 0;
  let initialized = false;
  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    if (!Number.isFinite(value)) continue;
    if (!initialized) {
      ema = value;
      initialized = true;
    } else {
      ema = (value - ema) * multiplier + ema;
    }
    if (i >= period - 1) {
      result[i] = ema;
    }
  }
  return result;
};

export const RSI = (series: Series, period: number): Series => {
  const result: number[] = Array(series.length).fill(NaN);
  if (period <= 0) return result;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < series.length; i++) {
    const change = series[i] - series[i - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
    if (i > period) {
      const prevChange = series[i - period] - series[i - period - 1];
      gain -= Math.max(0, prevChange);
      loss -= Math.max(0, -prevChange);
    }
    if (i >= period) {
      const avgGain = gain / period;
      const avgLoss = loss / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }
  return result;
};

export const ROC = (series: Series, period: number): Series => {
  const result: number[] = Array(series.length).fill(NaN);
  if (period <= 0) return result;
  for (let i = period; i < series.length; i++) {
    const base = series[i - period];
    if (!Number.isFinite(base) || base === 0) continue;
    result[i] = ((series[i] - base) / base) * 100;
  }
  return result;
};

export const ATR = (candles: Candle[], period: number): Series => {
  const result: number[] = Array(candles.length).fill(NaN);
  if (period <= 0) return result;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = i > 0 ? candles[i - 1].close : candles[i].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }
  const sma = SMA(trs, period);
  for (let i = 0; i < sma.length; i++) {
    result[i] = sma[i];
  }
  return result;
};

export const indicatorMap = {
  SMA,
  EMA,
  RSI,
  ROC,
  ATR,
};

export const warmupPeriods: Record<keyof typeof indicatorMap, (args: Record<string, number>) => number> = {
  SMA: (args) => args.period ?? 1,
  EMA: (args) => (args.period ?? 1) * 3,
  RSI: (args) => (args.period ?? 1) + 1,
  ROC: (args) => args.period ?? 1,
  ATR: (args) => (args.period ?? 1) + 1,
};
