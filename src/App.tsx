import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "styled-components";

// styles
import GlobalStyle from "./styles/globalStyle";
import theme from "./styles/theme";

// components
import Layout from "./components/Layout";

const App = () => {
	return (
		<ThemeProvider theme={theme}>
			<GlobalStyle />
			<Router>
				<Routes>
					<Route path="/" element={<Layout />}></Route>
				</Routes>
			</Router>
		</ThemeProvider>
	);
};

export default App;
