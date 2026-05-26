import Foundation
import FirebaseStorage

/// Uploads audio segments to Cloud Storage.
enum StorageService {
    private static let storage = Storage.storage()

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

        _ = try await ref.putFileAsync(from: fileURL, metadata: metadata)

        // Clean up local temp file.
        try? FileManager.default.removeItem(at: fileURL)

        return path
    }
}

// Firebase Storage SDK extension for async file upload.
extension StorageReference {
    func putFileAsync(from url: URL, metadata: StorageMetadata?) async throws -> StorageMetadata {
        try await withCheckedThrowingContinuation { continuation in
            putFile(from: url, metadata: metadata) { meta, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if let meta {
                    continuation.resume(returning: meta)
                } else {
                    continuation.resume(throwing: NSError(domain: "StorageService", code: -1))
                }
            }
        }
    }
}
