use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tauri::{Manager, Emitter};

#[derive(Clone, Serialize)]
struct LogPayload {
    stream: String,
    line: String,
}


/*
__ai_context__
本模块负责 Tauri 桌面端的核心 IPC 通道。
为支持 v0.6.0 前端产品形态的本地项目管理与历史校验趋势，本模块内置了对 SQLite 本地数据库的操作。
采用 rusqlite 库，在 app_data_dir/milestones.db 初始化三张表：projects、milestone_phases、verification_runs。
采用“单一存取通道原则”，所有数据库 CRUD 操作完全在此处执行，通过 Tauri Command 向前端 React 暴露。
*/

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: Option<i64>,
    pub repo: String,
    pub name: String,
    pub description: String,
    pub config_yaml: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MilestonePhase {
    pub id: Option<i64>,
    pub project_id: i64,
    pub phase_id: String,
    pub title: String,
    pub depends_on: String, // JSON array string
    pub rules_profile: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectWithPhases {
    pub project: Project,
    pub phases: Vec<MilestonePhase>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VerificationRun {
    pub id: Option<i64>,
    pub project_id: i64,
    pub phase_id: Option<String>,
    pub status: String,
    pub score: i32,
    pub rule_pass_rate: i32,
    pub commits_count: i32,
    pub pulls_count: i32,
    pub issues_count: i32,
    pub releases_count: i32,
    pub stars: Option<i32>,
    pub forks: Option<i32>,
    pub contributors: Option<i32>,
    pub json_path: String,
    pub html_path: String,
    pub markdown_path: String,
    pub error_message: Option<String>,
    pub generated_at: String,
}

pub struct DbState(pub std::sync::Mutex<rusqlite::Connection>);

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

    // Execute the CLI command asynchronously
    let mut child = tokio::process::Command::new("node")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn CLI: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let app_handle_stdout = app_handle.clone();
    let stdout_task: tauri::async_runtime::JoinHandle<Vec<String>> = tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        let mut accum = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let line_str: String = line;
            let _ = app_handle_stdout.emit("verification-log", LogPayload {
                stream: "stdout".to_string(),
                line: line_str.clone(),
            });
            accum.push(line_str);
        }
        accum
    });

    let app_handle_stderr = app_handle.clone();
    let stderr_task: tauri::async_runtime::JoinHandle<Vec<String>> = tauri::async_runtime::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        let mut accum = Vec::new();
        while let Ok(Some(line)) = reader.next_line().await {
            let line_str: String = line;
            let _ = app_handle_stderr.emit("verification-log", LogPayload {
                stream: "stderr".to_string(),
                line: line_str.clone(),
            });
            accum.push(line_str);
        }
        accum
    });

    let status = child.wait().await.map_err(|e| format!("Failed to wait for CLI: {}", e))?;

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

fn init_db(conn: &rusqlite::Connection) -> Result<(), String> {
    // 启用外键支持
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            config_yaml TEXT NOT NULL,
            created_at TEXT NOT NULL
        )",
        [],
    ).map_err(|e| format!("Failed to create projects table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS milestone_phases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            phase_id TEXT NOT NULL,
            title TEXT NOT NULL,
            depends_on TEXT NOT NULL,
            rules_profile TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
            UNIQUE(project_id, phase_id)
        )",
        [],
    ).map_err(|e| format!("Failed to create milestone_phases table: {}", e))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS verification_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            phase_id TEXT,
            status TEXT NOT NULL,
            score INTEGER NOT NULL,
            rule_pass_rate INTEGER NOT NULL,
            commits_count INTEGER NOT NULL,
            pulls_count INTEGER NOT NULL,
            issues_count INTEGER NOT NULL,
            releases_count INTEGER NOT NULL,
            stars INTEGER,
            forks INTEGER,
            contributors INTEGER,
            json_path TEXT NOT NULL,
            html_path TEXT NOT NULL,
            markdown_path TEXT NOT NULL,
            error_message TEXT,
            generated_at TEXT NOT NULL,
            FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
        )",
        [],
    ).map_err(|e| format!("Failed to create verification_runs table: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn create_project(
    project: Project,
    phases: Vec<MilestonePhase>,
    db: tauri::State<'_, DbState>,
) -> Result<i64, String> {
    let mut conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    // 开启事务以保证 ACID
    let tx = conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;
    
    tx.execute(
        "INSERT INTO projects (repo, name, description, config_yaml, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &project.repo,
            &project.name,
            &project.description,
            &project.config_yaml,
            chrono::Utc::now().to_rfc3339(),
        ),
    ).map_err(|e| format!("Failed to insert project: {}", e))?;
    
    let project_id = tx.last_insert_rowid();
    
    for phase in phases {
        tx.execute(
            "INSERT INTO milestone_phases (project_id, phase_id, title, depends_on, rules_profile, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            (
                project_id,
                &phase.phase_id,
                &phase.title,
                &phase.depends_on,
                &phase.rules_profile,
                chrono::Utc::now().to_rfc3339(),
            ),
        ).map_err(|e| format!("Failed to insert phase {}: {}", phase.phase_id, e))?;
    }
    
    tx.commit().map_err(|e| format!("Commit error: {}", e))?;
    Ok(project_id)
}

#[tauri::command]
async fn list_projects(
    db: tauri::State<'_, DbState>,
) -> Result<Vec<ProjectWithPhases>, String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    let mut stmt = conn
        .prepare("SELECT id, repo, name, description, config_yaml, created_at FROM projects ORDER BY id DESC")
        .map_err(|e| format!("Prepare error: {}", e))?;
        
    let project_rows = stmt.query_map([], |row| {
        Ok(Project {
            id: Some(row.get(0)?),
            repo: row.get(1)?,
            name: row.get(2)?,
            description: row.get(3)?,
            config_yaml: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| format!("Query error: {}", e))?;
    
    let mut result = Vec::new();
    for proj_res in project_rows {
        let proj = proj_res.map_err(|e| format!("Row error: {}", e))?;
        let proj_id = proj.id.unwrap_or_default();
        
        let mut p_stmt = conn
            .prepare("SELECT id, project_id, phase_id, title, depends_on, rules_profile, created_at FROM milestone_phases WHERE project_id = ?1 ORDER BY id ASC")
            .map_err(|e| format!("Prepare phase error: {}", e))?;
            
        let phase_rows = p_stmt.query_map([proj_id], |row| {
            Ok(MilestonePhase {
                id: Some(row.get(0)?),
                project_id: row.get(1)?,
                phase_id: row.get(2)?,
                title: row.get(3)?,
                depends_on: row.get(4)?,
                rules_profile: row.get(5)?,
                created_at: row.get(6)?,
            })
        }).map_err(|e| format!("Query phase error: {}", e))?;
        
        let mut phases = Vec::new();
        for p_res in phase_rows {
            phases.push(p_res.map_err(|e| format!("Phase row error: {}", e))?);
        }
        
        result.push(ProjectWithPhases { project: proj, phases });
    }
    
    Ok(result)
}

#[tauri::command]
async fn delete_project(
    id: i64,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    // SQLite 外键默认关闭，需要显式开启以启用 CASCADE
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;
        
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn save_run_result(
    project_id: i64,
    phase_id: Option<String>,
    json_path: String,
    html_path: String,
    markdown_path: String,
    db: tauri::State<'_, DbState>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    let json_content = fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read JSON report: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&json_content)
        .map_err(|e| format!("Failed to parse JSON report: {}", e))?;
        
    let status = json["status"].as_str().unwrap_or("failed").to_string();
    let score = json["score"].as_i64().unwrap_or(0) as i32;
    let rule_pass_rate = json["rulePassRate"].as_i64().unwrap_or(0) as i32;
    
    let evidence_counts = &json["evidenceCounts"];
    let commits_count = evidence_counts["commits"].as_i64().unwrap_or(0) as i32;
    let pulls_count = evidence_counts["pulls"].as_i64().unwrap_or(0) as i32;
    let issues_count = evidence_counts["issues"].as_i64().unwrap_or(0) as i32;
    let releases_count = evidence_counts["releases"].as_i64().unwrap_or(0) as i32;
    
    let community = &json["communityHealth"];
    let stars = community["stars"].as_i64().map(|n| n as i32);
    let forks = community["forks"].as_i64().map(|n| n as i32);
    let contributors = community["contributors"].as_i64().map(|n| n as i32);
    
    let generated_at = json["generatedAt"].as_str()
        .unwrap_or("")
        .to_string();
        
    conn.execute(
        "INSERT INTO verification_runs (
            project_id, phase_id, status, score, rule_pass_rate,
            commits_count, pulls_count, issues_count, releases_count,
            stars, forks, contributors, json_path, html_path, markdown_path,
            generated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)",
        (
            project_id,
            &phase_id,
            &status,
            score,
            rule_pass_rate,
            commits_count,
            pulls_count,
            issues_count,
            releases_count,
            stars,
            forks,
            contributors,
            &json_path,
            &html_path,
            &markdown_path,
            &generated_at,
        ),
    ).map_err(|e| format!("Failed to insert verification run: {}", e))?;
    
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
async fn get_project_runs(
    project_id: i64,
    db: tauri::State<'_, DbState>,
) -> Result<Vec<VerificationRun>, String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    
    let mut stmt = conn
        .prepare("SELECT id, project_id, phase_id, status, score, rule_pass_rate, commits_count, pulls_count, issues_count, releases_count, stars, forks, contributors, json_path, html_path, markdown_path, error_message, generated_at FROM verification_runs WHERE project_id = ?1 ORDER BY id DESC")
        .map_err(|e| format!("Prepare runs error: {}", e))?;
        
    let run_rows = stmt.query_map([project_id], |row| {
        Ok(VerificationRun {
            id: Some(row.get(0)?),
            project_id: row.get(1)?,
            phase_id: row.get(2)?,
            status: row.get(3)?,
            score: row.get(4)?,
            rule_pass_rate: row.get(5)?,
            commits_count: row.get(6)?,
            pulls_count: row.get(7)?,
            issues_count: row.get(8)?,
            releases_count: row.get(9)?,
            stars: row.get(10)?,
            forks: row.get(11)?,
            contributors: row.get(12)?,
            json_path: row.get(13)?,
            html_path: row.get(14)?,
            markdown_path: row.get(15)?,
            error_message: row.get(16)?,
            generated_at: row.get(17)?,
        })
    }).map_err(|e| format!("Query runs error: {}", e))?;
    
    let mut runs = Vec::new();
    for r_res in run_rows {
        runs.push(r_res.map_err(|e| format!("Run row error: {}", e))?);
    }
    
    Ok(runs)
}

#[tauri::command]
async fn backup_database(
    dest_path: String,
    app_handle: tauri::AppHandle,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let _lock = db.0.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        
    let db_path = app_dir.join("milestones.db");
    if !db_path.exists() {
        return Err("Database file does not exist".to_string());
    }
    
    fs::copy(&db_path, &dest_path)
        .map_err(|e| format!("Failed to copy backup file: {}", e))?;
        
    Ok(())
}

#[tauri::command]
async fn restore_database(
    src_path: String,
    app_handle: tauri::AppHandle,
    db: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let mut conn_guard = db.0.lock().map_err(|e| format!("Database lock error: {}", e))?;
    
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
        
    let db_path = app_dir.join("milestones.db");
    
    // 1. Temporarily replace with an in-memory connection to drop the file lock
    let mem_conn = rusqlite::Connection::open_in_memory()
        .map_err(|e| format!("Failed to open memory database: {}", e))?;
        
    *conn_guard = mem_conn;
    
    // 2. Safely copy the backup file over the active DB file
    fs::copy(&src_path, &db_path)
        .map_err(|e| format!("Failed to copy source backup file: {}", e))?;
        
    // 3. Re-open the restored database file
    let new_conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Failed to reopen database: {}", e))?;
        
    new_conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;
        
    *conn_guard = new_conn;
    
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
        .setup(|app| {
            let app_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            fs::create_dir_all(&app_dir)
                .map_err(|e| format!("Failed to create app directory: {}", e))?;
            
            let db_path = app_dir.join("milestones.db");
            let conn = rusqlite::Connection::open(&db_path)
                .map_err(|e| format!("Failed to open database: {}", e))?;
                
            init_db(&conn)?;
            
            app.manage(DbState(std::sync::Mutex::new(conn)));
            Ok(())
        })
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
            create_project,
            list_projects,
            delete_project,
            save_run_result,
            get_project_runs,
            backup_database,
            restore_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

