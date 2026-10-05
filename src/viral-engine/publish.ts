import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { postText } from "./message";
import { postizSettings, type Platform, type PublishMode } from "./publish-plan";
import type { Job } from "./store";

export type PostizRunner = (args: string[]) => Promise<string>;

const run = promisify(execFile);

// CLI officiel Postiz (npm i -g postiz) : il gère OAuth, upload et règles de chaque plateforme.
export const runPostiz: PostizRunner = async (args) => {
  const bin = process.env.POSTIZ_BIN ?? "postiz";
  const { stdout } = await run(bin, args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout;
};

export const hasPostizCredentials = () => existsSync(join(homedir(), ".postiz", "credentials.json"));

const IDENTIFIERS: Record<Platform, string[]> = {
  tiktok: ["tiktok"],
  youtube: ["youtube"],
  instagram: ["instagram", "instagram-standalone"],
  facebook: ["facebook"],
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.search(/[[{]/);
    return start >= 0 ? JSON.parse(text.slice(start)) : null;
  }
}

function postIdsFrom(output: string): string[] {
  const data = parseJson(output);
  const list = Array.isArray(data) ? data : [data];
  return list.map((p) => (p as { postId?: string; id?: string })?.postId ?? (p as { id?: string })?.id).filter((x): x is string => !!x);
}

export type PublishResult = {
  posted: Partial<Record<Platform, string[]>>;
  missing: Platform[];
  failed: { platform: Platform; error: string }[];
  manualText?: string;
};

// Publie seulement les plateformes pas encore publiées ; un échec n'efface jamais ce qui est déjà parti.
export async function publishJob(
  job: Job,
  mode: PublishMode,
  platforms: Platform[],
  tiktokMethod: "DIRECT_POST" | "UPLOAD",
  postiz: PostizRunner = runPostiz,
): Promise<PublishResult> {
  const posted: Partial<Record<Platform, string[]>> = { ...job.posted };
  if (mode === "manual") return { posted, missing: [], failed: [], manualText: postText(job) };
  if (!job.videoPath) throw new Error("Pas de vidéo à publier");

  const integrations = parseJson(await postiz(["integrations:list"])) as { id: string; identifier: string; disabled?: boolean }[];
  const targets = platforms.map((p) => ({ platform: p, integration: integrations.find((i) => !i.disabled && IDENTIFIERS[p].includes(i.identifier)) }));
  const missing = targets.filter((t) => !t.integration).map((t) => t.platform);
  const todo = targets.filter((t) => t.integration && !posted[t.platform]?.length);
  const failed: PublishResult["failed"] = [];
  if (!todo.length) return { posted, missing, failed };

  const uploaded = parseJson(await postiz(["upload", job.videoPath])) as { path: string };
  const date = new Date(Date.now() + 2 * 60_000).toISOString();
  for (const { platform, integration } of todo) {
    try {
      const settings = postizSettings(platform, mode, job.script, tiktokMethod);
      const out = await postiz(["posts:create", "-c", postText(job), "-s", date, "-m", uploaded.path, "--settings", JSON.stringify(settings), "-i", integration!.id]);
      posted[platform] = postIdsFrom(out);
    } catch (error) {
      failed.push({ platform, error: (error as Error).message });
    }
  }
  return { posted, missing, failed };
}

export const allPostIds = (job: Pick<Job, "posted" | "postIds">) => [...Object.values(job.posted ?? {}).flat(), ...(job.postIds ?? [])];

// Analytics Postiz : somme des points « vues / impressions / lectures ».
export function parseViews(output: string): number | null {
  let data: unknown;
  try {
    data = parseJson(output);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const metric = data.find((m) => /view|vue|impression|play|lecture/i.test(String((m as { label?: string }).label)));
  if (!metric) return null;
  return ((metric as { data?: { total?: number }[] }).data ?? []).reduce((sum, d) => sum + (Number(d.total) || 0), 0);
}

export async function fetchJobViews(job: Job, postiz: PostizRunner = runPostiz): Promise<number | null> {
  const ids = allPostIds(job);
  if (!ids.length) return null;
  let total = 0;
  let found = false;
  for (const id of ids) {
    const views = parseViews(await postiz(["analytics:post", id, "-d", "7"]).catch(() => ""));
    if (views !== null) {
      total += views;
      found = true;
    }
  }
  return found ? total : null;
}
