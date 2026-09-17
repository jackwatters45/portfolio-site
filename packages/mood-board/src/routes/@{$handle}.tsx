import { ArrowRight, Copy, ShareNetwork } from "@phosphor-icons/react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";

import { parseProfileHandle, profilePath } from "../client/board-route";
import { accessibleFieldColors } from "../client/board/board-utils";
import { publicMediaUrl } from "../client/media-url";
import { loadPublicProfile, PublicApiError } from "../client/public-api-client";
import type { PublicProfile } from "../lib/public-api";

export const Route = createFileRoute("/@{$handle}")({
  params: {
    parse: ({ handle }) => {
      const parsed = parseProfileHandle(handle);
      if (parsed === null) throw notFound();
      return { handle: parsed };
    },
    stringify: ({ handle }) => ({ handle }),
  },
  component: PublicProfilePage,
});

interface PublicCardStyle extends CSSProperties {
  "--public-card-muted": string;
}

const shareUrl = async (title: string, url: string): Promise<"shared" | "copied" | "cancelled"> => {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
};

function PublicProfilePage() {
  const { handle } = Route.useParams();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void loadPublicProfile(handle).then(
      (value) => {
        if (active) setProfile(value);
      },
      (reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof PublicApiError && reason.status === 404
            ? "This profile is private or does not exist."
            : "The profile could not be loaded.",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [handle]);

  if (error) {
    return (
      <main className="public-state-page">
        <span className="public-mark">Moodboard</span>
        <h1>Nothing public here</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="public-state-page" aria-busy="true">
        <p>Loading public profile…</p>
      </main>
    );
  }

  const profileUrl = new URL(profilePath(profile.owner.handle), window.location.origin).toString();

  return (
    <main className="public-profile-page">
      <header className="public-profile-header">
        <div>
          <span className="public-mark">Moodboard publisher</span>
          <h1>{profile.owner.displayName}</h1>
          <p className="public-handle">@{profile.owner.handle}</p>
          {profile.owner.bio && <p className="public-bio">{profile.owner.bio}</p>}
        </div>
        <button
          type="button"
          className="public-share-button"
          onClick={() => {
            void shareUrl(profile.owner.displayName, profileUrl).then(
              (result) => {
                setNotice(
                  result === "copied"
                    ? "Profile link copied"
                    : result === "shared"
                      ? "Share sheet opened"
                      : "",
                );
              },
              () => setNotice("Could not copy this profile link"),
            );
          }}
        >
          {typeof navigator.share === "function" ? <ShareNetwork size={18} /> : <Copy size={18} />}
          Share profile
        </button>
      </header>

      <section className="public-gallery" aria-labelledby="public-gallery-title">
        <div className="public-gallery-heading">
          <h2 id="public-gallery-title">Published boards</h2>
          <span>{profile.boards.length}</span>
        </div>
        {profile.boards.length === 0 ? (
          <p className="public-empty">No boards have been published yet.</p>
        ) : (
          <div className="public-board-grid">
            {profile.boards.map((board) => {
              const background = board.background ?? "#EDEDED";
              const colors = accessibleFieldColors(background);
              const hasBackgroundImage = board.backgroundMediaId !== undefined;
              const cardStyle: PublicCardStyle = {
                backgroundColor: background,
                color: hasBackgroundImage ? "#F8F7F3" : colors.foreground,
                "--public-card-muted": hasBackgroundImage ? "#F8F7F3" : colors.muted,
              };
              return (
                <Link
                  key={board.publicId}
                  className={`public-board-card${hasBackgroundImage ? " has-background-image" : ""}`}
                  to="/share/$publicId"
                  params={{ publicId: board.publicId }}
                  style={cardStyle}
                >
                  {board.backgroundMediaId !== undefined && (
                    <img
                      className="public-board-card-image"
                      src={publicMediaUrl(board.publicId, board.backgroundMediaId)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  )}
                  <span>
                    {board.itemCount} {board.itemCount === 1 ? "piece" : "pieces"}
                  </span>
                  <strong>{board.title || "Untitled mood"}</strong>
                  <small>
                    View board <ArrowRight size={14} />
                  </small>
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <p className="visually-hidden" role="status" aria-live="polite">
        {notice}
      </p>
    </main>
  );
}
