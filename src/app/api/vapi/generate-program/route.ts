import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("Vapi webhook received:", JSON.stringify(body, null, 2));

    // Vapi sends the tool call inside message.toolCalls
    const toolCall = body.message?.toolCalls?.[0];

    if (!toolCall) {
      return NextResponse.json({ error: "No tool call found" }, { status: 400 });
    }

    const functionName = toolCall.function?.name;
    const args =
      typeof toolCall.function?.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function?.arguments;

    console.log("Function name:", functionName);
    console.log("Arguments:", JSON.stringify(args, null, 2));

    if (functionName === "createFitnessProgram") {
      const { userId, name, workoutPlan, dietPlan } = args;

      if (!userId || !name || !workoutPlan || !dietPlan) {
        return NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        );
      }

      const planId = await convex.mutation(api.plans.createPlan, {
        userId,
        name,
        workoutPlan,
        dietPlan,
        isActive: true,
      });

      console.log("Plan saved to Convex, ID:", planId);

      // Vapi expects this exact response format
      return NextResponse.json({
        results: [
          {
            toolCallId: toolCall.id,
            result: "Fitness program created successfully!",
          },
        ],
      });
    }

    return NextResponse.json({ error: "Unknown function" }, { status: 400 });
  } catch (error) {
    console.error("Error in vapi webhook:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}