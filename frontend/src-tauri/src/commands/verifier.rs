/*
__ai_context__
本模块负责里程碑校验流的执行与报告管理。
主要职能：
1. 定义校验过程及报告管理的数据模型（LogPayload, VerificationRequest, VerificationResult, ReportSummary）。
2. 在后台拉起 Node.js 版本的 CLI 工具执行具体的规则评测，通过异步流机制捕获其标准输出及标准错误。
3. 通过 Tauri 广播事件（`verification-log`）实时将 CLI 日志推送至前端。
4. 提供历史报告列表的物理扫描与读取、JSON 格式报告的局部解析与物理删除。
依赖关系：
- 依赖 `tokio::process::Command` 实现跨平台异步子进程拉起。
- 依赖 `tauri::Emitter` 和 `tauri::AppHandle` 实现基于 IPC 事件的实时流日志推送。
- 依赖 `serde_json` 和 `chrono` 转换并加工报告状态。
*/

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};

use super::file_ops::move_file_to_trash;

#[derive(Clone, Serialize)]
pub struct LogPayload {
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VerificationRequest {
    pub repo: String,
    pub milestone: String,
    pub since: Option<String>,
    pub profile: Option<String>,
    pub rules_file: Option<String>,
    pub providers: Option<String>,
    pub output_dir: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VerificationResult {
    pub success: bool,
    pub summary: String,
    pub report_path: Option<String>,
    pub json_path: Option<String>,
    pub html_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportSummary {
    pub id: String,
    pub repo: String,
    pub milestone: String,
    pub score: u32,
    pub status: String,
    pub date: String,
    pub report_path: String,
    pub json_path: Option<String>,
    pub html_path: Option<String>,
}

/// 辅助函数：定位 CLI 校验引擎入口脚本文档 (cli.js) 的位置。
/// 支持开发调试路径 fallback 以及生产包内嵌资源路径查找。
fn find_cli_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let dev_path = app_dir.join("../../src/cli.js");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    let prod_path = app_dir.join("src/cli.js");
    if prod_path.exists() {
        return Ok(prod_path);
    }

    let cwd_path = PathBuf::from("../src/cli.js");
    if cwd_path.exists() {
        return Ok(cwd_path
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?);
    }

    Err("Could not find CLI script. Make sure the project structure is correct.".to_string())
}

fn trash_report_file(path: &Path, reports_dir: &Path, label: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let reports_root = reports_dir
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize reports directory: {}", e))?;
    let target = path
        .canonicalize()
        .map_err(|e| format!("Failed to canonicalize {}: {}", label, e))?;

    if !target.starts_with(&reports_root) {
        return Err(format!(
            "Refusing to move {} outside reports directory to trash",
            label
        ));
    }

    move_file_to_trash(&target, label)
}

#[tauri::command]
pub async fn run_verification(
    request: VerificationRequest,
    app_handle: AppHandle,
) -> Result<VerificationResult, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let reports_dir = app_dir.join("reports");
    fs::create_dir_all(&reports_dir)
        .map_err(|e| format!("Failed to create reports directory: {}", e))?;

    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let safe_repo = request.repo.replace("/", "_");
    let report_name = format!("{}_{}", safe_repo, timestamp);

    let report_path = reports_dir.join(format!("{}.md", report_name));
    let json_path = reports_dir.join(format!("{}.json", report_name));
    let html_path = reports_dir.join(format!("{}.html", report_name));

    let cli_path = find_cli_path(&app_handle)?;

    let mut args = vec![
        cli_path.to_string_lossy().to_string(),
        "--repo".to_string(),
        request.repo.clone(),
        "--milestone".to_string(),
        request.milestone.clone(),
        "--out".to_string(),
        report_path.to_string_lossy().to_string(),
        "--json-out".to_string(),
        json_path.to_string_lossy().to_string(),
        "--html-out".to_string(),
        html_path.to_string_lossy().to_string(),
    ];

    if let Some(since) = &request.since {
        if !since.is_empty() {
            args.push("--since".to_string());
            args.push(since.clone());
        }
    }

    if let Some(profile) = &request.profile {
        if !profile.is_empty() {
            args.push("--profile".to_string());
            args.push(profile.clone());
        }
    }

    if let Some(rules_file) = &request.rules_file {
        if !rules_file.is_empty() {
            args.push("--rules-file".to_string());
            args.push(rules_file.clone());
        }
    }

    if let Some(providers) = &request.providers {
        if !providers.is_empty() {
            args.push("--providers".to_string());
            args.push(providers.clone());
        }
    }

    let mut child = tokio::process::Command::new("node")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn CLI: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_handle_stdout = app_handle.clone();
    let stdout_task = tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut accum = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let line_str: String = line;
            let _ = app_handle_stdout.emit(
                "verification-log",
                LogPayload {
                    stream: "stdout".to_string(),
                    line: line_str.clone(),
                },
            );
            accum.push(line_str);
        }
        accum
    });

    let app_handle_stderr = app_handle.clone();
    let stderr_task = tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut accum = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let line_str: String = line;
            let _ = app_handle_stderr.emit(
                "verification-log",
                LogPayload {
                    stream: "stderr".to_string(),
                    line: line_str.clone(),
                },
            );
            accum.push(line_str);
        }
        accum
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for CLI: {}", e))?;

    let stdout_lines = stdout_task.await.unwrap_or_default();
    let stderr_lines = stderr_task.await.unwrap_or_default();

    let stdout_content = stdout_lines.join("\n");
    let stderr_content = stderr_lines.join("\n");

    if status.success() {
        Ok(VerificationResult {
            success: true,
            summary: stdout_content.trim().to_string(),
            report_path: Some(report_path.to_string_lossy().to_string()),
            json_path: Some(json_path.to_string_lossy().to_string()),
            html_path: Some(html_path.to_string_lossy().to_string()),
            error: None,
        })
    } else {
        Ok(VerificationResult {
            success: false,
            summary: stdout_content.trim().to_string(),
            report_path: None,
            json_path: None,
            html_path: None,
            error: Some(stderr_content),
        })
    }
}

#[tauri::command]
pub async fn list_reports(app_handle: AppHandle) -> Result<Vec<ReportSummary>, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let reports_dir = app_dir.join("reports");

    if !reports_dir.exists() {
        return Ok(vec![]);
    }

    let mut reports = Vec::new();

    let entries = fs::read_dir(&reports_dir)
        .map_err(|e| format!("Failed to read reports directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.extension().map_or(false, |ext| ext == "json") {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    let id = path
                        .file_stem()
                        .map(|s| s.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let repo = json["repo"].as_str().unwrap_or("unknown").to_string();
                    let milestone = json["milestone"].as_str().unwrap_or("unknown").to_string();
                    let score = json["score"].as_u64().unwrap_or(0) as u32;
                    let status = json["status"].as_str().unwrap_or("unknown").to_string();
                    let date = json["generatedAt"].as_str().unwrap_or("").to_string();

                    let md_path = path.with_extension("md");
                    let html_path = path.with_extension("html");

                    reports.push(ReportSummary {
                        id,
                        repo,
                        milestone,
                        score,
                        status,
                        date,
                        report_path: md_path.to_string_lossy().to_string(),
                        json_path: Some(path.to_string_lossy().to_string()),
                        html_path: Some(html_path.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }

    // 按时间降序排序以实现前端“最新报告优先”展示需求
    reports.sort_by(|a, b| b.date.cmp(&a.date));

    Ok(reports)
}

#[tauri::command]
pub async fn read_report(report_path: String) -> Result<String, String> {
    fs::read_to_string(&report_path).map_err(|e| format!("Failed to read report: {}", e))
}

#[tauri::command]
pub async fn read_report_json(json_path: String) -> Result<serde_json::Value, String> {
    let content =
        fs::read_to_string(&json_path).map_err(|e| format!("Failed to read JSON report: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Failed to parse JSON report: {}", e))
}

#[tauri::command]
pub async fn delete_report(
    report_path: String,
    json_path: Option<String>,
    html_path: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let reports_dir = app_dir.join("reports");

    if !reports_dir.exists() {
        return Ok(());
    }

    trash_report_file(Path::new(&report_path), &reports_dir, "markdown report")?;

    if let Some(path) = &json_path {
        trash_report_file(Path::new(path), &reports_dir, "JSON report")?;
    }

    if let Some(path) = &html_path {
        trash_report_file(Path::new(path), &reports_dir, "HTML report")?;
    }

    Ok(())
}

#[tauri::command]
pub async fn export_pdf_report(
    report_id: String,
    dest_path: String,
    app_handle: AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // 拼出本地已存在的 HTML 报告物理文件路径
    let html_path = app_dir.join("reports").join(format!("{}.html", report_id));
    if !html_path.exists() {
        return Err(format!("HTML report file not found: {:?}", html_path));
    }

    // 定位项目 src 文件夹中的 html-to-pdf.js 转换脚本路径
    let cli_path = find_cli_path(&app_handle)?;
    let root_src_dir = cli_path
        .parent()
        .ok_or("Failed to get parent dir of cli.js")?;
    let pdf_script_path = root_src_dir.join("html-to-pdf.js");

    if !pdf_script_path.exists() {
        return Err(format!(
            "PDF export script not found: {:?}",
            pdf_script_path
        ));
    }

    // 在后台异步拉起子进程：node html-to-pdf.js <html_path> <dest_path>
    let status = tokio::process::Command::new("node")
        .arg(pdf_script_path.to_string_lossy().to_string())
        .arg(html_path.to_string_lossy().to_string())
        .arg(dest_path)
        .status()
        .await
        .map_err(|e| format!("Failed to run PDF export script: {}", e))?;

    if status.success() {
        Ok(())
    } else {
        Err("PDF export script exited with error".to_string())
    }
}

/*
[For Future AI]
1. 关键设计假设：
   - 依赖本地系统环境中的 "node" 执行环境拉起 JavaScript 编写的校验脚本，故本地须装有 Node.js 环境。
   - 使用异步多任务分流广播 stdout 和 stderr，可防止长耗时任务中的日志缓存积压和前端假死。
   - `export_pdf_report` 假设在 node 的全局或者本项目依赖中装有 `playwright` 且其 Chromium 已拉取。
2. 潜在边界情况：
   - 如果用户系统没有 Node 路径或者 Playwright 缺失，会导致进程拉起失败并返回 `Failed to spawn CLI`。
   - 物理文件删除时如果文件被占用或损坏会触发 IO 异常。
   - 导出 PDF 时的目标物理路径若是系统无写权限目录（例如 macOS 根目录），子进程将返回写入失败。
*/
