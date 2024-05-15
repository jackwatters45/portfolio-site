export default function BlogImage({
	src,
	alt,
	caption,
}: {
	src: string;
	alt: string;
	caption?: string;
}) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				paddingLeft: "1rem",
				paddingRight: "1rem",
			}}
		>
			<img
				src={src}
				alt={alt}
				style={{
					borderRadius: ".5rem",
					boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
				}}
			/>
			<div style={{ fontSize: "0.9rem", color: "rgba(110 231 183)" }}>
				{caption ?? alt}
			</div>
		</div>
	);
}
