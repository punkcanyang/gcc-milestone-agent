/*
__ai_context__
本模块作为独立的数据库子模块，负责管理 GCC Milestone Agent 桌面端本地 SQLite 数据库。
主要职能：
1. 定义持久化数据模型（Project, MilestonePhase, ProjectWithPhases, VerificationRun）。
2. 提供全局数据库状态持有者 `DbState` 以供 Tauri 状态生命周期管理。
3. 执行数据库表初始化与 Schema 管理（外键约束）。
4. 承载所有直接与数据库交互的 IPC Commands（CRUD、备份及还原操作）。
依赖关系：
- 依赖 `rusqlite` 实现 SQLite 操作。
- 依赖 `tauri::State` 进行并发锁共享。
- 依赖 `tauri::Manager` 访问应用路径目录（如 AppDataDir）。
*/

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{Manager, State};

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

pub struct DbState(pub std::sync::Mutex<Connection>);

pub fn init_db(conn: &Connection) -> Result<(), String> {
    // 显式开启外键约束，以确保 CASCADE 删除项目时，其关联的阶段与运行记录也被级联清空
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    // 初始化项目表
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
    )
    .map_err(|e| format!("Failed to create projects table: {}", e))?;

    // 初始化里程碑阶段表
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
    )
    .map_err(|e| format!("Failed to create milestone_phases table: {}", e))?;

    // 初始化历史校验记录表
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
    )
    .map_err(|e| format!("Failed to create verification_runs table: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn create_project(
    project: Project,
    phases: Vec<MilestonePhase>,
    db: State<'_, DbState>,
) -> Result<i64, String> {
    let mut conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    // 使用事务保证项目与阶段信息的原子写入
    let tx = conn
        .transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

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
    )
    .map_err(|e| format!("Failed to insert project: {}", e))?;

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
pub async fn list_projects(db: State<'_, DbState>) -> Result<Vec<ProjectWithPhases>, String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, repo, name, description, config_yaml, created_at FROM projects ORDER BY id DESC")
        .map_err(|e| format!("Prepare error: {}", e))?;

    let project_rows = stmt
        .query_map([], |row| {
            Ok(Project {
                id: Some(row.get(0)?),
                repo: row.get(1)?,
                name: row.get(2)?,
                description: row.get(3)?,
                config_yaml: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?;

    let mut result = Vec::new();
    for proj_res in project_rows {
        let proj = proj_res.map_err(|e| format!("Row error: {}", e))?;
        let proj_id = proj.id.unwrap_or_default();

        let mut p_stmt = conn
            .prepare("SELECT id, project_id, phase_id, title, depends_on, rules_profile, created_at FROM milestone_phases WHERE project_id = ?1 ORDER BY id ASC")
            .map_err(|e| format!("Prepare phase error: {}", e))?;

        let phase_rows = p_stmt
            .query_map([proj_id], |row| {
                Ok(MilestonePhase {
                    id: Some(row.get(0)?),
                    project_id: row.get(1)?,
                    phase_id: row.get(2)?,
                    title: row.get(3)?,
                    depends_on: row.get(4)?,
                    rules_profile: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Query phase error: {}", e))?;

        let mut phases = Vec::new();
        for p_res in phase_rows {
            phases.push(p_res.map_err(|e| format!("Phase row error: {}", e))?);
        }

        result.push(ProjectWithPhases {
            project: proj,
            phases,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn delete_project(id: i64, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    // SQLite 外键约束在此连接级别开启，以便级联删除关联的 phases 与 runs 记录
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    conn.execute("DELETE FROM projects WHERE id = ?1", [id])
        .map_err(|e| format!("Delete error: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn save_run_result(
    project_id: i64,
    phase_id: Option<String>,
    json_path: String,
    html_path: String,
    markdown_path: String,
    db: State<'_, DbState>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let json_content =
        fs::read_to_string(&json_path).map_err(|e| format!("Failed to read JSON report: {}", e))?;
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

    let generated_at = json["generatedAt"].as_str().unwrap_or("").to_string();

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
    )
    .map_err(|e| format!("Failed to insert verification run: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub async fn get_project_runs(
    project_id: i64,
    db: State<'_, DbState>,
) -> Result<Vec<VerificationRun>, String> {
    let conn = db.0.lock().map_err(|e| format!("Lock error: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT id, project_id, phase_id, status, score, rule_pass_rate, commits_count, pulls_count, issues_count, releases_count, stars, forks, contributors, json_path, html_path, markdown_path, error_message, generated_at FROM verification_runs WHERE project_id = ?1 ORDER BY id DESC")
        .map_err(|e| format!("Prepare runs error: {}", e))?;

    let run_rows = stmt
        .query_map([project_id], |row| {
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
        })
        .map_err(|e| format!("Query runs error: {}", e))?;

    let mut runs = Vec::new();
    for r_res in run_rows {
        runs.push(r_res.map_err(|e| format!("Run row error: {}", e))?);
    }

    Ok(runs)
}

#[tauri::command]
pub async fn backup_database(
    dest_path: String,
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let _lock =
        db.0.lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let db_path = app_dir.join("milestones.db");
    if !db_path.exists() {
        return Err("Database file does not exist".to_string());
    }

    fs::copy(&db_path, &dest_path).map_err(|e| format!("Failed to copy backup file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn restore_database(
    src_path: String,
    app_handle: tauri::AppHandle,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let mut conn_guard =
        db.0.lock()
            .map_err(|e| format!("Database lock error: {}", e))?;

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let db_path = app_dir.join("milestones.db");

    // 1. 临时开启一个内存连接来替换锁，从而释放被占用中的数据库文件锁句柄
    let mem_conn = Connection::open_in_memory()
        .map_err(|e| format!("Failed to open memory database: {}", e))?;

    *conn_guard = mem_conn;

    // 2. 将备份文件安全复制并覆盖当前处于闲置的数据库文件
    fs::copy(&src_path, &db_path)
        .map_err(|e| format!("Failed to copy source backup file: {}", e))?;

    // 3. 重新打开已恢复好的物理文件数据库连接
    let new_conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to reopen database: {}", e))?;

    new_conn
        .execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

    *conn_guard = new_conn;

    Ok(())
}

/*
[For Future AI]
1. 关键设计假设：
   - 使用 Mutex 互斥锁确保单线程对 SQLite 进行同步写。
   - PRAGMA foreign_keys = ON 必须显式在每次数据库连接打开或还原重新加载后手动配置，SQLite 本身默认关闭此配置。
2. 潜在边界情况：
   - 数据库文件损坏或没有 write 权限时，还原与写入将失败。
   - `restore_database` 释放锁的步骤至关重要。如果不替换成内存库，文件覆盖操作将会由于资源占用 (Permission Denied / Busy) 而在 Windows 或某些 macOS 锁控制下失败。
3. 外部依赖项：
   - 依赖 `tauri::Manager` 接口获取 CWD/AppData 绝对路径。
*/
