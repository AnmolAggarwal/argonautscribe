import Foundation
import FirebaseAuth
import FirebaseFirestore

/// Manages Firebase Auth state and clinician profile.
@Observable
final class AuthService {
    private(set) var user: User?
    private(set) var clinician: Clinician?
    private(set) var isLoading = true

    var isSignedIn: Bool { user != nil && clinician != nil }

    private var authHandle: AuthStateDidChangeListenerHandle?
    private var clinicianListener: ListenerRegistration?

    init() {
        authHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
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

    deinit {
        if let handle = authHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
        clinicianListener?.remove()
    }

    private func listenToClinician(uid: String) {
        clinicianListener?.remove()
        let ref = Firestore.firestore().document("clinicians/\(uid)")
        clinicianListener = ref.addSnapshotListener { [weak self] snap, error in
            if let error {
                print("Clinician listener error: \(error.localizedDescription)")
                self?.isLoading = false
                return
            }
            self?.clinician = try? snap?.data(as: Clinician.self)
            self?.isLoading = false
        }
    }

    func signIn(email: String, password: String) async throws {
        try await Auth.auth().signIn(withEmail: email, password: password)
    }

    func signOut() throws {
        try Auth.auth().signOut()
    }
}
