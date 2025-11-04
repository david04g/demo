import { z } from "zod";
import { Strategy } from "@/lib/types";
import { warmupPeriods } from "@/lib/indicators";

const indicatorSchema = z.object({
  id: z
    .string()
    .min(1)
    .regex(/^@[a-zA-Z0-9_\-]+$/, "Indicator id must start with @ and contain alphanumerics"),
  fn: z.enum(["SMA", "EMA", "RSI", "ROC", "ATR"]),
  args: z.record(z.number().finite()),
  source: z.literal("close"),
});

const operand = z.union([z.number().finite(), z.string().regex(/^@[a-zA-Z0-9_\-]+$/)]);

const boolExpr: z.ZodTypeAny = z.lazy(() =>
  z.union([
    z.object({ all: z.array(boolExpr).min(1) }),
    z.object({ any: z.array(boolExpr).min(1) }),
    z.object({ gt: z.tuple([operand, operand]) }),
    z.object({ lt: z.tuple([operand, operand]) }),
    z.object({ cross_over: z.tuple([operand, operand]) }),
    z.object({ cross_under: z.tuple([operand, operand]) }),
    z.object({ risk_stop: z.literal(true) }).partial(),
    z.object({ risk_take: z.literal(true) }).partial(),
  ])
);

const actionBuy = z.object({
  ticker: z.union([z.literal("*"), z.string().min(1)]),
  sizing: z.object({
    type: z.enum(["equal_weight", "fixed_pct_cash", "all_in_single"]),
    pct: z.number().finite().min(0).max(1).optional(),
  }),
});

const actionClose = z.object({ ticker: z.union([z.literal("*"), z.string().min(1)]) });
const actionRebalance = z.object({ mode: z.literal("equal_weight") });

export const strategySchema = z.object({
  meta: z.object({
    name: z.string().min(1),
    version: z.number().int().min(1),
  }),
  universe: z.array(z.string().min(1)).min(1).max(50),
  window: z.object({
    start: z.string().refine((val) => !Number.isNaN(Date.parse(val)), "Invalid ISO date"),
    end: z.string().refine((val) => !Number.isNaN(Date.parse(val)), "Invalid ISO date"),
  }),
  capital: z.object({
    starting_cash: z.number().finite().positive(),
    commission: z.number().finite().min(0),
    slippage_pct: z.number().finite().min(0).max(0.05),
  }),
  schedule: z.object({
    rebalance: z.enum(["none", "weekly", "monthly", "quarterly"]),
    time_anchor: z.literal("close"),
  }),
  risk: z.object({
    max_allocation_pct: z.number().finite().min(0).max(1),
    max_positions: z.number().int().min(1),
    stop_loss_pct: z.number().finite().min(0).max(1).optional(),
    take_profit_pct: z.number().finite().min(0).max(1).optional(),
  }),
  indicators: z.array(indicatorSchema).superRefine((arr, ctx) => {
    const seen = new Set<string>();
    for (const indicator of arr) {
      if (seen.has(indicator.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate indicator id: ${indicator.id}`,
        });
      }
      seen.add(indicator.id);
      Object.values(indicator.args).forEach((value) => {
        if (!Number.isFinite(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Indicator ${indicator.id} has non-finite argument`,
          });
        }
      });
    }
  }),
  entries: z.array(
    z.object({
      when: boolExpr,
      then: z
        .object({
          buy: actionBuy.optional(),
          rebalance: actionRebalance.optional(),
          close: actionClose.optional(),
        })
        .refine((val) => val.buy || val.close || val.rebalance, {
          message: "Entry action must include at least one outcome",
        }),
    })
  ),
  exits: z.array(
    z.object({
      when: boolExpr,
      then: z
        .object({
          close: actionClose.optional(),
        })
        .refine((val) => Boolean(val.close), {
          message: "Exit action must include close",
        }),
    })
  ),
});

const collectOperands = (expr: unknown, bucket: Set<string>) => {
  if (!expr || typeof expr !== "object") return;
  if ("all" in (expr as any)) {
    (expr as any).all.forEach((child: unknown) => collectOperands(child, bucket));
  } else if ("any" in (expr as any)) {
    (expr as any).any.forEach((child: unknown) => collectOperands(child, bucket));
  } else {
    ["gt", "lt", "cross_over", "cross_under"].forEach((key) => {
      if (key in (expr as any)) {
        const tuple = (expr as any)[key];
        tuple.forEach((val: unknown) => {
          if (typeof val === "string" && val.startsWith("@")) {
            bucket.add(val);
          }
        });
      }
    });
  }
};

export const validateStrategy = (strategy: Strategy): { ok: true } | { ok: false; errors: string[] } => {
  const parsed = strategySchema.safeParse(strategy);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`),
    };
  }
  const { indicators, window, entries, exits } = parsed.data;
  const start = new Date(window.start);
  const end = new Date(window.end);
  if (end <= start) {
    return { ok: false, errors: ["window.end must be after window.start"] };
  }
  const indicatorIds = new Set(indicators.map((i) => i.id));
  const referenced = new Set<string>();
  entries.forEach((entry) => collectOperands(entry.when, referenced));
  exits.forEach((exit) => collectOperands(exit.when, referenced));
  for (const ref of referenced) {
    if (!indicatorIds.has(ref)) {
      return { ok: false, errors: [`Reference to undefined indicator ${ref}`] };
    }
  }
  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const maxWarmup = indicators.reduce((max, ind) => {
    const warmup = warmupPeriods[ind.fn](ind.args);
    return Math.max(max, warmup);
  }, 0);
  if (days < maxWarmup + 252) {
    return {
      ok: false,
      errors: [
        `window length must be at least ${maxWarmup + 252} days to cover indicator warmup + 252 sessions`,
      ],
    };
  }
  return { ok: true };
};
