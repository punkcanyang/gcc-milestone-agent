/**
 * __ai_context__
 * 模組角色：npm Registry Evidence Provider — 驗證套件是否已發布到 npm
 * 系統位置：providers/index.js → [本模組] → types.js
 * 核心職責：
 *   1. 從 package.json 讀取套件名稱（如果 repo 有的話）
 *   2. 查詢 npm registry 確認套件是否存在
 *   3. 收集版本、下載量等資訊
 * 設計說明：使用 GitHub raw file API 讀取 package.json，再查詢 npm registry
 */
import { EVIDENCE_TYPES, PROVIDER_SOURCES, githubFetch, fetchWithRetry } from './types.js';

const GITHUB_API = 'https://api.github.com';
const NPM_REGISTRY = 'https://registry.npmjs.org';

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const npmRegistryProvider = {
    name: PROVIDER_SOURCES.NPM_REGISTRY,
    types: [EVIDENCE_TYPES.PACKAGE],

    /**
     * WHY: 驗證 repo 的產出物是否有發布到 npm，反映項目的可用性和成熟度
     * 先從 GitHub 取 package.json 得到套件名稱，再查 npm registry
     */
    async collect({ owner, name, token }) {
        const source = PROVIDER_SOURCES.NPM_REGISTRY;

        // Step 1: 嘗試從 GitHub 取得 package.json
        let packageJson = null;
        try {
            const rawUrl = `${GITHUB_API}/repos/${owner}/${name}/contents/package.json`;
            const fileData = await githubFetch(rawUrl, token);
            // WHY: GitHub contents API 回傳 base64 encoded content
            if (fileData && fileData.content) {
                const decoded = Buffer.from(fileData.content, 'base64').toString('utf8');
                packageJson = JSON.parse(decoded);
            }
        } catch {
            // WHY: 不是 Node.js 項目或 package.json 不存在，回傳空結果而非拋錯
            return {
                items: [],
                counts: { packages: 0 },
                links: {},
                metadata: { reason: 'No package.json found in repository' }
            };
        }

        // WHY: private packages 不會在 npm registry 上，跳過查詢
        if (!packageJson || !packageJson.name || packageJson.private) {
            return {
                items: [],
                counts: { packages: 0 },
                links: {},
                metadata: { reason: packageJson?.private ? 'Package is private' : 'No package name found' }
            };
        }

        // Step 2: 查詢 npm registry
        const pkgName = packageJson.name;
        let npmData = null;
        try {
            npmData = await fetchWithRetry(`${NPM_REGISTRY}/${encodeURIComponent(pkgName)}`);
        } catch {
            // WHY: npm 查詢失敗（套件未發布），回傳空結果
            return {
                items: [{
                    type: EVIDENCE_TYPES.PACKAGE,
                    source,
                    title: `npm package "${pkgName}" — not published`,
                    body: `Package "${pkgName}" was found in package.json but is not published to npm registry.`,
                    url: `https://www.npmjs.com/package/${pkgName}`,
                    metadata: { packageName: pkgName, published: false }
                }],
                counts: { packages: 0 },
                links: {},
                metadata: { packageName: pkgName, published: false }
            };
        }

        // Step 3: 解析 npm 資料
        const latestVersion = npmData['dist-tags']?.latest || 'unknown';
        const versionCount = Object.keys(npmData.versions || {}).length;
        const npmUrl = `https://www.npmjs.com/package/${pkgName}`;
        const createdAt = npmData.time?.created || null;
        const modifiedAt = npmData.time?.modified || null;

        const items = [{
            type: EVIDENCE_TYPES.PACKAGE,
            source,
            title: `npm package "${pkgName}" v${latestVersion} — published`,
            body: `Package "${pkgName}" has ${versionCount} version(s) on npm. Latest: ${latestVersion}. publish npm package registry`,
            url: npmUrl,
            metadata: {
                packageName: pkgName,
                published: true,
                latestVersion,
                versionCount,
                createdAt,
                modifiedAt
            }
        }];

        return {
            items,
            counts: { packages: 1 },
            links: { packages: [npmUrl] },
            metadata: { packageName: pkgName, published: true, latestVersion, versionCount }
        };
    }
};

export default npmRegistryProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 僅支援 npm（不支援 PyPI/Cargo/etc.）
 *    - package.json 的 name 欄位用於 npm registry 查詢
 *    - private: true 的 package 不會查詢 npm
 * 2. 潛在邊界情況：
 *    - scoped packages（如 @org/pkg）需要正確 encode
 *    - monorepo 多 package.json 的情況只取根目錄的
 *    - npm registry 偶爾會回傳 unpublished 狀態
 * 3. 模組依賴：
 *    - types.js（githubFetch, fetchWithRetry, EVIDENCE_TYPES, PROVIDER_SOURCES）
 */
