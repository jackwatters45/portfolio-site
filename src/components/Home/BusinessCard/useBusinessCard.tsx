import { useState } from "react";

const useBusinessCard = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [contentVisible, setContentVisible] = useState(false);

	const openCard = () => {
		setIsOpen(true);
		if (!contentVisible) setTimeout(() => setContentVisible(true), 100);
	};

	return { isOpen, openCard, contentVisible };
};

export default useBusinessCard;
