import { useEffect, useRef, useState } from "react";

const useContactCard = () => {
	const cardRef = useRef<HTMLDivElement>(null);

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

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (cardRef.current && !cardRef.current.contains(event.target as Node)) closeCard();
		};

		if (isOpen) document.addEventListener("click", handleClickOutside, true);
		return () => document.removeEventListener("click", handleClickOutside, true);
	}, [isOpen]);

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") closeCard();
		};

		if (isOpen) window.addEventListener("keydown", handleEscape);
		return () => window.removeEventListener("keydown", handleEscape);
	}, [isOpen]);

	return { cardRef, isOpen, closeCard, openCard, contentVisible };
};

export default useContactCard;
