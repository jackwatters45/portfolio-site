import { BrowserRouter as Router, Route, Routes } from "react-router-dom";

// components
import Layout from "./components/Layout";

const App = () => {
	return (
		<Router>
			<Routes>
				<Route path="/" element={<Layout />}></Route>
			</Routes>
		</Router>
	);
};

export default App;
