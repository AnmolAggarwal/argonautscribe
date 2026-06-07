import SwiftUI
import FirebaseCore

@main
struct ArgonautScribeApp: App {
    @State private var authService: AuthService

    init() {
        FirebaseApp.configure()
        _authService = State(initialValue: AuthService())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authService)
                .tint(Theme.gold)
        }
    }
}
