import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { LogFn } from "./product-enrichment.ts";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown> | null | undefined;

type BufferedLog = {
  level: LogLevel;
  message: string;
  context: LogContext;
  at: string;
};

export const createPersistentLogger = (
  supabase: SupabaseClient,
  functionName: string,
) => {
  const runId = crypto.randomUUID();
  const buffer: BufferedLog[] = [];

  const log: LogFn = (message, level = "info", context = null) => {
    console.log(JSON.stringify({
      level,
      msg: message,
      context,
      function_name: functionName,
      run_id: runId,
    }));
    buffer.push({
      level,
      message,
      context: context ?? null,
      at: new Date().toISOString(),
    });
  };

  const flush = async () => {
    if (buffer.length === 0) return;
    const rows = buffer.splice(0).map((entry) => ({
      function_name: functionName,
      run_id: runId,
      level: entry.level,
      message: entry.message,
      context: entry.context,
      created_at: entry.at,
    }));
    const { error } = await supabase.from("edge_function_logs").insert(rows);
    if (error) {
      console.error(`[edge_function_logs] flush FAILED: ${JSON.stringify(error)}`);
    }
  };

  return { runId, log, flush };
};
