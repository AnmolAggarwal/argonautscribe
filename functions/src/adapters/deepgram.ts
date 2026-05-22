/**
 * Thin Deepgram client wrapper.
 *
 * Calls the prerecorded (batch) STT endpoint with Nova-3 Medical, smart
 * formatting + punctuation, and keyterm prompting for dental vocabulary.
 * Used once per audio segment in the generateNote pipeline.
 *
 * Nova-3 uses `keyterm` (not `keywords`). Plain terms, no intensifier
 * weights, 500 token limit. Common dental terms are merged with any
 * per-template terms.
 *
 * Caller is responsible for passing audio bytes + content-type. Audio
 * is deleted from Cloud Storage immediately after a successful return
 * per the post-STT deletion invariant (SPEC §14.16, CLAUDE.md §2.5).
 */

import { createClient } from "@deepgram/sdk";

/**
 * Common dental terms that benefit from keyterm prompting across all
 * templates. Merged with per-template terms before the API call.
 * Keep under ~30 terms here; per-template adds another ~20.
 */
const COMMON_DENTAL_KEYTERMS = [
  // Anatomy
  "occlusal", "distal", "mesial", "buccal", "lingual", "incisal",
  "interproximal", "subgingival", "supragingival",
  // Common abbreviations
  "MOD", "DO", "MO", "OL", "DL", "ML",
  "WNL", "BWs", "FMX",
  // Materials & procedures
  "composite", "amalgam", "zirconia", "porcelain",
  "prophy", "SRP", "perio",
  // General clinical
  "caries", "calculus", "gingivitis", "periodontitis",
  "anesthesia", "lidocaine", "articaine",
];

/** Strip boost intensifiers ("Panavia:2" → "Panavia") from legacy keyword format. */
function stripIntensifier(term: string): string {
  return term.replace(/:\d+(\.\d+)?$/, "");
}

export async function transcribeAudio(args: {
  apiKey: string;
  audio: Buffer;
  mimeType: string;
  keywords: string[];
}): Promise<string> {
  const { apiKey, audio, mimeType, keywords } = args;
  const dg = createClient(apiKey);

  // Merge common terms with per-template terms, deduplicate.
  const templateTerms = keywords.map(stripIntensifier);
  const allTerms = [...new Set([...COMMON_DENTAL_KEYTERMS, ...templateTerms])];

  const { result, error } = await dg.listen.prerecorded.transcribeFile(audio, {
    model: "nova-3-medical",
    smart_format: true,
    punctuate: true,
    keyterm: allTerms,
    mimetype: mimeType,
  } as Record<string, unknown>);

  if (error) {
    const message =
      typeof error === "string" ? error : (error as { message?: string }).message ?? JSON.stringify(error);
    throw new Error(`Deepgram error: ${message}`);
  }

  const transcript = result?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof transcript !== "string") {
    throw new Error("Deepgram returned no transcript");
  }
  return transcript;
}
