import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BanditState } from "./bandit";
import { withLock, writeJsonAtomic } from "./lock";
import type { Platform, PublishMode } from "./publish-plan";
import type { Trend } from "./trends";
import type { TemplateId, Timeline, ViralScript, Lang } from "./types";

export type JobStatus = "rendered" | "notified" | "publishing" | "published" | "rejected" | "failed";

export type Job = {
  id: string;
  createdAt: string;
  status: JobStatus;
  request: { topic?: string; template?: TemplateId; lang?: Lang; script?: unknown };
  script: ViralScript;
  timeline: Timeline;
  arm: string;
  source: "ollama" | "fallback" | "claude";
  ttsEngine: string;
  trend?: Trend;
  jobDir: string;
  videoPath?: string;
  publishMode?: PublishMode;
  postIds?: string[];
  // Registre de publication : ce qui est déjà parti, par plateforme. Une relance ne reposte jamais ces plateformes.
  posted?: Partial<Record<Platform, string[]>>;
  publishingSince?: string;
  publishedAt?: string;
  // D'où viennent les plans de fond, et à qui les créditer (Pexels, Pixabay).
  broll?: { source: string; credits: { provider: string; author: string; url: string }[] };
  views?: number;
  rewarded?: boolean;
  error?: string;
};

export type ViralState = { bandit: BanditState; viewsHistory: number[]; recentTopics: string[] };

export class RefError extends Error {
  constructor(
    readonly code: "not_found" | "ambiguous_ref",
    readonly ref: string,
    readonly matches: Job[] = [],
  ) {
    super(code === "not_found" ? `Aucune vidéo #${ref}.` : `#${ref} désigne plusieurs vidéos : ${matches.map((j) => `#${j.id.slice(0, 6)}`).join(", ")}. Tape quelques caractères de plus.`);
  }
}

// « #5F8A », « 5f8a », « 5f8a » : même vidéo, quelle que soit la porte.
export const normalizeRef = (input: string): string => input.replace(/[#\s]/g, "").toLowerCase();

export function createStore(home: string) {
  const jobsDir = join(home, "jobs");
  mkdirSync(jobsDir, { recursive: true });
  const statePath = join(home, "state.json");
  const jobPath = (id: string) => join(jobsDir, id, "job.json");

  const readJob = (id: string): Job | undefined => {
    try {
      return JSON.parse(readFileSync(jobPath(id), "utf8")) as Job;
    } catch (error) {
      console.error(`[store] job ${id} illisible, ignoré : ${(error as Error).message}`);
      return undefined;
    }
  };

  const listJobs = (): Job[] =>
    readdirSync(jobsDir)
      .filter((id) => existsSync(jobPath(id)))
      .map(readJob)
      .filter((j): j is Job => !!j)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const loadState = (): ViralState =>
    existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { bandit: {}, viewsHistory: [], recentTopics: [] };

  return {
    home,
    jobsDir,
    loadState,
    saveState(state: ViralState) {
      writeJsonAtomic(statePath, state);
    },
    // Lire, modifier, écrire sous verrou : le démon, le Studio et le MCP ne s'écrasent plus.
    updateState(fn: (s: ViralState) => ViralState): Promise<ViralState> {
      return withLock(join(home, "state.lock"), () => {
        const next = fn(loadState());
        writeJsonAtomic(statePath, next);
        return next;
      });
    },
    saveJob(job: Job) {
      mkdirSync(join(jobsDir, job.id), { recursive: true });
      writeJsonAtomic(jobPath(job.id), job);
    },
    getJob(id: string): Job | undefined {
      return existsSync(jobPath(id)) ? readJob(id) : undefined;
    },
    listJobs,
    latestJob(status?: JobStatus): Job | undefined {
      return listJobs().find((j) => !status || j.status === status);
    },
    findJob(ref: string): Job | undefined {
      return listJobs().find((j) => j.id.startsWith(normalizeRef(ref)));
    },
    resolveRef(ref: string): Job {
      const key = normalizeRef(ref);
      const matches = key ? listJobs().filter((j) => j.id.startsWith(key)) : [];
      if (matches.length === 1) return matches[0];
      throw new RefError(matches.length ? "ambiguous_ref" : "not_found", key, matches);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
