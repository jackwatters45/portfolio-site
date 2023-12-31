import greetings from "./constants/greetings";
import useLoopThroughText from "@/hooks/useLoopThroughText";

const useAbout = () => {
	const { currentIndex, loopThroughText, stopLooping } = useLoopThroughText(
		greetings.length,
		100,
	);

	const currentGreeting = greetings[currentIndex];

	return {
		currentGreeting,
		loopThroughText,
		stopLooping,
	};
};

export default useAbout;
