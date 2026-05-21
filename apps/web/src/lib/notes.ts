/**
 * Note CRUD helpers.
 *
 * Thin wrappers over Firestore calls. The web UI uses these so screen
 * components don't sprinkle Firestore SDK calls across themselves.
 */

import { v4 as uuidv4 } from "uuid";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { FieldValue, Template } from "@argonaut/shared";
import { db } from "./firebase";

/** "2026-05-21" — day-level only per the PHI invariants (SPEC §12.3). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create a new note. Reads the current template to capture its version,
 * then writes the note doc and an empty patient_tags doc.
 * Returns the new note_id.
 */
export async function createNote(
  clinicianUid: string,
  practiceId: string,
  templateId: string,
): Promise<string> {
  const templateRef = doc(db, "practices", practiceId, "templates", templateId);
  const templateSnap = await getDoc(templateRef);
  if (!templateSnap.exists()) {
    throw new Error(`Template "${templateId}" not found in practice "${practiceId}".`);
  }
  const template = templateSnap.data() as Template;

  const noteId = uuidv4();

  await setDoc(doc(db, "clinicians", clinicianUid, "notes", noteId), {
    note_id: noteId,
    template_id: templateId,
    template_version: template.version,
    date_iso: todayIso(),
    status: "new",
    transcript: "",
    field_values: {},
    final_note_text: "",
    error_message: null,
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });

  // Write audit event (non-blocking — fire and forget would be fine,
  // but we await so a permission error surfaces during dev).
  const auditId = uuidv4();
  await setDoc(doc(db, "audit", practiceId, "events", auditId), {
    event_type: "note_created",
    clinician_id: clinicianUid,
    note_id: noteId,
    template_id: templateId,
    date_iso: todayIso(),
    created_at: serverTimestamp(),
  });

  return noteId;
}

/**
 * Write a single field value and the latest rendered final_note_text.
 * Uses merge so other field values on the doc are unaffected.
 */
export async function writeFieldValue(
  clinicianUid: string,
  noteId: string,
  fieldName: string,
  value: FieldValue,
  finalNoteText: string,
): Promise<void> {
  await setDoc(
    doc(db, "clinicians", clinicianUid, "notes", noteId),
    {
      field_values: { [fieldName]: value },
      final_note_text: finalNoteText,
      updated_at: serverTimestamp(),
    },
    { merge: true },
  );
}

/** Upsert the patient tag for a note. Tag is PHI. */
export async function writePatientTag(
  clinicianUid: string,
  noteId: string,
  tag: string,
): Promise<void> {
  await setDoc(
    doc(db, "clinicians", clinicianUid, "patient_tags", noteId),
    {
      note_id: noteId,
      tag,
      precise_time: null,
      created_at: serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Mark a note filed: hard-delete the note, all its segments, and the
 * patient tag. Write a content-free audit event.
 */
export async function markFiled(
  clinicianUid: string,
  noteId: string,
  practiceId: string,
  templateId: string,
): Promise<void> {
  const batch = writeBatch(db);

  // Delete all segment docs under this note.
  const segmentsRef = collection(db, "clinicians", clinicianUid, "notes", noteId, "segments");
  const segmentDocs = await getDocs(segmentsRef);
  segmentDocs.forEach((s) => batch.delete(s.ref));

  // Delete the note itself.
  batch.delete(doc(db, "clinicians", clinicianUid, "notes", noteId));

  // Best-effort delete the patient tag (may not exist if never set).
  // Batched deletes don't fail on missing docs in Firestore.
  batch.delete(doc(db, "clinicians", clinicianUid, "patient_tags", noteId));

  // Audit event.
  const auditId = uuidv4();
  batch.set(doc(db, "audit", practiceId, "events", auditId), {
    event_type: "note_filed",
    clinician_id: clinicianUid,
    note_id: noteId,
    template_id: templateId,
    date_iso: todayIso(),
    created_at: serverTimestamp(),
  });

  await batch.commit();
}

/** Delete a single note without filing — used for explicit discard flows later. */
export async function discardNote(clinicianUid: string, noteId: string): Promise<void> {
  await deleteDoc(doc(db, "clinicians", clinicianUid, "notes", noteId));
  await deleteDoc(doc(db, "clinicians", clinicianUid, "patient_tags", noteId)).catch(() => {});
}
