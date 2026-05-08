/**
 * MIRAI client wiring — SSE consumer for /api/mirai/chat and Realtime
 * subscription for cross-device handoff (PRD §3.4).
 *
 * The wire format is the one produced by api/mirai/chat.ts:
 *   data: {"type":"meta","conversation_id":...,"sources":[...]}
 *   data: {"type":"delta","text":"..."}     // 0..N
 *   data: {"type":"done","reply":"...","budget":{...}}
 *   data: {"type":"error","message":"..."}  // mutually exclusive with done
 */
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

export type MiraiSource = { source_pdf: string; chunk_index: number; similarity?: number };

export type MiraiBudget = { spent_usd: number; cap_usd: number; warn: boolean };

export type MiraiStreamEvents = {
  onMeta?: (e: { conversation_id: string; persona: string; sources: MiraiSource[] }) => void;
  onDelta?: (text: string) => void;
  onDone?: (e: { reply: string; budget: MiraiBudget }) => void;
  onError?: (message: string) => void;
};

/**
 * Streams a MIRAI reply over SSE. EventSource can't send custom headers
 * (auth), so we hand-roll the SSE parser on top of fetch's ReadableStream.
 */
export async function streamMiraiChat(
  input: { message: string; persona?: string; conversation_id?: string | null },
  events: MiraiStreamEvents,
  signal?: AbortSignal,
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    events.onError?.('Sessiya tapılmadı');
    return;
  }

  let res: Response;
  try {
    res = await fetch('/api/mirai/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    events.onError?.((e as Error).message);
    return;
  }

  if (!res.ok || !res.body) {
    // Server returned a JSON error object via errorResponse(), not an SSE stream.
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    events.onError?.(err.error ?? `HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      events.onError?.((e as Error).message);
      return;
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });

    // Frames are separated by a blank line. SSE allows \n or \r\n line endings.
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLines = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart());
      if (dataLines.length > 0) {
        try {
          const payload = JSON.parse(dataLines.join('\n')) as
            | { type: 'meta'; conversation_id: string; persona: string; sources: MiraiSource[] }
            | { type: 'delta'; text: string }
            | { type: 'done'; reply: string; budget: MiraiBudget }
            | { type: 'error'; message: string };
          if (payload.type === 'meta') events.onMeta?.(payload);
          else if (payload.type === 'delta') events.onDelta?.(payload.text);
          else if (payload.type === 'done') events.onDone?.(payload);
          else if (payload.type === 'error') events.onError?.(payload.message);
        } catch {
          // Malformed frame — ignore but keep the stream open.
        }
      }
      sep = buffer.indexOf('\n\n');
    }
  }
}

/**
 * Realtime handoff subscription — PRD §3.4 wires
 * `mirai_messages:conversation_id=<uuid>` so the same user on another tab or
 * device sees new messages as they're inserted. We invalidate the messages
 * query rather than splicing rows, because INSERT events don't include the
 * full row when RLS-filtered by Supabase.
 */
export function useMiraiHandoff(conversationId: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`mirai_messages:conversation_id=${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mirai_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['mirai', 'messages', conversationId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, qc]);
}
