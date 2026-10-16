export interface ScenarioConfig {
  id: string;
  policyName: string;
  inspects: "input" | "output";
  unprotected?: boolean;
  denyText?: string;
}

export const SCENARIOS: Record<string, ScenarioConfig> = {
  "customer-assist-agent": {
    id: "customer-assist-agent",
    policyName: "Customer Support Agent - AI Safety & Data Protection",
    inspects: "input",
    unprotected: true,
  },
  "developer-enablement-agent": {
    id: "developer-enablement-agent",
    policyName: "GitHub Assistant - AI Safety & Data Protection",
    inspects: "output",
  },
  "support-ops-agent": {
    id: "support-ops-agent",
    policyName: "Support Operations Agent - AI Safety & Data Protection",
    inspects: "output",
    denyText: "Sorry, I can't help you with that",
  },
};
