// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  apiKey: "AIzaSyDNOlSqBh5uZLVqQMW-AOEbHFtWbEl2-KQ",
  authDomain: "gate-2027-a8850.firebaseapp.com",
  projectId: "gate-2027-a8850",
  storageBucket: "gate-2027-a8850.firebasestorage.app",
  messagingSenderId: "72739527219",
  appId: "1:72739527219:web:5e2a9a2a76bf7e4b206146",
  measurementId: "G-QP0GDP2STS"
};

// Initialize Firebase
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const analytics = (() => {
  if (typeof window === 'undefined') return null;
  try {
    return getAnalytics(app);
  } catch (err) {
    console.warn('Firebase Analytics initialization warning:', err);
    return null;
  }
})();
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
