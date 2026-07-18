// Shapes mirrored from the FastAPI responses. The graph is deep; the UI types the
// fields it uses and leaves the rest loose.

export interface Percentiles {
  p10: number;
  p50: number;
  p80: number;
  p90: number;
}

export interface MonteCarlo {
  iterations: number;
  effort_points: Percentiles;
  duration_sprints: Percentiles;
  cost: Percentiles;
}

export interface Reconciliation {
  top_down_points: number;
  bottom_up_points: number;
}

export interface Role {
  discipline: string;
  tier: string;
  location: string;
  allocated: number;
  day_rate: number;
}

export interface Component {
  id: string;
  name: string;
  component_type: string;
  technology?: string | null;
  discipline?: string | null;
}

export interface Scenario {
  id: string;
  name: string;
  dev_model: string;
  location_mix: Record<string, number>;
  engineers: number | null;
}

export interface ScenarioResult {
  scenario: Scenario;
  assumptions: string[];
  effort_points: Percentiles;
  duration_sprints: Percentiles;
  cost: Percentiles;
  monthly_cost: number;
  total_cost: number;
}

export interface TeamSuggestion {
  goal: string;
  scenario: Scenario;
  rationale: string;
  result: ScenarioResult | null;
}

export interface DeferralSuggestion {
  work_item_id: string;
  feature: string;
  points: number;
  rationale: string;
  est_sprint_saving: number;
}

export interface Graph {
  project_name: string;
  tags?: string[];
  scenarios?: ScenarioResult[];
  requirements: { id: string; text: string }[];
  capabilities: { id: string; name: string }[];
  components: Component[];
  work_items: { id: string; feature?: string; epic: string }[];
  matched_pattern_ids: string[];
  ranked_matches: { pattern_id: string; score: number; rationale: string }[];
  team_plan: { roles: Role[]; monthly_cost?: number; total_cost?: number };
  monte_carlo?: MonteCarlo;
  reconciliation?: Reconciliation;
  deterministic?: { total_points: number; total_cost?: number };
  assumptions: string[];
  client_context: {
    tech_stack: string[];
    compliance_posture: string[];
    team_skills: string[];
  };
}

export interface Reference {
  estimate_id: string;
  project_name: string;
  similarity: number;
  why: string;
  cost_p50?: number | null;
  effort_p50?: number | null;
}

export interface EstimateResponse {
  estimate_id: string;
  version: number;
  graph: Graph;
  mermaid: string;
  references: Reference[];
}

export interface EstimateSummary {
  estimate_id: string;
  project_name: string;
  version: number;
  pattern_ids: string[];
  cost_p50?: number | null;
  effort_p50?: number | null;
  updated_at: string;
  tags?: string[] | null;
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  when_to_use: string;
}
