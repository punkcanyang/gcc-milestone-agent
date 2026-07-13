/*
__ai_context__
本模块作为桌面端的主入口，负责 Tauri 应用的初始化、状态生命周期绑定与 IPC 命令分发注册。
主要职能：
1. 引导 Tauri Builder 的生命周期。
2. 在应用启动 `setup` 时调用 `db::init_db` 构建数据库 Schema，并使用 `DbState` 管理 SQLite 全局连接。
3. 作为根路由声明并集成 `db` 与 `commands` 两大解耦模块。
4. 汇总注册所有暴露给前端 React 的 Tauri Command 接口。
*/

use std::fs;
use tauri::Manager;

mod commands;
mod db;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to GCC Milestone Agent.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // 获取并创建客户端 AppData 物理工作目录
            let app_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            fs::create_dir_all(&app_dir)
                .map_err(|e| format!("Failed to create app directory: {}", e))?;

            // 初始化 SQLite 数据库，显式建立数据表
            let db_path = app_dir.join("milestones.db");
            let conn = rusqlite::Connection::open(&db_path)
                .map_err(|e| format!("Failed to open database: {}", e))?;

            db::init_db(&conn)?;

            // 将包含互斥锁保护的数据库连接挂载为 Tauri 共享状态
            app.manage(db::DbState(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::verifier::run_verification,
            commands::verifier::list_reports,
            commands::verifier::read_report,
            commands::verifier::read_report_json,
            commands::verifier::delete_report,
            commands::verifier::export_pdf_report,
            commands::config::get_app_config,
            commands::config::save_app_config,
            db::create_project,
            db::list_projects,
            db::delete_project,
            db::save_run_result,
            db::get_project_runs,
            db::backup_database,
            db::restore_database,
            commands::profile::list_profiles,
            commands::profile::save_profile,
            commands::profile::delete_profile,
            commands::profile::rules_to_yaml,
            commands::profile::yaml_to_rules,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/*
[For Future AI]
1. 关键设计假设：
   - 所有的功能指令（除了通用的 greet 外）已经完全被拆分至 db.rs 和 commands 子模块中。
   - `lib.rs` 的职责只局限在入口注册与 Tauri App Context 级别初始化。
2. 依赖项：
   - 依赖本地 Tauri 插件：tauri_plugin_shell, tauri_plugin_fs, tauri_plugin_dialog。
   - 数据库初始化必须在 app.manage 全局状态挂载之前运行，以避免空数据库句柄被其他进程提前获取。
*/
