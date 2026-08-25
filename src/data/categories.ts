import type { Category, Question } from "./types";

export function groupQuestionsByCategory(questions: Question[]): Category[] {
  const byTitle = new Map<string, Question[]>();
  const chapterByTitle = new Map<string, number>();

  for (const question of questions) {
    const title = question.chapter_title;
    const list = byTitle.get(title);
    if (list) {
      list.push(question);
    } else {
      byTitle.set(title, [question]);
    }
    chapterByTitle.set(title, question.chapter);
  }

  return [...byTitle.entries()]
    .sort((a, b) => (chapterByTitle.get(a[0]) ?? 0) - (chapterByTitle.get(b[0]) ?? 0))
    .map(([title, list]) => ({
      title,
      chapter: chapterByTitle.get(title) ?? 0,
      questions: list.sort((a, b) => a.number - b.number),
    }));
}

export function categoryTitles(categories: Category[]): string[] {
  return categories.map((category) => category.title);
}

export function questionsForTitle(categories: Category[], title: string): Question[] {
  const category = categories.find((c) => c.title === title);
  return category ? category.questions : [];
}
