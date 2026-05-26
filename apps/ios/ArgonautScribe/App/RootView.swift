import SwiftUI

/// Top-level router: shows sign-in or notes list based on auth state.
struct RootView: View {
    @Environment(AuthService.self) private var auth

    var body: some View {
        Group {
            if auth.isSignedIn {
                NavigationStack {
                    NotesListView()
                }
            } else {
                SignInView()
            }
        }
        .animation(.default, value: auth.isSignedIn)
    }
}
