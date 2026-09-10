import { createFileRoute } from "@tanstack/react-router";

import BoardEditor from "../components/board-editor";
import { AccountIdSchema } from "../lib/account";

const GUEST_DEMO_ACCOUNT_ID = AccountIdSchema.make("guest-demo-v1");

export const Route = createFileRoute("/demo")({ component: GuestDemoApp });

function GuestDemoApp() {
  return <BoardEditor accountId={GUEST_DEMO_ACCOUNT_ID} localOnly />;
}
