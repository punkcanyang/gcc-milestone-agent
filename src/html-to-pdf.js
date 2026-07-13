/*
__ai_context__
本模块负责将生成的本地 HTML 里程碑验证报告打印为标准的 A4 格式 PDF 文件。
主要职能：
1. 接收物理 HTML 文件路径和目标输出 PDF 物理路径作为命令行参数。
2. 启动 Headless 状态下的 Playwright Chromium 实例。
3. 载入本地 HTML 报告，等待页面样式与 DOM 加载完毕。
4. 调用页面的 PDF 打印引擎，以矢量形式输出 PDF，开启背景图案的渲染并设置页边距。
依赖关系：
- 依赖 `playwright` 库启动和操作浏览器。
- 依赖 `path` 模块转换绝对物理路径。
*/

import { chromium } from 'playwright';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const htmlPath = args[0];
  const pdfPath = args[1];

  // 防御性校验：检查命令行参数是否齐全
  if (!htmlPath || !pdfPath) {
    console.error('Error: Missing parameters.');
    console.error('Usage: node html-to-pdf.js <htmlPath> <pdfPath>');
    process.exit(1);
  }

  // 启动 headless 模式的浏览器实例
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const absoluteHtmlPath = path.resolve(htmlPath);

    // 以本地 file 协议载入生成的 HTML 文件
    await page.goto(`file://${absoluteHtmlPath}`, { waitUntil: 'load' });

    // 为 CSS 样式动态解析、图片渲染留出 1 秒的富余缓冲时间
    await page.waitForTimeout(1000);

    // 虚拟打印成 A4 格式的 PDF 报告
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true // 必须开启，以防 CSS 渲染的进度条与分值颜色在 PDF 中丢失
    });

    console.log(`PDF exported successfully to: ${pdfPath}`);
  } catch (err) {
    console.error('Failed to export PDF:', err);
    process.exit(1);
  } finally {
    // 确保任何情况下都关闭浏览器以释放系统资源
    await browser.close();
  }
}

main();

/*
[For Future AI]
1. 关键设计假设：
   - 假定运行环境中已通过 `npx playwright install chromium` 安装好了 Chromium 内核。
   - 依赖本地 `file://` 协议读取 HTML 报告。如果在沙盒环境中由于系统权限无法读取本地文件，可能需要启动临时本地 HTTP 服务。
2. 潜在边界情况：
   - 如果 HTML 文件过大或包含大型图片，可能需要延长 `page.waitForTimeout` 或者配置页面的 `waitUntil: 'networkidle'`。
   - `printBackground` 必须为 true。如果不设置，Chromium 默认会剔除所有的 background-color 和 border-color 以节约打印墨水，这将导致报告的色彩完全失效。
*/
