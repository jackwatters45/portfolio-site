// Run: bun run build:tacos && bun test sites/tacos/reviews.test.ts
import { expect, test } from 'bun:test';

test('unrated wine remains shared at Casa NOM', async () => {
  const html = await Bun.file(
    new URL('./dist/restaurants/casa-nom-mexican/index.html', import.meta.url),
  ).text();
  const dishes: string[] = [];
  await new HTMLRewriter()
    .on('section[aria-labelledby="shared"] article h3', {
      text(chunk) {
        if (chunk.text) dishes.push(chunk.text);
      },
    })
    .transform(new Response(html))
    .text();
  expect(dishes).toEqual([
    'Fish taco',
    'Shrimp taco',
    'Birria taco',
    'Carnitas taco',
    'Chips and guacamole',
    'Wine',
  ]);
  expect(html).not.toContain('id="unrated"');
  expect(html.match(/Pinot Gris\. Tasted like wine\. Yum\./g)).toHaveLength(1);
});

test('shared dishes and solo orders appear once in their correct sections', async () => {
  const html = await Bun.file(
    new URL(
      './dist/restaurants/lady-t-tatiana-bar/index.html',
      import.meta.url,
    ),
  ).text();
  const groups: Record<string, string[]> = {};
  let current = '';
  await new HTMLRewriter()
    .on('section.section[aria-labelledby]', {
      element(element) {
        current = element.getAttribute('aria-labelledby')!;
        groups[current] = [];
      },
    })
    .on('section.section article h3', {
      text(chunk) {
        if (chunk.text) groups[current].push(chunk.text);
      },
    })
    .transform(new Response(html))
    .text();
  expect(groups).toEqual({
    shared: [
      'Cauliflower taco',
      'Chicken taco',
      'Pork taco',
      'Chips and guacamole',
    ],
    'meg-extras': ['Paloma', 'Hugo spritz'],
    'jack-extras': ['Fish taco', 'Margarita', 'Spicy margarita'],
  });
});
