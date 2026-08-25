import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

function removePlaintextQuestions() {
  return {
    name: "remove-plaintext-questions",
    async writeBundle() {
      await unlink(resolve(process.cwd(), "dist/questions.json")).catch(() => {});
    },
  };
}

function checksum(value: string): string {
  let crc = 0 ^ -1;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i);
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return String((crc ^ -1) >>> 0);
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [removePlaintextQuestions()],
    define: {
      __QUESTIONS_PASSWORD_CHECKSUM__: JSON.stringify(
        env.QUESTIONS_PASSWORD ? checksum(env.QUESTIONS_PASSWORD) : "",
      ),
    },
  base: "./",
  build: {
    target: "es2022",
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  };
});
