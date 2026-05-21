import { useState, type FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

/**
 * Email + password sign-in / sign-up screen.
 *
 * For dev, the screen offers both "Sign in" and "Sign up" actions on the
 * same form. In production we'll restrict sign-up to invited users only
 * (or remove it entirely and provision via admin), but for MVP this is
 * the simplest path to a working auth account.
 */
export function SignIn() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromState = location.state as { from?: { pathname?: string } } | null;
  const redirectTo = fromState?.from?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handle(mode: "signin" | "signup", event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 400,
        margin: "4rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui",
      }}
    >
      <h1>ArgonautScribe</h1>
      <p style={{ color: "#666" }}>Sign in to your dev account, or create one.</p>

      <form onSubmit={(e) => handle("signin", e)}>
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "block" }}>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
            />
          </label>
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={{ display: "block" }}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength={6}
              style={{ width: "100%", padding: "0.5rem", marginTop: "0.25rem" }}
            />
          </label>
        </div>

        {error && (
          <p style={{ color: "crimson", fontSize: "0.85rem" }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
          <button
            type="submit"
            disabled={busy}
            style={{ flex: 1, padding: "0.6rem", cursor: busy ? "wait" : "pointer" }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => handle("signup")}
            disabled={busy}
            style={{ flex: 1, padding: "0.6rem", cursor: busy ? "wait" : "pointer" }}
          >
            Sign up
          </button>
        </div>
      </form>
    </main>
  );
}
