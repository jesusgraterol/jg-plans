export interface ILifecycleStage {
  id: string;
  label: string;
  title: string;
  description: string;
  code: string;
  source: string;
  result: unknown;
}

export interface ILifecycle {
  stages: ILifecycleStage[];
  before: string;
  after: string;
  unchangedMilestones: string;
  retained: { id: string | null; title: string; status: string | null }[];
  binding: { before: string; after: string };
}
