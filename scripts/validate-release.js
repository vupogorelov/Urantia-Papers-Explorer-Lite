import { appendFile } from 'node:fs/promises';

const tag = process.env.GITHUB_REF_NAME ?? '';
const match = tag.match(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);

if (!match) {
  throw new Error(`Release tag "${tag}" must use SemVer MAJOR.MINOR.PATCH, for example v0.1.1.`);
}

const [, major, minor, patch] = match;
const current = [major, minor, patch].map(BigInt);
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? 1);

if (!repository || !token) throw new Error('GitHub repository context is unavailable.');
if (!Number.isSafeInteger(runNumber) || runNumber < 1) throw new Error('Invalid GitHub Actions run number.');

const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  },
});

if (response.status !== 404 && !response.ok) {
  throw new Error(`Could not check the latest release (GitHub HTTP ${response.status}).`);
}

if (response.ok) {
  const release = await response.json();
  const previousMatch = String(release.tag_name ?? '').match(/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!previousMatch) throw new Error(`Latest stable release tag "${release.tag_name}" is not SemVer.`);
  const previous = previousMatch.slice(1).map(BigInt);
  const order = current.findIndex((part, index) => part !== previous[index]);
  const comparison = order < 0 ? 0 : current[order] > previous[order] ? 1 : -1;
  const retryingSameRelease = runAttempt > 1 && comparison === 0;
  if (comparison <= 0 && !retryingSameRelease) {
    throw new Error(`Version ${tag} must be greater than the latest release ${release.tag_name}. Use a patch, minor, or major SemVer bump.`);
  }
}

await appendFile(process.env.GITHUB_ENV, [
  `ANDROID_VERSION_CODE=${runNumber}`,
  `ANDROID_VERSION_NAME=${major}.${minor}.${patch}`,
  '',
].join('\n'), 'utf8');

console.log(`Validated ${tag}; Android versionName=${major}.${minor}.${patch}, versionCode=${runNumber}.`);
