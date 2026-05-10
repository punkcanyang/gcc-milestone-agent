import fs from 'node:fs/promises';
import path from 'node:path';

const SNAPSHOT_DIR = '.gcc-milestone/snapshots';

function snapshotPath(repo) {
  const safe = repo.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(SNAPSHOT_DIR, `${safe}.json`);
}

export async function saveSnapshot(repo, { score, status, communityHealth, counts }) {
  const dir = path.resolve(process.cwd(), SNAPSHOT_DIR);
  await fs.mkdir(dir, { recursive: true });

  const data = {
    timestamp: new Date().toISOString(),
    repo,
    score,
    status,
    counts,
    communityHealth
  };

  const filePath = path.resolve(process.cwd(), snapshotPath(repo));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}

export async function loadPreviousSnapshot(repo) {
  try {
    const filePath = path.resolve(process.cwd(), snapshotPath(repo));
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
