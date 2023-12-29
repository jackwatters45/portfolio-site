import {
	StyledNav,
	StyledNavLink,
	StyledNavLinkContainer,
	StyledNavTitleRest,
} from "./Nav.styles";

const Nav = () => {
	return (
		<StyledNav>
			<StyledNavTitleRest to="/">Watters</StyledNavTitleRest>
			<StyledNavLinkContainer>
				<StyledNavLink to="#about">About</StyledNavLink>
				<StyledNavLink to="#projects">Projects</StyledNavLink>
				<StyledNavLink to="#contact">Contact</StyledNavLink>
			</StyledNavLinkContainer>
		</StyledNav>
	);
};

export default Nav;
