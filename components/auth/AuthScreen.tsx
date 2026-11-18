import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Mail,
  Phone,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { cloudAuth } from '../../services/CloudSyncService';
import {
  getAchieverAuthError,
  prepareAchieverAuthPersistence,
  signInWithGoogleForAchiever,
  saveAchieverUserDisplayName,
} from '../../services/auth/AuthService';

const achieverLogo = `${import.meta.env.BASE_URL}achiever-logo.svg`;

const COUNTRY_CODES = [
  { label: 'India (+91)', code: '+91' },
  { label: 'United States (+1)', code: '+1' },
  { label: 'United Kingdom (+44)', code: '+44' },
  { label: 'United Arab Emirates (+971)', code: '+971' },
  { label: 'Canada (+1)', code: '+1' },
  { label: 'Australia (+61)', code: '+61' },
  { label: 'Singapore (+65)', code: '+65' },
  { label: 'Nepal (+977)', code: '+977' },
  { label: 'Bangladesh (+880)', code: '+880' },
  { label: 'Pakistan (+92)', code: '+92' },
  { label: 'Germany (+49)', code: '+49' },
  { label: 'France (+33)', code: '+33' },
  { label: 'Saudi Arabia (+966)', code: '+966' },
  { label: 'Sri Lanka (+94)', code: '+94' },
  { label: 'Other (+custom)', code: '+' },
];

interface AuthScreenProps {
  authError?: string;
  onRetry?: () => void;
}

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true" className="h-5 w-5">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" transform="translate(0 4)" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.75 7.18l7.73 6C44.42 38.02 46.98 31.86 46.98 24.55z" transform="translate(0 0)" />
    <path fill="#FBBC05" d="M10.54 28.59A14.4 14.4 0 0 1 9.78 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.92 7.53 2.56 10.78l7.98-6.19z" transform="translate(0 0)" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" transform="translate(0 0)" />
  </svg>
);

const AuthScreen: React.FC<AuthScreenProps> = ({ authError = '', onRetry }) => {
  const [mode, setMode] = useState<'choose' | 'phone'>('choose');
  const [step, setStep] = useState<'number' | 'otp'>('number');
  const [countryCode, setCountryCode] = useState('+91');
  const [customCode, setCustomCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState(authError);
  const [notice, setNotice] = useState('');
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => () => {
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;
  }, []);

  const resetPhoneFlow = () => {
    recaptchaRef.current?.clear();
    recaptchaRef.current = null;
    setConfirmation(null);
    setOtp('');
    setStep('number');
    setCooldown(0);
    setError('');
    setNotice('');
  };

  const fullPhoneNumber = () => {
    const code = countryCode === '+' ? customCode.trim() : countryCode;
    const digits = phoneNumber.replace(/[^0-9]/g, '');
    return code + digits;
  };

  const validatePhone = () => {
    const number = fullPhoneNumber();
    if (!/^\+[1-9]\d{7,14}$/.test(number)) {
      setError('Enter a valid international phone number, including its country code.');
      return null;
    }
    return number;
  };

  const createVerifier = (): RecaptchaVerifier => {
    recaptchaRef.current?.clear();
    const verifier = new RecaptchaVerifier(cloudAuth, 'achiever-phone-recaptcha', {
      size: 'invisible',
      callback: () => setError(''),
      'expired-callback': () => {
        setError('Phone verification expired. Please request a new OTP.');
        setConfirmation(null);
        setStep('number');
      },
    });
    recaptchaRef.current = verifier;
    return verifier;
  };

  const sendOtp = async (resend = false) => {
    if (busy || (resend && cooldown > 0)) return;
    if (!fullName.trim()) {
      setError('Enter your full name to set up your ACHIEVER account.');
      return;
    }
    const number = validatePhone();
    if (!number) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      await prepareAchieverAuthPersistence();
      const verifier = createVerifier();
      const result = await signInWithPhoneNumber(cloudAuth, number, verifier);
      setConfirmation(result);
      setStep('otp');
      setOtp('');
      setCooldown(30);
      setNotice('A verification code has been sent. Enter the latest code received on your phone.');
    } catch (failure) {
      setError(getAchieverAuthError(failure));
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    if (!confirmation || busy) return;
    const code = otp.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit verification code.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const credential = await confirmation.confirm(code);
      try {
        await saveAchieverUserDisplayName(credential.user, fullName);
      } catch (profileFailure) {
        // A valid phone session should remain usable if profile metadata is
        // temporarily unavailable; the UID-scoped profile can be retried later.
        console.warn('[ACHIEVER Auth] Phone profile name could not be saved yet.', profileFailure);
      }
      // AuthGate observes the verified Firebase session and opens the app.
    } catch (failure) {
      setError(getAchieverAuthError(failure));
    } finally {
      setBusy(false);
    }
  };

  const continueWithGoogle = async () => {
    if (googleBusy || busy) return;
    setGoogleBusy(true);
    setError('');
    setNotice('');
    try {
      await signInWithGoogleForAchiever();
    } catch (failure) {
      setError(getAchieverAuthError(failure));
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07152f] px-4 py-10 text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-36 -top-40 h-[28rem] w-[28rem] rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="absolute -bottom-48 -right-28 h-[34rem] w-[34rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.28) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
      </div>

      <section className="relative z-10 w-full max-w-md overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_30px_100px_rgba(0,0,0,.35)]">
        <div className="bg-gradient-to-br from-slate-50 via-white to-indigo-50/70 px-7 pb-6 pt-8 text-center">
          <img src={achieverLogo} alt="ACHIEVER — AI Learning & Intelligence" className="mx-auto h-auto w-52 max-w-full object-contain" />
          <p className="mt-2 text-[10px] font-extrabold tracking-[0.25em] text-indigo-600">LEARN • PRACTICE • ACHIEVE</p>
          <h1 className="mt-7 text-2xl font-extrabold tracking-tight text-slate-900">Welcome to ACHIEVER</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Your personalized AI-powered learning environment.
          </p>
        </div>

        <div className="space-y-4 px-7 pb-7 pt-2">
          {error && (
            <div role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
              <XCircle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {onRetry && (
            <button type="button" onClick={onRetry} className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
              Retry secure account setup
            </button>
          )}
          {notice && (
            <div role="status" className="flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-700">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          {mode === 'choose' ? (
            <>
              <button
                type="button"
                onClick={() => void continueWithGoogle()}
                disabled={googleBusy}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-bold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {googleBusy ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <GoogleMark />}
                Continue with Google
              </button>

              <div className="flex items-center gap-3 py-1">
                <span className="h-px flex-1 bg-slate-200" />
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">or</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                onClick={() => { setMode('phone'); setError(''); setNotice(''); }}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
              >
                <Phone size={18} />
                Continue with Phone Number
              </button>

              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                Your personal study records are stored separately under your authenticated Firebase account.
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <button type="button" onClick={resetPhoneFlow} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                <ArrowLeft size={14} /> Back to sign-in options
              </button>

              {step === 'number' ? (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Verify your phone number</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">We’ll send a one-time verification code by SMS.</p>
                  </div>

                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Full name</span>
                    <input
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      placeholder="Enter your full name"
                      disabled={busy}
                      className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                    />
                    <span className="mt-1 block text-[10px] text-slate-400">Used for first-time profile setup. Existing saved account names are preserved.</span>
                  </label>

                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-2">
                    <label className="min-w-0">
                      <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Country code</span>
                      <select
                        value={countryCode}
                        onChange={(event) => setCountryCode(event.target.value)}
                        disabled={busy}
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                      >
                        {COUNTRY_CODES.map((item, index) => <option key={item.label + index} value={item.code}>{item.code} · {item.label.split(' (')[0]}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0">
                      <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Mobile number</span>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        value={phoneNumber}
                        onChange={(event) => setPhoneNumber(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') void sendOtp(); }}
                        placeholder="98765 43210"
                        disabled={busy}
                        className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                      />
                    </label>
                  </div>

                  {countryCode === '+' && (
                    <label className="block">
                      <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">Custom country calling code</span>
                      <input value={customCode} onChange={(event) => setCustomCode(event.target.value.replace(/[^+\d]/g, ''))} placeholder="+xxx" className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-indigo-400" />
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={() => void sendOtp()}
                    disabled={busy || !phoneNumber.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Smartphone size={17} />}
                    Send OTP
                  </button>
                  <p className="text-center text-[10px] leading-4 text-slate-400">Phone verification is protected by Firebase’s reCAPTCHA challenge.</p>
                </>
              ) : (
                <>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Enter verification code</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Enter the 6-digit code sent to <strong className="text-slate-700">{fullPhoneNumber()}</strong>.</p>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-[11px] font-semibold text-slate-600">SMS verification code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      onKeyDown={(event) => { if (event.key === 'Enter') void verifyOtp(); }}
                      placeholder="••••••"
                      disabled={busy}
                      className="w-full rounded-xl border border-slate-200 px-4 py-4 text-center text-2xl font-bold tracking-[0.5em] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-50"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void verifyOtp()}
                    disabled={busy || otp.length !== 6}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 size={17} />}
                    Verify &amp; continue
                  </button>
                  <div className="flex items-center justify-between text-xs">
                    <button type="button" onClick={() => { setConfirmation(null); setStep('number'); setOtp(''); setError(''); }} className="font-semibold text-slate-500 hover:text-indigo-600">Change number</button>
                    <button type="button" onClick={() => void sendOtp(true)} disabled={busy || cooldown > 0} className="font-semibold text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-400">
                      {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <div id="achiever-phone-recaptcha" aria-hidden="true" />
          <p className="pt-2 text-center text-[10px] leading-5 text-slate-400">
            By continuing, you agree to the applicable Terms of Service and Privacy Policy.
          </p>
          <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
            <Mail size={11} /> Secure sign-in powered by Firebase Authentication
          </p>
        </div>
      </section>

      <p className="absolute bottom-4 left-4 right-4 z-10 text-center text-[10px] text-slate-400/75">
        ACHIEVER · AI Learning &amp; Intelligence
      </p>
    </main>
  );
};

export default AuthScreen;
