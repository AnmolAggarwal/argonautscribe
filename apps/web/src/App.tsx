import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, RequireClinician } from "./lib/auth";
import { SignIn } from "./screens/SignIn";
import { NotesList } from "./screens/NotesList";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route
          path="/"
          element={
            <RequireClinician>
              <NotesList />
            </RequireClinician>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
