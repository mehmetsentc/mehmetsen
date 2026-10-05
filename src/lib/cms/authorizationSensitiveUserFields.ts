/**
 * SEC-CMS-ROLE-ESCALATION-1 — fields on Firestore `users/{uid}` that grant or limit
 * server-side authority. A client (Firebase Web SDK) must never be able to write them;
 * only super_admin through the existing CMS user screens, or trusted Admin SDK code
 * (e.g. /api/auth/cms-sync), may change them.
 *
 * Enforced in `firestore.rules` → authorizationSensitiveUserFields(). The two lists
 * are kept identical by `firestoreRules.users.sec1.test.ts` (drift guard), so this is
 * the single documented list, not a second source of truth.
 *
 * Readers (why each field is sensitive):
 * - role        → resolveCmsRoleFromFirestore: verifyCmsToken, /api/auth/cms-sync,
 *                 newsroomAuth, /api/events/sync, /api/cron/iskur-jobs; rules userRole()
 * - permissions → /api/admin/gmail/callback (`permissions.includes('system:settings')`)
 * - cmsScope    → Phase 1 staff scope (verifyCmsToken + rbacScope; rules isScopedStaff)
 * - isAdmin, admin → legacy privileged keys; no current reader, kept closed
 */
export const AUTHORIZATION_SENSITIVE_USER_FIELDS = [
  'role',
  'permissions',
  'cmsScope',
  'isAdmin',
  'admin',
] as const

export type AuthorizationSensitiveUserField = (typeof AUTHORIZATION_SENSITIVE_USER_FIELDS)[number]
