/**
 * Thin Deepgram client wrapper.
 *
 * Calls the prerecorded (batch) STT endpoint with Nova-3 Medical, smart
 * formatting + punctuation, and the template's dental keyword list.
 * Used once per audio segment in the generateNote pipeline.
 *
 * Caller is responsible for passing audio bytes + content-type. Audio
 * is deleted from Cloud Storage immediately after a successful return
 * per the post-STT deletion invariant (SPEC §14.16, CLAUDE.md §2.5).
 */

import { createClient } from "@deepgram/sdk";

export async function transcribeAudio(args: {
  apiKey: string;
  audio: Buffer;
  mimeType: string;
  keywords: string[];
}): Promise<string> {
  const { apiKey, audio, mimeType, keywords } = args;
  const dg = createClient(apiKey);

  const { result, error } = await dg.listen.prerecorded.transcribeFile(audio, {
    model: "nova-3-medical",
    smart_format: true,
    punctuate: true,
    keywords,
    mimetype: mimeType,
  });

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
