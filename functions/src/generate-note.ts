/**
 * generateNote — HTTPS callable Cloud Function.
 *
 * Triggered by the web app when the dentist clicks "Generate". Walks
 * the existing audio segments of a note through Deepgram, deletes the
 * audio post-STT (privacy invariant, SPEC §14.16), then calls Claude
 * once with the combined transcript + any user-set picklist values,
 * merges the AI fields into the note, and renders final_note_text.
 *
 * Cost guardrails (SPEC §20.3 step 4, §20.4):
 *   - The note must exist and not be in `filed` or `generating` state.
 *   - Already-transcribed segments are skipped (idempotency).
 *   - On any failure the note moves to `error` with a human-readable
 *     error_message; the audio for any segment already transcribed is
 *     deleted regardless.
 */

import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import {
  FieldValue as AdminFieldValue,
  getFirestore,
  type DocumentData,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { transcribeAudio } from "./adapters/deepgram";
import { fillTemplateViaClaude } from "./adapters/anthropic";
import { buildSystemPrompt, buildFewShotMessages, buildUserMessage } from "./prompts/build";
import { buildToolSchema } from "./prompts/schema";
import { mergeFieldValues, type AiFieldValue } from "./merge";
import { render } from "./render";
import type { FieldValue, Template } from "./types";

const DEEPGRAM_KEY = defineSecret("DEEPGRAM_API_KEY");
const ANTHROPIC_KEY = defineSecret("ANTHROPIC_API_KEY");

// Pin model centrally; bump intentionally per SPEC §14.9.
const LLM_MODEL = "claude-sonnet-4-6";

interface GenerateNoteRequest {
  noteId: string;
}

interface GenerateNoteResponse {
  ok: true;
  status: "ready";
  segmentsTranscribed: number;
  finalNoteText: string;
}

export const generateNote = onCall<GenerateNoteRequest, Promise<GenerateNoteResponse>>(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 180,
    cors: true,
    secrets: [DEEPGRAM_KEY, ANTHROPIC_KEY],
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Sign-in required.");
    }
    const clinicianUid = auth.uid;

    const { noteId } = request.data ?? {};
    if (!noteId || typeof noteId !== "string") {
      throw new HttpsError("invalid-argument", "noteId is required.");
    }

    const db = getFirestore();
    const bucket = getStorage().bucket();

    // --- Read clinician, note, template ---
    const clinicianSnap = await db.doc(`clinicians/${clinicianUid}`).get();
    if (!clinicianSnap.exists) {
      throw new HttpsError("permission-denied", "No clinician profile.");
    }
    const clinician = clinicianSnap.data() as DocumentData;
    const practiceId = clinician.practice_id as string;

    const noteRef = db.doc(`clinicians/${clinicianUid}/notes/${noteId}`);
    const noteSnap = await noteRef.get();
    if (!noteSnap.exists) {
      throw new HttpsError("not-found", "Note not found.");
    }
    const note = noteSnap.data() as DocumentData;

    if (note.status === "filed") {
      throw new HttpsError("failed-precondition", "Note is already filed.");
    }
    if (note.status === "generating") {
      throw new HttpsError("failed-precondition", "Note is already generating.");
    }

    const templateRef = db.doc(
      `practices/${practiceId}/templates/${note.template_id as string}`,
    );
    const templateSnap = await templateRef.get();
    if (!templateSnap.exists) {
      throw new HttpsError("not-found", `Template ${note.template_id} not found.`);
    }
    const template = templateSnap.data() as Template;

    // --- Mark generating ---
    await noteRef.update({
      status: "generating",
      error_message: null,
      updated_at: AdminFieldValue.serverTimestamp(),
    });

    try {
      // --- Read segments in sequence order ---
      const segmentsCol = db.collection(
        `clinicians/${clinicianUid}/notes/${noteId}/segments`,
      );
      const segmentsSnap = await segmentsCol.orderBy("sequence", "asc").get();

      if (segmentsSnap.empty) {
        throw new Error("No audio segments to transcribe. Record something first.");
      }

      // --- STT each segment that hasn't been transcribed yet ---
      const transcriptChunks: string[] = [];
      let transcribedCount = 0;

      for (const segDoc of segmentsSnap.docs) {
        const seg = segDoc.data() as DocumentData;

        if (seg.transcript_chunk && typeof seg.transcript_chunk === "string" && seg.transcript_chunk.length > 0) {
          // Already transcribed — reuse.
          transcriptChunks.push(seg.transcript_chunk);
          continue;
        }

        const storagePath = seg.storage_path as string | null;
        if (!storagePath) {
          // No audio and no transcript. This can happen if:
          //   - A previous Generate partially succeeded (audio deleted, STT returned empty)
          //   - The upload never completed but the segment doc was created
          // Mark as error and skip — don't block the rest of the note.
          logger.warn("Skipping segment with no audio and no transcript", {
            noteId,
            segmentId: segDoc.id,
            status: seg.status,
          });
          await segDoc.ref.update({
            status: "error",
            error_message: "No audio file available for transcription",
          });
          continue;
        }

        // Verify the file actually exists in Storage before downloading.
        const file = bucket.file(storagePath);
        const [exists] = await file.exists();
        if (!exists) {
          logger.warn("Segment audio file missing from Storage", {
            noteId,
            segmentId: segDoc.id,
            storagePath,
          });
          await segDoc.ref.update({
            status: "error",
            storage_path: null,
            error_message: "Audio file not found in storage",
          });
          continue;
        }

        await segDoc.ref.update({ status: "transcribing" });

        const [audio] = await file.download();
        const segContentType =
          typeof seg.content_type === "string" ? (seg.content_type as string) : null;
        const [metadata] = await file.getMetadata();
        const metaContentType =
          typeof metadata.contentType === "string" ? metadata.contentType : null;
        const contentType: string = segContentType ?? metaContentType ?? "audio/webm";

        logger.info("Transcribing segment", {
          noteId,
          segmentId: segDoc.id,
          bytes: audio.length,
          contentType,
        });

        const chunk = await transcribeAudio({
          apiKey: DEEPGRAM_KEY.value(),
          audio,
          mimeType: contentType,
          keywords: template.keywords ?? [],
        });

        // Persist chunk + mark segment done. Clear storage_path so we
        // can't try to re-download deleted audio later.
        await segDoc.ref.update({
          transcript_chunk: chunk,
          status: "done",
          storage_path: null,
        });

        // Delete audio (post-STT invariant).
        await file.delete().catch((err: unknown) => {
          logger.warn("Audio delete failed (continuing):", err);
        });

        transcriptChunks.push(chunk);
        transcribedCount += 1;
      }

      const combinedTranscript = transcriptChunks.join(" ").trim();
      if (combinedTranscript.length === 0) {
        throw new Error("Transcription produced no text.");
      }

      // --- Build LLM prompt + tool schema, call Claude ---
      const toolSchema = buildToolSchema(template);
      const systemPrompt = buildSystemPrompt(template);
      const fewShotMessages = buildFewShotMessages(template);

      const existingFieldValues = (note.field_values ?? {}) as Record<string, FieldValue>;

      const userMessage = buildUserMessage({
        transcript: combinedTranscript,
        userSetFieldValues: existingFieldValues,
      });

      const llmResult = await fillTemplateViaClaude({
        apiKey: ANTHROPIC_KEY.value(),
        model: LLM_MODEL,
        systemPrompt,
        toolSchema,
        fewShotMessages,
        userMessage,
      });

      logger.info("Claude usage", { noteId, usage: llmResult.usage });

      // --- Merge + render ---
      const merged = mergeFieldValues(
        existingFieldValues,
        llmResult.fieldValues as unknown as Record<string, AiFieldValue>,
      );
      const finalText = render(template, merged);

      // --- Write back ---
      await noteRef.update({
        transcript: combinedTranscript,
        field_values: merged,
        final_note_text: finalText,
        status: "ready",
        error_message: null,
        updated_at: AdminFieldValue.serverTimestamp(),
      });

      return {
        ok: true,
        status: "ready",
        segmentsTranscribed: transcribedCount,
        finalNoteText: finalText,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("generateNote failed:", { noteId, error: message });
      await noteRef.update({
        status: "error",
        error_message: message,
        updated_at: AdminFieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", message);
    }
  },
);
