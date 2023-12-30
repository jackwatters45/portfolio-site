import { Suspense, lazy } from "react";

import Home from "../Home";
import Nav from "../Nav";
import { AppContainer } from "./Layout.styles";

const About = lazy(() => import("../About"));

const Layout = () => {
	return (
		<AppContainer>
			<Nav />
			<Home />
			<Suspense>
				<About />
			</Suspense>
		</AppContainer>
	);
};

export default Layout;
