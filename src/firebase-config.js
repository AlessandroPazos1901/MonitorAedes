// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from 'firebase/database';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDMrjrriqiBXh8N6v5oYDUsTGY33mvIKRI",
  authDomain: "raspberry-monitor-upc.firebaseapp.com",
  databaseURL: "https://raspberry-monitor-upc-default-rtdb.firebaseio.com",
  projectId: "raspberry-monitor-upc",
  storageBucket: "raspberry-monitor-upc.firebasestorage.app",
  messagingSenderId: "853397589676",
  appId: "1:853397589676:web:95f32c27200a56cab25909",
  measurementId: "G-81MKBV0NGM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const database = getDatabase(app);
export default app;