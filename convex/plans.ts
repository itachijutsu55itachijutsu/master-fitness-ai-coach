import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createPlan = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    workoutPlan: v.object({
      schedule: v.array(v.string()),
      exercises: v.array(
        v.object({
          day: v.string(),
          routines: v.array(
            v.object({
              name: v.string(),
              // ✅ FIX: Changed from v.number() to v.optional(v.number())
              // to match the schema.ts definition — previously this mismatch
              // caused silent save failures whenever Gemini omitted sets/reps
              sets: v.optional(v.number()),
              reps: v.optional(v.number()),
            })
          ),
        })
      ),
    }),
    dietPlan: v.object({
      dailyCalories: v.number(),
      meals: v.array(
        v.object({
          name: v.string(),
          foods: v.array(v.string()),
        })
      ),
    }),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Deactivate all existing active plans for this user before creating a new one
    const activePlans = await ctx.db
      .query("plans")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isActive"), true))
      .collect();

    for (const plan of activePlans) {
      await ctx.db.patch(plan._id, { isActive: false });
    }

    const planId = await ctx.db.insert("plans", args);
    return planId;
  },
});

export const getUserPlans = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const plans = await ctx.db
      .query("plans")
      .withIndex("by_user_id", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();

    return plans;
  },
});
