/**
 * Project-wide constants. Keep this file small; values that need to vary
 * by environment go in Firebase Remote Config or env vars, not here.
 */

/** Hard cap on a single audio segment's duration. */
export const MAX_SEGMENT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/** Hard cap on the combined transcript length per note. SPEC §9.8 (CLAUDE.md). */
export const MAX_TRANSCRIPT_CHARS = 50_000;

/** Days after creation that an un-filed note is auto-deleted. SPEC §12.6. */
export const NOTE_AUTO_DELETE_DAYS = 30;

/** Days an audit event is retained. SPEC §12.5. */
export const AUDIT_RETENTION_DAYS = 90;

/**
 * Default Anthropic model. Pin the exact ID at implementation time; verify
 * the current Sonnet via Anthropic docs on each upgrade. SPEC §14.9.
 */
export const DEFAULT_LLM_MODEL = "claude-sonnet-4-6";

/** Default Deepgram model. SPEC §14.8. */
export const DEFAULT_STT_MODEL = "nova-3-medical";

/** The pilot practice's Firestore ID. */
export const PRACTICE_ID = "argonaut-practice";
