/**
 * Application configuration.
 *
 * ENV values:
 *   "dev"  - IndexedDB (no Firebase needed)
 *   "prod" - Firebase Firestore (credentials entered via UI on first visit)
 *
 * Change the ENV constant below to switch environments.
 */

const ENV = "prod"; // Change to "dev" for IndexedDB, "prod" for Firebase

const config = {
  env: ENV,
  isDev: ENV === "dev",
  isProd: ENV === "prod",

  // Storage keys
  storageKey: "pkt_store",
  firebaseCredKey: "pkt_firebase_cred",
};

export default config;
