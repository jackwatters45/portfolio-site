import "../styles/animations/loading.css";

const Loading = () => {
	return (
		<div className="h-screen w-screen flex justify-center items-center bg-neutral-900 z-20">
			<img
				className="w-10 h-10 origin-center rotate-animation"
				src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703751903/chilly_Icon_aqnqzg.png"
				alt="loading"
				draggable="false"
			/>
		</div>
	);
};

export default Loading;
