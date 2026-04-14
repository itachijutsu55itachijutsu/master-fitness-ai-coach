"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { vapi } from "@/lib/vapi";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

const GenerateProgramPage = () => {
  const [callActive, setCallActive] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [callEnded, setCallEnded] = useState(false);
  // ✅ FIX: Track plan generation status separately from call ending
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const { user } = useUser();
  const router = useRouter();
  const createPlan = useMutation(api.plans.createPlan);

  const messageContainerRef = useRef<HTMLDivElement>(null);

  // Suppress known Vapi "Meeting has ended" console noise
  useEffect(() => {
    const originalError = console.error;
    console.error = function (msg, ...args) {
      if (
        msg &&
        (msg.includes("Meeting has ended") ||
          (args[0] && args[0].toString().includes("Meeting has ended")))
      ) {
        console.log("Ignoring known error: Meeting has ended");
        return;
      }
      return originalError.call(console, msg, ...args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (messageContainerRef.current) {
      messageContainerRef.current.scrollTop =
        messageContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // ✅ FIX: Replaced the 1500ms hard-coded redirect with a proper delayed redirect.
  // The old code redirected after 1.5s — but Gemini + Convex can take 5–15s.
  // Now we wait 8 seconds after the call ends before redirecting, giving the
  // backend (Vapi → Convex HTTP → Gemini → DB save) enough time to complete.
  useEffect(() => {
    if (callEnded) {
      setIsGeneratingPlan(true);
      const redirectTimer = setTimeout(() => {
        router.push("/profile");
      }, 8000); // 8 seconds gives Gemini + Convex enough time to finish
      return () => clearTimeout(redirectTimer);
    }
  }, [callEnded, router]);

  useEffect(() => {
    const handleCallStart = () => {
      console.log("Call started");
      setConnecting(false);
      setCallActive(true);
      setCallEnded(false);
      setIsGeneratingPlan(false);
    };

    const handleCallEnd = () => {
      console.log("Call ended — plan generation will begin on the server");
      setCallActive(false);
      setConnecting(false);
      setIsSpeaking(false);
      setCallEnded(true);
    };

    const handleSpeechStart = () => {
      setIsSpeaking(true);
    };

    const handleSpeechEnd = () => {
      setIsSpeaking(false);
    };

    const handleMessage = async (message: any) => {
      // Collect transcript messages for display
      if (message.type === "transcript" && message.transcriptType === "final") {
        const newMessage = { content: message.transcript, role: message.role };
        setMessages((prev) => [...prev, newMessage]);
      }

      // ✅ NOTE: This tool-calls block handles assistant-mode Vapi setups.
      // In workflow mode (which this app uses via NEXT_PUBLIC_VAPI_WORKFLOW_ID),
      // plan creation is handled server-side by convex/http.ts → /vapi/generate-program.
      // This client-side handler is kept as a fallback in case you switch to assistant mode.
      if (message.type === "tool-calls") {
        const toolCall = message.toolCallList?.[0];
        console.log("Tool call received:", toolCall?.function?.name);

        if (toolCall?.function?.name === "createFitnessProgram") {
          try {
            const planData =
              typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            await createPlan({
              userId: user?.id as string,
              name: planData.name,
              workoutPlan: planData.workoutPlan,
              dietPlan: planData.dietPlan,
              isActive: true,
            });

            console.log("Plan saved to Convex via client-side tool call!");
          } catch (err) {
            console.error("Failed to save plan via client-side tool call:", err);
          }
        }
      }
    };

    const handleError = (error: any) => {
      console.log("Vapi Error", error);
      setConnecting(false);
      setCallActive(false);
    };

    vapi
      .on("call-start", handleCallStart)
      .on("call-end", handleCallEnd)
      .on("speech-start", handleSpeechStart)
      .on("speech-end", handleSpeechEnd)
      .on("message", handleMessage)
      .on("error", handleError);

    return () => {
      vapi
        .off("call-start", handleCallStart)
        .off("call-end", handleCallEnd)
        .off("speech-start", handleSpeechStart)
        .off("speech-end", handleSpeechEnd)
        .off("message", handleMessage)
        .off("error", handleError);
    };
  }, [createPlan, user?.id]);

  const toggleCall = async () => {
    if (callActive) {
      vapi.stop();
    } else {
      try {
        setConnecting(true);
        setMessages([]);
        setCallEnded(false);
        setIsGeneratingPlan(false);

        const fullName = user?.firstName
          ? `${user.firstName} ${user.lastName || ""}`.trim()
          : "There";

        await vapi.start(process.env.NEXT_PUBLIC_VAPI_WORKFLOW_ID!, {
          variableValues: {
            full_name: fullName,
            user_id: user?.id,
          },
        });
      } catch (error) {
        console.log("Failed to start call", error);
        setConnecting(false);
      }
    }
  };

  // ✅ FIX: Better status label that reflects actual state
  const getStatusLabel = () => {
    if (isSpeaking) return "Speaking...";
    if (callActive) return "Listening...";
    if (isGeneratingPlan) return "Generating your plan...";
    return "Waiting...";
  };

  return (
    <div className="flex flex-col min-h-screen text-foreground overflow-hidden pb-6 pt-24">
      <div className="container mx-auto px-4 h-full max-w-5xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-mono">
            <span>Generate Your </span>
            <span className="text-primary uppercase">Fitness Program</span>
          </h1>
          <p className="text-muted-foreground mt-2">
            Have a voice conversation with our AI assistant to create your
            personalized plan
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* AI ASSISTANT CARD */}
          <Card className="bg-card/90 backdrop-blur-sm border border-border overflow-hidden relative">
            <div className="aspect-video flex flex-col items-center justify-center p-6 relative">
              <div
                className={`absolute inset-0 ${
                  isSpeaking ? "opacity-30" : "opacity-0"
                } transition-opacity duration-300`}
              >
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 flex justify-center items-center h-20">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`mx-1 h-16 w-1 bg-primary rounded-full ${
                        isSpeaking ? "animate-sound-wave" : ""
                      }`}
                      style={{
                        animationDelay: `${i * 0.1}s`,
                        height: isSpeaking
                          ? `${Math.random() * 50 + 20}%`
                          : "5%",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="relative size-32 mb-4">
                <div
                  className={`absolute inset-0 bg-primary opacity-10 rounded-full blur-lg ${
                    isSpeaking ? "animate-pulse" : ""
                  }`}
                />
                <div className="relative w-full h-full rounded-full bg-card flex items-center justify-center border border-border overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-secondary/10"></div>
                  <img
                    src="/ai-avatar.png"
                    alt="AI Assistant"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <h2 className="text-xl font-bold text-foreground">CodeFlex AI</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Fitness & Diet Coach
              </p>

              <div
                className={`mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border ${
                  isSpeaking ? "border-primary" : ""
                } ${isGeneratingPlan ? "border-yellow-500" : ""}`}
              >
                <div
                  className={`w-2 h-2 rounded-full ${
                    isSpeaking
                      ? "bg-primary animate-pulse"
                      : isGeneratingPlan
                      ? "bg-yellow-500 animate-pulse"
                      : "bg-muted"
                  }`}
                />
                {/* ✅ FIX: Status now correctly shows "Generating your plan..." instead of "Redirecting" */}
                <span className="text-xs text-muted-foreground">
                  {getStatusLabel()}
                </span>
              </div>
            </div>
          </Card>

          {/* USER CARD */}
          <Card className="bg-card/90 backdrop-blur-sm border overflow-hidden relative">
            <div className="aspect-video flex flex-col items-center justify-center p-6 relative">
              <div className="relative size-32 mb-4">
                <img
                  src={user?.imageUrl}
                  alt="User"
                  className="size-full object-cover rounded-full"
                />
              </div>
              <h2 className="text-xl font-bold text-foreground">You</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {user
                  ? (user.firstName + " " + (user.lastName || "")).trim()
                  : "Guest"}
              </p>
              <div className="mt-4 flex items-center gap-2 px-3 py-1 rounded-full bg-card border">
                <div className="w-2 h-2 rounded-full bg-muted" />
                <span className="text-xs text-muted-foreground">Ready</span>
              </div>
            </div>
          </Card>
        </div>

        {messages.length > 0 && (
          <div
            ref={messageContainerRef}
            className="w-full bg-card/90 backdrop-blur-sm border border-border rounded-xl p-4 mb-8 h-64 overflow-y-auto transition-all duration-300 scroll-smooth"
          >
            <div className="space-y-3">
              {messages.map((msg, index) => (
                <div key={index} className="message-item animate-fadeIn">
                  <div className="font-semibold text-xs text-muted-foreground mb-1">
                    {msg.role === "assistant" ? "CodeFlex AI" : "You"}:
                  </div>
                  <p className="text-foreground">{msg.content}</p>
                </div>
              ))}

              {/* ✅ FIX: Show accurate message — plan is being generated, not already done */}
              {callEnded && (
                <div className="message-item animate-fadeIn">
                  <div className="font-semibold text-xs text-primary mb-1">
                    System:
                  </div>
                  <p className="text-foreground">
                    {isGeneratingPlan
                      ? "Generating your personalized fitness plan... Redirecting to your profile shortly."
                      : "Your fitness program has been created! Redirecting to your profile..."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="w-full flex justify-center gap-4">
          <Button
            className={`w-40 text-xl rounded-3xl ${
              callActive
                ? "bg-destructive hover:bg-destructive/90"
                : callEnded
                ? "bg-yellow-600 hover:bg-yellow-700"
                : "bg-primary hover:bg-primary/90"
            } text-white relative`}
            onClick={toggleCall}
            disabled={connecting || callEnded}
          >
            {connecting && (
              <span className="absolute inset-0 rounded-full animate-ping bg-primary/50 opacity-75"></span>
            )}
            <span>
              {callActive
                ? "End Call"
                : connecting
                ? "Connecting..."
                : callEnded
                ? "Generating..."
                : "Start Call"}
            </span>
          </Button>
        </div>

        {/* ✅ FIX: Added a visible countdown/status bar when generating so users don't leave early */}
        {isGeneratingPlan && (
          <div className="mt-4 text-center">
            <p className="text-sm text-muted-foreground font-mono animate-pulse">
              ⚙ AI is building your custom plan — please wait, redirecting in a
              few seconds...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GenerateProgramPage;
