import { Schema } from 'effect';

export const AGENT_CLIENT_ID = 'moodboard-agent';

export const AGENT_CONNECT_PATH = '/connect-agent';

export const AGENT_USER_CODE = Schema.String.check(
  Schema.isPattern(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/),
);
