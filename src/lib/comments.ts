/**
 * Task comments + notifications — REQ-TASK-07 + §3.2 notifications.
 *
 * RLS (0002):
 *   - tc_select: comments visible to anyone with task SELECT
 *   - tc_insert: must set user_id = auth.uid()
 *   - tc_update_own: own comments only
 *
 * Mentions are populated server-side by the trigger from migration 0012;
 * the client just sets body. notifications rows for mentioned users are
 * created by the same trigger.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './store';
import { ValidationError } from './finance';

export type TaskCommentRow = {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  mentions: string[];
  created_at: string;
};

export function useTaskComments(taskId: string | null) {
  const qc = useQueryClient();

  // Realtime — PRD §3.4 doesn't list a task_comments channel explicitly,
  // but the activity_log + tasks channels do, and comments are a clear
  // collaboration surface. Subscribe directly to the table so a teammate's
  // comment appears without a refresh.
  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`task_comments:task=${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${taskId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['task_comments', taskId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, qc]);

  return useQuery({
    queryKey: ['task_comments', taskId],
    enabled: !!taskId,
    queryFn: async (): Promise<TaskCommentRow[]> => {
      const { data, error } = await supabase
        .from('task_comments')
        .select('id, task_id, user_id, body, mentions, created_at')
        .eq('task_id', taskId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TaskCommentRow[];
    },
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (body: string) => {
      if (!profile?.id) throw new ValidationError('No profile');
      const trimmed = body.trim();
      if (trimmed.length === 0) throw new ValidationError('Şərh boş ola bilməz.');
      if (trimmed.length > 4000) throw new ValidationError('Şərh çox uzundur (≤4000).');
      const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        user_id: profile.id,
        body: trimmed,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task_comments', taskId] }),
  });
}

export function useDeleteComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task_comments', taskId] }),
  });
}

// ----------------------------------------------------------------------------
// In-app notifications (§3.2 notifications, RLS notif_self)
// ----------------------------------------------------------------------------

export type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useUnreadNotifications(limit = 20) {
  const { profile } = useAuth();
  const qc = useQueryClient();

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase
      .channel(`notifications:user=${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`,
        },
        () => qc.invalidateQueries({ queryKey: ['notifications'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, qc]);

  return useQuery({
    queryKey: ['notifications', profile?.id, limit],
    enabled: !!profile?.id,
    queryFn: async (): Promise<NotificationRow[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('id, user_id, kind, payload, read_at, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
