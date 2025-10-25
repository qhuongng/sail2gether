import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

import { firebaseConfig } from "@/constants/config";

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
