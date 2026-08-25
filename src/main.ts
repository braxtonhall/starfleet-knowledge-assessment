import "./styles/app.css";
import { loadQuestions } from "./data/questions";
import { startApp } from "./app";
import { copy } from "./copy";
import { roomCodeFromUrl } from "./net/roomCode";
import { createAuthorization } from "./ui/screens/authorization";
import {
  clearQuestionsPassword,
  isQuestionsPassword,
  rememberQuestionsPassword,
  removePasswordFromAddressBar,
  storedQuestionsPassword,
} from "./state/questionsPassword";

async function bootstrap(): Promise<void> {
  const main = document.getElementById("app");
  if (!main) throw new Error("Missing #app mount point");

  main.textContent = copy.system.accessing;

  try {
    const encryptedPassword = new URLSearchParams(window.location.search).get("pw");
    const savedPassword = storedQuestionsPassword();
    const candidate = encryptedPassword ?? savedPassword;
    if (candidate && isQuestionsPassword(candidate)) {
      try {
        const questions = await loadQuestions(candidate);
        rememberQuestionsPassword(candidate);
        if (encryptedPassword) removePasswordFromAddressBar();
        startApp(questions, main, roomCodeFromUrl());
        return;
      } catch {
        clearQuestionsPassword();
      }
    }

    document.body.classList.add("mode-compact");
    const attemptAuthorization = async (password: string): Promise<void> => {
      try {
        const questions = await loadQuestions(password);
        rememberQuestionsPassword(password);
        removePasswordFromAddressBar();
        startApp(questions, main, roomCodeFromUrl());
      } catch {
        main.replaceChildren(createAuthorization(attemptAuthorization, copy.authorization.invalid));
      }
    };
    const authorization = createAuthorization(attemptAuthorization, encryptedPassword ? copy.authorization.invalid : "");
    main.replaceChildren(authorization);
  } catch (error) {
    console.error(error);
    main.textContent = copy.system.unableToComply;
  }
}

void bootstrap();
