import { useEffect, useState } from "react";

const useLoopThroughText = (itemsLength: number, loopDuration: number) => {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isLooping, setIsLooping] = useState(false);

	const loopThroughText = () => setIsLooping(true);
	const stopLooping = () => setIsLooping(false);

	useEffect(() => {
		if (isLooping) {
			const updatePosition = () => setCurrentIndex((prev) => (prev + 1) % itemsLength);

			const intervalId = window.setInterval(updatePosition, loopDuration);

			return () => {
				clearInterval(intervalId);
			};
		}
	}, [isLooping, itemsLength, loopDuration]);

	return { currentIndex, loopThroughText, stopLooping };
};

export default useLoopThroughText;