import { supabase } from '../../lib/supabase';
import type { Program, UserProgram, ProgramContent } from '../../domain/types';

// ─── DB row shapes ────────────────────────────────────────────────────────────

interface DbProgram {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  content: ProgramContent | null;
  created_at: string;
}

interface DbUserProgram {
  id: string;
  user_id: string;
  program_id: string;
  created_at: string;
  programs: DbProgram | null;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function dbProgramToDomain(row: DbProgram): Program {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category ?? undefined,
    content: row.content ?? undefined,
    createdAt: row.created_at,
  };
}

function dbUserProgramToDomain(row: DbUserProgram): UserProgram {
  return {
    id: row.id,
    userId: row.user_id,
    programId: row.program_id,
    program: row.programs ? dbProgramToDomain(row.programs) : undefined,
    createdAt: row.created_at,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch the current user's assigned program (most recently assigned).
 * Returns null when no program is assigned yet.
 */
export async function getUserProgram(): Promise<UserProgram | null> {
  const { data, error } = await supabase
    .from('user_programs')
    .select('*, programs(*)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return dbUserProgramToDomain(data as DbUserProgram);
}
