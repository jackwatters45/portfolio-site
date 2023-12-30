import { Suspense, lazy } from "react";

import Home from "../Home";
import Nav from "../Nav";
import { AppContainer } from "./Layout.styles";

const About = lazy(() => import("../About"));
const Projects = lazy(() => import("../Projects"));
const Contact = lazy(() => import("../Contact"));

const Layout = () => {
	return (
		<AppContainer>
			<Nav />
			<Home />
			<Suspense>
				<About />
				<Projects />
				<Contact />
			</Suspense>
		</AppContainer>
	);
};

export default Layout;
