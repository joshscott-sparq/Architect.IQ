import type {
  EstimateResponse,
  EstimateSummary,
  Pattern,
} from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export interface ClientContextInput {
  tech_stack: string[];
  compliance_posture: string[];
  team_skills: string[];
  us_ns_mix?: Record<string, number>;
}

export const api = {
  listPatterns: () => fetch("/api/patterns").then((r) => json<Pattern[]>(r)),

  listEstimates: () =>
    fetch("/api/estimates").then((r) => json<EstimateSummary[]>(r)),

  getEstimate: (id: string) =>
    fetch(`/api/estimates/${id}`).then((r) => json<EstimateResponse>(r)),

  createEstimate: (body: {
    project_name: string;
    prd_text: string;
    client_context: ClientContextInput;
    match_override?: string | null;
  }) =>
    fetch("/api/estimates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<EstimateResponse>(r)),

  recompute: (
    id: string,
    overrides: { ai_boost?: number; engineer_count?: number }
  ) =>
    fetch(`/api/estimates/${id}/recompute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    }).then((r) => json<EstimateResponse>(r)),

  demoStatus: () =>
    fetch("/api/demo/status").then((r) =>
      json<{ seeded: boolean; count: number; available: number }>(r)
    ),

  seedDemo: () =>
    fetch("/api/demo/seed", { method: "POST" }).then((r) =>
      json<{ created_count: number; total: number }>(r)
    ),

  extractContext: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/context/extract", {
      method: "POST",
      body: form,
    }).then((r) => json<{ filename: string; text: string }>(r));
  },

  getRates: () =>
    fetch("/api/rates").then((r) =>
      json<{
        source: string;
        summary: { rows: number; disciplines: string[]; tiers: string[]; locations: string[] };
        rates: { discipline: string; tier: string; location: string; day_rate: number }[];
      }>(r)
    ),

  uploadRates: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch("/api/rates", { method: "POST", body: form }).then((r) =>
      json<{ status: string; source: string; summary: { rows: number } }>(r)
    );
  },

  recost: (id: string) =>
    fetch(`/api/estimates/${id}/recost`, { method: "POST" }).then((r) =>
      json<EstimateResponse>(r)
    ),
};
