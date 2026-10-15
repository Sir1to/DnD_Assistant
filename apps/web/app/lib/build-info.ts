export interface PublicBuildInfo {
  version: string;
  commit: string;
  builtAt?: string;
}

function nonEmpty(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export const publicBuildInfo: PublicBuildInfo = {
  version: nonEmpty(process.env.NEXT_PUBLIC_APP_VERSION, '0.1.0'),
  commit: nonEmpty(process.env.NEXT_PUBLIC_APP_COMMIT, 'development'),
  ...(process.env.NEXT_PUBLIC_APP_BUILD_TIME
    ? { builtAt: process.env.NEXT_PUBLIC_APP_BUILD_TIME }
    : {}),
};

export function formatBuildLabel(build: PublicBuildInfo): string {
  const dirty = build.commit.endsWith('-dirty');
  const commit = dirty ? build.commit.slice(0, -6) : build.commit;
  const shortCommit = /^[a-f\d]{7,64}$/i.test(commit) ? commit.slice(0, 8) : commit;

  return `v${build.version} · ${shortCommit}${dirty ? '+dirty' : ''}`;
}
