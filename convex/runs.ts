import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

declare const process: any;

// Log a single tracker execution run
export const saveRunRecord = mutation({
  args: {
    secretKey: v.string(),
    tweetsProcessed: v.number(),
    modelUsed: v.string(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalCost: v.number(),
    timestamp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.secretKey !== process.env.BACKEND_SECRET_KEY) {
      throw new Error("Unauthorized: Invalid backend secret key.");
    }
    await ctx.db.insert("tracker_runs", {
      tweetsProcessed: args.tweetsProcessed,
      modelUsed: args.modelUsed,
      totalInputTokens: args.totalInputTokens,
      totalOutputTokens: args.totalOutputTokens,
      totalCost: args.totalCost,
      timestamp: args.timestamp || new Date().toISOString(),
    });
  },
});

// Bulk insert run logs (primarily used for data migration)
export const bulkInsertRuns = mutation({
  args: {
    secretKey: v.string(),
    runs: v.array(
      v.object({
        tweetsProcessed: v.number(),
        modelUsed: v.string(),
        totalInputTokens: v.number(),
        totalOutputTokens: v.number(),
        totalCost: v.number(),
        timestamp: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    if (args.secretKey !== process.env.BACKEND_SECRET_KEY) {
      throw new Error("Unauthorized: Invalid backend secret key.");
    }
    for (const run of args.runs) {
      await ctx.db.insert("tracker_runs", {
        ...run,
        timestamp: run.timestamp || new Date().toISOString(),
      });
    }
  },
});

// Query to get recent tracker runs
export const getRecentRuns = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("tracker_runs")
      .order("desc")
      .take(limit);
  },
});

// Query to get aggregated run stats
export const getRunStats = query({
  args: {},
  handler: async (ctx) => {
    const allRuns = await ctx.db
      .query("tracker_runs")
      .collect();

    let totalCost = 0;
    let totalTweetsProcessed = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const modelCounts: Record<string, number> = {};

    for (const r of allRuns) {
      totalCost += r.totalCost;
      totalTweetsProcessed += r.tweetsProcessed;
      totalInputTokens += r.totalInputTokens;
      totalOutputTokens += r.totalOutputTokens;
      modelCounts[r.modelUsed] = (modelCounts[r.modelUsed] || 0) + 1;
    }

    return {
      runCountSample: allRuns.length,
      totalCost,
      totalTweetsProcessed,
      totalInputTokens,
      totalOutputTokens,
      modelCounts,
    };
  },
});

