// ─────────────────────────────────────────────────────────────
// Nalog (/profil): registracija ili prijava za anonimne, podešavanje
// profila (ime, email, lozinka) + odjava za registrovane.
// Registracija je opciona — vezuje email+lozinku za trenutni identitet,
// pa istorija partija ostaje i postaje dostupna na svim uređajima.
// ─────────────────────────────────────────────────────────────
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@state/authStore';
import { useOnlineStore } from '@state/onlineStore';
import { hasOnlineEnv } from '@net/config';
import { cn } from '@/lib/utils';
import { ProfileTabs } from '../components/ProfileTabs';

const inputCls =
  'w-full border border-black/35 bg-white px-3 py-2 font-mono text-sm text-black shadow-[inset_1px_1px_0_rgba(0,0,0,0.08)] outline-none focus:border-black/60';
const btnPrimary =
  'w-full border border-black/40 bg-[#1597ee] px-4 py-3 font-bold text-black shadow-[3px_4px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50';
const btnLight =
  'w-full border border-black/35 bg-[#f7f7f2] px-4 py-2 font-bold text-black shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008] disabled:opacity-50';
const panelCls = 'border border-[#c9c9c9] bg-[#f6f6f2] font-mono text-sm shadow-[3px_4px_0_#4d1008]';
const labelCls = 'mb-1 text-[12px] font-bold text-black/60';
const errCls = 'text-[12px] font-bold text-[#9f2f2a]';
const okCls = 'text-[12px] font-bold text-[#087f45]';

function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await action();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nije prošlo — pokušaj ponovo');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, done, submit };
}

/** Registracija + prijava (za anonimne posetioce). */
function AuthForms() {
  const registerAction = useAuthStore((s) => s.register);
  const loginAction = useAuthStore((s) => s.login);
  const displayName = useOnlineStore((s) => s.displayName);

  const [regName, setRegName] = useState(displayName);
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const reg = useSubmit(async () => {
    if (!regName.trim()) throw new Error('Unesi ime (1–20 znakova)');
    await registerAction(regEmail.trim(), regPassword, regName.trim());
  });

  const [logEmail, setLogEmail] = useState('');
  const [logPassword, setLogPassword] = useState('');
  const log = useSubmit(() => loginAction(logEmail.trim(), logPassword));

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className={panelCls}>
        <div className="bg-[#ececea] px-3 py-2 font-bold">Napravi nalog</div>
        <form onSubmit={(e) => void reg.submit(e)} className="space-y-3 p-3">
          <p className="text-[11px] leading-4 text-black/50">
            Nalog nije obavezan — ali sa njim imaš istu istoriju partija na svim uređajima. Tvoje dosadašnje partije
            automatski ostaju uz nalog.
          </p>
          <div>
            <div className={labelCls}>Ime za stolom</div>
            <input
              value={regName}
              onChange={(e) => setRegName(e.target.value)}
              maxLength={20}
              placeholder="npr. Nikola"
              className={inputCls}
            />
          </div>
          <div>
            <div className={labelCls}>Email</div>
            <input
              type="email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              placeholder="ti@primer.com"
              className={inputCls}
              required
            />
          </div>
          <div>
            <div className={labelCls}>Lozinka (bar 8 znakova)</div>
            <input
              type="password"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              minLength={8}
              className={inputCls}
              required
            />
          </div>
          <button type="submit" disabled={reg.busy} className={btnPrimary}>
            {reg.busy ? 'Pravim nalog...' : 'Registruj se'}
          </button>
          {reg.error && <p className={errCls}>{reg.error}</p>}
        </form>
      </section>

      <section className={panelCls}>
        <div className="bg-[#ececea] px-3 py-2 font-bold">Već imaš nalog? Prijavi se</div>
        <form onSubmit={(e) => void log.submit(e)} className="space-y-3 p-3">
          <p className="text-[11px] leading-4 text-black/50">
            Prijava vraća tvoj nalog na ovaj uređaj — sa istorijom partija.
          </p>
          <div>
            <div className={labelCls}>Email</div>
            <input
              type="email"
              value={logEmail}
              onChange={(e) => setLogEmail(e.target.value)}
              placeholder="ti@primer.com"
              className={inputCls}
              required
            />
          </div>
          <div>
            <div className={labelCls}>Lozinka</div>
            <input
              type="password"
              value={logPassword}
              onChange={(e) => setLogPassword(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <button type="submit" disabled={log.busy} className={btnPrimary}>
            {log.busy ? 'Prijavljujem...' : 'Prijavi se'}
          </button>
          {log.error && <p className={errCls}>{log.error}</p>}
        </form>
      </section>
    </div>
  );
}

/** Podešavanja profila (za registrovane) + odjava. */
function ProfileSettings() {
  const me = useAuthStore((s) => s.me)!;
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  const [name, setName] = useState(me.displayName ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const nameForm = useSubmit(() => updateProfile({ displayName: name.trim() }));
  const emailForm = useSubmit(() => updateProfile({ email: email.trim() }));
  const passwordForm = useSubmit(async () => {
    await updateProfile({ newPassword, currentPassword });
    setCurrentPassword('');
    setNewPassword('');
  });

  function doLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className={cn(panelCls, 'sm:col-span-2')}>
        <div className="flex items-center justify-between gap-3 bg-[#ececea] px-3 py-2 font-bold">
          <span className="shrink-0">Tvoj nalog</span>
          <span className="truncate font-normal text-black/55">{me.email}</span>
        </div>
        <div className="flex items-center justify-between gap-3 p-3">
          <p className="text-[11px] leading-4 text-black/50">
            Prijavljen si — istorija partija te prati na svakom uređaju na kom se prijaviš.
          </p>
          <button
            onClick={doLogout}
            className="shrink-0 border border-black/40 bg-[#fff2a8] px-4 py-2 font-bold text-[#9f2f2a] shadow-[2px_3px_0_#4d1008] active:translate-y-0.5 active:shadow-[1px_1px_0_#4d1008]"
          >
            Odjavi se
          </button>
        </div>
      </section>

      <section className={panelCls}>
        <div className="bg-[#ececea] px-3 py-2 font-bold">Ime za stolom</div>
        <form onSubmit={(e) => void nameForm.submit(e)} className="space-y-3 p-3">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} className={inputCls} required />
          <button type="submit" disabled={nameForm.busy} className={btnLight}>
            {nameForm.busy ? 'Čuvam...' : 'Sačuvaj ime'}
          </button>
          {nameForm.error && <p className={errCls}>{nameForm.error}</p>}
          {nameForm.done && <p className={okCls}>Sačuvano ✓</p>}
        </form>
      </section>

      <section className={panelCls}>
        <div className="bg-[#ececea] px-3 py-2 font-bold">Email</div>
        <form onSubmit={(e) => void emailForm.submit(e)} className="space-y-3 p-3">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} required />
          <button type="submit" disabled={emailForm.busy} className={btnLight}>
            {emailForm.busy ? 'Čuvam...' : 'Sačuvaj email'}
          </button>
          {emailForm.error && <p className={errCls}>{emailForm.error}</p>}
          {emailForm.done && <p className={okCls}>Sačuvano ✓</p>}
        </form>
      </section>

      <section className={cn(panelCls, 'sm:col-span-2')}>
        <div className="bg-[#ececea] px-3 py-2 font-bold">Promena lozinke</div>
        <form onSubmit={(e) => void passwordForm.submit(e)} className="grid gap-3 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <div className={labelCls}>Trenutna lozinka</div>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputCls}
              required
            />
          </div>
          <div>
            <div className={labelCls}>Nova lozinka (bar 8 znakova)</div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              className={inputCls}
              required
            />
          </div>
          <button type="submit" disabled={passwordForm.busy} className={cn(btnLight, 'self-end sm:w-auto')}>
            {passwordForm.busy ? 'Čuvam...' : 'Promeni'}
          </button>
          {passwordForm.error && <p className={cn(errCls, 'sm:col-span-3')}>{passwordForm.error}</p>}
          {passwordForm.done && <p className={cn(okCls, 'sm:col-span-3')}>Lozinka promenjena ✓</p>}
        </form>
      </section>
    </div>
  );
}

export default function Profile() {
  const me = useAuthStore((s) => s.me);
  const loadMe = useAuthStore((s) => s.loadMe);
  const online = hasOnlineEnv();

  useEffect(() => {
    document.title = 'Prefa — Profil';
    if (online) void loadMe();
  }, [online, loadMe]);

  return (
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-6 pt-5">
      <h1 className="mb-4 font-mono text-2xl font-bold leading-none text-[#f3de33] drop-shadow-[2px_2px_0_#4d1008]">
        Profil
      </h1>

      <div className="space-y-4">
        <ProfileTabs active="profil" />
        {!online ? (
          <p className="font-mono text-sm font-bold text-black/60">
            Online igra nije podešena za ovaj build — nalog nije dostupan.
          </p>
        ) : me?.registered ? (
          <ProfileSettings />
        ) : (
          <AuthForms />
        )}
      </div>
    </main>
  );
}
