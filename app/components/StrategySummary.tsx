import { Strategy } from "@/lib/types";

type StrategySummaryProps = {
  strategy: Strategy;
};

const describeBool = (expr: any): string => {
  if (!expr) return "";
  if (expr.all) {
    return expr.all.map(describeBool).join(" AND ");
  }
  if (expr.any) {
    return expr.any.map(describeBool).join(" OR ");
  }
  if (expr.gt) {
    return `${describeOperand(expr.gt[0])} is greater than ${describeOperand(expr.gt[1])}`;
  }
  if (expr.lt) {
    return `${describeOperand(expr.lt[0])} is less than ${describeOperand(expr.lt[1])}`;
  }
  if (expr.cross_over) {
    return `${describeOperand(expr.cross_over[0])} crosses above ${describeOperand(expr.cross_over[1])}`;
  }
  if (expr.cross_under) {
    return `${describeOperand(expr.cross_under[0])} crosses below ${describeOperand(expr.cross_under[1])}`;
  }
  if (expr.risk_stop) {
    return `Risk stop triggered`;
  }
  if (expr.risk_take) {
    return `Risk take-profit triggered`;
  }
  return "condition";
};

const describeOperand = (value: string | number) => {
  if (typeof value === "number") return value.toString();
  if (value.startsWith("@")) return value.replace("@", "");
  return value;
};

const describeSizing = (strategy: Strategy["entries"][number]["then"]["buy"] | undefined) => {
  if (!strategy) return "no sizing";
  switch (strategy.sizing.type) {
    case "equal_weight":
      return "equal weight of allowed capital";
    case "fixed_pct_cash":
      return `${Math.round((strategy.sizing.pct ?? 0) * 100)}% of cash`;
    case "all_in_single":
      return "all remaining cash";
    default:
      return "custom sizing";
  }
};

export const StrategySummary = ({ strategy }: StrategySummaryProps) => {
  return (
    <div className="card space-y-4">
      <header>
        <h2 className="section-title">Natural Language Summary</h2>
        <p className="mt-1 text-sm text-slate-400">
          {strategy.meta.name} trades {strategy.universe.join(", ")} between {strategy.window.start} and {" "}
          {strategy.window.end} with ${strategy.capital.starting_cash.toLocaleString()} starting capital.
        </p>
      </header>
      <div className="space-y-3 text-sm text-slate-200">
        {strategy.entries.map((entry, idx) => (
          <div key={idx}>
            <div className="font-semibold text-slate-100">Entry #{idx + 1}</div>
            <p>
              When {describeBool(entry.when)}, then buy {entry.then.buy?.ticker ?? "the signal ticker"} using {" "}
              {describeSizing(entry.then.buy)}.
              {entry.then.rebalance ? " Rebalance equally after fills." : ""}
              {entry.then.close ? ` Close ${entry.then.close.ticker}.` : ""}
            </p>
          </div>
        ))}
        {strategy.exits.map((exit, idx) => (
          <div key={idx}>
            <div className="font-semibold text-slate-100">Exit #{idx + 1}</div>
            <p>
              When {describeBool(exit.when)}, close {exit.then.close?.ticker ?? "position"}.
            </p>
          </div>
        ))}
        <div>
          <div className="font-semibold text-slate-100">Risk</div>
          <p>
            Max allocation {Math.round(strategy.risk.max_allocation_pct * 100)}%, maximum positions {" "}
            {strategy.risk.max_positions}. Stop loss {strategy.risk.stop_loss_pct ?? 0} / take profit {" "}
            {strategy.risk.take_profit_pct ?? 0}.
          </p>
        </div>
      </div>
    </div>
  );
};
