export type StageResult = "pass" | "modify" | "block" | "skip";

export interface Stage {
  name: string;
  result: StageResult;
  detail: string;
  dlp?: string[];
  ai?: string[];
  policy?: string;
  ms: number;
}

export interface ChatResponse {
  decision: "allowed" | "rewritten" | "blocked" | "bypassed" | "error";
  final_message: string;
  sanitized_input: string | null;
  blocked_at: "input" | "output" | null;
  dlp: string[];
  ai: string[];
  stages: Stage[];
}

export interface ChatRequest {
  agent: string;
  message: string;
  conversation_id: string;
  source: string;
  pgai: {
    enabled: boolean;
    label: string;
  };
}

export interface PGInspectResponse {
  input?: {
    blocked: boolean;
    modified: boolean;
    policyName: string;
    content: Array<{
      originalContent: string;
      modifiedContent: string;
      dlpViolations: Array<{ name: string; action: string }>;
      aiViolations: Array<{ type: string; action: string }>;
    }>;
  };
}

export interface Env {
  PGAI_API_EMAIL: string;
  PGAI_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  TURNSTILE_SECRET_KEY?: string;
  MODE?: string;
}
