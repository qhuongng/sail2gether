// Firebase configuration - paste it here after creating your Firebase project
export const firebaseConfig = {
    apiKey: "your-api-key",
    authDomain: "your-auth-domain",
    projectId: "your-project-id",
    storageBucket: "your-storage-bucket",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id",
    databaseURL: "your-realtime-database-url",
};

// Cloudflare Worker URL - paste here after deploying your R2 upload worker
export const WORKER_URL = "https://your-cloudflare-worker-url.workers.dev";

// R2 Upload Secret - match this with the secret you set when setting up your worker
export const UPLOAD_SECRET = "your-r2-upload-secret";

// R2 Public URL - paste here after setting up your R2 bucket
export const R2_PUBLIC_URL = "https://your-r2-public-url.r2.dev";

// LocalStorage key for hosted rooms
export const HOSTED_ROOMS_KEY = "sail2gether_hosted_rooms";
