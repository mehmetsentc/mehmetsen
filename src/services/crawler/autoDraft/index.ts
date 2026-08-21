export {
  AUTO_DRAFT_GATE_STATUSES,
  STRONG_SINGLE_SOURCE_THRESHOLDS,
  evaluateAutoDraftGate,
  evaluateStrongSingleSource,
  scoreAutoDraftEligibility,
  canCreateAutoDraftJob,
  canCreateManualApprovedJob,
  toMachineDraftEligibility,
  buildMachineEligibilityMeta,
  autoDraftMayPublish,
  type AutoDraftGateStatus,
  type AutoDraftGateInput,
  type AutoDraftGateResult,
  type EligibilityScoreBreakdown,
  type MachineDraftEligibilityStatus,
  type MachineEligibilityAuditMeta,
} from './eligibility'

export {
  scoreEditorialAutoDraftRank,
  compareEditorialAutoDraftRank,
  isCanakkaleLocal,
  CANAKKALE_RANK_BOOST,
  type EditorialRankInput,
  type EditorialRankResult,
} from './editorialRank'

export { aiJobFailureReasonTr, AI_JOB_FAILURE_REASON_TR } from './aiFailureLabels'

export {
  buildOpsCounters,
  formatMetricNumber,
  metricOk,
  metricUnavailable,
  type ControlledAutoDraftOpsCounters,
  type MetricValue,
} from './observability'

export { summarizeSourceHealth, type SourceHealthSummary } from './sourceHealth'

export {
  auditCronSchedules,
  phase4eFreshnessExpectations,
  type ScheduleAuditRow,
} from './scheduleAudit'

export {
  buildEventContentFingerprint,
  fingerprintFromMembers,
  decideEventRevision,
  type RevisionDecision,
  type RevisionMember,
} from './revision'

export {
  autoDraftBudgetLimits,
  checkMonthlyBudget,
  monthPeriodKey,
  type AutoDraftBudgetLimits,
} from './budgetLimits'

export {
  runControlledAutoDraftTick,
  autoDraftPublicationAllowed,
  recoverStaleLeases,
  type ControlledAutoDraftTickResult,
} from './pipeline'

export {
  runDedicatedAiWorkerTick,
  workerMayClaimNewJobs,
  type AiWorkerTickResult,
} from './worker'

export {
  blocksAutomaticRepay,
  isUncertainFailureCode,
  newWorkerId,
  newExecutionId,
  leaseExpiresAt,
  isLeaseExpired,
  UNCERTAIN_FAILURE_CODES,
} from './lease'

export {
  getAutoDraftEligibleAfter,
  getAcceptanceCohortIds,
  isEventEligibleForAutoDraft,
  acceptanceHardCaps,
  jobLeaseTimeoutMs,
} from './activation'

export {
  buildCostCmsPayload,
  costCmsUnavailablePayload,
  aggregateLedgerRows,
  type CostAggregateWindow,
} from './costAggregates'
