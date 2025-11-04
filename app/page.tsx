"use client";

import { useMemo, useState } from "react";
import { StrategyBuilder } from "@/app/components/StrategyBuilder";
import { StrategySummary } from "@/app/components/StrategySummary";
import { Presets, presets } from "@/app/components/Presets";
import { ResultsView } from "@/app/components/ResultsView";
import { BacktestResult, Strategy } from "@/lib/types";
import { validateStrategy } from "@/lib/validate";

const defaultStrategy: Strategy = structuredClone(presets["SMA 20/50"]);

export default function Page() {
  const [strategy, setStrategy] = useState<Strategy>(defaultStrategy);
  const [result, setResult] = useState<BacktestResult>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const json = useMemo(() => JSON.stringify(strategy, null, 2), [strategy]);

  const runBacktest = async () => {
    const check = validateStrategy(strategy);
    if (!check.ok) {
      setValidationErrors(check.errors);
      setError("Validation failed. Please review the guardrails.");
      return;
    }
    setValidationErrors([]);
    setError(undefined);
    setLoading(true);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy }),
      });
      if (!res.ok) {
        const payload = await res.json();
        throw new Error(payload.errors?.map((e: any) => e.message).join("\n") ?? payload.message ?? "Request failed");
      }
      const payload = (await res.json()) as BacktestResult;
      setResult(payload);
    } catch (err: any) {
      setError(err.message ?? "Failed to run backtest");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold text-white">EOD Strategy Lab</h1>
        <p className="max-w-3xl text-sm text-slate-400">
          Build rule-based, end-of-day strategies with guardrails, preview the JSON spec, and backtest across deterministic
          synthetic candles. All execution happens at the close with a train/validate split.
        </p>
      </header>

      <Presets
        onSelect={(preset) => {
          setStrategy(preset);
          setResult(undefined);
        }}
      />

      <StrategyBuilder strategy={strategy} onChange={setStrategy} />

      <div className="grid gap-6 lg:grid-cols-2">
        <StrategySummary strategy={strategy} />
        <div className="card space-y-3">
          <h2 className="section-title">Strategy JSON</h2>
          <textarea className="input h-80 whitespace-pre font-mono text-xs" value={json} readOnly />
          {validationErrors.length > 0 && (
            <div className="rounded-lg border border-red-600/50 bg-red-900/40 px-3 py-2 text-sm text-red-100">
              {validationErrors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          )}
          <button
            onClick={runBacktest}
            disabled={loading}
            className="w-full rounded-xl bg-brand px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {loading ? "Running backtest…" : "Run Backtest"}
          </button>
        </div>
      </div>

      <ResultsView result={result} loading={loading} error={error} />
    </main>
  );
}
