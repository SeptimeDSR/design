import { hasPostizCredentials } from "./publish";
import { resolvePublishMode, type PublishMode } from "./publish-plan";
import type { Env } from "./config";

// Un seul endroit décide du mode : le message lu par l'utilisateur et la publication réelle ne divergent jamais.
export const resolveModeFromEnv = (env: Env = process.env): PublishMode => resolvePublishMode(env, hasPostizCredentials());
