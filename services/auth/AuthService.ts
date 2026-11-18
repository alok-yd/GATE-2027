import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { cloudAuth, cloudDb } from '../CloudSyncService';

export interface AchieverAuthProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  providerIds: string[];
}

export const toAchieverAuthProfile = (user: User): AchieverAuthProfile => ({
  uid: user.uid,
  displayName: user.displayName,
  email: user.email,
  phoneNumber: user.phoneNumber,
  photoURL: user.photoURL,
  providerIds: user.providerData.map((provider) => provider.providerId),
});

/**
 * User documents live in the existing Firestore users/{uid} document used by
 * Cloud Sync. Merge writes preserve cloudSyncVersion and existing appData.
 */
export const ensureAchieverUserProfile = async (user: User): Promise<void> => {
  const profileRef = doc(cloudDb, 'users', user.uid);
  const existing = await getDoc(profileRef);
  const profile = toAchieverAuthProfile(user);
  const patch: Record<string, unknown> = {
    ...profile,
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists() || !existing.data().createdAt) {
    patch.createdAt = serverTimestamp();
  }

  await setDoc(profileRef, patch, { merge: true });
};

export const prepareAchieverAuthPersistence = async (): Promise<void> => {
  await setPersistence(cloudAuth, browserLocalPersistence);
};

export const signInWithGoogleForAchiever = async (): Promise<void> => {
  await prepareAchieverAuthPersistence();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    await signInWithPopup(cloudAuth, provider);
  } catch (error) {
    const code = (error as { code?: string })?.code || '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(cloudAuth, provider);
      return;
    }
    throw error;
  }
};

export const completeAchieverGoogleRedirect = async (): Promise<void> => {
  await getRedirectResult(cloudAuth);
};

export const signOutFromAchiever = async (): Promise<void> => {
  await signOut(cloudAuth);
};

export const getAchieverAuthError = (error: unknown): string => {
  const code = String((error as { code?: unknown })?.code || '');
  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was cancelled. You can try again whenever you are ready.';
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in popup. Please allow popups or retry using the redirect flow.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in window was opened. Complete that sign-in or try again.';
    case 'auth/account-exists-with-different-credential':
      return 'An account already exists with another sign-in method. Sign in using that method first; ACHIEVER will not merge accounts automatically.';
    case 'auth/credential-already-in-use':
      return 'This sign-in credential is already linked to another ACHIEVER account.';
    case 'auth/operation-not-allowed':
      return 'This sign-in method is not enabled in Firebase Authentication. Contact the ACHIEVER administrator.';
    case 'auth/unauthorized-domain':
      return 'This website domain is not authorised for Firebase Authentication. Add it in Firebase Console → Authentication → Settings → Authorized domains.';
    case 'auth/too-many-requests':
      return 'Firebase temporarily limited sign-in attempts. Wait a little before trying again.';
    case 'auth/network-request-failed':
      return 'Network connection failed. Check your internet connection and retry.';
    case 'auth/invalid-phone-number':
      return 'Enter a valid mobile number including its country code.';
    case 'auth/invalid-verification-code':
      return 'The OTP is incorrect. Check the SMS and enter the latest code.';
    case 'auth/code-expired':
      return 'This OTP has expired. Request a new verification code.';
    case 'auth/quota-exceeded':
      return 'Firebase SMS quota has been reached. Try again later or review the Firebase phone-authentication quota.';
    case 'auth/invalid-verification-id':
      return 'This verification session has expired. Request a new OTP.';
    case 'auth/missing-phone-number':
      return 'Enter your mobile number before requesting an OTP.';
    case 'auth/captcha-check-failed':
      return 'Phone verification could not complete its reCAPTCHA check. Refresh the page and try again.';
    case 'auth/argument-error':
      return 'Phone verification could not initialise. Confirm that the authorised domain and Phone provider are configured in Firebase.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the ACHIEVER administrator.';
    case 'auth/user-token-expired':
    case 'auth/id-token-expired':
      return 'Your session expired. Sign in again to continue.';
    default: {
      const message = error instanceof Error ? error.message : '';
      if (/permission-denied/i.test(message)) {
        return 'Firebase denied access to the account profile. Verify the existing Firestore ownership rules are deployed.';
      }
      return message || 'Authentication could not be completed. Please try again.';
    }
  }
};
