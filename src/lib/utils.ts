import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateString(dateString: string | Date): string {
	// Parse the date string into a Date object
	const date = new Date(dateString);

	// Ensure the date is valid
	if (Number.isNaN(date.getTime())) {
		throw new Error("Invalid date string");
	}

	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const day = String(date.getUTCDate()).padStart(2, "0");

	return `${month}/${day}/${year}`;
}

