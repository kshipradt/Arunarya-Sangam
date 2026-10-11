/**
 * Who is signed in. Keeps the session fresh in the background, shares it
 * across browser tabs, and loads the person's profile.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as authApi from "@/lib/api/auth";
import { ApiError } from "@/lib/api/http";
import { loadSession, saveSession, secondsUntilRefresh, SESSION_KEY, type Session } from "@/lib/api/session";
import { fetchProfile, saveProfile, type Profile, type ProfileUpdate } from "./profile";

type Status = "loading" | "signedOut" | "signedIn";

type AuthValue = {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  /** Returns a valid access token, refreshing first if it is about to expire. */
  getAccessToken: () => Promise<string>;
  acceptSession: (session: Session) => Promise<Profile | null>;
  signIn: (email: string, password: string, captchaToken?: string | null) => Promise<Profile | null>;
  signOut: () => Promise<void>;
  updateProfile: (values: ProfileUpdate) => Promise<Profile>;
  reloadProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<Status>(session ? "loading" : "signedOut");
  const refreshing = useRef<Promise<Session> | null>(null);

  const commit = useCallback((s: Session | null) => {
    saveSession(s);
    setSession(s);
    if (!s) {
      setProfile(null);
      setStatus("signedOut");
    }
  }, []);

  const refresh = useCallback(
    async (current: Session): Promise<Session> => {
      refreshing.current ??= authApi
        .refreshSession(current.refresh_token)
        .then((s) => {
          commit(s);
          return s;
        })
        .catch((e) => {
          // Only a definitive auth refusal ends the session; a network blip does not.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) commit(null);
          throw e;
        })
        .finally(() => {
          refreshing.current = null;
        });
      return refreshing.current;
    },
    [commit],
  );

  const getAccessToken = useCallback(async () => {
    if (!session) throw new ApiError(401, "session_not_found", "Not signed in");
    if (secondsUntilRefresh(session) > 0) return session.access_token;
    return (await refresh(session)).access_token;
  }, [session, refresh]);

  const loadProfileFor = useCallback(async (s: Session) => {
    const p = await fetchProfile(s.user.id, s.access_token);
    setProfile(p);
    setStatus("signedIn");
    return p;
  }, []);

  // On start-up: refresh an old token if needed, then load the profile.
  useEffect(() => {
    if (!session || status !== "loading") return;
    const start = secondsUntilRefresh(session) > 0 ? Promise.resolve(session) : refresh(session);
    start.then(loadProfileFor).catch(() => commit(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh quietly one minute before the token expires.
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => void refresh(session).catch(() => {}), secondsUntilRefresh(session) * 1000);
    return () => clearTimeout(timer);
  }, [session, refresh]);

  // Signing in or out in one tab updates every other open tab.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== SESSION_KEY) return;
      const next = loadSession();
      setSession(next);
      if (next) void loadProfileFor(next).catch(() => {});
      else {
        setProfile(null);
        setStatus("signedOut");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [loadProfileFor]);

  const acceptSession = useCallback(
    async (s: Session) => {
      commit(s);
      return loadProfileFor(s);
    },
    [commit, loadProfileFor],
  );

  const signIn = useCallback(
    async (email: string, password: string, captchaToken?: string | null) =>
      acceptSession(await authApi.signInWithPassword(email, password, captchaToken)),
    [acceptSession],
  );

  const signOut = useCallback(async () => {
    if (session) await authApi.signOut(session.access_token);
    commit(null);
  }, [session, commit]);

  const updateProfile = useCallback(
    async (values: ProfileUpdate) => {
      if (!session) throw new ApiError(401, "session_not_found", "Not signed in");
      const saved = await saveProfile(session.user.id, values, await getAccessToken());
      if (!saved) throw new ApiError(404, "profile_missing", "Profile not found");
      setProfile(saved);
      return saved;
    },
    [session, getAccessToken],
  );

  const reloadProfile = useCallback(async () => {
    if (session) await loadProfileFor({ ...session, access_token: await getAccessToken() });
  }, [session, getAccessToken, loadProfileFor]);

  const value = useMemo<AuthValue>(
    () => ({ status, session, profile, getAccessToken, acceptSession, signIn, signOut, updateProfile, reloadProfile }),
    [status, session, profile, getAccessToken, acceptSession, signIn, signOut, updateProfile, reloadProfile],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
