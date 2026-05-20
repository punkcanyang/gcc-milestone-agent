/**
 * __ai_context__
 * 模組角色：指標歷史快照儲存模組
 * 系統位置：milestone-check.js → [本模組]
 * 核心職責：
 *   1. 將每次評估的 score、status、counts 和 communityHealth 指標寫入本地快照 JSON 檔案中
 *   2. 讀取之前的快照，以提供趨勢對比
 */
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

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 快照資料夾 `.gcc-milestone/snapshots/` 在當前工作目錄(CWD)下且被 git 忽略。
 *    - 檔名由 repo 的 owner/name 正規化生成，例如 `octocat_hello-world.json`。
 * 2. 潛在邊界情況：
 *    - 讀取時如果檔案不存在或格式不合法的 JSON，會安靜返回 null 而不崩潰。
 * 3. 模組依賴：
 *    - node:fs/promises
 *    - node:path
 */

