/**
 * __ai_context__
 * 模組角色：Etherscan Smart Contract Provider
 * 系統位置：providers/index.js → [本模組]
 * 核心職責：
 *   1. 透過 Etherscan API 查詢指定的智能合約地址
 *   2. 驗證合約是否已開源 (Verified)
 *   3. 取得合約的部署者與部署交易 Hash
 * 設計說明：支援傳入自訂 RPC URL (如 Optimism/Arbitrum scan) 以支援多鏈
 */

import { EVIDENCE_TYPES, PROVIDER_SOURCES, fetchWithRetry } from './types.js';

/**
 * @type {import('./types.js').ProviderDefinition}
 */
const etherscanApiProvider = {
    name: PROVIDER_SOURCES.ETHERSCAN_API,
    types: [EVIDENCE_TYPES.SMART_CONTRACT],

    async collect(ctx) {
        const address = ctx.options?.contractAddress;
        if (!address) {
            // 如果沒提供合約地址，直接跳過
            return { items: [], counts: {}, links: {} };
        }

        // WHY: 基本輸入驗證 — 以太坊地址為 42 字元的十六進制字串 (0x + 40 hex chars)
        if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
            console.warn(`[etherscan-api] Invalid Ethereum address format: ${address}`);
            return {
                items: [],
                counts: { smart_contracts: 0 },
                links: {},
                metadata: { address, error: 'Invalid Ethereum address format' }
            };
        }

        const baseUrl = ctx.options?.etherscanUrl || 'https://api.etherscan.io/api';
        const apiKey = ctx.options?.etherscanApiKey || '';
        const apiKeyParam = apiKey ? `&apikey=${apiKey}` : '';

        const items = [];
        const links = { smart_contracts: [] };
        const metadata = { address };

        try {
            // 1. 檢查合約是否已驗證 (Verified Source Code)
            const sourceUrl = `${baseUrl}?module=contract&action=getsourcecode&address=${address}${apiKeyParam}`;
            const sourceRes = await fetchWithRetry(sourceUrl);

            let isVerified = false;
            let contractName = 'UnknownContract';
            let compilerVersion = '';

            if (sourceRes.status === '1' && sourceRes.result && sourceRes.result[0]) {
                const contractData = sourceRes.result[0];
                if (contractData.ABI !== 'Contract source code not verified') {
                    isVerified = true;
                    contractName = contractData.ContractName || contractName;
                    compilerVersion = contractData.CompilerVersion || '';
                }
            }

            metadata.isVerified = isVerified;
            metadata.contractName = contractName;

            let bodyText = `Contract Address: ${address}\nName: ${contractName}\nStatus: ${isVerified ? 'Verified ✅' : 'Unverified ❌'}`;
            if (compilerVersion) {
                bodyText += `\nCompiler: ${compilerVersion}`;
            }

            // 2. 獲取合約部署資訊 (Contract Creation)
            // 備註：這是 Etherscan 較新的端點，某些小眾 scan 可能不支援
            const creationUrl = `${baseUrl}?module=contract&action=getcontractcreation&contractaddresses=${address}${apiKeyParam}`;
            try {
                const creationRes = await fetchWithRetry(creationUrl);
                if (creationRes.status === '1' && creationRes.result && creationRes.result[0]) {
                    const creationData = creationRes.result[0];
                    const creator = creationData.contractCreator;
                    const txHash = creationData.txHash;
                    metadata.creator = creator;
                    metadata.txHash = txHash;
                    
                    bodyText += `\nDeployed by: ${creator}\nTxHash: ${txHash}`;
                }
            } catch (err) {
                console.warn(`[etherscan-api] Failed to get contract creation info: ${err.message}`);
            }

            // 根據 baseUrl 推斷區塊鏈瀏覽器的網址
            let explorerUrl = `https://etherscan.io/address/${address}`; // Fallback
            try {
                const urlObj = new URL(baseUrl);
                const explorerDomain = urlObj.hostname.replace('api.', '');
                explorerUrl = `${urlObj.protocol}//${explorerDomain}/address/${address}`;
            } catch (e) {
                // Keep fallback
            }
            links.smart_contracts.push(explorerUrl);

            items.push({
                type: EVIDENCE_TYPES.SMART_CONTRACT,
                source: PROVIDER_SOURCES.ETHERSCAN_API,
                title: `Smart Contract Deployed: ${contractName}`,
                body: bodyText,
                url: explorerUrl,
                metadata
            });

            return {
                items,
                counts: {
                    smart_contracts: 1
                },
                links,
                metadata
            };
        } catch (error) {
            // WHY: 統一錯誤處理 — provider 失敗應返回空結果而非拋錯，讓其他 provider 繼續運行
            console.warn(`[etherscan-api] Error fetching data for ${address}: ${error.message}`);
            return {
                items: [],
                counts: { smart_contracts: 0 },
                links: {},
                metadata: { address, error: error.message }
            };
        }
    }
};

export default etherscanApiProvider;

/**
 * [For Future AI]
 * 1. 關鍵假設：
 *    - 依賴 Etherscan 格式的 API。
 *    - 若合約未驗證，`getsourcecode` 仍會回傳 status=1 但 ABI 為 'Contract source code not verified'。
 * 2. 潛在邊界情況：
 *    - Etherscan Rate Limit 非常嚴格 (免費版 5 req/s)，如果沒給 API Key 極易被 429。
 *    - 某些二線 EVM 鏈的 Explorer 可能不支援 `getcontractcreation` 端點。
 * 3. 模組依賴：
 *    - fetchWithRetry (處理重試)
 */
