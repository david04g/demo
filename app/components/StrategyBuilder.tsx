"use client";

import { useCallback } from "react";
import { Strategy } from "@/lib/types";

export type ConditionRow = {
  id: string;
  kind: "gt" | "lt" | "cross_over" | "cross_under" | "risk_stop" | "risk_take";
  left?: string;
  right?: string;
};

type ConditionGroup = {
  mode: "all" | "any";
  rows: ConditionRow[];
};

type StrategyBuilderProps = {
  strategy: Strategy;
  onChange: (strategy: Strategy) => void;
};

const toConditionGroup = (expr: Strategy["entries"][number]["when"]): ConditionGroup => {
  if ("all" in expr) {
    return {
      mode: "all",
      rows: expr.all.map((item, idx) => convertRow(item, idx.toString())),
    };
  }
  if ("any" in expr) {
    return {
      mode: "any",
      rows: expr.any.map((item, idx) => convertRow(item, idx.toString())),
    };
  }
  return {
    mode: "all",
    rows: [convertRow(expr, "0")],
  };
};

const convertRow = (item: any, id: string): ConditionRow => {
  if (item.gt) {
    return { id, kind: "gt", left: formatOperand(item.gt[0]), right: formatOperand(item.gt[1]) };
  }
  if (item.lt) {
    return { id, kind: "lt", left: formatOperand(item.lt[0]), right: formatOperand(item.lt[1]) };
  }
  if (item.cross_over) {
    return {
      id,
      kind: "cross_over",
      left: formatOperand(item.cross_over[0]),
      right: formatOperand(item.cross_over[1]),
    };
  }
  if (item.cross_under) {
    return {
      id,
      kind: "cross_under",
      left: formatOperand(item.cross_under[0]),
      right: formatOperand(item.cross_under[1]),
    };
  }
  if (item.risk_stop) {
    return { id, kind: "risk_stop" };
  }
  if (item.risk_take) {
    return { id, kind: "risk_take" };
  }
  return { id, kind: "gt", left: "@close", right: "0" };
};

const formatOperand = (operand: string | number) => {
  if (typeof operand === "number") return operand.toString();
  return operand;
};

const parseOperand = (value?: string) => {
  if (!value) return 0;
  if (value.startsWith("@")) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toBoolExpr = (group: ConditionGroup): Strategy["entries"][number]["when"] => {
  const rows = group.rows.map((row) => {
    switch (row.kind) {
      case "gt":
        return { gt: [parseOperand(row.left), parseOperand(row.right)] };
      case "lt":
        return { lt: [parseOperand(row.left), parseOperand(row.right)] };
      case "cross_over":
        return { cross_over: [parseOperand(row.left), parseOperand(row.right)] };
      case "cross_under":
        return { cross_under: [parseOperand(row.left), parseOperand(row.right)] };
      case "risk_stop":
        return { risk_stop: true } as any;
      case "risk_take":
        return { risk_take: true } as any;
    }
  });
  if (group.mode === "all") {
    return { all: rows } as any;
  }
  return { any: rows } as any;
};

export const StrategyBuilder = ({ strategy, onChange }: StrategyBuilderProps) => {
  const update = useCallback(
    (partial: Partial<Strategy>) => {
      onChange({ ...strategy, ...partial });
    },
    [onChange, strategy],
  );

  const handleUniverse = useCallback(
    (value: string) => {
      const symbols = value
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      update({ universe: symbols });
    },
    [update],
  );

  const handleWindow = useCallback(
    (key: "start" | "end", value: string) => {
      update({ window: { ...strategy.window, [key]: value } });
    },
    [strategy.window, update],
  );

  const handleCapital = useCallback(
    (key: keyof Strategy["capital"], value: number) => {
      update({ capital: { ...strategy.capital, [key]: value } });
    },
    [strategy.capital, update],
  );

  const handleRisk = useCallback(
    (key: keyof Strategy["risk"], value: number | undefined) => {
      update({ risk: { ...strategy.risk, [key]: value } });
    },
    [strategy.risk, update],
  );

  const addIndicator = useCallback(() => {
    const nextIndex = strategy.indicators.length + 1;
    const id = `@ind_${nextIndex}`;
    update({
      indicators: [
        ...strategy.indicators,
        { id, fn: "SMA", args: { period: 20 }, source: "close" },
      ],
    });
  }, [strategy.indicators, update]);

  const updateIndicator = useCallback(
    (index: number, key: "fn" | "args" | "id", value: any) => {
      const copy = [...strategy.indicators];
      if (!copy[index]) return;
      copy[index] = { ...copy[index], [key]: value };
      update({ indicators: copy });
    },
    [strategy.indicators, update],
  );

  const removeIndicator = useCallback(
    (index: number) => {
      const copy = strategy.indicators.filter((_, idx) => idx !== index);
      update({ indicators: copy });
    },
    [strategy.indicators, update],
  );

  const updateConditions = useCallback(
    (
      type: "entries" | "exits",
      index: number,
      updater: (group: ConditionGroup) => ConditionGroup,
    ) => {
      const list = [...strategy[type]];
      const current = list[index];
      if (!current) return;
      const group = toConditionGroup(current.when);
      const updatedGroup = updater(group);
      const when = toBoolExpr(updatedGroup);
      list[index] = { ...current, when } as any;
      update({ [type]: list } as any);
    },
    [strategy, update],
  );

  const updateEntryAction = useCallback(
    (index: number, partial: any) => {
      const entries = [...strategy.entries];
      const current = entries[index];
      if (!current) return;
      entries[index] = {
        ...current,
        then: {
          ...current.then,
          ...partial,
        },
      };
      update({ entries });
    },
    [strategy.entries, update],
  );

  const updateExitAction = useCallback(
    (index: number, ticker: string) => {
      const exits = [...strategy.exits];
      const current = exits[index];
      if (!current) return;
      exits[index] = {
        ...current,
        then: { close: { ticker } },
      };
      update({ exits });
    },
    [strategy.exits, update],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-4">
        <div>
          <h2 className="section-title">Universe & Window</h2>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="label">Tickers</span>
              <input
                className="input mt-1"
                value={strategy.universe.join(", ")}
                onChange={(event) => handleUniverse(event.target.value)}
                placeholder="AAPL, MSFT"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="label">Start</span>
                <input
                  type="date"
                  className="input mt-1"
                  value={strategy.window.start}
                  onChange={(event) => handleWindow("start", event.target.value)}
                />
              </label>
              <label className="block">
                <span className="label">End</span>
                <input
                  type="date"
                  className="input mt-1"
                  value={strategy.window.end}
                  onChange={(event) => handleWindow("end", event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>

        <div>
          <h2 className="section-title">Capital & Costs</h2>
          <div className="mt-3 grid grid-cols-3 gap-3">
            {([
              ["starting_cash", "Starting Cash"],
              ["commission", "Commission"],
              ["slippage_pct", "Slippage %"],
            ] as const).map(([key, label]) => (
              <label className="block" key={key}>
                <span className="label">{label}</span>
                <input
                  type="number"
                  step="0.01"
                  className="input mt-1"
                  value={strategy.capital[key]}
                  onChange={(event) => handleCapital(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h2 className="section-title">Risk Controls</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Max Allocation %</span>
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={strategy.risk.max_allocation_pct}
                onChange={(event) => handleRisk("max_allocation_pct", Number(event.target.value))}
              />
            </label>
            <label className="block">
              <span className="label">Max Positions</span>
              <input
                type="number"
                className="input mt-1"
                value={strategy.risk.max_positions}
                onChange={(event) => handleRisk("max_positions", Number(event.target.value))}
              />
            </label>
            <label className="block">
              <span className="label">Stop Loss %</span>
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={strategy.risk.stop_loss_pct ?? ""}
                onChange={(event) =>
                  handleRisk(
                    "stop_loss_pct",
                    event.target.value === "" ? undefined : Number(event.target.value),
                  )
                }
              />
            </label>
            <label className="block">
              <span className="label">Take Profit %</span>
              <input
                type="number"
                step="0.01"
                className="input mt-1"
                value={strategy.risk.take_profit_pct ?? ""}
                onChange={(event) =>
                  handleRisk(
                    "take_profit_pct",
                    event.target.value === "" ? undefined : Number(event.target.value),
                  )
                }
              />
            </label>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Indicators</h2>
          <button className="rounded-lg bg-brand px-3 py-1 text-sm font-semibold text-white" onClick={addIndicator}>
            + Add
          </button>
        </div>
        <div className="space-y-3">
          {strategy.indicators.map((indicator, index) => (
            <div key={indicator.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-200">{indicator.id}</div>
                <button
                  className="text-xs text-slate-400 hover:text-red-400"
                  onClick={() => removeIndicator(index)}
                >
                  Remove
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                <label className="block">
                  <span className="label">Function</span>
                  <select
                    className="input mt-1"
                    value={indicator.fn}
                    onChange={(event) => updateIndicator(index, "fn", event.target.value)}
                  >
                    {(["SMA", "EMA", "RSI", "ROC", "ATR"] as const).map((fn) => (
                      <option key={fn} value={fn}>
                        {fn}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="label">Period</span>
                  <input
                    type="number"
                    className="input mt-1"
                    value={indicator.args.period ?? 20}
                    onChange={(event) =>
                      updateIndicator(index, "args", { ...indicator.args, period: Number(event.target.value) })
                    }
                  />
                </label>
                <label className="block">
                  <span className="label">Id</span>
                  <input
                    className="input mt-1"
                    value={indicator.id}
                    onChange={(event) => updateIndicator(index, "id", event.target.value)}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-4 lg:col-span-2">
        <header className="flex items-center justify-between">
          <h2 className="section-title">Entry Logic</h2>
        </header>
        {strategy.entries.map((entry, entryIndex) => {
          const group = toConditionGroup(entry.when);
          return (
            <div key={entryIndex} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-300">
                  Mode
                  <select
                    className="input mt-1"
                    value={group.mode}
                    onChange={(event) =>
                      updateConditions("entries", entryIndex, (current) => ({
                        ...current,
                        mode: event.target.value as ConditionGroup["mode"],
                      }))
                    }
                  >
                    <option value="all">ALL</option>
                    <option value="any">ANY</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 space-y-3">
                {group.rows.map((row, rowIndex) => (
                  <div key={row.id} className="grid grid-cols-4 gap-3 text-sm">
                    <select
                      className="input"
                      value={row.kind}
                      onChange={(event) =>
                        updateConditions("entries", entryIndex, (current) => ({
                          ...current,
                          rows: current.rows.map((r, idx) =>
                            idx === rowIndex
                              ? {
                                  ...r,
                                  kind: event.target.value as ConditionRow["kind"],
                                }
                              : r,
                          ),
                        }))
                      }
                    >
                      <option value="gt">Indicator &gt; Value</option>
                      <option value="lt">Indicator &lt; Value</option>
                      <option value="cross_over">Cross Over</option>
                      <option value="cross_under">Cross Under</option>
                      <option value="risk_stop">Risk Stop</option>
                      <option value="risk_take">Risk Take</option>
                    </select>
                    {row.kind === "risk_stop" || row.kind === "risk_take" ? (
                      <div className="col-span-3 flex items-center text-xs text-slate-400">
                        Evaluates the account-level risk flags
                      </div>
                    ) : (
                      <>
                        <input
                          className="input"
                          value={row.left ?? ""}
                          onChange={(event) =>
                            updateConditions("entries", entryIndex, (current) => ({
                              ...current,
                              rows: current.rows.map((r, idx) =>
                                idx === rowIndex
                                  ? {
                                      ...r,
                                      left: event.target.value,
                                    }
                                  : r,
                              ),
                            }))
                          }
                          placeholder="@sma_fast"
                        />
                        <span className="flex items-center justify-center text-xs text-slate-400">vs</span>
                        <input
                          className="input"
                          value={row.right ?? ""}
                          onChange={(event) =>
                            updateConditions("entries", entryIndex, (current) => ({
                              ...current,
                              rows: current.rows.map((r, idx) =>
                                idx === rowIndex
                                  ? {
                                      ...r,
                                      right: event.target.value,
                                    }
                                  : r,
                              ),
                            }))
                          }
                          placeholder="@sma_slow or 0"
                        />
                      </>
                    )}
                  </div>
                ))}
                <button
                  className="rounded-lg border border-dashed border-slate-700 px-3 py-1 text-xs text-slate-300"
                  onClick={() =>
                    updateConditions("entries", entryIndex, (current) => ({
                      ...current,
                      rows: [
                        ...current.rows,
                        {
                          id: `${current.rows.length}`,
                          kind: "gt",
                          left: "@indicator",
                          right: "0",
                        },
                      ],
                    }))
                  }
                >
                  + Add Condition
                </button>
              </div>

              <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                <label className="block">
                  <span className="label">Buy Ticker</span>
                  <input
                    className="input mt-1"
                    value={entry.then.buy?.ticker ?? "*"}
                    onChange={(event) =>
                      updateEntryAction(entryIndex, {
                        buy: {
                          ...(entry.then.buy ?? { sizing: { type: "equal_weight" as const } }),
                          ticker: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className="block">
                  <span className="label">Sizing</span>
                  <select
                    className="input mt-1"
                    value={entry.then.buy?.sizing.type ?? "equal_weight"}
                    onChange={(event) =>
                      updateEntryAction(entryIndex, {
                        buy: {
                          ticker: entry.then.buy?.ticker ?? "*",
                          sizing: {
                            type: event.target.value as any,
                            pct: entry.then.buy?.sizing.pct,
                          },
                        },
                      })
                    }
                  >
                    <option value="equal_weight">Equal Weight</option>
                    <option value="fixed_pct_cash">Fixed % Cash</option>
                    <option value="all_in_single">All-in Single</option>
                  </select>
                </label>
                {entry.then.buy?.sizing.type === "fixed_pct_cash" && (
                  <label className="block">
                    <span className="label">Pct</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input mt-1"
                      value={entry.then.buy.sizing.pct ?? 0.1}
                      onChange={(event) =>
                        updateEntryAction(entryIndex, {
                          buy: {
                            ticker: entry.then.buy?.ticker ?? "*",
                            sizing: {
                              type: "fixed_pct_cash",
                              pct: Number(event.target.value),
                            },
                          },
                        })
                      }
                    />
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={Boolean(entry.then.rebalance)}
                    onChange={(event) =>
                      updateEntryAction(entryIndex, {
                        rebalance: event.target.checked ? { mode: "equal_weight" } : undefined,
                      })
                    }
                  />
                  Rebalance after fill
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card space-y-4 lg:col-span-2">
        <h2 className="section-title">Exit Logic</h2>
        {strategy.exits.map((exit, exitIndex) => {
          const group = toConditionGroup(exit.when);
          return (
            <div key={exitIndex} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm text-slate-300">
                  Mode
                  <select
                    className="input mt-1"
                    value={group.mode}
                    onChange={(event) =>
                      updateConditions("exits", exitIndex, (current) => ({
                        ...current,
                        mode: event.target.value as ConditionGroup["mode"],
                      }))
                    }
                  >
                    <option value="all">ALL</option>
                    <option value="any">ANY</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 space-y-3">
                {group.rows.map((row, rowIndex) => (
                  <div key={row.id} className="grid grid-cols-4 gap-3 text-sm">
                    <select
                      className="input"
                      value={row.kind}
                      onChange={(event) =>
                        updateConditions("exits", exitIndex, (current) => ({
                          ...current,
                          rows: current.rows.map((r, idx) =>
                            idx === rowIndex
                              ? {
                                  ...r,
                                  kind: event.target.value as ConditionRow["kind"],
                                }
                              : r,
                          ),
                        }))
                      }
                    >
                      <option value="gt">Indicator &gt; Value</option>
                      <option value="lt">Indicator &lt; Value</option>
                      <option value="cross_over">Cross Over</option>
                      <option value="cross_under">Cross Under</option>
                      <option value="risk_stop">Risk Stop</option>
                      <option value="risk_take">Risk Take</option>
                    </select>
                    {row.kind === "risk_stop" || row.kind === "risk_take" ? (
                      <div className="col-span-3 flex items-center text-xs text-slate-400">
                        Evaluates the account-level risk flags
                      </div>
                    ) : (
                      <>
                        <input
                          className="input"
                          value={row.left ?? ""}
                          onChange={(event) =>
                            updateConditions("exits", exitIndex, (current) => ({
                              ...current,
                              rows: current.rows.map((r, idx) =>
                                idx === rowIndex
                                  ? {
                                      ...r,
                                      left: event.target.value,
                                    }
                                  : r,
                              ),
                            }))
                          }
                          placeholder="@indicator"
                        />
                        <span className="flex items-center justify-center text-xs text-slate-400">vs</span>
                        <input
                          className="input"
                          value={row.right ?? ""}
                          onChange={(event) =>
                            updateConditions("exits", exitIndex, (current) => ({
                              ...current,
                              rows: current.rows.map((r, idx) =>
                                idx === rowIndex
                                  ? {
                                      ...r,
                                      right: event.target.value,
                                    }
                                  : r,
                              ),
                            }))
                          }
                          placeholder="@indicator"
                        />
                      </>
                    )}
                  </div>
                ))}
                <button
                  className="rounded-lg border border-dashed border-slate-700 px-3 py-1 text-xs text-slate-300"
                  onClick={() =>
                    updateConditions("exits", exitIndex, (current) => ({
                      ...current,
                      rows: [
                        ...current.rows,
                        {
                          id: `${current.rows.length}`,
                          kind: "lt",
                          left: "@indicator",
                          right: "0",
                        },
                      ],
                    }))
                  }
                >
                  + Add Condition
                </button>
              </div>
              <div className="mt-4">
                <label className="text-sm text-slate-300">
                  Close Ticker
                  <input
                    className="input mt-1"
                    value={exit.then.close?.ticker ?? "*"}
                    onChange={(event) => updateExitAction(exitIndex, event.target.value)}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
};
