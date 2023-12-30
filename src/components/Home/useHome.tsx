import { useTypingEffect } from "@/hooks/useTypingEffect";

const texts = [
	"Web dev",
	"Work in progress",
	"React nerd",
	"Dog dad",
	"Software enthusiast",
	"Language learner",
	"Loved by grandmas",
	"Aspiring reader",
	"World explorer",
	"Lacrosse Player",
	"Hispanohablante",
	"Job hunter",
	"Amateur designer",
	"Yerba Mate lover",
	"Coffee enjoyer",
	"Tea is fine",
	"History buff",
	"Artist",
	"Vinyl collector",
	"Weight lifter",
	"Hockey fan",
	"Budding chef",
	"Strapping young man",
];

const useHome = () => {
	const subtitleText = useTypingEffect(texts);

	return { subtitleText };
};

export default useHome;
