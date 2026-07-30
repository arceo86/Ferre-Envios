import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBNC-Oh6i2wyZMRiailIoYZ8rzpjN-6wBo",
  authDomain: "ferreteria-envios.firebaseapp.com",
  projectId: "ferreteria-envios",
  storageBucket: "ferreteria-envios.firebasestorage.app",
  messagingSenderId: "871957193583",
  appId: "1:871957193583:web:e093c54efa0919b142be9a"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);