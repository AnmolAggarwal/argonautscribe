/**
 * Seed script for the dev Firestore project.
 *
 * Writes the practice doc and the toy template (and its v1 archive) so the
 * web app has something to point at on first run. Idempotent — safe to run
 * multiple times.
 *
 * Auth via Application Default Credentials. Set GOOGLE_APPLICATION_CREDENTIALS
 * to a service-account JSON path before running:
 *
 *   export GOOGLE_APPLICATION_CREDENTIALS=./service-account-dev.json
 *   pnpm seed
 *
 * Optionally pass a clinician UID to also create that clinician's profile:
 *
 *   pnpm seed --clinician <uid>
 *
 * Service account key: Firebase Console → Project Settings → Service accounts
 * → Generate new private key. Save to repo root as service-account-dev.json
 * (gitignored).
 */

import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  TOY_PRACTICE_ID,
  TOY_TEMPLATE_ID,
  TOY_TEMPLATE,
} from "../shared/src/fixtures/toy-template";
import {
  CEMENTATION_TEMPLATE_ID,
  CEMENTATION_TEMPLATE,
} from "../shared/src/fixtures/cementation-template";
import {
  CROWN_PREP_TEMPLATE_ID,
  CROWN_PREP_TEMPLATE,
} from "../shared/src/fixtures/crown-prep-template";
import {
  GENERAL_TEMPLATE_ID,
  GENERAL_TEMPLATE,
} from "../shared/src/fixtures/general-template";
import {
  PROPHYLAXIS_TEMPLATE_ID,
  PROPHYLAXIS_TEMPLATE,
} from "../shared/src/fixtures/prophylaxis-template";
import {
  NEW_PATIENT_EXAM_TEMPLATE_ID,
  NEW_PATIENT_EXAM_TEMPLATE,
} from "../shared/src/fixtures/new-patient-exam-template";
import {
  SOAP_TEMPLATE_ID,
  SOAP_TEMPLATE,
} from "../shared/src/fixtures/soap-template";

const projectId = process.env.GCLOUD_PROJECT ?? "argonautscribe";

initializeApp({
  credential: applicationDefault(),
  projectId,
});

const db = getFirestore();

function parseArgs(): { clinicianUid: string | null } {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--clinician");
  if (idx !== -1 && args[idx + 1]) {
    return { clinicianUid: args[idx + 1]! };
  }
  return { clinicianUid: null };
}

async function seedPractice(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}`);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`practices/${TOY_PRACTICE_ID} — already exists, skipping`);
    return;
  }
  await ref.set({
    practice_id: TOY_PRACTICE_ID,
    name: "Argonaut Practice (dev)",
    created_at: FieldValue.serverTimestamp(),
  });
  console.log(`practices/${TOY_PRACTICE_ID} — created`);
}

async function seedTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${TOY_TEMPLATE_ID}`);

  const docData = {
    ...TOY_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${TOY_TEMPLATE_ID} — written (v${TOY_TEMPLATE.version})`);

  // Archive v1 under versions/ so older notes can re-render against it.
  const versionRef = ref.collection("versions").doc(String(TOY_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${TOY_TEMPLATE.version} — archived`);
}

async function seedCementationTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${CEMENTATION_TEMPLATE_ID}`);

  const docData = {
    ...CEMENTATION_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${CEMENTATION_TEMPLATE_ID} — written (v${CEMENTATION_TEMPLATE.version})`);

  const versionRef = ref.collection("versions").doc(String(CEMENTATION_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${CEMENTATION_TEMPLATE.version} — archived`);
}

async function seedCrownPrepTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${CROWN_PREP_TEMPLATE_ID}`);

  const docData = {
    ...CROWN_PREP_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${CROWN_PREP_TEMPLATE_ID} — written (v${CROWN_PREP_TEMPLATE.version})`);

  const versionRef = ref.collection("versions").doc(String(CROWN_PREP_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${CROWN_PREP_TEMPLATE.version} — archived`);
}

async function seedGeneralTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${GENERAL_TEMPLATE_ID}`);

  const docData = {
    ...GENERAL_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${GENERAL_TEMPLATE_ID} — written (v${GENERAL_TEMPLATE.version})`);

  const versionRef = ref.collection("versions").doc(String(GENERAL_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${GENERAL_TEMPLATE.version} — archived`);
}

async function seedProphylaxisTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${PROPHYLAXIS_TEMPLATE_ID}`);

  const docData = {
    ...PROPHYLAXIS_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${PROPHYLAXIS_TEMPLATE_ID} — written (v${PROPHYLAXIS_TEMPLATE.version})`);

  const versionRef = ref.collection("versions").doc(String(PROPHYLAXIS_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${PROPHYLAXIS_TEMPLATE.version} — archived`);
}

async function seedNewPatientExamTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${NEW_PATIENT_EXAM_TEMPLATE_ID}`);

  const docData = {
    ...NEW_PATIENT_EXAM_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${NEW_PATIENT_EXAM_TEMPLATE_ID} — written (v${NEW_PATIENT_EXAM_TEMPLATE.version})`);

  const versionRef = ref.collection("versions").doc(String(NEW_PATIENT_EXAM_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${NEW_PATIENT_EXAM_TEMPLATE.version} — archived`);
}

async function seedSoapTemplate(): Promise<void> {
  const ref = db.doc(`practices/${TOY_PRACTICE_ID}/templates/${SOAP_TEMPLATE_ID}`);

  const docData = {
    ...SOAP_TEMPLATE,
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  };

  await ref.set(docData);
  console.log(`practices/${TOY_PRACTICE_ID}/templates/${SOAP_TEMPLATE_ID} — written (v${SOAP_TEMPLATE.version})`);

  const versionRef = ref.collection("versions").doc(String(SOAP_TEMPLATE.version));
  await versionRef.set(docData);
  console.log(`  versions/${SOAP_TEMPLATE.version} — archived`);
}

async function seedClinician(uid: string): Promise<void> {
  const ref = db.doc(`clinicians/${uid}`);
  const snap = await ref.get();
  if (snap.exists) {
    console.log(`clinicians/${uid} — already exists, skipping`);
    return;
  }
  await ref.set({
    email: "(set on first sign-in)",
    display_name: "Anmol (dev)",
    role: "admin",
    practice_id: TOY_PRACTICE_ID,
    default_template_id: TOY_TEMPLATE_ID,
    created_at: FieldValue.serverTimestamp(),
  });
  console.log(`clinicians/${uid} — created (role: admin, practice: ${TOY_PRACTICE_ID})`);
}

async function main(): Promise<void> {
  console.log(`Seeding project: ${projectId}\n`);
  await seedPractice();
  await seedTemplate();
  await seedCementationTemplate();
  await seedCrownPrepTemplate();
  await seedGeneralTemplate();
  await seedProphylaxisTemplate();
  await seedNewPatientExamTemplate();
  await seedSoapTemplate();

  const { clinicianUid } = parseArgs();
  if (clinicianUid) {
    await seedClinician(clinicianUid);
  } else {
    console.log("\nNo --clinician <uid> passed. To create your clinician profile:");
    console.log("  1. Sign in to the web app once (creates a Firebase Auth user).");
    console.log("  2. Copy your UID from the Firebase console (Authentication tab).");
    console.log("  3. Re-run: pnpm seed --clinician <uid>");
  }

  console.log("\nDone.");
  // Force exit — firestore admin keeps the event loop alive.
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

// Suppress unused-import warning for Timestamp; kept for future seed data needs.
void Timestamp;
