import styled from "styled-components";

export const StyledBlankCard = styled.div<{ $isOpen: boolean }>`
	position: absolute;
	right: 2.5rem;
	bottom: 2.5rem;
	background: ${({ theme }) => theme.colors.text1};

	${({ $isOpen }) =>
		$isOpen
			? "width: 225px;height: 225px;"
			: "cursor: pointer; height: 150px; width: 150px;"}

	color: ${({ theme }) => theme.colors.background1};
`;

export const StyledCardContentContainer = styled.div`
	position: relative;
	display: flex;
	flex-direction: column;
	justify-content: space-between;
	align-items: flex-start;
	height: 100%;
	width: 100%;
	padding: 1.25rem 0.75rem;
	text-align: left;
	font-size: 1rem;
	font-family: "Bebas Neue";
`;

export const StyledCardImageTitleContainer = styled.div`
	display: flex;
	justify-content: space-between;
	width: 100%;
`;

export const StyledCardTitle = styled.div`
	margin-top: 0.5rem;
`;

export const StyledCardImage = styled.img`
	width: 50px;
	transform: rotateY(180deg);
	cursor: pointer;
`;

export const StyledCardName = styled.span`
	font-size: 1.75rem;
`;
export const StyledContactText = styled.div`
	gap: 0.25rem;
`;

export const StyledBottomContent = styled.div`
	display: flex;
	justify-content: space-between;
	width: 100%;
	align-items: center;
`;

export const StyledCardIconsContainer = styled.div`
	display: flex;
	flex-direction: column;
`;
