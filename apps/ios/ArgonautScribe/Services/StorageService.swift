import Foundation
import FirebaseStorage

/// Uploads audio segments to Cloud Storage.
enum StorageService {
    // nonisolated(unsafe) silences the Swift 6 concurrency warning —
    // Storage.storage() returns a thread-safe singleton.
    nonisolated(unsafe) private static let storage = Storage.storage()

    /// Upload an audio file and return the storage path.
    static func uploadSegment(
        noteId: String,
        segmentId: String,
        fileURL: URL
    ) async throws -> String {
        let path = "notes/\(noteId)/segments/\(segmentId)"
        let ref = storage.reference().child(path)

        let metadata = StorageMetadata()
        metadata.contentType = "audio/m4a"

        // putFileAsync returns non-Sendable StorageMetadata; wrap in
        // a nonisolated(unsafe) let to silence the Swift 6 data-race warning.
        nonisolated(unsafe) let _ = try await ref.putFileAsync(from: fileURL, metadata: metadata)

        // Clean up local temp file.
        try? FileManager.default.removeItem(at: fileURL)

        return path
    }
}
