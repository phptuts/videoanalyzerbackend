const dotenv = require("dotenv");
const admin = require("firebase-admin");
const { Speechmatics } = require("speechmatics");
const { OpenAI } = require("openai");

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

// Listens for videos that have recently been uploaded to firebase
admin
  .firestore()
  .collection("videos")
  .where("status", "==", "uploaded")
  .onSnapshot(async (snapshot) => {
    const docs = snapshot
      .docChanges()
      .filter((d) => d.type == "added")
      .map((d) => d.doc);

    for (let doc of docs) {
      try {
        await transcribeVideo(doc);
      } catch (error) {
        console.log(error);
        await doc.ref.update({ status: "error_transcribed" });
      }
    }
  });

/**
 * Download the video and transcribes it.
 * @param {admin.firestore.QueryDocumentSnapshot} doc
 */
async function transcribeVideo(doc) {
  const docData = doc.data();
  const bucket = admin.storage().bucket();
  const videoFile = bucket.file(docData["videoPath"]);

  const sm = new Speechmatics(process.env.SPEECHMATICS_API_KEY);
  const [fileContents] = await videoFile.download();
  const inputFile = { data: new Blob([fileContents]), fileName: doc.id };

  const transcribedText = await sm.batch.transcribe(
    inputFile,
    {
      transcription_config: { language: "en" },
    },
    "text"
  );

  await doc.ref.update({ transcribedText, status: "transcribed" });
}

// Listens for videos that have recently been transcribed.
admin
  .firestore()
  .collection("videos")
  .where("status", "==", "transcribed")
  .onSnapshot(async (snapshot) => {
    const docChanges = snapshot.docChanges().filter((d) => d.type == "added");

    for (let docChange of docChanges) {
      try {
        await answerQuestionForVideo(docChange.doc);
      } catch (error) {
        console.log(error);
        await doc.ref.update({ status: "error_openai" });
      }
    }
  });

/**
 * Loops through all the questions the user asked about the video to be generated.
 *
 * @param {admin.firestore.QueryDocumentSnapshot} doc
 */
async function answerQuestionForVideo(doc) {
  const docData = doc.data();
  const questions = docData.questions;
  for (let question of questions) {
    const answer = await askOpenAQuestionAI(
      docData.title,
      docData.transcribedText,
      question.text
    );
    question.answer = answer;
  }

  await doc.ref.update({ questions: questions, status: "completed" });
}

/**
 * Asks open ai a question based on the transcribed video.
 *
 * @param {string} videoTitle
 * @param {string} transcribedText
 * @param {string} questionText
 * @returns {string} answered question
 */
async function askOpenAQuestionAI(videoTitle, transcribedText, questionText) {
  const openai = new OpenAI({
    apiKey: process.env.OPEN_AI_APIKEY,
  });
  const response = await openai.chat.completions.create({
    messages: [
      { role: "system", content: `Video Title: ${videoTitle}` },
      {
        role: "system",
        content: `Transcribed text of video: ${transcribedText}`,
      },
      { role: "user", content: questionText },
    ],
    model: "gpt-3.5-turbo",
  });
  return response.choices[0].message.content;
}
