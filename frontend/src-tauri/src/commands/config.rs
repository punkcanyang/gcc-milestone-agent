/*
__ai_context__
本模块负责客户端全局应用配置（例如报告存储路径、GitHub 身份 Token）的管理。
主要职能：
1. 定义全局配置数据结构 `AppConfig`，提供默认配置项。
2. 封装 `get_app_config` 命令，从物理路径 `app_data_dir/config.json` 安全加载 JSON 配置，如果不存在则自动返回默认值。
3. 封装 `save_app_config` 命令，将前端修改后的配置格式化并持久化写入 `config.json` 文件。
依赖关系：
- 依赖 `serde` 与 `serde_json` 完成序列化与反序列化。
- 依赖 `tauri::AppHandle` 及 `tauri::Manager` 计算配置文件的物理存储路径。
*/

use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager};

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
pub async fn get_app_config(app_handle: AppHandle) -> Result<AppConfig, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let config_path = app_dir.join("config.json");

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read config: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))
    } else {
        Ok(AppConfig::default())
    }
}

#[tauri::command]
pub async fn save_app_config(config: AppConfig, app_handle: AppHandle) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app directory: {}", e))?;

    let config_path = app_dir.join("config.json");
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&config_path, content).map_err(|e| format!("Failed to write config: {}", e))?;

    Ok(())
}

/*
[For Future AI]
1. 关键设计假设：
   - 配置文件存储在 Tauri 的 app_data_dir 目录下的 config.json 中。
   - 数据格式使用标准 JSON，易于手动查阅或修复损坏配置。
2. 潜在边界情况：
   - 文件写冲突：高频并发修改可能有竞争，但因为是客户端单用户交互，通常可以忽略。
   - 文件损坏：如果 JSON 格式在底层被手动改坏，读取将会报错 `Failed to parse config`，需要手动修复或删除该文件。
*/
