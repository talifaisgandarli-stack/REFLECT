/**
 * Məzmun Planlaması — PRD §9.3 / US-CONTENT-01.
 *
 * Schema: content_plans (id, channel, scheduled_at, topic, owner_id,
 *                        status, body, created_at, updated_at).
 * RLS: admin-only (PRD §9.3 "admin only").
 *
 * Out of scope this sprint:
 *   - "owner receives a deadline reminder 2 days before scheduled_at"
 *     (US-CONTENT-01 acceptance criterion). Lands as a small follow-up
 *     in /api/cron/telegram-reminders alongside task deadlines.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { ValidationError } from './finance';

export type ContentStatus = 'idea' | 'draft' | 'review' | 'published';
export type ContentChannel =
  | 'instagram'
  | 'linkedin'
  | 'facebook'
  | 'website'
  | 'newsletter'
  | 'other';

export const CONTENT_STATUS_ORDER: ContentStatus[] = ['idea', 'draft', 'review', 'published'];
export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  idea: 'Idea',
  draft: 'Draft',
  review: 'Review',
  published: 'Published',
};

export const CONTENT_CHANNEL_LABEL: Record<ContentChannel, string> = {
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  website: 'Website',
  newsletter: 'Newsletter',
  other: 'Digər',
};

export type ContentPlan = {
  id: string;
  channel: ContentChannel;
  scheduled_at: string | null;
  topic: string;
  owner_id: string | null;
  status: ContentStatus;
  body: string | null;
  created_at: string;
  updated_at: string;
};

export function useContentPlans() {
  return useQuery({
    queryKey: ['content_plans'],
    queryFn: async (): Promise<ContentPlan[]> => {
      const { data, error } = await supabase
        .from('content_plans')
        .select('*')
        .order('scheduled_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ContentPlan[];
    },
  });
}

export type ContentPlanInput = {
  channel: ContentChannel;
  topic: string;
  scheduled_at?: string | null;
  owner_id?: string | null;
  status?: ContentStatus;
  body?: string | null;
};

export function useCreateContentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ContentPlanInput) => {
      if (!input.topic.trim()) throw new ValidationError('Mövzu boş ola bilməz.');
      const { error } = await supabase.from('content_plans').insert({
        channel: input.channel,
        topic: input.topic.trim(),
        scheduled_at: input.scheduled_at ?? null,
        owner_id: input.owner_id ?? null,
        status: input.status ?? 'idea',
        body: input.body ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_plans'] }),
  });
}

export function useUpdateContentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<ContentPlanInput>) => {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (input.channel !== undefined) patch.channel = input.channel;
      if (input.topic !== undefined) {
        if (!input.topic.trim()) throw new ValidationError('Mövzu boş ola bilməz.');
        patch.topic = input.topic.trim();
      }
      if (input.scheduled_at !== undefined) patch.scheduled_at = input.scheduled_at;
      if (input.owner_id !== undefined) patch.owner_id = input.owner_id;
      if (input.status !== undefined) patch.status = input.status;
      if (input.body !== undefined) patch.body = input.body;

      const { error } = await supabase.from('content_plans').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_plans'] }),
  });
}

export function useDeleteContentPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('content_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['content_plans'] }),
  });
}
