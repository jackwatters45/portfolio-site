import "../../styles/animations/loading.css";

const Loading = () => {
	return (
		<div className="h-screen w-screen flex justify-center items-center">
			<img
				className="w-10 h-10 origin-center rotate-animation"
				src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703751903/chilly_Icon_aqnqzg.png"
				alt="loading"
			/>
		</div>
	);
};

export default Loading;
