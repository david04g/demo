export type IndicatorFunction = "SMA" | "EMA" | "RSI" | "ROC" | "ATR";

export type IndicatorDefinition = {
  id: string;
  fn: IndicatorFunction;
  args: Record<string, number>;
  source: "close";
};

export type IndicatorRef = string;

export type ComparisonOp =
  | { gt: [IndicatorRef | number, IndicatorRef | number] }
  | { lt: [IndicatorRef | number, IndicatorRef | number] }
  | { cross_over: [IndicatorRef | number, IndicatorRef | number] }
  | { cross_under: [IndicatorRef | number, IndicatorRef | number] };

export type LogicalOp = { all: BoolExpr[] } | { any: BoolExpr[] };

export type RiskFlag = { risk_stop?: true } | { risk_take?: true };

export type BoolExpr = ComparisonOp | LogicalOp | RiskFlag;

export type ActionBuy = {
  ticker: "*" | string;
  sizing: {
    type: "equal_weight" | "fixed_pct_cash" | "all_in_single";
    pct?: number;
  };
};

export type ActionClose = {
  ticker: "*" | string;
};

export type ActionRebalance = {
  mode: "equal_weight";
};

export type EntryRule = {
  when: BoolExpr;
  then: {
    buy?: ActionBuy;
    rebalance?: ActionRebalance;
    close?: ActionClose;
  };
};

export type ExitRule = {
  when: BoolExpr;
  then: {
    close?: ActionClose;
  };
};

export type Strategy = {
  meta: { name: string; version: number };
  universe: string[];
  window: { start: string; end: string };
  capital: { starting_cash: number; commission: number; slippage_pct: number };
  schedule: { rebalance: "none" | "weekly" | "monthly" | "quarterly"; time_anchor: "close" };
  risk: {
    max_allocation_pct: number;
    max_positions: number;
    stop_loss_pct?: number;
    take_profit_pct?: number;
  };
  indicators: IndicatorDefinition[];
  entries: EntryRule[];
  exits: ExitRule[];
};

export type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BacktestMetrics = {
  cagr: number;
  stdev: number;
  maxDrawdown: number;
  calmar: number;
  hitRate: number;
  avgWin: number;
  avgLoss: number;
  exposure: number;
  turnover: number;
};

export type EquityCurve = {
  dates: string[];
  values: number[];
};

export type PerAssetStats = {
  symbol: string;
  trades: number;
  pnl: number;
  exposure: number;
};

export type BacktestResult = {
  metrics: {
    train: BacktestMetrics;
    validate: BacktestMetrics;
  };
  equity: {
    train: EquityCurve;
    validate: EquityCurve;
  };
  perAsset: PerAssetStats[];
  warnings: string[];
};
