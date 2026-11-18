import React, { useEffect, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { cloudAuth, waitForCloudSyncAccountReady } from '../../services/CloudSyncService';
import { activateUserStorage, deactivateUserStorage, hasUnassignedLegacyData } from '../../services/UserScopedStorage';
import {
  completeAchieverGoogleRedirect,
  ensureAchieverUserProfile,
  getAchieverAuthError,
  prepareAchieverAuthPersistence,
} from '../../services/auth/AuthService';
import AuthScreen from './AuthScreen';

interface AuthGateProps {
  children: React.ReactNode;
}

type GateState =
  | { status: 'loading'; user: null; error: '' }
  | { status: 'signed-out'; user: null; error: '' }
  | { status: 'authenticated'; user: User; error: '' }
  | { status: 'error'; user: null; error: string };

const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [gate, setGate] = useState<GateState>({ status: 'loading', user: null, error: '' });
  const [legacyNotice, setLegacyNotice] = useState(false);

  useEffect(() => {
    let active = true;
    let previousUid: string | null = null;
    let transition = Promise.resolve();
    let unsubscribe: (() => void) | undefined;

    const initialise = async () => {
      try {
        await prepareAchieverAuthPersistence();
        await completeAchieverGoogleRedirect();
      } catch (error) {
        if (active) setGate({ status: 'error', user: null, error: getAchieverAuthError(error) });
        return undefined;
      }

      if (!active) return undefined;

      return onAuthStateChanged(
        cloudAuth,
        (user) => {
          if (previousUid && previousUid !== user?.uid) {
            // Unmount the previous account's React tree before changing the
            // active local-storage namespace or restoring another user's data.
            setGate({ status: 'loading', user: null, error: '' });
          }

          transition = transition.then(async () => {
            if (!active) return;

            try {
              if (previousUid && previousUid !== user?.uid) {
                await deactivateUserStorage(previousUid);
              }

              if (!user) {
                if (previousUid) await deactivateUserStorage(previousUid);
                previousUid = null;
                if (active) setGate({ status: 'signed-out', user: null, error: '' });
                return;
              }

              // Activate the UID namespace before mounting any private component.
              const activation = await activateUserStorage(user.uid);
              if (activation.quarantinedLegacyData || hasUnassignedLegacyData()) {
                setLegacyNotice(true);
              }

              try {
                await ensureAchieverUserProfile(user);
              } catch (profileError) {
                const code = String((profileError as { code?: unknown })?.code || '');
                if (code.includes('unavailable') || code.includes('network')) {
                  // The Firebase session is valid. Keep local study tools available
                  // offline; Cloud Sync retries profile creation when connectivity returns.
                  console.warn('[ACHIEVER Auth] Profile metadata will be retried when online.', profileError);
                } else {
                  throw profileError;
                }
              }

              // Hydrate this UID's Firestore records before private modules
              // mount, so a new device does not briefly show empty/default data.
              await waitForCloudSyncAccountReady(user.uid);
              previousUid = user.uid;
              if (active) setGate({ status: 'authenticated', user, error: '' });
            } catch (error) {
              if (active) {
                setGate({
                  status: 'error',
                  user: null,
                  error: error instanceof Error
                    ? error.message
                    : 'ACHIEVER could not safely prepare this account on this device.',
                });
              }
            }
          }).catch((error) => {
            if (active) {
              setGate({
                status: 'error',
                user: null,
                error: error instanceof Error ? error.message : 'Authentication state could not be restored.',
              });
            }
          });
        },
        (error) => {
          if (active) {
            setGate({ status: 'error', user: null, error: getAchieverAuthError(error) });
          }
        }
      );
    };

    void initialise().then((cleanup) => {
      if (active) unsubscribe = cleanup;
      else cleanup?.();
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  if (gate.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07152f] px-4 text-white">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/15 bg-white/10">
            <ShieldCheck className="h-7 w-7 text-indigo-200" />
          </div>
          <LoaderCircle className="h-5 w-5 animate-spin text-indigo-200" />
          <p className="text-sm font-medium text-slate-300">Securing your ACHIEVER account…</p>
        </div>
      </main>
    );
  }

  if (gate.status === 'error') {
    return (
      <AuthScreen
        authError={gate.error}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (gate.status === 'signed-out') return <AuthScreen />;

  return (
    <>
      {legacyNotice && (
        <div
          role="status"
          className="fixed left-4 right-4 top-4 z-[10001] mx-auto max-w-3xl rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 shadow-lg"
        >
          ACHIEVER found older device-only study records whose original owner cannot be verified from the previous sign-in history. Those records have been preserved separately and were not assigned to this account. Contact the administrator to verify ownership before attempting any migration.
          <button type="button" onClick={() => setLegacyNotice(false)} className="ml-2 font-bold underline">Dismiss</button>
        </div>
      )}
      <React.Fragment key={gate.user.uid}>{children}</React.Fragment>
    </>
  );
};

export default AuthGate;
