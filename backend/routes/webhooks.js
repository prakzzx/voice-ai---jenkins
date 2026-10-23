// routes/webhooks.js
//
// CHANGES FROM PREVIOUS VERSION:
//   1. call-started handler now saves vapiCallId to the conversation record.
//      Previously the handler only logged. vapiCallId was never written to DB,
//      so _pushStagePromptUpdate always had a null vapiCallId and every runtime
//      prompt update silently failed — stage transitions had zero effect on behavior.
//   2. memoryService import is now conditional (wrapped in try/catch) so the server
//      starts even before memoryService.js is created. Once memoryService exists,
//      the import works automatically with no further changes needed here.

"use strict";

const express              = require("express");
const router               = express.Router();
const prisma               = require("../config/database");
const conversationService  = require("../services/conversationService");
const orchestrationService = require("../services/orchestrationService");
const promptService        = require("../services/promptService");
const vapiService          = require("../services/vapiService");
const { notifyConversationCompleted } = require("../services/notificationService");
const { executeTool } = require("../services/toolExecutor");
const { getTool } = require("../services/toolRegistry");

// Safe import of memoryService — server starts even if file doesn't exist yet.
// Remove the try/catch once memoryService.js is deployed.
let memoryService = null;
try {
  memoryService = require("../services/memoryService");
} catch (e) {
  console.warn("[webhook] memoryService not found — summarization disabled. Create services/memoryService.js to enable.");
}

router.post("/vapi", async (req, res) => {
  const messageType = req.body?.message?.type || req.body?.type;
  console.log("[WEBHOOK]", messageType);

  try {
    // Vapi nests the payload under `message`; fall back to the raw body for other senders.
    const event = req.body?.message || req.body;

    switch (messageType) {

      // ── Call started ──────────────────────────────────────────────────────
      // FIX: Save vapiCallId to the conversation record.
      // Without this, _pushStagePromptUpdate has no vapiCallId and every
      // runtime prompt update silently fails — stage transitions don't work.
      case "call-started": {
        const vapiCallId     = event.call?.id;
        const conversationId = event.call?.metadata?.conversationId
                            || event.call?.metadata?.platformConversationId;

        console.log("[webhook] Call started. vapiCallId:", vapiCallId, "conversationId:", conversationId);

        if (vapiCallId && conversationId) {
          await prisma.conversation.update({
            where: { id: conversationId },
            data:  { vapiCallId },
          });
          console.log("[webhook] vapiCallId saved to conversation:", conversationId);
        } else {
          console.warn("[webhook] call-started: missing vapiCallId or conversationId in metadata. Prompt updates will not work for this call.");
        }
        break;
      }

      // ── End of call ───────────────────────────────────────────────────────
      case "call-ended":
      case "end-of-call-report": {
        const callId   = event.call?.id || event.callId;
        const duration = event.durationSeconds ?? event.call?.duration;
        const rawSummary = event.summary || event.analysis?.summary || null;
        const summary  = typeof rawSummary === "string" ? rawSummary : null;

        if (!callId) break;

        const conversation = await prisma.conversation.findFirst({
          where: { vapiCallId: callId },
          include: { agent: { select: { name: true } } },
        });

        if (!conversation) {
          console.warn("[webhook] end-of-call: no conversation for callId", callId);
          break;
        }

        // Vapi may deliver both call-ended and end-of-call-report, or retry; notify only once.
        const alreadyCompleted = conversation.status === "completed";

        const completedConversation = await conversationService.endConversation(conversation.id, {
          duration,
          summary,
        });

        const transcript = event.artifact?.messages || event.transcript || event.artifact?.transcript;
        if (!alreadyCompleted && Array.isArray(transcript) && transcript.length > 0) {
          const messages = transcript
            .filter((t) => t.role !== "system")
            .map((t) => ({
              role:      t.role === "bot" ? "assistant" : t.role,
              content:   t.content || t.message || "",
              timestamp: t.timestamp ? new Date(t.timestamp) : new Date(),
            }));
          await conversationService.addMessages(conversation.id, messages);
        }

        // Slack notification is best-effort, sent after the conversation is saved,
        // and must never prevent the rest of webhook processing.
        if (!alreadyCompleted) {
          try {
            const completionNotice = await notifyConversationCompleted({
              ...completedConversation,
              agentName: conversation.agent?.name,
            });
            if (completionNotice.failed.length) {
              console.warn("[webhook] chat-completion Slack notification failed");
            }
          } catch (err) {
            console.warn("[webhook] chat-completion Slack notification error:", err.message);
          }
        }

        await orchestrationService.endOrchestration(conversation.id);

        // Fire-and-forget summarization for memory layer
        if (memoryService?.summarizeConversationIfNeeded) {
          memoryService.summarizeConversationIfNeeded(conversation.id).catch((err) => {
            console.error("[webhook] summarization failed:", err.message);
          });
        }

        break;
      }

      // ── Real-time transcript ──────────────────────────────────────────────
      case "transcript":
      case "transcript-update": {
        // Guard: only process final (complete) utterances
        const isFinal = event.transcript?.isFinal ?? event.isFinal ?? true;
        if (!isFinal) break;

        const conversationId = event.call?.metadata?.conversationId
                            || event.call?.metadata?.platformConversationId;
        const role = event.role || event.transcript?.role;
        const text = typeof event.transcript === "string"
          ? event.transcript
          : event.transcript?.text || event.message || event.text;

        if (!conversationId || !role || !text) break;

        const result = await orchestrationService.processTranscriptTurn(
          conversationId,
          role,
          text,
        );

        if (result?.advanced && !result?.handoff) {
          // Load the saved vapiCallId from DB — it was written on call-started
          const conversation = await prisma.conversation.findUnique({
            where:  { id: conversationId },
            select: { vapiCallId: true },
          });
          await _pushStagePromptUpdate(
            conversation?.vapiCallId,
            conversationId,
            result,
          );
        }

        if (result?.advanced && result?.handoff) {
          console.log("[webhook] handoff → assistantId:", result.handoffAssistantId);
          // TODO Phase 5: await vapiService.transferCall(event.call.id, result.handoffAssistantId);
        }

        break;
      }

      // ── Function / tool calls ─────────────────────────────────────────────
      case "function-call":
      case "tool-calls": {
        // Execute only tools registered by the server; never accept arbitrary URLs from webhook input.
        // Vapi sends toolCallList: [{ id, name, arguments }] (or toolCalls: [{ id, function: {name, arguments} }]).
        const rawCall = event.toolCallList?.[0] || event.toolCalls?.[0] || event.functionCall || {};
        const call = rawCall.function || rawCall;
        const toolCallId = rawCall.id;
        const toolName = call.name;
        let payload = call.parameters || call.arguments || {};
        if (typeof payload === "string") {
          try { payload = JSON.parse(payload); } catch { payload = {}; }
        }
        if (!toolName || !getTool(toolName)) {
          return res.status(400).json({ error: "Unknown or missing registered tool" });
        }
        const result = await executeTool(toolName, payload);
        const resultText = result.success ? "success" : "failed";
        return res.json({
          // Vapi expects results keyed by toolCallId; keep legacy fields for older callers.
          results: toolCallId ? [{ toolCallId, result: resultText }] : undefined,
          result: resultText,
          tool: toolName,
          data: result.success ? result.data : undefined,
        });
      }

      default: {
        console.log("[webhook] Unhandled type:", messageType);
      }
    }

    return res.json({ received: true });

  } catch (error) {
    console.error("[webhook] Error:", error.message, error.stack);
    // Always return 200 — a 500 causes Vapi to retry indefinitely
    return res.status(200).json({ received: true, error: "Processing failed" });
  }
});

// Generic webhook entry point for approved registered tools. Protected by VAPI_WEBHOOK_SECRET
// through the middleware mounted in server.js. The body can never define a destination URL.
router.post("/tools", async (req, res) => {
  const toolName = String(req.body?.tool || "");
  if (!toolName || !getTool(toolName)) return res.status(400).json({ error: "Unknown registered tool" });
  const result = await executeTool(toolName, req.body?.payload || {});
  return res.status(result.success ? 200 : 502).json({ success: result.success, tool: toolName, ...(result.success ? { data: result.data } : { error: result.error }) });
});

// ─── Internal: push updated stage prompt to live call ────────────────────────
async function _pushStagePromptUpdate(vapiCallId, conversationId, orchResult) {
  if (!vapiCallId) {
    console.warn("[webhook] _pushStagePromptUpdate: no vapiCallId — call-started may not have fired or metadata was missing");
    return;
  }

  try {
    const conversation = await prisma.conversation.findUnique({
      where:   { id: conversationId },
      include: { agent: true },
    });

    if (!conversation?.agent) {
      console.warn("[webhook] _pushStagePromptUpdate: conversation or agent not found");
      return;
    }

    const agent = conversation.agent;

    const compiledPrompt = promptService.buildCompiledPrompt(agent, {
      taskOverride: orchResult.stagePrompt || orchResult.newStage,
      // Context is not re-fetched mid-call — it was injected at call start.
      // Mid-call context refresh is a Phase 6 concern.
    });

    await vapiService.updateCallAssistant(vapiCallId, compiledPrompt, agent.temperature);

    console.log(
      "[webhook] Stage prompt pushed.",
      "stage:", orchResult.newStage,
      "promptLength:", compiledPrompt.length,
    );

  } catch (err) {
    console.error("[webhook] _pushStagePromptUpdate failed:", err.message);
  }
}

module.exports = router;