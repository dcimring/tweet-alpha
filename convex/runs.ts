import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Log a single tracker execution run
export const saveRunRecord = mutation({
  args: {
    tweetsProcessed: v.number(),
    modelUsed: v.string(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalCost: v.number(),
    timestamp: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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
    for (const run of args.runs) {
      await ctx.db.insert("tracker_runs", {
        ...run,
        timestamp: run.timestamp || new Date().toISOString(),
      });
    }
  },
});
