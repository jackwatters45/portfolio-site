import { useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

// converted to react from this: https://youtu.be/PkADl0HubMY?si=2o1ZtHgGqgP24fo2, https://codepen.io/Hyperplexed/pen/MWXBRBp
const useProjectsAnimation = (projectsLength: number) => {
	const trackRef = useRef<HTMLDivElement>(null);
	const [mouseDownAt, setMouseDownAt] = useState(0);
	const [percentage, setPercentage] = useState(0);
	const [prevPercentage, setPrevPercentage] = useState(-50);
	const [focusedIndex, setFocusedIndex] = useState(0);

	const handleOnDown = (e: MouseEvent<HTMLDivElement>) => setMouseDownAt(e.clientX);

	const handleOnUp = () => {
		setMouseDownAt(0);
		setPrevPercentage(percentage);
	};

	const handleOnMove = (e: MouseEvent<HTMLDivElement>) => {
		if (mouseDownAt === 0 || !trackRef.current) return;

		const mouseDelta = mouseDownAt - e.clientX;
		const maxDelta = window.innerWidth / 2;

		const percentage = (mouseDelta / maxDelta) * -100;
		const nextPercentageUnconstrained = prevPercentage + percentage;
		const nextPercentage = Math.max(Math.min(nextPercentageUnconstrained, 0), -100);

		setPercentage(nextPercentage);

		trackRef.current.animate(
			{
				transform: `translate(${nextPercentage}%, 0%)`,
			},
			{ duration: 1200, fill: "forwards" },
		);

		for (const card of trackRef.current.children) {
			const image = card.firstElementChild as HTMLImageElement;
			image.animate(
				{
					objectPosition: `${100 + nextPercentage}% center`,
				},
				{ duration: 1200, fill: "forwards" },
			);
		}
	};

	const stepSize = 100 / projectsLength;

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault();

			const direction = e.key === "ArrowRight" ? -1 : 1;

			let newIndex = focusedIndex + direction;
			newIndex = Math.max(0, Math.min(newIndex, projectsLength - 1));
			setFocusedIndex(newIndex);

			let newPercentage = percentage + stepSize * direction;

			newPercentage = Math.max(Math.min(newPercentage, 0), -100);

			setPercentage(newPercentage);
			setPrevPercentage(newPercentage);

			if (trackRef.current) {
				trackRef.current.animate(
					{
						transform: `translate(${newPercentage}%, 0%)`,
					},
					{ duration: 600, fill: "forwards" },
				);

				for (const card of trackRef.current.children) {
					const image = card.firstElementChild as HTMLImageElement;
					image.animate(
						{
							objectPosition: `${100 + newPercentage}% center`,
						},
						{ duration: 600, fill: "forwards" },
					);
				}
			}
		}
	};

	return {
		trackRef,
		handleOnDown,
		handleOnUp,
		handleOnMove,
		handleKeyDown,
		focusedIndex,
	};
};

export default useProjectsAnimation;
