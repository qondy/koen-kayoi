import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyDcHNqoeSsalb-w_Q8287dhmqIs-s05Pso',
  authDomain: 'koen-kayoi.firebaseapp.com',
  projectId: 'koen-kayoi',
  storageBucket: 'koen-kayoi.firebasestorage.app',
  messagingSenderId: '281019921477',
  appId: '1:281019921477:web:a1ab7250726acf83885f2c',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
