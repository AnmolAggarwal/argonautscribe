import { onObjectFinalized } from "firebase-functions/v2/storage";
import { logger } from "firebase-functions/v2";

/**
 * Triggered when an audio segment lands in Cloud Storage at
 *   notes/{note_id}/segments/{segment_id}
 *
 * Implements the pipeline described in SPEC §10.3:
 *   1. Verify object metadata (clinician_id, note_id, segment_id).
 *   2. Idempotency check on the segment doc status.
 *   3. Read parent note + template (at template_version).
 *   4. Download audio.
 *   5. Deepgram transcribe (with template's keyword list).
 *   6. Append transcript_chunk to the note's combined transcript.
 *   7. Delete audio from Storage; clear storage_path on segment doc.
 *   8. Set note.status = "drafting".
 *   9. Build LLM prompt (system + tool schema + few-shot + transcript + user-set values).
 *  10. Claude Sonnet 4.6 with tool-use; retry once on schema violation.
 *  11. Merge AI field values into note.field_values (preserving user-set fields).
 *  12. Render final_note_text via the template's format string.
 *  13. Update note: field_values, final_note_text, status = "ready".
 *
 * This is a skeleton. The full implementation lands once the shared types and
 * format-string renderer stabilize.
 */
export const processSegment = onObjectFinalized(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 120,
    secrets: ["DEEPGRAM_API_KEY", "ANTHROPIC_API_KEY"],
  },
  async (event) => {
    const path = event.data.name;
    if (!path || !path.startsWith("notes/")) {
      return;
    }

    // TODO: implement per SPEC §10.3.
    logger.info("processSegment triggered", { path });
  },
);
