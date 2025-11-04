import {
  BacktestMetrics,
  BacktestResult,
  Candle,
  EquityCurve,
  PerAssetStats,
  Strategy,
} from "@/lib/types";
import { indicatorMap, warmupPeriods } from "@/lib/indicators";

const hashString = (input: string) => {
  let hash = 1779033703;
  for (let i = 0; i < input.length; i++) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return hash >>> 0;
};

const mulberry32 = (seed: number) => {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const businessDaysBetween = (start: Date, end: Date) => {
  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

export const generateCandles = (symbol: string, start: string, end: string): Candle[] => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const dates = businessDaysBetween(startDate, endDate);
  const seed = hashString(`${symbol}:${start}:${end}`);
  const rand = mulberry32(seed);
  const candles: Candle[] = [];
  let price = 50 + rand() * 50;
  for (const date of dates) {
    const drift = 0.0004;
    const vol = 0.02;
    const shock = (rand() - 0.5) * 2;
    const ret = Math.exp(drift + vol * shock);
    const open = price;
    const close = Math.max(1, price * ret);
    const high = Math.max(open, close) * (1 + Math.abs(shock) * 0.3);
    const low = Math.min(open, close) * (1 - Math.abs(shock) * 0.3);
    const volume = 1_000_000 * (1 + Math.abs(shock) * 10);
    candles.push({
      date: date.toISOString().slice(0, 10),
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return candles;
};

type IndicatorSeries = Record<string, number[]>;

type SymbolSeries = {
  candles: Candle[];
  closes: number[];
  indicators: IndicatorSeries;
};

type PortfolioPosition = {
  shares: number;
  costBasis: number;
  entryPrice: number;
  entryDate: string;
};

type Trade = {
  symbol: string;
  date: string;
  pnl: number;
};

type SimulationOptions = {
  startIndex: number;
  endIndex: number;
};

type SimulationOutput = {
  equity: EquityCurve;
  metrics: BacktestMetrics;
  perAsset: Map<string, { pnl: number; trades: number; exposureDays: number }>;
  warnings: string[];
};

type EvaluationContext = {
  symbol: string;
  index: number;
  series: SymbolSeries;
  riskFlags: { stop: boolean; take: boolean };
};

const resolveOperand = (
  operand: string | number,
  ctx: EvaluationContext,
  seriesMap: Record<string, SymbolSeries>,
) => {
  if (typeof operand === "number") return operand;
  const indicator = ctx.series.indicators[operand];
  if (!indicator) return NaN;
  return indicator[ctx.index];
};

const evalExpr = (
  expr: any,
  ctx: EvaluationContext,
  seriesMap: Record<string, SymbolSeries>,
): boolean => {
  if (expr.all) {
    return expr.all.every((child: any) => evalExpr(child, ctx, seriesMap));
  }
  if (expr.any) {
    return expr.any.some((child: any) => evalExpr(child, ctx, seriesMap));
  }
  if (expr.gt) {
    const [left, right] = expr.gt;
    const l = resolveOperand(left, ctx, seriesMap);
    const r = resolveOperand(right, ctx, seriesMap);
    return Number.isFinite(l) && Number.isFinite(r) && l > r;
  }
  if (expr.lt) {
    const [left, right] = expr.lt;
    const l = resolveOperand(left, ctx, seriesMap);
    const r = resolveOperand(right, ctx, seriesMap);
    return Number.isFinite(l) && Number.isFinite(r) && l < r;
  }
  if (expr.cross_over) {
    const [left, right] = expr.cross_over;
    const seriesLeft = resolveOperand(left, ctx, seriesMap);
    const seriesRight = resolveOperand(right, ctx, seriesMap);
    const prevCtx = { ...ctx, index: Math.max(0, ctx.index - 1) };
    const prevLeft = resolveOperand(left, prevCtx, seriesMap);
    const prevRight = resolveOperand(right, prevCtx, seriesMap);
    return (
      Number.isFinite(seriesLeft) &&
      Number.isFinite(seriesRight) &&
      Number.isFinite(prevLeft) &&
      Number.isFinite(prevRight) &&
      prevLeft <= prevRight &&
      seriesLeft > seriesRight
    );
  }
  if (expr.cross_under) {
    const [left, right] = expr.cross_under;
    const seriesLeft = resolveOperand(left, ctx, seriesMap);
    const seriesRight = resolveOperand(right, ctx, seriesMap);
    const prevCtx = { ...ctx, index: Math.max(0, ctx.index - 1) };
    const prevLeft = resolveOperand(left, prevCtx, seriesMap);
    const prevRight = resolveOperand(right, prevCtx, seriesMap);
    return (
      Number.isFinite(seriesLeft) &&
      Number.isFinite(seriesRight) &&
      Number.isFinite(prevLeft) &&
      Number.isFinite(prevRight) &&
      prevLeft >= prevRight &&
      seriesLeft < seriesRight
    );
  }
  if (expr.risk_stop) {
    return ctx.riskFlags.stop;
  }
  if (expr.risk_take) {
    return ctx.riskFlags.take;
  }
  return false;
};

const computeIndicators = (strategy: Strategy, data: Record<string, Candle[]>): Record<string, SymbolSeries> => {
  const result: Record<string, SymbolSeries> = {};
  for (const symbol of strategy.universe) {
    const candles = data[symbol];
    const closes = candles.map((c) => c.close);
    const indicators: IndicatorSeries = {};
    for (const indicator of strategy.indicators) {
      const { id, fn, args } = indicator;
      const warmup = warmupPeriods[fn](args);
      if (candles.length < warmup + 5) {
        throw new Error(`Insufficient warmup for ${fn} on ${symbol}`);
      }
      if (fn === "ATR") {
        indicators[id] = indicatorMap[fn](candles, args.period ?? 14);
      } else {
        const source = closes;
        indicators[id] = indicatorMap[fn](source as any, args.period ?? 14);
      }
    }
    result[symbol] = { candles, closes, indicators };
  }
  return result;
};

const computeMetrics = (equity: number[], dates: string[]): BacktestMetrics => {
  if (equity.length === 0) {
    return {
      cagr: 0,
      stdev: 0,
      maxDrawdown: 0,
      calmar: 0,
      hitRate: 0,
      avgWin: 0,
      avgLoss: 0,
      exposure: 0,
      turnover: 0,
    };
  }
  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1];
    if (prev === 0) {
      dailyReturns.push(0);
    } else {
      dailyReturns.push(equity[i] / prev - 1);
    }
  }
  const totalDays = equity.length;
  const totalYears = totalDays / 252;
  const endingValue = equity[equity.length - 1];
  const startValue = equity[0] === 0 ? 1 : equity[0];
  const cagr = totalYears > 0 ? Math.pow(endingValue / startValue, 1 / totalYears) - 1 : 0;
  const mean = dailyReturns.reduce((acc, val) => acc + val, 0) / Math.max(1, dailyReturns.length);
  const stdev = Math.sqrt(
    dailyReturns.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
      Math.max(1, dailyReturns.length - 1),
  );
  let peak = equity[0];
  let maxDrawdown = 0;
  for (const value of equity) {
    if (value > peak) peak = value;
    const dd = peak === 0 ? 0 : (value - peak) / peak;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }
  const calmar = maxDrawdown !== 0 ? cagr / Math.abs(maxDrawdown) : 0;
  return {
    cagr,
    stdev,
    maxDrawdown,
    calmar,
    hitRate: 0,
    avgWin: 0,
    avgLoss: 0,
    exposure: 0,
    turnover: 0,
  };
};

const finalizeMetrics = (
  base: BacktestMetrics,
  tradeLog: Trade[],
  exposureDays: number,
  totalDays: number,
  turnover: number,
) => {
  const wins = tradeLog.filter((trade) => trade.pnl > 0);
  const losses = tradeLog.filter((trade) => trade.pnl < 0);
  const hitRate = tradeLog.length > 0 ? wins.length / tradeLog.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((acc, t) => acc + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? losses.reduce((acc, t) => acc + t.pnl, 0) / losses.length : 0;
  return {
    ...base,
    hitRate,
    avgWin,
    avgLoss,
    exposure: totalDays > 0 ? exposureDays / totalDays : 0,
    turnover,
  };
};

const shouldRebalance = (strategy: Strategy, dayIndex: number, series: SymbolSeries) => {
  if (strategy.schedule.rebalance === "none") return false;
  switch (strategy.schedule.rebalance) {
    case "weekly":
      return dayIndex % 5 === 0;
    case "monthly": {
      if (dayIndex === 0) return false;
      const current = new Date(series.candles[dayIndex].date);
      const prev = new Date(series.candles[dayIndex - 1].date);
      return current.getMonth() !== prev.getMonth();
    }
    case "quarterly": {
      if (dayIndex === 0) return false;
      const current = new Date(series.candles[dayIndex].date);
      const prev = new Date(series.candles[dayIndex - 1].date);
      const currentQuarter = Math.floor(current.getMonth() / 3);
      const prevQuarter = Math.floor(prev.getMonth() / 3);
      return currentQuarter !== prevQuarter || current.getFullYear() !== prev.getFullYear();
    }
    default:
      return false;
  }
};

const simulate = (
  strategy: Strategy,
  seriesMap: Record<string, SymbolSeries>,
  options: SimulationOptions,
): SimulationOutput => {
  const { startIndex, endIndex } = options;
  const dates = seriesMap[strategy.universe[0]].candles
    .slice(startIndex, endIndex + 1)
    .map((candle) => candle.date);
  let cash = strategy.capital.starting_cash;
  const positions = new Map<string, PortfolioPosition>();
  const equityCurve: number[] = [];
  const equityDates: string[] = [];
  const tradeLog: Trade[] = [];
  const perAsset = new Map<string, { pnl: number; trades: number; exposureDays: number }>();
  let exposureDays = 0;
  let turnoverValue = 0;
  const warnings: string[] = [];

  for (let idx = startIndex; idx <= endIndex; idx++) {
    const currentDate = seriesMap[strategy.universe[0]].candles[idx].date;
    const dailyPrices: Record<string, number> = {};
    strategy.universe.forEach((symbol) => {
      dailyPrices[symbol] = seriesMap[symbol].closes[idx];
    });

    // Risk flags
    const riskStop = new Set<string>();
    const riskTake = new Set<string>();
    positions.forEach((position, symbol) => {
      const price = dailyPrices[symbol];
      if (!Number.isFinite(price)) return;
      if (strategy.risk.stop_loss_pct !== undefined) {
        const threshold = position.entryPrice * (1 - strategy.risk.stop_loss_pct);
        if (price <= threshold) {
          riskStop.add(symbol);
        }
      }
      if (strategy.risk.take_profit_pct !== undefined) {
        const threshold = position.entryPrice * (1 + strategy.risk.take_profit_pct);
        if (price >= threshold) {
          riskTake.add(symbol);
        }
      }
    });

    const closings = new Set<string>();
    riskStop.forEach((symbol) => closings.add(symbol));
    riskTake.forEach((symbol) => closings.add(symbol));

    // Exit rules
    strategy.universe.forEach((symbol) => {
      const ctx: EvaluationContext = {
        symbol,
        index: idx,
        series: seriesMap[symbol],
        riskFlags: { stop: riskStop.has(symbol), take: riskTake.has(symbol) },
      };
      for (const exit of strategy.exits) {
        if (evalExpr(exit.when, ctx, seriesMap)) {
          const target = exit.then.close?.ticker ?? symbol;
          if (target === "*" || target === symbol) {
            closings.add(symbol);
          }
        }
      }
    });

    // Apply closings
    closings.forEach((symbol) => {
      const position = positions.get(symbol);
      if (!position) return;
      const price = dailyPrices[symbol];
      const gross = price * position.shares;
      const commission = strategy.capital.commission;
      const slippage = gross * strategy.capital.slippage_pct;
      const proceeds = gross - commission - slippage;
      const pnl = proceeds - position.costBasis;
      cash += proceeds;
      positions.delete(symbol);
      tradeLog.push({ symbol, date: currentDate, pnl });
      const per = perAsset.get(symbol) ?? { pnl: 0, trades: 0, exposureDays: 0 };
      per.pnl += pnl;
      per.trades += 1;
      perAsset.set(symbol, per);
      turnoverValue += Math.abs(gross);
    });

    // Entry rules & rebalancing
    type PendingBuy = { symbol: string; sizing: Strategy["entries"][number]["then"]["buy"]; };
    const buys: PendingBuy[] = [];
    let rebalanceFlag = false;
    strategy.universe.forEach((symbol) => {
      const ctx: EvaluationContext = {
        symbol,
        index: idx,
        series: seriesMap[symbol],
        riskFlags: { stop: riskStop.has(symbol), take: riskTake.has(symbol) },
      };
      for (const entry of strategy.entries) {
        if (evalExpr(entry.when, ctx, seriesMap)) {
          if (entry.then.buy) {
            const targetTicker = entry.then.buy.ticker === "*" ? symbol : entry.then.buy.ticker;
            buys.push({ symbol: targetTicker, sizing: entry.then.buy });
          }
          if (entry.then.close) {
            const targetTicker = entry.then.close.ticker === "*" ? symbol : entry.then.close.ticker;
            closings.add(targetTicker);
          }
          if (entry.then.rebalance) {
            rebalanceFlag = true;
          }
        }
      }
    });

    // Apply schedule rebalance after entries/exits
    const scheduleRebalance = shouldRebalance(
      strategy,
      idx,
      seriesMap[strategy.universe[0]],
    );
    rebalanceFlag = rebalanceFlag || scheduleRebalance;

    // Execute buys
    buys.sort((a, b) => a.symbol.localeCompare(b.symbol));
    const maxPositions = strategy.risk.max_positions;
    for (const pending of buys) {
      if (!strategy.universe.includes(pending.symbol)) continue;
      if (positions.size >= maxPositions && !positions.has(pending.symbol)) {
        warnings.push(`Max positions reached, skipped ${pending.symbol} on ${currentDate}`);
        continue;
      }
      const price = dailyPrices[pending.symbol];
      if (!Number.isFinite(price)) continue;
      const existing = positions.get(pending.symbol);
      const equityValue = Array.from(positions.entries()).reduce((acc, [sym, pos]) => {
        const px = dailyPrices[sym];
        return acc + (Number.isFinite(px) ? px * pos.shares : 0);
      }, 0) + cash;
      const allocationCap =
        strategy.risk.max_allocation_pct > 0
          ? equityValue * strategy.risk.max_allocation_pct
          : equityValue / Math.max(1, maxPositions);
      const currentValue = existing ? existing.shares * price : 0;
      let budget = 0;
      switch (pending.sizing.sizing.type) {
        case "equal_weight": {
          budget = Math.max(0, allocationCap - currentValue);
          break;
        }
        case "fixed_pct_cash": {
          const pct = pending.sizing.sizing.pct ?? 0.1;
          budget = cash * pct;
          break;
        }
        case "all_in_single": {
          budget = cash;
          break;
      }
      if (budget <= 0) continue;
      const costPerShare = price * (1 + strategy.capital.slippage_pct);
      const shares = Math.floor(budget / costPerShare);
      if (shares <= 0) continue;
      const tradeCost = shares * costPerShare + strategy.capital.commission;
      if (tradeCost > cash) continue;
      cash -= tradeCost;
      const costBasis = tradeCost;
      if (existing) {
        const totalShares = existing.shares + shares;
        const newCostBasis = existing.costBasis + costBasis;
        positions.set(pending.symbol, {
          shares: totalShares,
          costBasis: newCostBasis,
          entryPrice: newCostBasis / totalShares,
          entryDate: existing.entryDate,
        });
      } else {
        positions.set(pending.symbol, {
          shares,
          costBasis,
          entryPrice: costBasis / shares,
          entryDate: currentDate,
        });
      }
      turnoverValue += tradeCost;
    }

    if (rebalanceFlag && positions.size > 0) {
      const equityValue = Array.from(positions.entries()).reduce((acc, [sym, pos]) => {
        const px = dailyPrices[sym];
        return acc + (Number.isFinite(px) ? px * pos.shares : 0);
      }, 0) + cash;
      const targetValue =
        strategy.risk.max_allocation_pct > 0
          ? equityValue * strategy.risk.max_allocation_pct
          : equityValue / Math.max(1, positions.size);
      positions.forEach((position, symbol) => {
        const price = dailyPrices[symbol];
        if (!Number.isFinite(price)) return;
        const desiredShares = Math.floor(targetValue / (price * (1 + strategy.capital.slippage_pct)));
        const deltaShares = desiredShares - position.shares;
        if (deltaShares === 0) return;
        if (deltaShares > 0) {
          const costPerShare = price * (1 + strategy.capital.slippage_pct);
          const tradeCost = deltaShares * costPerShare + strategy.capital.commission;
          if (tradeCost <= cash) {
            cash -= tradeCost;
            position.shares += deltaShares;
            position.costBasis += tradeCost;
            position.entryPrice = position.costBasis / position.shares;
            turnoverValue += tradeCost;
          }
        } else {
          const sellShares = Math.abs(deltaShares);
          const gross = sellShares * price;
          const proceeds = gross - strategy.capital.commission - gross * strategy.capital.slippage_pct;
          cash += proceeds;
          position.shares -= sellShares;
          position.costBasis = position.entryPrice * position.shares;
          turnoverValue += Math.abs(gross);
          if (position.shares <= 0) {
            positions.delete(symbol);
            const pnl = proceeds - position.costBasis;
            tradeLog.push({ symbol, date: currentDate, pnl });
            const per = perAsset.get(symbol) ?? { pnl: 0, trades: 0, exposureDays: 0 };
            per.pnl += pnl;
            per.trades += 1;
            perAsset.set(symbol, per);
          }
        }
      });
    }

    const equity = Array.from(positions.entries()).reduce((acc, [symbol, position]) => {
      const price = dailyPrices[symbol];
      return acc + (Number.isFinite(price) ? price * position.shares : 0);
    }, 0) + cash;

    if (positions.size > 0) {
      exposureDays += 1;
    }
    positions.forEach((_, symbol) => {
      const per = perAsset.get(symbol) ?? { pnl: 0, trades: 0, exposureDays: 0 };
      per.exposureDays += 1;
      perAsset.set(symbol, per);
    });

    equityCurve.push(equity);
    equityDates.push(currentDate);
  }

  const baseMetrics = computeMetrics(equityCurve, equityDates);
  const metrics = finalizeMetrics(
    baseMetrics,
    tradeLog,
    exposureDays,
    equityCurve.length,
    equityCurve.length > 0 ? turnoverValue / equityCurve.length : 0,
  );

  return {
    equity: { dates: equityDates, values: equityCurve },
    metrics,
    perAsset,
    warnings,
  };
};

export const runBacktest = (strategy: Strategy): BacktestResult => {
  const candles: Record<string, Candle[]> = {};
  for (const symbol of strategy.universe) {
    candles[symbol] = generateCandles(symbol, strategy.window.start, strategy.window.end);
  }
  const seriesMap = computeIndicators(strategy, candles);
  const length = seriesMap[strategy.universe[0]].candles.length;
  const splitIndex = Math.floor(length * 0.7);

  const train = simulate(strategy, seriesMap, { startIndex: 0, endIndex: Math.max(splitIndex - 1, 0) });
  const validate = simulate(strategy, seriesMap, {
    startIndex: Math.max(splitIndex, 0),
    endIndex: length - 1,
  });

  const merged: Record<string, { pnl: number; trades: number; exposureDays: number }> = {};
  train.perAsset.forEach((value, key) => {
    merged[key] = { pnl: value.pnl, trades: value.trades, exposureDays: value.exposureDays };
  });
  validate.perAsset.forEach((value, key) => {
    if (!merged[key]) {
      merged[key] = { pnl: 0, trades: 0, exposureDays: 0 };
    }
    merged[key].pnl += value.pnl;
    merged[key].trades += value.trades;
    merged[key].exposureDays += value.exposureDays;
  });

  const perAsset: PerAssetStats[] = Object.entries(merged).map(([symbol, stats]) => ({
    symbol,
    trades: stats.trades,
    pnl: stats.pnl,
    exposure: validate.equity.values.length > 0 ? stats.exposureDays / validate.equity.values.length : 0,
  }));

  const warnings = [...train.warnings, ...validate.warnings];

  return {
    metrics: {
      train: train.metrics,
      validate: validate.metrics,
    },
    equity: {
      train: train.equity,
      validate: validate.equity,
    },
    perAsset,
    warnings,
  };
};
