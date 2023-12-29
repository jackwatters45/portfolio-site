import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "styled-components";

// css
import "./styles/fonts.css";
import "./styles/reset.css";
import theme from "./styles/theme";
import GlobalStyle from "./styles/globalStyle";

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
