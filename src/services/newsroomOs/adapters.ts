import { Collections } from '@/lib/firebase/collections'
import type {
  AgentTask,
  AuditLogEntry,
  NewsroomAgent,
  RuleProposal,
  SocialAccountRef,
} from '@/types/newsroomOs'

/**
 * Newsroom OS data adapters.
 * Implementations may return empty lists until Phase 2+ wiring; never invent KPIs.
 */

export type AdapterResult<T> =
  | { ok: true; data: T; source: 'firestore' | 'empty' | 'cache' }
  | { ok: false; error: string; data: T }

export const NEWSROOM_OS_COLLECTIONS = {
  AGENTS: Collections.NEWSROOM_AGENTS,
  AGENT_TASKS: Collections.AGENT_TASKS,
  AGENT_EXECUTIONS: Collections.AGENT_EXECUTIONS,
  AGENT_MEMORIES: Collections.AGENT_MEMORIES,
  SHARED_MEMORIES: Collections.SHARED_MEMORIES,
  INSTRUCTION_SETS: Collections.INSTRUCTION_SETS,
  LEARNING_PROPOSALS: Collections.LEARNING_PROPOSALS,
  ALGORITHM_PROPOSALS: Collections.ALGORITHM_PROPOSALS,
  SOCIAL_ACCOUNTS: Collections.SOCIAL_ACCOUNTS,
  SMM_QUEUE: Collections.SMM_QUEUE,
  PAGE_LAYOUTS: Collections.PAGE_LAYOUTS,
  AUDIT_LOGS: Collections.CMS_AUDIT_LOGS,
  FEATURE_FLAGS: Collections.CMS_FEATURE_FLAGS,
} as const

export async function listNewsroomAgents(): Promise<AdapterResult<NewsroomAgent[]>> {
  // Phase 2 will query Firestore; foundation returns empty contract.
  return { ok: true, data: [], source: 'empty' }
}

export async function listAgentTasksAdapter(_opts?: {
  status?: string
  limit?: number
}): Promise<AdapterResult<AgentTask[]>> {
  return { ok: true, data: [], source: 'empty' }
}

export async function listSocialAccounts(_citySlug?: string): Promise<AdapterResult<SocialAccountRef[]>> {
  return { ok: true, data: [], source: 'empty' }
}

export async function listRuleProposals(): Promise<AdapterResult<RuleProposal[]>> {
  return { ok: true, data: [], source: 'empty' }
}

export async function listAuditLogs(_limit = 50): Promise<AdapterResult<AuditLogEntry[]>> {
  return { ok: true, data: [], source: 'empty' }
}

export function newsroomOsReadyMessage(module: string): string {
  return `${module} hazır — veri bağlanınca burada görünecek. Mevcut newsroom / sosyal / AI editör akışları çalışmaya devam ediyor.`
}
