/*
__ai_context__
本模块负责桌面客户端的规则集（Rules Profile）管理。
主要职能：
1. 定义规则集与规则条目数据模型（ProfileRule, ProfileSummary）。
2. 从物理文件目录加载内置与自定义的规则集（YAML 格式）。
3. 实现自定义规则集的可视化保存、重命名校验与物理删除（防止目录穿越与内置覆盖）。
4. 提供规则集数据结构与 YAML 纯文本的相互转换逻辑。
依赖关系：
- 依赖 `serde_yaml` 用于解析和序列化 rules 配置文件。
- 依赖 `tauri::AppHandle` 和 `tauri::Manager` 定位内置与应用专属物理目录。
*/

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

use super::file_ops::move_file_to_trash;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileRule {
    pub id: String,
    pub text: String,
    pub keywords: Vec<String>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfileSummary {
    pub name: String,
    pub is_builtin: bool,
    pub rules: Vec<ProfileRule>,
    pub file_path: Option<String>,
}

/// 辅助函数：定位内置只读规则集（gcc-allocation.yaml）的物理位置。
/// 支持开发环境（CWD/resource_dir）和生产环境（打包资源）两种路径方案的 fallback。
fn find_builtin_profile_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))?;

    let dev_path = app_dir.join("../../profiles/gcc-allocation.yaml");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    let prod_path = app_dir.join("profiles/gcc-allocation.yaml");
    if prod_path.exists() {
        return Ok(prod_path);
    }

    let cwd_path = PathBuf::from("../profiles/gcc-allocation.yaml");
    if cwd_path.exists() {
        return Ok(cwd_path
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize path: {}", e))?);
    }

    Err("Could not find builtin profile path.".to_string())
}

fn validate_profile_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let is_valid = name
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if !is_valid {
        return Err(
            "Profile name can only contain alphanumeric characters, hyphens, and underscores"
                .to_string(),
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn list_profiles(app_handle: AppHandle) -> Result<Vec<ProfileSummary>, String> {
    let mut summaries = Vec::new();

    // 1. 加载内置规则 gcc-allocation
    let mut builtin_rules = Vec::new();
    let mut builtin_loaded = false;
    let mut builtin_path_str = None;

    if let Ok(builtin_path) = find_builtin_profile_path(&app_handle) {
        builtin_path_str = Some(builtin_path.to_string_lossy().to_string());
        if let Ok(content) = fs::read_to_string(&builtin_path) {
            #[derive(Deserialize)]
            struct YamlRules {
                rules: Vec<ProfileRule>,
            }
            if let Ok(parsed) = serde_yaml::from_str::<YamlRules>(&content) {
                builtin_rules = parsed.rules;
                builtin_loaded = true;
            }
        }
    }

    // 防御性 Fallback：如果内置 YAML 加载失败，提供默认规则，保证系统能正常工作
    if !builtin_loaded {
        builtin_rules = vec![
            ProfileRule {
                id: "GCC-A1".to_string(),
                text: "Milestone scope is clearly documented".to_string(),
                keywords: vec![
                    "milestone".to_string(),
                    "scope".to_string(),
                    "deliverable".to_string(),
                    "docs".to_string(),
                ],
                source: None,
            },
            ProfileRule {
                id: "GCC-A2".to_string(),
                text: "Submission issue or discussion thread exists".to_string(),
                keywords: vec![
                    "submission".to_string(),
                    "issue".to_string(),
                    "discussion".to_string(),
                ],
                source: None,
            },
            ProfileRule {
                id: "GCC-A3".to_string(),
                text: "Work artifacts are publicly traceable".to_string(),
                keywords: vec![
                    "commit".to_string(),
                    "pr".to_string(),
                    "release".to_string(),
                    "repository".to_string(),
                ],
                source: None,
            },
            ProfileRule {
                id: "GCC-A4".to_string(),
                text: "Workflow and process transparency are described".to_string(),
                keywords: vec![
                    "workflow".to_string(),
                    "process".to_string(),
                    "transparency".to_string(),
                    "public".to_string(),
                ],
                source: None,
            },
            ProfileRule {
                id: "GCC-A5".to_string(),
                text: "Verification output includes evidence links".to_string(),
                keywords: vec![
                    "evidence".to_string(),
                    "link".to_string(),
                    "report".to_string(),
                    "verification".to_string(),
                ],
                source: None,
            },
            ProfileRule {
                id: "GCC-A6".to_string(),
                text: "CI pipeline is operational".to_string(),
                keywords: vec![
                    "ci".to_string(),
                    "workflow".to_string(),
                    "pass".to_string(),
                    "success".to_string(),
                ],
                source: Some("github-actions".to_string()),
            },
            ProfileRule {
                id: "GCC-A7".to_string(),
                text: "Project has community engagement".to_string(),
                keywords: vec![
                    "contributor".to_string(),
                    "stars".to_string(),
                    "forks".to_string(),
                    "community".to_string(),
                ],
                source: Some("github-community".to_string()),
            },
            ProfileRule {
                id: "GCC-A8".to_string(),
                text: "Package is published to registry".to_string(),
                keywords: vec![
                    "npm".to_string(),
                    "package".to_string(),
                    "publish".to_string(),
                    "registry".to_string(),
                ],
                source: Some("npm-registry".to_string()),
            },
            ProfileRule {
                id: "GCC-A9".to_string(),
                text: "External links in docs are reachable".to_string(),
                keywords: vec![
                    "url".to_string(),
                    "link".to_string(),
                    "reachable".to_string(),
                ],
                source: Some("url-checker".to_string()),
            },
            ProfileRule {
                id: "GCC-A10".to_string(),
                text: "Project has active community discussions".to_string(),
                keywords: vec![
                    "discussion".to_string(),
                    "community".to_string(),
                    "answered".to_string(),
                    "participant".to_string(),
                    "comment".to_string(),
                ],
                source: Some("github-discussions".to_string()),
            },
        ];
    }

    summaries.push(ProfileSummary {
        name: "gcc-allocation".to_string(),
        is_builtin: true,
        rules: builtin_rules,
        file_path: builtin_path_str,
    });

    // 2. 加载用户自定义规则
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let profiles_dir = app_dir.join("profiles");
    if !profiles_dir.exists() {
        fs::create_dir_all(&profiles_dir)
            .map_err(|e| format!("Failed to create profiles directory: {}", e))?;
    }

    let entries = fs::read_dir(&profiles_dir)
        .map_err(|e| format!("Failed to read profiles directory: {}", e))?;

    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            if path
                .extension()
                .map_or(false, |ext| ext == "yaml" || ext == "yml")
            {
                if let Ok(content) = fs::read_to_string(&path) {
                    #[derive(Deserialize)]
                    struct YamlRules {
                        rules: Vec<ProfileRule>,
                    }
                    if let Ok(parsed) = serde_yaml::from_str::<YamlRules>(&content) {
                        let name = path
                            .file_stem()
                            .map(|s| s.to_string_lossy().to_string())
                            .unwrap_or_default();

                        // 避免自定义命名冲突覆盖内置的只读名字
                        if name != "gcc-allocation" {
                            summaries.push(ProfileSummary {
                                name,
                                is_builtin: false,
                                rules: parsed.rules,
                                file_path: Some(path.to_string_lossy().to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    Ok(summaries)
}

#[tauri::command]
pub async fn save_profile(
    name: String,
    rules: Vec<ProfileRule>,
    app_handle: AppHandle,
) -> Result<String, String> {
    // 防御性安全过滤，防止通过 `../` 进行目录穿越物理写入
    validate_profile_name(&name)?;

    if name == "gcc-allocation" {
        return Err("Cannot overwrite default builtin profile".to_string());
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let profiles_dir = app_dir.join("profiles");
    fs::create_dir_all(&profiles_dir)
        .map_err(|e| format!("Failed to create profiles directory: {}", e))?;

    let file_path = profiles_dir.join(format!("{}.yaml", name));

    #[derive(Serialize)]
    struct YamlRules {
        rules: Vec<ProfileRule>,
    }

    let yaml_payload = YamlRules { rules };
    let yaml_content = serde_yaml::to_string(&yaml_payload)
        .map_err(|e| format!("Failed to serialize rules to YAML: {}", e))?;

    fs::write(&file_path, yaml_content)
        .map_err(|e| format!("Failed to write profile file: {}", e))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn delete_profile(name: String, app_handle: AppHandle) -> Result<(), String> {
    // 删除也必须执行同一套名称校验，避免通过 `../` 指向 profiles 目录外的实体文件
    validate_profile_name(&name)?;

    if name == "gcc-allocation" {
        return Err("Cannot delete default builtin profile".to_string());
    }

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let file_path = app_dir.join("profiles").join(format!("{}.yaml", name));
    move_file_to_trash(&file_path, "profile file")?;

    Ok(())
}

#[tauri::command]
pub fn rules_to_yaml(rules: Vec<ProfileRule>) -> Result<String, String> {
    #[derive(Serialize)]
    struct YamlPayload {
        rules: Vec<ProfileRule>,
    }
    serde_yaml::to_string(&YamlPayload { rules })
        .map_err(|e| format!("Failed to serialize rules to YAML: {}", e))
}

#[tauri::command]
pub fn yaml_to_rules(yaml: String) -> Result<Vec<ProfileRule>, String> {
    #[derive(Deserialize)]
    struct YamlPayload {
        rules: Vec<ProfileRule>,
    }
    let parsed: YamlPayload =
        serde_yaml::from_str(&yaml).map_err(|e| format!("Failed to parse YAML: {}", e))?;
    Ok(parsed.rules)
}

/*
[For Future AI]
1. 关键设计假设：
   - 规则文件以 YAML 编码存储在本地磁盘。自定义文件的加载机制通过磁盘文件扫描获取。
   - 文件名安全校验在 Rust 后端拦截以解决安全漏洞风险。
2. 潜在边界情况：
   - 文件加载错误或者 YAML 语法错误会导致该条规则集在列表中被自动跳过（非阻塞性）。
   - 内置规则集即使 YAML 解析失败，也保证有一份硬编码 Fallback，从而不破坏前端的初次可用状态。
*/
