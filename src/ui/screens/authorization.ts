import { copy } from "../../copy";
import { h } from "../dom";

const NATO: Record<string, string> = {
  A: "ALPHA", B: "BRAVO", C: "CHARLIE", D: "DELTA", E: "ECHO", F: "FOXTROT", G: "GOLF", H: "HOTEL",
  I: "INDIA", J: "JULIETT", K: "KILO", L: "LIMA", M: "MIKE", N: "NOVEMBER", O: "OSCAR", P: "PAPA",
  Q: "QUEBEC", R: "ROMEO", S: "SIERRA", T: "TANGO", U: "UNIFORM", V: "VICTOR", W: "WHISKEY", X: "XRAY",
  Y: "YANKEE", Z: "ZULU", 0: "ZERO", 1: "ONE", 2: "TWO", 3: "THREE", 4: "FOUR", 5: "FIVE", 6: "SIX",
  7: "SEVEN", 8: "EIGHT", 9: "NINER",
};

export function createAuthorization(onSubmit: (password: string) => void, error = ""): HTMLElement {
  const phonetic = h("div", { className: "authorization-phonetic", "aria-live": "polite" });
  const input = h("input", {
    className: "authorization-input",
    type: "password",
    autocomplete: "current-password",
    placeholder: copy.authorization.input,
    "aria-label": copy.authorization.input,
  });
  const message = h("p", { className: "authorization-message", textContent: error });
  const submit = h("button", { className: "lcars-action lcars-action--wide", type: "submit" }, copy.authorization.submit);
  const form = h("form", { className: "authorization-form" }, input, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    onSubmit(input.value);
  });
  input.addEventListener("input", () => {
    phonetic.textContent = [...input.value.toUpperCase()].map((character) => NATO[character] ?? character).join(" ");
    message.textContent = "";
  });

  return h(
    "section",
    { className: "authorization" },
    h("div", { className: "lcars-text-bar authorization-heading" }, h("h2", {}, copy.authorization.heading)),
    h("div", { className: "authorization-panel" }, phonetic, form, message),
  );
}
