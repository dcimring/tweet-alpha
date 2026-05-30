import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  processed_tweets: defineTable({
    tweetId: v.string(),
    username: v.string(),
    text: v.string(),
    tickers: v.string(),
    signal: v.string(),
    processedAt: v.optional(v.string()),
  }).index("by_tweetId", ["tweetId"]),

  tracker_runs: defineTable({
    tweetsProcessed: v.number(),
    modelUsed: v.string(),
    totalInputTokens: v.number(),
    totalOutputTokens: v.number(),
    totalCost: v.number(),
    timestamp: v.optional(v.string()),
  }),
});
