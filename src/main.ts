import "./styles/app.css";
import { loadQuestions } from "./data/questions";
import { startApp } from "./app";
import { copy } from "./copy";
import { roomCodeFromUrl } from "./net/roomCode";

async function bootstrap(): Promise<void> {
  const main = document.getElementById("app");
  if (!main) throw new Error("Missing #app mount point");

  main.textContent = copy.system.accessing;

  try {
    const questions = await loadQuestions();
    startApp(questions, main, roomCodeFromUrl());
  } catch (error) {
    console.error(error);
    main.textContent = copy.system.unableToComply;
  }
}

void bootstrap();
