import { Strategy } from "@/lib/types";

const baseWindow = {
  start: "2015-01-02",
  end: "2024-01-02",
};

const meta = (name: string) => ({ name, version: 1 });

const baseCapital = {
  starting_cash: 100000,
  commission: 1,
  slippage_pct: 0.0005,
};

const baseRisk = {
  max_allocation_pct: 0.25,
  max_positions: 4,
};

export const presets: Record<string, Strategy> = {
  "Buy & Hold": {
    meta: meta("Buy & Hold"),
    universe: ["SPY"],
    window: baseWindow,
    capital: baseCapital,
    schedule: { rebalance: "none", time_anchor: "close" },
    risk: { ...baseRisk, max_allocation_pct: 1 },
    indicators: [
      { id: "@price", fn: "SMA", args: { period: 1 }, source: "close" },
    ],
    entries: [
      {
        when: { any: [{ lt: ["@price", 1_000_000] }] },
        then: {
          buy: { ticker: "SPY", sizing: { type: "all_in_single" } },
        },
      },
    ],
    exits: [
      {
        when: { any: [{ risk_take: true }] },
        then: { close: { ticker: "SPY" } },
      },
    ],
  },
  "DCA Monthly": {
    meta: meta("DCA Monthly"),
    universe: ["SPY"],
    window: baseWindow,
    capital: baseCapital,
    schedule: { rebalance: "monthly", time_anchor: "close" },
    risk: { ...baseRisk, max_allocation_pct: 0.5 },
    indicators: [
      { id: "@trend", fn: "SMA", args: { period: 20 }, source: "close" },
    ],
    entries: [
      {
        when: { any: [{ lt: ["@trend", 1_000_000] }] },
        then: {
          buy: { ticker: "SPY", sizing: { type: "fixed_pct_cash", pct: 0.2 } },
        },
      },
    ],
    exits: [
      {
        when: { any: [{ risk_stop: true }] },
        then: { close: { ticker: "SPY" } },
      },
    ],
  },
  "SMA 20/50": {
    meta: meta("SMA 20/50"),
    universe: ["SPY", "QQQ"],
    window: baseWindow,
    capital: baseCapital,
    schedule: { rebalance: "monthly", time_anchor: "close" },
    risk: { ...baseRisk, max_allocation_pct: 0.33 },
    indicators: [
      { id: "@sma_fast", fn: "SMA", args: { period: 20 }, source: "close" },
      { id: "@sma_slow", fn: "SMA", args: { period: 50 }, source: "close" },
    ],
    entries: [
      {
        when: { all: [{ cross_over: ["@sma_fast", "@sma_slow"] }] },
        then: {
          buy: { ticker: "*", sizing: { type: "equal_weight" } },
          rebalance: { mode: "equal_weight" },
        },
      },
    ],
    exits: [
      {
        when: { any: [{ cross_under: ["@sma_fast", "@sma_slow"] }] },
        then: { close: { ticker: "*" } },
      },
    ],
  },
  "RSI(14) Mean Reversion": {
    meta: meta("RSI(14) Mean Reversion"),
    universe: ["IWM", "DIA"],
    window: baseWindow,
    capital: baseCapital,
    schedule: { rebalance: "weekly", time_anchor: "close" },
    risk: { ...baseRisk, max_allocation_pct: 0.3 },
    indicators: [
      { id: "@rsi", fn: "RSI", args: { period: 14 }, source: "close" },
    ],
    entries: [
      {
        when: { all: [{ lt: ["@rsi", 30] }] },
        then: {
          buy: { ticker: "*", sizing: { type: "fixed_pct_cash", pct: 0.25 } },
        },
      },
    ],
    exits: [
      {
        when: { all: [{ gt: ["@rsi", 50] }] },
        then: { close: { ticker: "*" } },
      },
    ],
  },
};

type PresetsProps = {
  onSelect: (strategy: Strategy) => void;
};

export const Presets = ({ onSelect }: PresetsProps) => {
  return (
    <div className="card space-y-3">
      <h2 className="section-title">Presets</h2>
      <div className="grid gap-2 md:grid-cols-2">
        {Object.entries(presets).map(([name, strategy]) => (
          <button
            key={name}
            className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:border-brand hover:bg-brand/20"
            onClick={() => onSelect(structuredClone(strategy))}
          >
            {name}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Loading a preset replaces the current configuration. All synthetic data is deterministic, so reruns are
        reproducible.
      </p>
    </div>
  );
};
