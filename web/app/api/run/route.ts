import { runOrchestration, ProviderType } from '@/lib/orchestrator';

export async function POST(request: Request) {
  const { provider, apiKey, userMessage, conversationId } = await request.json();

  if (!provider || !apiKey || !userMessage) {
    return Response.json({ error: 'provider, apiKey and userMessage are required' }, { status: 400 });
  }

  const id = conversationId ?? crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for await (const event of runOrchestration(provider as ProviderType, apiKey, userMessage, id)) {
          send(event);
        }
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
