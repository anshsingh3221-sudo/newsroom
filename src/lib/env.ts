import { z } from "zod";

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  LLM_PROVIDER: z.enum(["gemini", "openai", "anthropic"]).default("gemini"),
  LLM_MODEL: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["none", "gemini", "openai"]).default("none"),
  EMBEDDING_MODEL: z.string().optional(),
  SEARCH_PROVIDER: z.enum(["gdelt", "brave"]).default("gdelt"),
  BRAVE_API_KEY: z.string().optional(),
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Invalid environment. Check .env.local: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function llmKey(e = env()): string | undefined {
  return { gemini: e.GEMINI_API_KEY, openai: e.OPENAI_API_KEY, anthropic: e.ANTHROPIC_API_KEY }[e.LLM_PROVIDER];
}
export const llmConfigured = () => Boolean(llmKey());
