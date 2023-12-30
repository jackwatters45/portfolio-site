import Home from "../Home";
import Nav from "../Nav";

import { AppContainer } from "./Layout.styles";

const Layout = () => {
	return (
		<AppContainer>
			<Nav />
			<Home />
		</AppContainer>
	);
};

export default Layout;
