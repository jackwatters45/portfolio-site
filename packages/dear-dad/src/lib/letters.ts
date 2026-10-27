import { getCollection } from 'astro:content';

export async function publishedLetters() {
  const letters = await getCollection('letters', ({ data }) => !data.draft);

  return letters.sort(
    (a, b) =>
      b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id),
  );
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
