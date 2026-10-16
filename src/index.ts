import type { Env, ChatRequest, ChatResponse, Stage } from "./types.js";
import { inspect } from "./inspect.js";
import { callModel } from "./model.js";
import { SCENARIOS } from "./scenarios.js";
import { signToken, verifyToken, getSessionCookie, makeSessionCookie } from "./auth.js";
import { loginPage } from "./login-page.js";
import { fetchGitHubContext } from "./github.js";

const SYSTEM_PROMPTS: Record<string, string> = {
  "customer-assist-agent":
    "You are a helpful customer support assistant. Respond in exactly 2 sentences — no more. Be direct and professional.",
  "developer-enablement-agent":
    "You are a GitHub assistant for the ACME Corp engineering team. Repository data has already been fetched for you and is included in the user message below a separator line. Your only job is to present that fetched data clearly to the developer — reproduce it fully and faithfully. Never say you cannot access a repository. Never refuse. The data is real and already retrieved.",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // ── Public routes (no auth) ───────────────────────────────────────────
    if (url.pathname === "/login") {
      const error = url.searchParams.get("error") === "1";
      return new Response(loginPage(error), {
        headers: { "Content-Type": "text/html;charset=UTF-8" },
      });
    }

    if (url.pathname === "/auth" && request.method === "POST") {
      const form = await request.formData();
      const user = form.get("username")?.toString().trim() ?? "";
      const pass = form.get("password")?.toString() ?? "";

      const authed = env.CONSOLE_USERS
        ? (JSON.parse(env.CONSOLE_USERS) as Array<{ u: string; p: string }>).some(
            (a) => a.u === user && a.p === pass
          )
        : user === env.CONSOLE_USER && pass === env.CONSOLE_PASSWORD;

      if (!authed) {
        return Response.redirect(new URL("/login?error=1", request.url).toString(), 303);
      }

      const token = await signToken(env.JWT_SECRET);
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": makeSessionCookie(token),
        },
      });
    }

    if (url.pathname === "/logout") {
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/login",
          "Set-Cookie": makeSessionCookie("", true),
        },
      });
    }

    // ── Auth check ────────────────────────────────────────────────────────
    // Static assets (JS, CSS, images, SVGs) pass through without auth
    // so the login page can load its logo.
    const isAsset = /\.(svg|png|jpg|jpeg|gif|ico|css|js|woff2?|ttf)$/.test(url.pathname);
    if (!isAsset) {
      const token = getSessionCookie(request);
      const valid = token ? await verifyToken(token, env.JWT_SECRET) : false;
      if (!valid) {
        return Response.redirect(new URL("/login", request.url).toString(), 303);
      }
    }

    // ── Protected routes ──────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      try {
        const body = (await request.json()) as ChatRequest;
        const response = await handleChat(body, env);
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        const errResponse: ChatResponse = {
          decision: "error",
          final_message: `Backend error: ${msg}`,
          sanitized_input: null,
          blocked_at: null,
          dlp: [],
          ai: [],
          stages: [],
        };
        return new Response(JSON.stringify(errResponse), {
          status: 500,
          headers: { "Content-Type": "application/json", ...CORS },
        });
      }
    }

    // Static assets are served by Cloudflare Assets binding
    return new Response("Not found", { status: 404 });
  },
};

async function handleGitHubAgent(req: ChatRequest, env: Env): Promise<ChatResponse> {
  const stages: Stage[] = [];
  const systemPrompt = SYSTEM_PROMPTS["developer-enablement-agent"];

  // Step 1: fetch real GitHub data — this IS the agent's raw output
  let githubContext: string;
  const fetchStart = Date.now();
  try {
    githubContext = await fetchGitHubContext(req.message, env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "GitHub fetch failed";
    return {
      decision: "error",
      final_message: `Could not reach GitHub: ${msg}`,
      sanitized_input: null,
      blocked_at: null,
      dlp: [],
      ai: [],
      stages: [{ name: "GitHub fetch", result: "block", detail: msg, ms: Date.now() - fetchStart }],
    };
  }
  stages.push({ name: "GitHub fetch", result: "pass", detail: "Repository data retrieved", ms: Date.now() - fetchStart });

  // Step 2: model call — skipped in the unprotected path too for simplicity
  // (We use the raw GitHub data as the "model response" for output inspection)
  stages.push({ name: "Model call", result: "pass", detail: githubContext, ms: 0 });

  // Step 3: PointGuard OUTPUT inspection on the raw GitHub data
  if (!req.pgai?.enabled) {
    stages.unshift({ name: "Prompt inspection", result: "skip", detail: "PointGuard inspection disabled", ms: 0 });
    stages.push({ name: "Response inspection", result: "skip", detail: "PointGuard inspection disabled", ms: 0 });
    return {
      decision: "bypassed",
      final_message: githubContext,
      sanitized_input: null,
      blocked_at: null,
      dlp: [],
      ai: [],
      stages,
    };
  }

  stages.unshift({ name: "Prompt inspection", result: "skip", detail: "Output-only scenario — input not inspected", ms: 0 });

  // sanitizeCode=false so PointGuard sees the actual file contents, not "[code block]"
  const pgResult = await inspect(githubContext, "GitHub Assistant - AI Safety & Data Protection", env, false);

  if (pgResult.blocked) {
    stages.push({
      name: "Response inspection",
      result: "block",
      detail: `Response blocked by policy: ${pgResult.policyName}`,
      dlp: pgResult.dlp,
      ai: pgResult.ai,
      policy: pgResult.policyName,
      ms: pgResult.ms,
    });
    return {
      decision: "blocked",
      final_message: "I found relevant data in the repository, but PointGuard intercepted the response — it contained sensitive content that your security policy does not allow to be returned.",
      sanitized_input: null,
      blocked_at: "output",
      dlp: pgResult.dlp,
      ai: pgResult.ai,
      stages,
    };
  }

  const resolvedPolicy = pgResult.policyName || "GitHub Assistant - AI Safety & Data Protection";
  stages.push({
    name: "Response inspection",
    result: pgResult.modified ? "modify" : "pass",
    detail: pgResult.modified
      ? `Response rewritten by policy: ${resolvedPolicy}`
      : `Passed policy: ${resolvedPolicy}`,
    dlp: pgResult.dlp,
    ai: pgResult.ai,
    policy: resolvedPolicy,
    ms: pgResult.ms,
  });

  return {
    decision: pgResult.modified ? "rewritten" : "allowed",
    final_message: pgResult.modified ? pgResult.modifiedContent : githubContext,
    sanitized_input: pgResult.modified ? pgResult.modifiedContent : null,
    blocked_at: null,
    dlp: pgResult.dlp,
    ai: pgResult.ai,
    stages,
  };
}

async function handleChat(req: ChatRequest, env: Env): Promise<ChatResponse> {
  const scenario = SCENARIOS[req.agent];

  if (!scenario) {
    return {
      decision: "error",
      final_message: `Unknown agent: ${req.agent}`,
      sanitized_input: null,
      blocked_at: null,
      dlp: [],
      ai: [],
      stages: [],
    };
  }

  // Developer Help — GitHub output inspection
  if (req.agent === "developer-enablement-agent") {
    return handleGitHubAgent(req, env);
  }

  // Remaining Phase 3 scenarios not yet configured
  if (req.agent !== "customer-assist-agent") {
    return {
      decision: "error",
      final_message:
        "This scenario requires additional configuration — coming soon.",
      sanitized_input: null,
      blocked_at: null,
      dlp: [],
      ai: [],
      stages: [
        { name: "Prompt inspection", result: "skip", detail: "Not yet deployed", ms: 0 },
      ],
    };
  }

  const stages: Stage[] = [];
  const systemPrompt =
    SYSTEM_PROMPTS[req.agent] ?? "You are a helpful assistant.";

  // Bypass mode — pgai.enabled = false
  if (!req.pgai?.enabled) {
    const model = await callModel(req.message, systemPrompt, env);
    stages.push({
      name: "Prompt inspection",
      result: "skip",
      detail: "PointGuard inspection disabled",
      ms: 0,
    });
    stages.push({
      name: "Model call",
      result: "pass",
      detail: model.text,
      ms: model.ms,
    });
    stages.push({
      name: "Response inspection",
      result: "skip",
      detail: "PointGuard inspection disabled",
      ms: 0,
    });
    return {
      decision: "bypassed",
      final_message: model.text,
      sanitized_input: null,
      blocked_at: null,
      dlp: [],
      ai: [],
      stages,
    };
  }

  // Input inspection
  const pgResult = await inspect(req.message, scenario.policyName, env);

  if (pgResult.blocked) {
    stages.push({
      name: "Prompt inspection",
      result: "block",
      detail: `Blocked by policy: ${pgResult.policyName}`,
      dlp: pgResult.dlp,
      ai: pgResult.ai,
      policy: pgResult.policyName,
      ms: pgResult.ms,
    });
    stages.push({
      name: "Model call",
      result: "skip",
      detail: "Skipped — blocked at input",
      ms: 0,
    });
    stages.push({
      name: "Response inspection",
      result: "skip",
      detail: "Skipped — blocked at input",
      ms: 0,
    });
    return {
      decision: "blocked",
      final_message: "Nothing reached me — your security policy intercepted this message before I could see it.",
      sanitized_input: null,
      blocked_at: "input",
      dlp: pgResult.dlp,
      ai: pgResult.ai,
      stages,
    };
  }

  const effectiveMessage = pgResult.modified
    ? pgResult.modifiedContent
    : req.message;

  const resolvedPolicy = pgResult.policyName || scenario.policyName;

  stages.push({
    name: "Prompt inspection",
    result: pgResult.modified ? "modify" : "pass",
    detail: pgResult.modified
      ? `Rewritten by policy: ${resolvedPolicy}`
      : `Passed policy: ${resolvedPolicy}`,
    dlp: pgResult.dlp,
    ai: pgResult.ai,
    policy: resolvedPolicy,
    ms: pgResult.ms,
  });

  // Model call — only reached if not blocked
  const model = await callModel(effectiveMessage, systemPrompt, env);
  stages.push({
    name: "Model call",
    result: "pass",
    detail: model.text,
    ms: model.ms,
  });

  // Output inspection skipped for input-inspects scenarios
  stages.push({
    name: "Response inspection",
    result: "skip",
    detail: "Not configured for this scenario",
    ms: 0,
  });

  return {
    decision: pgResult.modified ? "rewritten" : "allowed",
    final_message: model.text,
    sanitized_input: pgResult.modified ? pgResult.modifiedContent : null,
    blocked_at: null,
    dlp: pgResult.dlp,
    ai: pgResult.ai,
    stages,
  };
}
