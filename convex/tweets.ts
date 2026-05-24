import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// Check if a tweet has already been processed by querying the by_tweetId index
export const isTweetProcessed = query({
  args: { tweetId: v.string() },
  handler: async (ctx, args) => {
    const tweet = await ctx.db
      .query("processed_tweets")
      .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
      .unique();
    return tweet !== null;
  },
});

// Save a processed tweet into the database, avoiding duplicates
export const saveProcessedTweet = mutation({
  args: {
    tweetId: v.string(),
    username: v.string(),
    text: v.string(),
    tickers: v.string(),
    signal: v.string(),
    processedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processed_tweets")
      .withIndex("by_tweetId", (q) => q.eq("tweetId", args.tweetId))
      .unique();
    if (existing !== null) {
      return;
    }
    await ctx.db.insert("processed_tweets", {
      tweetId: args.tweetId,
      username: args.username,
      text: args.text,
      tickers: args.tickers,
      signal: args.signal,
      processedAt: args.processedAt || new Date().toISOString(),
    });
  },
});

// Bulk insert tweets (primarily used for data migration)
export const bulkInsertTweets = mutation({
  args: {
    tweets: v.array(
      v.object({
        tweetId: v.string(),
        username: v.string(),
        text: v.string(),
        tickers: v.string(),
        signal: v.string(),
        processedAt: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    for (const tweet of args.tweets) {
      const existing = await ctx.db
        .query("processed_tweets")
        .withIndex("by_tweetId", (q) => q.eq("tweetId", tweet.tweetId))
        .unique();
      if (existing === null) {
        await ctx.db.insert("processed_tweets", {
          ...tweet,
          processedAt: tweet.processedAt || new Date().toISOString(),
        });
      }
    }
  },
});
