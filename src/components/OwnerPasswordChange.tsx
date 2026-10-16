import { useState } from "react";
import type { FormEvent } from "react";
import { authLog, supabase } from "../lib/supabase";
import ArchiveDialog from "./ArchiveDialog";

type Props = { open: boolean; onComplete: () => void; onLogout: () => void; onSkip: () => void };

export default function OwnerPasswordChange({ open, onComplete, onLogout, onSkip }: Props) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    const { data: userData } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: { ...userData.user?.user_metadata, password_changed: true },
    });
    if (updateError) {
      authLog("password_change_failed", { error: updateError.message });
      setError(updateError.message);
      setLoading(false);
      return;
    }
    setPassword("");
    setConfirmation("");
    setLoading(false);
    authLog("password_changed", { userId: userData.user?.id ?? null });
    onComplete();
  };

  return <ArchiveDialog open={open} className="owner-login owner-password-change" closeOnBackdrop={false} onCancel={(event) => event.preventDefault()} ariaLabel="Choose a new password">
    <p className="eyebrow">Secure your archive</p>
    <h2>Choose a new password.</h2>
    <p className="owner-login-intro">Before entering Card Studio, replace your temporary password with one only you know.</p>
    <form onSubmit={changePassword}>
      <label>New password<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required autoFocus /></label>
      <label>Confirm password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required /></label>
      {error && <p className="owner-login-error" role="alert">{error}</p>}
      <button className="owner-login-submit" disabled={loading}>{loading ? "Saving password…" : "Save new password"}</button>
    </form>
    <div className="owner-password-actions">
      <button type="button" className="owner-password-skip" onClick={onSkip}>I’ll change it later</button>
      <button type="button" className="owner-password-logout" onClick={onLogout}>Log out</button>
    </div>
    <p className="owner-login-note">This step is required once for your owner account.</p>
  </ArchiveDialog>;
}
