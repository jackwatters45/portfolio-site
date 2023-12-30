import styled from "styled-components";

export const StyledBlankCard = styled.div<{ $isOpen: boolean }>`
	position: absolute;
	right: 2.5rem;
	bottom: 2.5rem;
	background: ${({ theme }) => theme.colors.text1};

	${({ $isOpen }) =>
		$isOpen
			? "width: 375px;height: 225px;"
			: "cursor: pointer; height: 150px; width: 150px;"}

	color: ${({ theme }) => theme.colors.background1};
`;

export const StyledCardContentContainer = styled.div`
	position: relative;
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	height: 100%;
	width: 100%;
	padding: 1.25rem;
`;

export const StyledCardTextContent = styled.div`
	display: flex;
	flex-direction: column;
	height: 100%;
	justify-content: space-between;
	align-items: flex-start;
	text-align: left;
	padding: 1rem 0 0.5rem;
	font-size: 1rem;

	font-family: "Bebas Neue";
`;

export const StyledCardName = styled.span`
	font-size: 1.75rem;
`;

export const StyledCardImageIconsContainer = styled.div`
	justify-content: space-between;
	height: 100%;
	align-items: flex-end;
	padding-bottom: 0.5rem;
`;

export const StyledCardIconsContainer = styled.div`
	padding-right: 0.5rem;
`;

export const StyledCardImage = styled.img`
	margin-top: 0.5rem;
	width: 75px;
	transform: rotateY(180deg);
	cursor: pointer;
`;
