const techStack1: string[] = [
	"React",
	"TailwindCSS",
	"React Query",
	"HTML5",
	"Framer Motion",
	"CSS3",
	"Vite",
];

const techStack2: string[] = [
	"TypeScript",
	"NodeJs",
	"Express",
	"MongoDb",
	"Javascript",
	"RedisDb",
];

const repeatTimes = 2;

const getRepeatedArr = <T,>(arr: T[], repeatCount = repeatTimes): T[] =>
	Array.from({ length: repeatCount }, () => arr).flat();

export const repeatedTechStack1: string[] = getRepeatedArr(techStack1);

export const repeatedTechStack2: string[] = getRepeatedArr(techStack2);
