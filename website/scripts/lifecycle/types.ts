import type {
  ICheckResult,
  IPlanCreation,
  IPlanDocumentWriteResult,
  IPlanInspection,
  IPlanUpdateResult,
  IProgress,
} from 'jg-plans';

export interface ILifecycleStage {
  id: string;
  label: string;
  title: string;
  description: string;
  code: string;
  source: string;
  call: string;
  result: IPlanCreation | IPlanInspection;
  operations: {
    call: string;
    result: IPlanUpdateResult | IPlanDocumentWriteResult | ICheckResult;
  }[];
  consumer: Record<string, unknown>;
}

// one criterion, the milestone ordinals that deliver it and its derived progress
export interface ILifecycleCriterion {
  id: string;
  milestones: (number | null)[];
  progress: IProgress | null;
}

export interface ILifecycle {
  stages: ILifecycleStage[];
  before: string;
  after: string;
  unchangedMilestones: string;
  retained: { id: string | null; title: string; status: string | null }[];
  binding: { before: string; after: string };
  progress: ILifecycleCriterion[];
  finding: { code: string; criterion: string; line: number };
  staleWrite: { expectedSha256: string; currentSha256: string; code: string };
}
