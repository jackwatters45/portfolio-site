import { useEffect, useState } from "react";

const useLayout = () => {
	const [isLoaded, setIsLoaded] = useState(false);

	useEffect(() => {
		setTimeout(() => {
			setIsLoaded(true);
		}, 1000);
	}, []);

	return { isLoaded };
};

export default useLayout;
