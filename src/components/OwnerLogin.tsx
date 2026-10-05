import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { supabase, archiveRequest, authLog } from "../lib/supabase";

type Props = { open: boolean; onClose: () => void; onSuccess: () => void };

export default function OwnerLogin({ open, onClose, onSuccess }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
      setPassword("");
    }
  }, [open]);

  const logIn = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (loginError || !data.session) throw new Error("Unable to sign in. Check your email and password.");
      authLog("sign_in_succeeded", { userId: data.user?.id ?? null });
      await archiveRequest("/owner", data.session.access_token);
      setPassword("");
      onSuccess();
    } catch (loginError) {
      authLog("sign_in_failed", { error: loginError instanceof Error ? loginError.message : String(loginError) });
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return <dialog className="poem-reader owner-login" ref={dialogRef} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <button className="reader-close" onClick={onClose} aria-label="Close owner login">×</button>
    <p className="eyebrow">A private writing space</p>
    <h2>Welcome back.</h2>
    <p className="owner-login-intro">Sign in as the archive owner to enter Card Studio.</p>
    <form onSubmit={logIn}>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <p className="owner-login-error" role="alert">{error}</p>}
      <button className="owner-login-submit" disabled={loading}>{loading ? "Verifying access…" : "Sign in to Card Studio"}</button>
    </form>
    <p className="owner-login-note">Owner access only. The poetry archive remains open to everyone.</p>
  </dialog>;
}
