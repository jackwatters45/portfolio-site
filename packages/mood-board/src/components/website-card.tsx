import { ArrowSquareOut, GlobeSimple } from "@phosphor-icons/react";
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import type { BoardItem } from "../client/board/types";

const WebsiteCardContent = ({ item }: { readonly item: BoardItem }) => {
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const imageAvailable = item.websiteImageUrl !== undefined && failedImage !== item.websiteImageUrl;
  return (
    <div className={`website-card${imageAvailable ? " has-preview" : " is-fallback"}`}>
      <div className="website-card-image">
        {imageAvailable ? (
          <img
            src={item.websiteImageUrl}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(item.websiteImageUrl ?? null)}
          />
        ) : (
          <GlobeSimple size={46} weight="thin" aria-hidden="true" />
        )}
      </div>
      <div className="website-card-copy">
        <span className="website-card-site">{item.websiteSiteLabel ?? "Website"}</span>
        <strong>{item.websiteTitle ?? item.websiteSiteLabel ?? "Website"}</strong>
        {item.websiteDescription && <p>{item.websiteDescription}</p>}
        <span className="website-card-open">
          Visit site <ArrowSquareOut size={14} weight="bold" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
};

export function WebsiteCard({
  item,
  editing,
}: {
  readonly item: BoardItem;
  readonly editing: boolean;
}) {
  const content = <WebsiteCardContent item={item} />;
  if (editing || item.websiteUrl === undefined) return content;

  const activateSpace = (event: ReactKeyboardEvent<HTMLAnchorElement>) => {
    if (event.key !== " ") return;
    event.preventDefault();
    event.currentTarget.click();
  };

  return (
    <a
      className="presentation-website-link presentation-item-link"
      href={item.websiteUrl}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
      aria-label={`Open ${item.websiteTitle ?? item.websiteSiteLabel ?? "website"} in a new tab`}
      draggable={false}
      onClick={(event) => {
        if (event.detail > 0) event.preventDefault();
      }}
      onKeyDown={activateSpace}
    >
      {content}
    </a>
  );
}
