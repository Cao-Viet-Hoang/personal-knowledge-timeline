/**
 * Application configuration.
 *
 * ENV values:
 *   "dev"  — localStorage + seed JSON (no Firebase needed)
 *   "prod" — Firebase Firestore (credentials entered via UI on first visit)
 *
 * Change the ENV constant below to switch environments.
 */

const ENV = "dev"; // ← Change to "prod" to use Firebase

const config = {
  env: ENV,
  isDev: ENV === "dev",
  isProd: ENV === "prod",

  // localStorage keys
  storageKey: "pkt_store",
  firebaseCredKey: "pkt_firebase_cred",
  seedUrl: "data/seed.json",
};

export default config;
