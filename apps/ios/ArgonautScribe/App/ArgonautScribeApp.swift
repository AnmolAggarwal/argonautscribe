import SwiftUI
import FirebaseCore

@main
struct ArgonautScribeApp: App {
    init() {
        FirebaseApp.configure()
    }

    @State private var authService = AuthService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(authService)
        }
    }
}
