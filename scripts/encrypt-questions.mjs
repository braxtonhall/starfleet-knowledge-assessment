import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const inputPath = resolve(root, "public/questions.json");
const outputPath = resolve(root, "public/questions.json.enc");

try {
  await readFile(inputPath);
} catch (error) {
  if (error.code === "ENOENT") {
    console.log(`No plaintext question file found; keeping ${outputPath}`);
    process.exit(0);
  }
  throw error;
}

async function loadPassword() {
  const env = await readFile(resolve(root, ".env"), "utf8");
  const line = env.split(/\r?\n/).find((entry) => entry.startsWith("QUESTIONS_PASSWORD="));
  const password = line?.slice("QUESTIONS_PASSWORD=".length).trim();
  if (!password) throw new Error("QUESTIONS_PASSWORD is missing from .env");
  return password;
}

function deriveKey(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 32, "sha256");
}

const password = await loadPassword();
const plaintext = await readFile(inputPath);
const salt = randomBytes(16);
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
await writeFile(outputPath, Buffer.concat([salt, iv, ciphertext]));
console.log(`Encrypted ${inputPath} -> ${outputPath}`);
