/**
 * Karyera Strukturu — PRD §9.2.
 *
 * Schema: career_levels (id, name, level_index, requirements jsonb).
 * RLS: SELECT for any authenticated user; admin-only writes.
 *
 * Out of scope (PRD gap, deferred): per-user "current level" mapping —
 * profiles has no career_level_id column. v1 is a published list +
 * admin CRUD; we revisit when PRD adds the column.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { ValidationError } from './finance';

export type CareerLevel = {
  id: string;
  name: string;
  level_index: number;
  requirements: Record<string, unknown>;
  created_at: string;
};

export function useCareerLevels() {
  return useQuery({
    queryKey: ['career_levels'],
    queryFn: async (): Promise<CareerLevel[]> => {
      const { data, error } = await supabase
        .from('career_levels')
        .select('*')
        .order('level_index', { ascending: true });
      if (error) throw error;
      return (data ?? []) as CareerLevel[];
    },
  });
}

export type CareerLevelInput = {
  name: string;
  level_index: number;
  requirements?: Record<string, unknown>;
};

function validate(input: CareerLevelInput) {
  if (!input.name.trim()) throw new ValidationError('Səviyyə adı boş ola bilməz.');
  if (!Number.isInteger(input.level_index) || input.level_index < 0) {
    throw new ValidationError('Səviyyə nömrəsi 0 və ya daha böyük olmalıdır.');
  }
}

export function useCreateCareerLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CareerLevelInput) => {
      validate(input);
      const { error } = await supabase.from('career_levels').insert({
        name: input.name.trim(),
        level_index: input.level_index,
        requirements: input.requirements ?? {},
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['career_levels'] }),
  });
}

export function useUpdateCareerLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string } & Partial<CareerLevelInput>) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) {
        if (!input.name.trim()) throw new ValidationError('Ad boş ola bilməz.');
        patch.name = input.name.trim();
      }
      if (input.level_index !== undefined) {
        if (!Number.isInteger(input.level_index) || input.level_index < 0) {
          throw new ValidationError('Səviyyə nömrəsi 0 və ya daha böyük olmalıdır.');
        }
        patch.level_index = input.level_index;
      }
      if (input.requirements !== undefined) patch.requirements = input.requirements;

      const { error } = await supabase.from('career_levels').update(patch).eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['career_levels'] }),
  });
}

export function useDeleteCareerLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('career_levels').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['career_levels'] }),
  });
}
