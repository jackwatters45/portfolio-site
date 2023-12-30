import { useState } from "react";

const useBusinessCard = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [contentVisible, setContentVisible] = useState(false);

	const closeCard = () => {
		setIsOpen(false);
		setContentVisible(false);
	};

	const openCard = () => {
		setIsOpen(true);
		if (!contentVisible) setTimeout(() => setContentVisible(true), 100);
	};

	return { isOpen, closeCard, openCard, contentVisible };
};

export default useBusinessCard;
