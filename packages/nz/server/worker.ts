import { type CommentsEnv, handleComments } from './comments';

interface Env extends CommentsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return handleComments(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
