import { generateText, tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

export type ProviderType = 'anthropic' | 'openai' | 'google';

export interface OwnerRecord {
  owner: string;
  entered_at: string;
  exited_at?: string;
  escalation_reason?: string;
}

export interface AttemptedResolution {
  by: string;
  action: string;
  outcome: string;
}

export interface ConversationContext {
  conversation_id: string;
  schema_version: '1.0';
  created_at: string;
  current_owner: string;
  owner_history: OwnerRecord[];
  messages: Array<{ role: string; content: string; by?: string }>;
  extracted_entities: Record<string, string>;
  attempted_resolutions: AttemptedResolution[];
  confidence: number;
  escalation_reason: string | null;
  resolution_status: 'open' | 'resolved';
}

export type OrchestratorEvent =
  | { type: 'node_start'; node: string }
  | { type: 'node_reply'; node: string; content: string; confidence?: number }
  | { type: 'routing'; from: string; to: string; reason: string }
  | { type: 'context'; context: ConversationContext }
  | { type: 'done' }
  | { type: 'error'; message: string };

interface AdapterResult {
  reply: string;
  confidence: number;
  needs_human: boolean;
  extracted_entities?: Record<string, string>;
  action?: string;
  action_outcome?: string;
  resolution_status: 'open' | 'resolved';
}

const RESPOND_SCHEMA = z.object({
  reply: z.string(),
  confidence: z.number().describe('0.0–1.0 confidence the issue is resolved'),
  needs_human: z.boolean(),
  extracted_entities: z.record(z.string(), z.string()).optional().describe('Key facts: issue_category, issue_summary, etc.'),
  action: z.string().optional(),
  action_outcome: z.string().optional(),
  resolution_status: z.enum(['open', 'resolved']),
});

const RESPOND_TOOL = tool({
  description: 'Formulate a structured response to the customer support request.',
  parameters: RESPOND_SCHEMA,
} as any);

const VENDOR_SYSTEM = `You are a vendor chatbot for a cryptocurrency exchange.
You can: answer FAQs, explain platform features, provide general troubleshooting steps.
You CANNOT: access user accounts, check transaction history, or interact with payment processors.

If the issue requires account access or payment system investigation, set confidence below 0.5.
If there is a security incident (unauthorized access, confirmed fraud), set needs_human=true.
Always populate extracted_entities with issue_category and issue_summary.`;

const INTERNAL_SYSTEM = `You are an internal support specialist for a cryptocurrency exchange.
You have access to: account history, payment processor status, transaction retry tools, fraud detection.

The conversation history shows what the vendor bot already tried — do NOT ask the customer to repeat themselves.
Take specific investigative actions, describe what you found, and resolve the issue if you can.
Set needs_human=true only if you've confirmed fraud or the issue genuinely requires manual escalation.`;

function getModels(provider: ProviderType, apiKey: string) {
  if (provider === 'openai') {
    const openai = createOpenAI({ apiKey });
    return { vendor: openai('gpt-4o-mini'), internal: openai('gpt-4o') };
  } else if (provider === 'google') {
    const google = createGoogleGenerativeAI({ apiKey });
    return { vendor: google('gemini-2.5-flash'), internal: google('gemini-2.5-pro') };
  } else {
    const anthropic = createAnthropic({ apiKey });
    return { vendor: anthropic('claude-3-5-haiku-latest'), internal: anthropic('claude-3-5-sonnet-latest') };
  }
}

async function callAdapter(
  model: any,
  system: string,
  messages: Array<{ role: string; content: string }>
): Promise<AdapterResult> {
  const { toolCalls } = await generateText({
    model,
    system,
    messages: messages as any,
    tools: { respond: RESPOND_TOOL },
    toolChoice: 'required',
  });

  const respondCall = toolCalls.find((t) => t.toolName === 'respond');
  if (!respondCall) throw new Error('No tool call returned');
  return (respondCall as any).args as AdapterResult;
}

export async function* runOrchestration(
  provider: ProviderType,
  apiKey: string,
  userMessage: string,
  conversationId: string
): AsyncGenerator<OrchestratorEvent> {
  const models = getModels(provider, apiKey);

  const context: ConversationContext = {
    conversation_id: conversationId,
    schema_version: '1.0',
    created_at: new Date().toISOString(),
    current_owner: 'vendor_bot',
    owner_history: [],
    messages: [{ role: 'user', content: userMessage }],
    extracted_entities: {},
    attempted_resolutions: [],
    confidence: 1.0,
    escalation_reason: null,
    resolution_status: 'open',
  };

  // ── Vendor Bot ──────────────────────────────────────────────────────────────
  yield { type: 'node_start', node: 'vendor_bot' };
  const vbEntered = new Date().toISOString();

  const vendorResult = await callAdapter(models.vendor, VENDOR_SYSTEM, context.messages);

  context.messages.push({ role: 'assistant', content: vendorResult.reply, by: 'vendor_bot' });
  context.owner_history.push({ owner: 'vendor_bot', entered_at: vbEntered, exited_at: new Date().toISOString() });
  context.attempted_resolutions.push({
    by: 'vendor_bot',
    action: vendorResult.action ?? 'answered FAQ',
    outcome: vendorResult.action_outcome ?? vendorResult.reply.slice(0, 120),
  });
  Object.assign(context.extracted_entities, vendorResult.extracted_entities ?? {});
  context.confidence = vendorResult.confidence;
  context.resolution_status = vendorResult.resolution_status;

  yield { type: 'node_reply', node: 'vendor_bot', content: vendorResult.reply, confidence: vendorResult.confidence };

  if (context.resolution_status === 'resolved') {
    yield { type: 'context', context };
    yield { type: 'done' };
    return;
  }

  // ── Route from Vendor Bot ────────────────────────────────────────────────────
  if (vendorResult.needs_human) {
    const reason = 'sensitive issue flagged by vendor bot';
    yield { type: 'routing', from: 'vendor_bot', to: 'human_agent', reason };
    context.current_owner = 'human_agent';
    context.escalation_reason = reason;
    context.owner_history.push({ owner: 'human_agent', entered_at: new Date().toISOString(), escalation_reason: reason });
    yield { type: 'node_reply', node: 'human_agent', content: 'Escalated to a human agent due to sensitive issue detection.' };
    yield { type: 'context', context };
    yield { type: 'done' };
    return;
  }

  if (vendorResult.confidence >= 0.5) {
    yield { type: 'context', context };
    yield { type: 'done' };
    return;
  }

  // ── Internal Agent ──────────────────────────────────────────────────────────
  const escalationReason = `vendor bot confidence too low (${Math.round(vendorResult.confidence * 100)}%)`;
  yield { type: 'routing', from: 'vendor_bot', to: 'internal_agent', reason: escalationReason };
  yield { type: 'node_start', node: 'internal_agent' };
  const iaEntered = new Date().toISOString();

  const escalationNote = { role: 'user', content: `[Escalated from vendor bot — ${escalationReason}. Please investigate.]` };
  const internalResult = await callAdapter(models.internal, INTERNAL_SYSTEM, [...context.messages, escalationNote]);

  context.messages.push(escalationNote, { role: 'assistant', content: internalResult.reply, by: 'internal_agent' });
  context.owner_history.push({
    owner: 'internal_agent',
    entered_at: iaEntered,
    exited_at: new Date().toISOString(),
    escalation_reason: escalationReason,
  });
  context.attempted_resolutions.push({
    by: 'internal_agent',
    action: internalResult.action ?? 'investigated account',
    outcome: internalResult.action_outcome ?? internalResult.reply.slice(0, 120),
  });
  Object.assign(context.extracted_entities, internalResult.extracted_entities ?? {});
  context.confidence = internalResult.confidence;
  context.resolution_status = internalResult.resolution_status;
  context.current_owner = 'internal_agent';
  context.escalation_reason = escalationReason;

  yield { type: 'node_reply', node: 'internal_agent', content: internalResult.reply, confidence: internalResult.confidence };

  // ── Route from Internal Agent ────────────────────────────────────────────────
  if (internalResult.needs_human) {
    const reason2 = 'manual intervention required by internal agent';
    yield { type: 'routing', from: 'internal_agent', to: 'human_agent', reason: reason2 };
    context.current_owner = 'human_agent';
    context.escalation_reason = reason2;
    context.owner_history.push({ owner: 'human_agent', entered_at: new Date().toISOString(), escalation_reason: reason2 });
    yield { type: 'node_reply', node: 'human_agent', content: 'Escalated to a human agent — manual intervention required.' };
  }

  yield { type: 'context', context };
  yield { type: 'done' };
}
