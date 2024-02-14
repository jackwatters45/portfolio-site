import { useEffect, useState } from "react";

export const useTypingEffect = (
	textsToType: string[],
	typeDurationMs = 100,
	deleteDurationMs = 50,
	pauseDurationMs = 750,
) => {
	const [currentTextIndex, setCurrentTextIndex] = useState(0);
	const [currentPosition, setCurrentPosition] = useState(0);
	const [isTypingForwards, setIsTypingForwards] = useState(true);

	useEffect(() => {
		const currentText = textsToType[currentTextIndex];
		let intervalId: number;
		let timeoutId: number;

		const updatePosition = () => {
			if (isTypingForwards) {
				if (currentPosition < currentText.length) {
					setCurrentPosition(currentPosition + 1);
				} else {
					clearInterval(intervalId);
					timeoutId = window.setTimeout(() => {
						setIsTypingForwards(false);
						setCurrentPosition(currentPosition - 1);
						intervalId = window.setInterval(updatePosition, deleteDurationMs);
					}, pauseDurationMs);
				}
			} else {
				if (currentPosition > 0) {
					setCurrentPosition(currentPosition - 1);
				} else {
					clearInterval(intervalId);
					timeoutId = window.setTimeout(() => {
						setIsTypingForwards(true);
						setCurrentTextIndex((prevIndex) => (prevIndex + 1) % textsToType.length);
						setCurrentPosition(0);
						intervalId = window.setInterval(updatePosition, typeDurationMs);
					}, pauseDurationMs);
				}
			}
		};

		intervalId = window.setInterval(
			updatePosition,
			isTypingForwards ? typeDurationMs : deleteDurationMs,
		);

		return () => {
			clearInterval(intervalId);
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}, [
		typeDurationMs,
		deleteDurationMs,
		textsToType,
		currentTextIndex,
		currentPosition,
		isTypingForwards,
		pauseDurationMs,
	]);

	return textsToType[currentTextIndex].substring(0, currentPosition);
};