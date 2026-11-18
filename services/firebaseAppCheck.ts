import type { FirebaseApp } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';

export type FirebaseAppCheckStatus =
  | 'initialized'
  | 'missing-site-key'
  | 'initialization-failed';

export interface FirebaseAppCheckDiagnostic {
  appName: string;
  status: FirebaseAppCheckStatus;
  provider: 'ReCaptchaEnterpriseProvider' | null;
  autoRefreshEnabled: boolean;
  message: string;
}

interface AppCheckRegistryEntry {
  instance: AppCheck | null;
  diagnostic: FirebaseAppCheckDiagnostic;
}

type AppCheckGlobalScope = typeof globalThis & {
  __ACHIEVER_FIREBASE_APPCHECK_REGISTRY__?: Map<string, AppCheckRegistryEntry>;
};

const siteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || '').trim();

const globalScope = globalThis as AppCheckGlobalScope;
const registry =
  globalScope.__ACHIEVER_FIREBASE_APPCHECK_REGISTRY__ ??
  (globalScope.__ACHIEVER_FIREBASE_APPCHECK_REGISTRY__ = new Map<string, AppCheckRegistryEntry>());

const makeDiagnostic = (
  appName: string,
  status: FirebaseAppCheckStatus,
  message: string
): FirebaseAppCheckDiagnostic => ({
  appName,
  status,
  provider: status === 'initialized' ? 'ReCaptchaEnterpriseProvider' : null,
  autoRefreshEnabled: status === 'initialized',
  message,
});

/**
 * Initialise App Check once per FirebaseApp instance.
 *
 * The registry lives on globalThis so it survives Vite hot-module replacement.
 * App Check's SDK contract permits initializeAppCheck() only once per app.
 */
export const initializeFirebaseAppCheck = (firebaseApp: FirebaseApp): AppCheck | null => {
  const existing = registry.get(firebaseApp.name);
  if (existing) return existing.instance;

  if (typeof window === 'undefined') {
    return null;
  }

  if (!siteKey) {
    const message =
      '[ACHIEVER Firebase App Check] Configuration is missing. Set ' +
      'VITE_FIREBASE_APPCHECK_SITE_KEY to the reCAPTCHA Enterprise site key ' +
      'registered for Firebase project gate-2027-a8850, then rebuild/restart the app. ' +
      'App Check is NOT active for Firebase app "' + firebaseApp.name +
      '". Local-only application features remain available; do not enable Firebase App Check enforcement until this is configured and production requests are verified.';

    const diagnostic = makeDiagnostic(firebaseApp.name, 'missing-site-key', message);
    registry.set(firebaseApp.name, { instance: null, diagnostic });

    if (import.meta.env.PROD) {
      console.error(message);
    } else {
      console.warn(message);
    }
    return null;
  }

  try {
    const instance = initializeAppCheck(firebaseApp, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    const diagnostic = makeDiagnostic(
      firebaseApp.name,
      'initialized',
      'Firebase App Check is initialized with reCAPTCHA Enterprise and automatic token refresh.'
    );
    registry.set(firebaseApp.name, { instance, diagnostic });
    console.info('[ACHIEVER Firebase App Check]', diagnostic.message, 'Firebase app:', firebaseApp.name);
    return instance;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      '[ACHIEVER Firebase App Check] Initialization failed for Firebase app "' +
      firebaseApp.name + '": ' + detail +
      '. Check the reCAPTCHA Enterprise site key and Firebase App Check registration.';

    const diagnostic = makeDiagnostic(firebaseApp.name, 'initialization-failed', message);
    registry.set(firebaseApp.name, { instance: null, diagnostic });
    console.error(message, error);
    return null;
  }
};

export const getFirebaseAppCheckDiagnostic = (
  appName: string
): FirebaseAppCheckDiagnostic | null => registry.get(appName)?.diagnostic || null;

export const getFirebaseAppCheckSiteKeyConfigured = (): boolean => Boolean(siteKey);
