// upload-emails.js
// Usage: node upload-emails.js
// Make sure you have AWS credentials set up (env vars or ~/.aws/credentials)

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");
const fs = require("fs");
const path = require("path");

const REGION = "us-east-1";
const TABLE_NAME = "ApprovedEmails";

// ---
// To add new emails, put them in the array below (one per string):
// Example: ["newuser@example.com", "another@email.com"]
const newEmails = ["abennett09@yahoo.com"
  // Add new emails here, e.g.:
  // "someone@domain.com",
];

// Optionally, also load from CSV if you want to batch upload again:
// const FILE_PATH = path.join(__dirname, "public/2025-cfr-email.csv");
// const fileContent = fs.existsSync(FILE_PATH) ? fs.readFileSync(FILE_PATH, "utf-8") : "";
// const csvEmails = fileContent
//   .split(/\r?\n/)
//   .map(line => line.trim().toLowerCase())
//   .filter(line => line.length > 0 && line.includes("@"));

// Combine all emails to upload (remove duplicates)
const emails = Array.from(new Set([
  ...newEmails.map(e => e.trim().toLowerCase()),
  // ...csvEmails, // Uncomment if you want to include CSV again
]));

if (emails.length === 0) {
  console.error("No emails to upload. Add emails to the newEmails array.");
  process.exit(1);
}

const client = new DynamoDBClient({ region: REGION });
const ddb = DynamoDBDocumentClient.from(client);

async function batchWrite(items) {
  const batches = [];
  let i = 0;
  while (i < items.length) {
    batches.push(items.slice(i, i + 25));
    i += 25;
  }
  for (const batch of batches) {
    const params = {
      RequestItems: {
        [TABLE_NAME]: batch.map(email => ({
          PutRequest: {
            Item: { email }
          }
        }))
      }
    };
    await ddb.send(new BatchWriteCommand(params));
    console.log(`Uploaded batch of ${batch.length}`);
  }
}

(async () => {
  try {
    await batchWrite(emails);
    console.log("All emails uploaded!");
  } catch (err) {
    console.error("Error uploading emails:", err);
    process.exit(1);
  }
})();
