/**
 * Thin Anthropic client wrapper.
 *
 * One messages.create call with tool-use forced to the `fill_note`
 * tool. Returns the parsed field_values from the tool_use block.
 * cache_control is applied to the system prompt and tools to engage
 * Anthropic's prompt caching on the stable per-template content.
 *
 * Retry on schema violation lives in the caller (generateNote), not
 * here — keeps this adapter side-effect-free and easy to test.
 */

// Lazy-imported inside fillTemplateViaClaude() to avoid 10s deploy timeout.
// Runtime: const Anthropic = require("@anthropic-ai/sdk").default;
import type AnthropicType from "@anthropic-ai/sdk";
import type { FieldValue } from "../types";

interface FillTemplateArgs {
  apiKey: string;
  model: string;
  systemPrompt: string;
  toolSchema: unknown;
  fewShotMessages: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  maxTokens?: number;
}

interface FillResult {
  fieldValues: Record<string, FieldValue>;
  /** For observability — caller can log these. */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export async function fillTemplateViaClaude(args: FillTemplateArgs): Promise<FillResult> {
  const {
    apiKey,
    model,
    systemPrompt,
    toolSchema,
    fewShotMessages,
    userMessage,
    maxTokens = 2000,
  } = args;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = (require("@anthropic-ai/sdk") as { default: typeof import("@anthropic-ai/sdk").default }).default;
  const client = new Anthropic({ apiKey });

  // Retry with exponential backoff for transient 529 (overloaded) errors.
  const MAX_RETRIES = 3;
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delayMs = Math.min(1000 * 2 ** attempt, 8000); // 2s, 4s, 8s
      await new Promise((r) => setTimeout(r, delayMs));
    }
    try {
      return await callClaude(client, { model, systemPrompt, toolSchema, fewShotMessages, userMessage, maxTokens });
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number }).status;
      if (status === 529 || status === 503 || status === 500) {
        // Retryable — continue loop
        continue;
      }
      throw err; // Non-retryable — bail immediately
    }
  }
  throw lastError;
}

async function callClaude(
  client: AnthropicType,
  args: { model: string; systemPrompt: string; toolSchema: unknown; fewShotMessages: Array<{ role: "user" | "assistant"; content: string }>; userMessage: string; maxTokens: number },
): Promise<FillResult> {
  const { model, systemPrompt, toolSchema, fewShotMessages, userMessage, maxTokens } = args;

  // The cache_control field is documented but not yet in this SDK
  // version's TS types — passed through to the API verbatim. Verify
  // cache_hit metrics in production; upgrade SDK to drop these casts.
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      } as AnthropicType.TextBlockParam,
    ],
    tools: [
      {
        name: "fill_note",
        description:
          "Return the structured field_values extracted from the dental encounter transcript.",
        input_schema: toolSchema as AnthropicType.Tool.InputSchema,
        cache_control: { type: "ephemeral" },
      } as AnthropicType.Tool,
    ],
    tool_choice: { type: "tool", name: "fill_note" },
    messages: [
      ...fewShotMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: userMessage },
    ],
  });

  const toolUseBlock = response.content.find(
    (block): block is AnthropicType.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUseBlock) {
    throw new Error("Claude returned no tool_use block");
  }

  const input = toolUseBlock.input as { field_values?: Record<string, FieldValue> } | undefined;
  if (!input || typeof input !== "object" || !input.field_values) {
    throw new Error("Claude tool_use payload missing field_values");
  }

  return {
    fieldValues: input.field_values,
    usage: response.usage as FillResult["usage"],
  };
}
