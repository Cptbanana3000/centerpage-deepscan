import admin from 'firebase-admin';
import { createRequire } from 'module';

// Add flexible credential loading: prefer env var, fallback to local ServiceKey.json for local dev.
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // The env variable should contain the raw JSON string for the service account
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (err) {
    console.error('[Firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT env variable. Ensure it contains valid JSON.');
    throw err;
  }
} else {
  // Fallback to local file for local development
  try {
    const require = createRequire(import.meta.url);
    serviceAccount = require('../../ServiceKey.json');
  } catch (fileErr) {
    console.error('[Firestore] No service account JSON available. Provide FIREBASE_SERVICE_ACCOUNT env variable or place ServiceKey.json in project root.');
    throw fileErr;
  }
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  // Configure Firestore to ignore undefined values so we can persist partial reports safely
  admin.firestore().settings({ ignoreUndefinedProperties: true });
}

const db = admin.firestore();

export default db; 