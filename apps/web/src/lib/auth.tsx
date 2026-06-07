/**
 * Auth provider + route guards.
 *
 * Listens to Firebase Auth state and, when signed in, the user's clinician
 * doc at /clinicians/{uid}. The clinician doc is provisioned manually for
 * MVP (via `pnpm seed --clinician <uid>`); if a signed-in user has no
 * profile yet, RequireClinician renders a screen with their UID and the
 * seed command they need to run.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  deleteUser,
} from "firebase/auth";
import { doc, onSnapshot, collection, getDocs, deleteDoc } from "firebase/firestore";
import { Navigate, useLocation } from "react-router-dom";
import type { Clinician } from "@argonaut/shared";
import { auth, db } from "./firebase";

interface AuthState {
  user: User | null;
  clinician: Clinician | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [clinician, setClinician] = useState<Clinician | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [clinicianResolved, setClinicianResolved] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthResolved(true);
      if (!next) {
        setClinician(null);
        setClinicianResolved(true);
      } else {
        setClinicianResolved(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, "clinicians", user.uid),
      (snap) => {
        setClinician(snap.exists() ? (snap.data() as Clinician) : null);
        setClinicianResolved(true);
      },
      (err) => {
        console.error("Clinician doc listener error:", err);
        setClinician(null);
        setClinicianResolved(true);
      },
    );
    return unsub;
  }, [user]);

  const value: AuthState = {
    user,
    clinician,
    loading: !authResolved || (user !== null && !clinicianResolved),
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      await firebaseSignOut(auth);
    },
    deleteAccount: async () => {
      if (!user) return;
      const uid = user.uid;
      // Delete all notes and their segments
      const notesSnap = await getDocs(collection(db, "clinicians", uid, "notes"));
      for (const noteDoc of notesSnap.docs) {
        const segsSnap = await getDocs(collection(noteDoc.ref, "segments"));
        for (const seg of segsSnap.docs) await deleteDoc(seg.ref);
        await deleteDoc(noteDoc.ref);
      }
      // Delete all patient tags
      const tagsSnap = await getDocs(collection(db, "clinicians", uid, "patient_tags"));
      for (const tagDoc of tagsSnap.docs) await deleteDoc(tagDoc.ref);
      // Delete clinician profile
      await deleteDoc(doc(db, "clinicians", uid));
      // Delete Firebase Auth user (must be last)
      await deleteUser(user);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/**
 * Renders children only when:
 *   (a) a Firebase user is signed in, AND
 *   (b) that user's clinician doc exists in Firestore.
 *
 * If signed in but no clinician doc, renders a help screen instructing
 * the developer to run the seed script with the UID.
 */
export function RequireClinician({ children }: { children: ReactNode }) {
  const { user, clinician, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingScreen />;
  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  if (!clinician) {
    return <NoProfileScreen uid={user.uid} email={user.email} />;
  }
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui", color: "#666" }}>
      Loading…
    </main>
  );
}

function NoProfileScreen({ uid, email }: { uid: string; email: string | null }) {
  return (
    <main
      style={{
        maxWidth: 560,
        margin: "3rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui",
        lineHeight: 1.5,
      }}
    >
      <h1>No clinician profile yet</h1>
      <p>
        You're signed in as <code>{email ?? "(unknown email)"}</code>, but you don't have
        a clinician profile in Firestore yet.
      </p>
      <p>From the repo root, run:</p>
      <pre
        style={{
          background: "#f4f4f4",
          padding: "0.75rem 1rem",
          borderRadius: 4,
          fontSize: "0.85rem",
          overflowX: "auto",
        }}
      >
        export GOOGLE_APPLICATION_CREDENTIALS=./service-account-dev.json{"\n"}
        pnpm seed --clinician {uid}
      </pre>
      <p>Then refresh this page.</p>
      <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "2rem" }}>
        Your UID: <code>{uid}</code>
      </p>
    </main>
  );
}
