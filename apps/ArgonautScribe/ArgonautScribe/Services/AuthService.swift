import Foundation
import FirebaseAuth
import FirebaseFirestore

/// Manages Firebase Auth state and clinician profile.
@MainActor
@Observable
final class AuthService {
    private(set) var user: User?
    private(set) var clinician: Clinician?
    private(set) var isLoading = true

    var isSignedIn: Bool { user != nil && clinician != nil }

    private var authHandle: AuthStateDidChangeListenerHandle?
    private var clinicianListener: ListenerRegistration?

    // AuthService is created once at app launch and lives until termination,
    // so deinit never runs. No cleanup needed.

    init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor [weak self] in
                self?.user = user
                if let user {
                    self?.listenToClinician(uid: user.uid)
                } else {
                    self?.clinicianListener?.remove()
                    self?.clinician = nil
                    self?.isLoading = false
                }
            }
        }
    }

    private func listenToClinician(uid: String) {
        clinicianListener?.remove()
        let ref = Firestore.firestore().document("clinicians/\(uid)")
        clinicianListener = ref.addSnapshotListener { [weak self] snap, error in
            Task { @MainActor [weak self] in
                if let error {
                    print("Clinician listener error: \(error.localizedDescription)")
                    self?.isLoading = false
                    return
                }
                self?.clinician = try? snap?.data(as: Clinician.self)
                self?.isLoading = false
            }
        }
    }

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }

    /// Delete the current user's account and all associated data.
    /// Deletes: all notes (and their segments), all patient tags, clinician doc, then Firebase Auth user.
    func deleteAccount() async throws {
        guard let user else { throw AuthError.notSignedIn }
        let uid = user.uid
        let db = Firestore.firestore()

        // 1. Delete all notes and their segment subcollections
        let notesSnap = try await db.collection("clinicians/\(uid)/notes").getDocuments()
        for noteDoc in notesSnap.documents {
            let segSnap = try await noteDoc.reference.collection("segments").getDocuments()
            for seg in segSnap.documents { try await seg.reference.delete() }
            try await noteDoc.reference.delete()
        }

        // 2. Delete all patient tags
        let tagsSnap = try await db.collection("clinicians/\(uid)/patient_tags").getDocuments()
        for tagDoc in tagsSnap.documents { try await tagDoc.reference.delete() }

        // 3. Delete clinician profile
        try await db.document("clinicians/\(uid)").delete()

        // 4. Delete Firebase Auth user (must be last — loses auth)
        try await user.delete()
    }
}

enum AuthError: LocalizedError {
    case notSignedIn
    var errorDescription: String? {
        switch self {
        case .notSignedIn: return "No user is signed in."
        }
    }
}
