// Run with the dev server: TACOS_URL=http://localhost:4323 bun test sites/tacos/map.test.ts
// Or test the production output: bun run build:tacos && bun test sites/tacos/map.test.ts
import { expect, test } from 'bun:test';

async function page(path: string) {
  return process.env.TACOS_URL
    ? fetch(new URL(path, process.env.TACOS_URL))
    : new Response(
        Bun.file(new URL(`./dist${path}index.html`, import.meta.url)),
      );
}

test('map pins link to listed restaurants and contain valid coordinates', async () => {
  const links: string[] = [];
  await new HTMLRewriter()
    .on('a.restaurant-entry', {
      element: (element) => {
        links.push(element.getAttribute('href')!);
      },
    })
    .transform(await page('/'))
    .text();

  let locations:
    | {
        url: string;
        name: string;
        coordinates: number[];
        scores: { meg: number | null; jack: number | null };
      }[]
    | undefined;
  await new HTMLRewriter()
    .on('#restaurant-map', {
      element: (element) => {
        locations = JSON.parse(
          element
            .getAttribute('data-locations')!
            .replaceAll('&#34;', '"')
            .replaceAll('&quot;', '"')
            .replaceAll('&lt;', '<')
            .replaceAll('&gt;', '>')
            .replaceAll('&#39;', "'")
            .replaceAll('&amp;', '&'),
        );
      },
    })
    .transform(await page('/map/'))
    .text();

  expect(locations).toBeDefined();
  for (const location of locations!) {
    expect(links).toContain(location.url);
    expect(location.name.length).toBeGreaterThan(0);
    for (const person of ['meg', 'jack'] as const) {
      const score = location.scores[person];
      if (score !== null) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(10);
      }
    }
    expect(location.coordinates).toHaveLength(2);
    expect(Math.abs(location.coordinates[0]!)).toBeLessThanOrEqual(90);
    expect(Math.abs(location.coordinates[1]!)).toBeLessThanOrEqual(180);
  }
  if (links.length === 0) expect(locations).toEqual([]);
});
