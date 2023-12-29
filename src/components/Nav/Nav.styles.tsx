import { Link } from "react-router-dom";
import styled from "styled-components";

export const StyledNav = styled.nav`
	display: flex;
	justify-content: space-between;
	padding: 2rem 2.5rem;
`;

export const StyledNavLinkContainer = styled.div`
	height: 2rem;
	display: flex;
	gap: 1rem;
`;

export const StyledNavTitleRest = styled(Link)`
	font-size: 24px;
	text-transform: uppercase;
	display: inline-block;
	position: relative;
	overflow: hidden;
	font-family: "Roboto Mono";

	&:before,
	&:after {
		content: "";
		position: absolute;
		width: 0%;
		height: 2px;
		top: 50%;
		margin-top: -2.5px;
		background: #fff;
	}

	&:before {
		left: -2.5px;
	}

	&:after {
		right: 2.5px;
		background: #fff;
		transition: width 0.8s cubic-bezier(0.22, 0.61, 0.36, 1);
	}

	&:hover:before {
		background: #fff;
		width: 100%;
		transition: width 0.5s cubic-bezier(0.22, 0.61, 0.36, 1);
	}

	&:hover:after {
		background: transparent;
		width: 100%;
		transition: 0s;
	}
`;

export const StyledNavLink = styled(Link)`
	text-transform: uppercase;
	font-weight: 700;
	font-size: 18px;
	padding: 0.25rem;
	position: relative;
	line-height: normal;
	height: fit-content;
	white-space: nowrap;
	overflow: hidden;

	&::before {
		background: ${({ theme }) => theme.colors.text1};
		content: "";
		inset: 0;
		position: absolute;
		transform: scaleX(0);
		transform-origin: right;
		transition: transform 2.5s ease-in-out;
		z-index: -1;
		border-radius: 0.125rem;
	}

	&:hover::before {
		transform: scaleX(1);
		transform-origin: left;
	}

	&:hover {
		transform: scaleX(1);
		transform-origin: right;
		transition: transform 2.5s ease-in-out;
		color: ${({ theme }) => theme.colors.background1};
	}
`;
