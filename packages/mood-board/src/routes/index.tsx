import { ArrowRight, Plus } from "@phosphor-icons/react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { authClient } from "../client/auth-client";
import { createBoardCatalog, type BoardCatalog } from "../client/board-catalog";
import { boardPath } from "../client/board-route";
import { HomeAccountIdentity } from "../components/account-identity";
import { DEFAULT_BOARD_ID, type BoardSummary } from "../lib/board-rpc";

export const Route = createFileRoute("/")({ component: HomePage });

const formatUpdatedAt = (value: number) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });

function HomePage() {
  const navigate = useNavigate();
  const session = authClient.useSession();
  const [boards, setBoards] = useState<ReadonlyArray<BoardSummary>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [loadedAccountId, setLoadedAccountId] = useState<string | null>(null);
  const catalogRef = useRef<BoardCatalog | null>(null);
  const user = session.data?.user;

  useEffect(() => {
    document.title = "Moodboard — A place to collect what stays with you";
  }, []);

  useEffect(() => {
    if (session.isPending || session.isRefetching || user === undefined || session.error != null)
      return;

    const catalog = createBoardCatalog();
    catalogRef.current = catalog;
    let active = true;

    void catalog.list().then(
      (summaries) => {
        if (!active) return;
        setBoards(summaries);
        setError("");
        setCreateError("");
        setLoadedAccountId(user.id);
        setLoading(false);
      },
      () => {
        if (!active) return;
        setError("The board library could not be reached.");
        setLoadedAccountId(user.id);
        setLoading(false);
      },
    );

    return () => {
      active = false;
      if (catalogRef.current === catalog) catalogRef.current = null;
      void catalog.close();
    };
  }, [session.error, session.isPending, session.isRefetching, user]);

  const createNewBoard = useCallback(async () => {
    const catalog = catalogRef.current;
    if (catalog === null || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const board = await catalog.create("Untitled mood");
      await navigate({ to: "/boards/$boardId", params: { boardId: board.id } });
    } catch {
      setCreateError("The new board could not be created.");
      setCreating(false);
    }
  }, [creating, navigate]);

  const catalogCurrent = user !== undefined && loadedAccountId === user.id;
  const visibleBoards = catalogCurrent ? boards : [];
  const visibleError = catalogCurrent ? error : "";
  const catalogLoading =
    session.isPending ||
    session.isRefetching ||
    (user !== undefined && !catalogCurrent) ||
    (catalogCurrent && loading);

  return (
    <main className="home-page">
      <header className="home-header">
        <Link className="home-wordmark" to="/" aria-label="Moodboard home">
          <span aria-hidden="true" />
          Moodboard
        </Link>
        <div className="home-header-actions">
          <HomeAccountIdentity
            user={session.data?.user}
            pending={session.isPending}
            error={session.error != null}
            onRetry={() => void session.refetch()}
          />
          {user === undefined ? (
            <Link className="home-enter-link" to="/demo">
              Open canvas <ArrowRight size={15} weight="bold" />
            </Link>
          ) : (
            <Link
              className="home-enter-link"
              to="/boards/$boardId"
              params={{ boardId: DEFAULT_BOARD_ID }}
            >
              Open canvas <ArrowRight size={15} weight="bold" />
            </Link>
          )}
        </div>
      </header>

      <section className="home-intro" aria-labelledby="home-title">
        <p className="home-kicker">A visual notebook</p>
        <h1 id="home-title">
          Keep the things
          <br />
          that stay with you.
        </h1>
        <div className="home-intro-copy">
          <p>
            Moodboard is a quiet, open canvas for collecting images, colors, notes, sounds, and
            links. Arrange references without forcing them into a template, then return when an idea
            needs direction.
          </p>
          <p>
            Try the canvas without an account and keep the demo in this browser, or sign in for
            persistent private boards that follow you across devices.
          </p>
        </div>
      </section>

      <section className="home-boards" aria-labelledby="boards-title">
        <div className="home-section-heading">
          <h2 id="boards-title">Your boards</h2>
          {user !== undefined && (
            <div className="home-board-heading-actions">
              {!catalogLoading && !visibleError && (
                <span className="home-board-count">{visibleBoards.length}</span>
              )}
              <button
                className="home-new-board"
                type="button"
                disabled={catalogLoading || creating}
                onClick={() => void createNewBoard()}
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                {creating ? "Creating…" : "New board"}
              </button>
            </div>
          )}
        </div>

        {createError && (
          <p className="home-board-create-error" role="alert">
            {createError}
          </p>
        )}

        {!session.isPending && user === undefined && (
          <div className="home-board-message home-board-message--guest">
            <p>
              Start with an example board stored only in this browser. Signing in opens a separate
              private workspace.
            </p>
            <span>
              <Link to="/demo">Try the demo</Link>
              <Link to="/login" search={{ returnTo: boardPath(DEFAULT_BOARD_ID) }}>
                Sign in for private boards
              </Link>
            </span>
          </div>
        )}

        {catalogLoading && (
          <div className="home-board-loading" aria-label="Loading boards" aria-busy="true">
            <span />
            <span />
            <span />
          </div>
        )}

        {!catalogLoading && user !== undefined && visibleError && (
          <div className="home-board-message" role="alert">
            <p>{visibleError}</p>
            <Link to="/boards/$boardId" params={{ boardId: DEFAULT_BOARD_ID }}>
              Open the default board
            </Link>
          </div>
        )}

        {!catalogLoading && user !== undefined && !visibleError && visibleBoards.length === 0 && (
          <div className="home-board-list">
            <Link
              className="home-board-row"
              to="/boards/$boardId"
              params={{ boardId: DEFAULT_BOARD_ID }}
              style={{ "--board-index": 0 } as CSSProperties}
            >
              <span className="home-board-number">01</span>
              <strong>For the way a place can feel</strong>
              <span className="home-board-meta">
                10 example items
                <span aria-hidden="true"> / </span>
                Yours to remix
              </span>
              <ArrowRight className="home-board-arrow" size={19} />
            </Link>
          </div>
        )}

        {!catalogLoading && user !== undefined && !visibleError && visibleBoards.length > 0 && (
          <div className="home-board-list">
            {visibleBoards.map((board, index) => (
              <Link
                key={board.id}
                className="home-board-row"
                to="/boards/$boardId"
                params={{ boardId: board.id }}
                style={{ "--board-index": index } as CSSProperties}
              >
                <span className="home-board-number">{String(index + 1).padStart(2, "0")}</span>
                <strong>{board.title || "Untitled mood"}</strong>
                <span className="home-board-meta">
                  {board.itemCount} {board.itemCount === 1 ? "item" : "items"}
                  <span aria-hidden="true"> / </span>
                  {formatUpdatedAt(board.updatedAt)}
                </span>
                <ArrowRight className="home-board-arrow" size={19} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <footer className="home-acknowledgements">
        <div className="home-section-heading">
          <h2>Acknowledgements</h2>
        </div>
        <div>
          <p>
            The canvas interaction and restraint were inspired by the mood page from Devouring
            Details: frameless media, free arrangement, and only the controls that need to be there.
          </p>
          <p>
            Built with React and Effect. Interface symbols are from Phosphor Icons. Moodboard is
            designed to stay portable, focused, and yours.
          </p>
        </div>
        <span className="home-footer-mark">Collect slowly. Edit freely.</span>
      </footer>
    </main>
  );
}
