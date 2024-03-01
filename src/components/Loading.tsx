import "../styles/animations/loading.css";

const Loading = () => {
	return (
		<div className="z-20 flex h-screen w-screen items-center justify-center bg-neutral-900">
			<img
				className="rotate-animation h-10 w-10 origin-center"
				src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703751903/chilly_Icon_aqnqzg.png"
				alt="loading"
				draggable="false"
			/>
		</div>
	);
};

export default Loading;
