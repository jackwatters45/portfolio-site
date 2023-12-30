import { Section } from "@/styles/sharedStyles";

const Contact = () => {
	return (
		<Section>
			<div>Get in touch</div>
			<div>
				<img
					src="https://res.cloudinary.com/drheg5d7j/image/upload/v1703923329/Chilly_xmtdvm.jpg"
					alt=""
					style={{ width: "200px" }}
				/>
				<div>
					<span>Social</span>
					<a
						href="https://www.instagram.com/jackwatters45/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Instagram
					</a>
					<a
						href="https://www.linkedin.com/in/john-watters/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Linkedin
					</a>
					<a
						href="https://github.com/jackwatters45"
						target="_blank"
						rel="noopener noreferrer"
					>
						Github
					</a>
					<a
						href="https://open.spotify.com/user/jackwatters22?si=77d268609e904877"
						target="_blank"
						rel="noopener noreferrer"
					>
						Spotify
					</a>
				</div>
				<div>
					<span>Contact</span>
					<a href="tel:+19544949167">
						<span>Tel. 954-494-9167</span>
					</a>
					<a href="mailto:jack.watters@me.com">
						<span>Email. jackwatters@me.com</span>
					</a>
					<span>17 Plymouth Ave, San Francisco, 94941</span>
				</div>
			</div>
			<div>
				<span>Design inspired by:</span>
				<a href="https://bepatrickdavid.com/" target="_blank" rel="noopener noreferrer">
					Patrick David
				</a>
				<a
					href="https://lk.emotion-agency.com/"
					target="_blank"
					rel="noopener noreferrer"
				>
					Leonid Kostetckyi
				</a>
				<a href="https://adrienlaurent.fr/" target="_blank" rel="noopener noreferrer">
					Adrien Laurent
				</a>
			</div>
		</Section>
	);
};

export default Contact;
