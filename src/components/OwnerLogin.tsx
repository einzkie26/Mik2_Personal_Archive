import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { archiveRequest, authLog, signInArchiveOwner } from "../lib/supabase";
import { executeLoginCaptcha, loadRecaptcha } from "../lib/recaptcha";
import ArchiveDialog from "./ArchiveDialog";

type Props = { open: boolean; onClose: () => void; onSuccess: () => void };

export default function OwnerLogin({ open, onClose, onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    if (open) {
      setError("");
      let cancelled = false;
      void loadRecaptcha().catch(cause => { if (!cancelled) setError(cause.message); });
      return () => { cancelled = true; };
    } else {
      setPassword("");
    }
  }, [open]);

  const logIn = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      const captchaToken = await executeLoginCaptcha();
      const session = await signInArchiveOwner(email.trim(), password, captchaToken);
      await archiveRequest("/owner", session.access_token);
      authLog("sign_in_succeeded", { userId: session.user.id });
      setPassword("");
      onSuccess();
    } catch (loginError) {
      authLog("sign_in_failed", { error: loginError instanceof Error ? loginError.message : String(loginError) });
      setError(loginError instanceof Error ? loginError.message : "Unable to sign in. Please try again.");
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  return <ArchiveDialog open={open} className="owner-login" onClose={onClose} closeLabel="Close owner login" ariaLabel="Owner login">
    <p className="eyebrow">A private writing space</p>
    <h2>Welcome back.</h2>
    <p className="owner-login-intro">Sign in as the archive owner to enter Card Studio.</p>
    <form onSubmit={logIn}>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} disabled={loading} required autoFocus /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={1024} disabled={loading} required /></label>
      {error && <p className="owner-login-error" role="alert">{error}</p>}
      <button className="owner-login-submit" disabled={loading}>{loading ? "Verifying access…" : "Sign in to Card Studio"}</button>
    </form>
    <p className="owner-login-note">Owner access only. The poetry archive remains open to everyone.</p>
  </ArchiveDialog>;
}
