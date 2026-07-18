import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.providers().then((p) => setGoogle(p.google)).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch {
      setError("Invalid email or password");
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    try {
      const { url } = await api.googleLoginUrl();
      window.location.href = url;
    } catch {
      setError("Google SSO is not configured");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-dark px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-6">
          <img src="/brand/Sparq-Logo-White.svg" alt="Sparq" className="h-7" />
          <div className="text-canvas text-lg font-semibold">
            Architect<span className="text-brand-orange">.IQ</span>
          </div>
        </div>
        <form onSubmit={submit} className="bg-surface rounded-xl p-6 border border-line">
          <h1 className="text-lg font-semibold mb-4">Sign in</h1>
          <label className="label">Email</label>
          <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <label className="label">Password</label>
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="text-brand-orange-deep text-[13px] mt-2">{error}</div>}
          <button className="btn btn-primary w-full mt-4" disabled={busy || !email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" className="btn w-full mt-2" onClick={googleLogin} disabled={!google}>
            {google ? "Sign in with Google" : "Google SSO (not configured)"}
          </button>
          <p className="text-muted text-[11px] mt-3">JumpCloud SSO coming via the same OIDC path.</p>
        </form>
        <div className="text-canvas/70 text-[12px] mt-4 bg-black/20 rounded-lg p-3">
          <div className="font-semibold text-canvas mb-1">Sample logins</div>
          admin@architect.iq / admin123 · user@architect.iq / user123 · client@architect.iq / client123
        </div>
      </div>
    </div>
  );
}
