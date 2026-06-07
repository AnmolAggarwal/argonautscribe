import SwiftUI

struct SignInView: View {
    @Environment(AuthService.self) private var auth
    @State private var email = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Text("Argonaut Scribe")
                .font(.largeTitle.bold())
                .foregroundStyle(Theme.plum)

            Text("Sign in to your account")
                .foregroundStyle(Theme.textSecondary)

            VStack(spacing: 12) {
                TextField("Email", text: $email)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.emailAddress)
                    .autocorrectionDisabled()

                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                    .textContentType(.password)
            }
            .padding(.horizontal)

            if let errorMessage {
                Text(errorMessage)
                    .foregroundStyle(.red)
                    .font(.caption)
            }

            Button {
                Task { await signIn() }
            } label: {
                if isLoading {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Sign In")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Theme.plum)
            .padding(.horizontal)
            .disabled(email.isEmpty || password.isEmpty || isLoading)

            Spacer()
            Spacer()
        }
        .padding()
    }

    @MainActor
    private func signIn() async {
        isLoading = true
        errorMessage = nil
        let authService = auth
        do {
            try await authService.signIn(email: email, password: password)
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
