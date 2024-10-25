import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ModeToggle() {
	const [theme, setThemeState] = React.useState<
		"theme-light" | "dark" | "system"
	>("theme-light");

	React.useEffect(() => {
		const isDarkMode = document.documentElement.classList.contains("dark");
		setThemeState(isDarkMode ? "dark" : "theme-light");
	}, []);

	React.useEffect(() => {
		const isDark =
			theme === "dark" ||
			(theme === "system" &&
				window.matchMedia("(prefers-color-scheme: dark)").matches);
		document.documentElement.classList[isDark ? "add" : "remove"]("dark");
	}, [theme]);

	return (
		<Button
			onClick={() =>
				setThemeState((prev) => (prev === "dark" ? "theme-light" : "dark"))
			}
			variant="ghost"
			size="icon-fit"
			className="hover:bg-transparent"
		>
			<Sun className="h-[1.15rem] w-[1.15rem] rotate-0 scale-100 transition-all 
      dark:-rotate-90 dark:scale-0" />
			<Moon className="absolute h-[1.15rem] w-[1.15rem] rotate-90 scale-0 
      transition-all dark:rotate-0 dark:scale-100" />
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}