// Manual: bun run build && bun test packages/reviews/tests/map.test.ts
import { expect, test } from 'bun:test';

function page(site: string, path: string) {
  return new Response(
    Bun.file(new URL(`../../${site}/dist${path}index.html`, import.meta.url)),
  );
}

for (const site of ['tacos']) {
  test(`${site}: map pins link to listed restaurants and contain valid coordinates`, async () => {
    const links: string[] = [];
    const dates: string[] = [];
    await new HTMLRewriter()
      .on('.entry-meta time', {
        element: (element) => {
          dates.push(element.getAttribute('datetime')!);
        },
      })
      .on('a.restaurant-entry', {
        element: (element) => {
          links.push(element.getAttribute('href')!);
        },
      })
      .transform(page(site, '/'))
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
      .transform(page(site, '/map/'))
      .text();

    expect(dates).toEqual([...dates].sort().reverse());
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
}
