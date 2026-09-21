export function reviewerName(person: string): string {
  return person.charAt(0).toUpperCase() + person.slice(1);
}
