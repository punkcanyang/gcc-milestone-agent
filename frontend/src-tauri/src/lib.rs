use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VerificationRequest {
    pub repo: String,
    pub milestone: String,
    pub since: Option<String>,
    pub profile: Option<String>,
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
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub reports_dir: String,
    pub github_token: Option<String>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            reports_dir: "reports".to_string(),
            github_token: None,
        }
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to GCC Milestone Agent.", name)
}

#[tauri::command]
async fn run_verification(
    request: VerificationRequest,
    app_handle: tauri::AppHandle,
) -> Result<VerificationResult, String> {
    // Get the app data directory for storing reports
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Create reports directory
    let reports_dir = app_dir.join("reports");
    fs::create_dir_all(&reports_dir)
        .map_err(|e| format!("Failed to create reports directory: {}", e))?;

    // Generate unique filenames
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
    let safe_repo = request.repo.replace("/", "_");
    let report_name = format!("{}_{}", safe_repo, timestamp);

    let report_path = reports_dir.join(format!("{}.md", report_name));
    let json_path = reports_dir.join(format!("{}.json", report_name));
    let html_path = reports_dir.join(format!("{}.html", report_name));

    // Find the CLI script path
    let cli_path = find_cli_path(&app_handle)?;

    // Build the command arguments
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

    if let Some(providers) = &request.providers {
        if !providers.is_empty() {
            args.push("--providers".to_string());
            args.push(providers.clone());
        }
    }

    // Execute the CLI command
    let output = Command::new("node")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute CLI: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if output.status.success() {
        Ok(VerificationResult {
            success: true,
            summary: stdout.trim().to_string(),
            report_path: Some(report_path.to_string_lossy().to_string()),
            json_path: Some(json_path.to_string_lossy().to_string()),
            html_path: Some(html_path.to_string_lossy().to_string()),
            error: None,
        })
    } else {
        Ok(VerificationResult {
            success: false,
            summary: stdout.trim().to_string(),
            report_path: None,
            json_path: None,
            html_path: None,
            error: Some(stderr),
        })
    }
}

#[tauri::command]
async fn list_reports(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ReportSummary>, String> {
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
                    let date = json["generatedAt"]
                        .as_str()
                        .unwrap_or("")
                        .to_string();

                    let md_path = path.with_extension("md");

                    reports.push(ReportSummary {
                        id,
                        repo,
                        milestone,
                        score,
                        status,
                        date,
                        report_path: md_path.to_string_lossy().to_string(),
                        json_path: Some(path.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }

    // Sort by date descending
    reports.sort_by(|a, b| b.date.cmp(&a.date));

    Ok(reports)
}

#[tauri::command]
async fn read_report(
    report_path: String,
) -> Result<String, String> {
    fs::read_to_string(&report_path)
        .map_err(|e| format!("Failed to read report: {}", e))
}

#[tauri::command]
async fn read_report_json(
    json_path: String,
) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read JSON report: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON report: {}", e))
}

#[tauri::command]
async fn delete_report(
    report_path: String,
    json_path: Option<String>,
    html_path: Option<String>,
) -> Result<(), String> {
    if std::path::Path::new(&report_path).exists() {
        fs::remove_file(&report_path)
            .map_err(|e| format!("Failed to delete report: {}", e))?;
    }

    if let Some(path) = &json_path {
        if std::path::Path::new(path).exists() {
            fs::remove_file(path)
                .map_err(|e| format!("Failed to delete JSON report: {}", e))?;
        }
    }

    if let Some(path) = &html_path {
        if std::path::Path::new(path).exists() {
            fs::remove_file(path)
                .map_err(|e| format!("Failed to delete HTML report: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
async fn get_app_config(
    app_handle: tauri::AppHandle,
) -> Result<AppConfig, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let config_path = app_dir.join("config.json");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        Ok(AppConfig::default())
    }
}

#[tauri::command]
async fn save_app_config(
    config: AppConfig,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app directory: {}", e))?;

    let config_path = app_dir.join("config.json");
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

fn find_cli_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Try to find the CLI script relative to the app
    let app_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    // In development, the CLI is at ../../src/cli.js relative to the frontend
    let dev_path = app_dir.join("../../src/cli.js");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    // In production, the CLI might be bundled
    let prod_path = app_dir.join("src/cli.js");
    if prod_path.exists() {
        return Ok(prod_path);
    }

    // Fallback: try to find it in the current directory
    let cwd_path = PathBuf::from("../src/cli.js");
    if cwd_path.exists() {
        return Ok(cwd_path.canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?);
    }

    Err("Could not find CLI script. Make sure the project structure is correct.".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            run_verification,
            list_reports,
            read_report,
            read_report_json,
            delete_report,
            get_app_config,
            save_app_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
