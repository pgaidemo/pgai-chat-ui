import type { Env, PGInspectResponse } from "./types.js";

const PGAI_BASE =
  "https://api.eval1.appsoc.com/aisec-rdc-v2/api/v1/orgs/aispm-demo1-869021";

export interface InspectResult {
  blocked: boolean;
  modified: boolean;
  policyName: string;
  originalContent: string;
  modifiedContent: string;
  dlp: string[];
  ai: string[];
  ms: number;
}

export async function inspect(
  text: string,
  policyName: string,
  env: Env
): Promise<InspectResult> {
  const start = Date.now();

  const sanitized = text.replace(/```[\s\S]*?```/g, "[code block]").trim();

  const res = await fetch(`${PGAI_BASE}/inspect/input?aiSec=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-appsoc-api-email": env.PGAI_API_EMAIL,
      "X-appsoc-api-key": env.PGAI_API_KEY,
    },
    body: JSON.stringify({
      policyName,
      input: [{ role: "user", content: sanitized }],
    }),
  });

  const ms = Date.now() - start;

  if (!res.ok) {
    throw new Error(`PointGuard API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as PGInspectResponse;
  const r = data.input ?? {
    blocked: false,
    modified: false,
    policyName: "",
    content: [],
  };
  const c = r.content?.[0] ?? {
    originalContent: text,
    modifiedContent: text,
    dlpViolations: [],
    aiViolations: [],
  };

  return {
    blocked: r.blocked,
    modified: r.modified,
    policyName: r.policyName,
    originalContent: c.originalContent,
    modifiedContent: c.modifiedContent,
    dlp: (c.dlpViolations ?? []).map((v) => `${v.name} (${v.action})`),
    ai: (c.aiViolations ?? []).map((v) => `${v.type} (${v.action})`),
    ms,
  };
}
