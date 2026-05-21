/**
 * Audio segment CRUD + Storage helpers.
 *
 * A segment is one Record→Stop cycle. Augment creates additional
 * segments on the same note (each with a higher sequence number).
 * Re-record (clean) deletes all segments and clears the transcript on
 * the note, keeping the note shell and any picklist values.
 *
 * Storage paths and metadata MUST match the Storage Security Rules
 * (firestore/storage.rules). The clinician_id custom metadata is
 * checked on every upload; omitting it produces a permission-denied
 * error with no other diagnostic.
 */

import { v4 as uuidv4 } from "uuid";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, deleteObject } from "firebase/storage";
import type { AudioSegment, NoteStatus } from "@argonaut/shared";
import { db, storage } from "./firebase";

/** Path in Cloud Storage where a segment's audio blob lives. */
export function segmentStoragePath(noteId: string, segmentId: string): string {
  return `notes/${noteId}/segments/${segmentId}`;
}

/** Read all segment docs for a note, ordered by sequence ascending. */
export async function listSegments(
  clinicianUid: string,
  noteId: string,
): Promise<AudioSegment[]> {
  const q = query(
    collection(db, "clinicians", clinicianUid, "notes", noteId, "segments"),
    orderBy("sequence", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as AudioSegment);
}

/**
 * Create a segment doc + upload its audio. Returns the new segment_id.
 *
 * The note's status is moved to "transcribing" once upload completes —
 * the Cloud Function (step 4) takes ownership from there. Without the
 * function the segment sits at "uploading" and the note sits at
 * "transcribing" indefinitely; that's expected for step 3 testing.
 */
export async function createSegmentAndUpload(args: {
  clinicianUid: string;
  noteId: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  sequence: number;
}): Promise<string> {
  const { clinicianUid, noteId, blob, mimeType, durationMs, sequence } = args;
  const segmentId = uuidv4();
  const path = segmentStoragePath(noteId, segmentId);

  const segmentDocRef = doc(
    db,
    "clinicians",
    clinicianUid,
    "notes",
    noteId,
    "segments",
    segmentId,
  );

  await setDoc(segmentDocRef, {
    segment_id: segmentId,
    sequence,
    storage_path: path,
    transcript_chunk: "",
    duration_ms: durationMs,
    status: "uploading",
    error_message: null,
    created_at: serverTimestamp(),
  });

  // Storage upload with required metadata. The clinician_id custom
  // metadata field is enforced by Storage Security Rules (see
  // firestore/storage.rules); the upload will be rejected without it.
  const objectRef = storageRef(storage, path);
  await uploadBytes(objectRef, blob, {
    contentType: mimeType,
    customMetadata: {
      clinician_id: clinicianUid,
      note_id: noteId,
      segment_id: segmentId,
    },
  });

  // Move the note to "transcribing" — the Cloud Function picks up from here.
  await setNoteStatus(clinicianUid, noteId, "transcribing");

  return segmentId;
}

/** Update only the status field on the note doc. */
export async function setNoteStatus(
  clinicianUid: string,
  noteId: string,
  status: NoteStatus,
): Promise<void> {
  await setDoc(
    doc(db, "clinicians", clinicianUid, "notes", noteId),
    { status, updated_at: serverTimestamp() },
    { merge: true },
  );
}

/**
 * Delete all segments for a note: Storage audio (if any remain) and
 * the segment docs. Best-effort on Storage — the Cloud Function may
 * have already deleted some objects post-STT.
 */
export async function deleteAllSegments(
  clinicianUid: string,
  noteId: string,
): Promise<void> {
  const segments = await listSegments(clinicianUid, noteId);

  // Storage objects first (no transaction needed; best effort).
  await Promise.all(
    segments.map(async (s) => {
      if (!s.storage_path) return;
      try {
        await deleteObject(storageRef(storage, s.storage_path));
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code !== "storage/object-not-found") {
          console.warn("Storage delete failed (continuing):", err);
        }
      }
    }),
  );

  // Then segment docs, batched.
  const batch = writeBatch(db);
  for (const s of segments) {
    batch.delete(
      doc(db, "clinicians", clinicianUid, "notes", noteId, "segments", s.segment_id),
    );
  }
  await batch.commit();
}

/**
 * Re-record (clean): wipe all audio + transcripts on this note, keep
 * the note shell and any picklist/qualifier values the user has set.
 * Status returns to "new".
 */
export async function clearAudioAndTranscript(
  clinicianUid: string,
  noteId: string,
): Promise<void> {
  await deleteAllSegments(clinicianUid, noteId);
  await setDoc(
    doc(db, "clinicians", clinicianUid, "notes", noteId),
    {
      transcript: "",
      status: "new",
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}
