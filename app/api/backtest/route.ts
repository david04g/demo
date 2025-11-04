import { NextRequest, NextResponse } from "next/server";
import { runBacktest } from "@/lib/sim";
import { strategySchema, validateStrategy } from "@/lib/validate";
import { Strategy } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const strategy: Strategy = body.strategy;
    const parsed = strategySchema.safeParse(strategy);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: parsed.error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }
    const guard = validateStrategy(parsed.data);
    if (guard.ok === false) {
      return NextResponse.json(
        {
          message: "Validation failed",
          errors: guard.errors.map((message) => ({ message })),
        },
        { status: 400 },
      );
    }
    const result = runBacktest(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      {
        message: "Unexpected error",
        error: error?.message ?? "Unknown",
      },
      { status: 500 },
    );
  }
}
