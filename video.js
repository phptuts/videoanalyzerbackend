const dotenv = require("dotenv");
const admin = require("firebase-admin");

// Allows us to use the .env file.
dotenv.config();

/**
 * Decodes a Base64 encoded string.
 *
 * @param {string} base64String - The Base64 encoded string to decode.
 * @returns {string} The decoded string.
 */
function decodeBase64(base64String) {
  // Create a buffer from the Base64 encoded string
  const buffer = Buffer.from(base64String, "base64");
  // Convert the buffer back to a string
  return buffer.toString("utf-8");
}

const cert = JSON.parse(decodeBase64(process.env.FIREBASE_ADMIN_KEY));

// Initializes the admin app.
admin.initializeApp({
  credential: admin.credential.cert(cert),
  storageBucket: "video-analyzer-751d2.appspot.com",
});

console.log("success");
