import React, { useEffect, useState } from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { cloudAuth } from '../../services/CloudSyncService';
import { activateUserStorage, deactivateUserStorage } from '../../services/UserScopedStorage';
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

  useEffect(() => {
    let active = true;
    let previousUid: string | null = null;
    let transition = Promise.resolve();

    const initialise = async () => {
      try {
        await prepareAchieverAuthPersistence();
        await completeAchieverGoogleRedirect();
      } catch (error) {
        if (active) setGate({ status: 'error', user: null, error: getAchieverAuthError(error) });
      }

      if (!active) return;

      const unsubscribe = onAuthStateChanged(cloudAuth, (user) => {
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

            // Restore/quarantine device-local data before any private component mounts.
            await activateUserStorage(user.uid);
            await ensureAchieverUserProfile(user);
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
      });

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    void initialise().then((cleanup) => {
      unsubscribe = cleanup;
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

  return <>{children}</>;
};

export default AuthGate;
