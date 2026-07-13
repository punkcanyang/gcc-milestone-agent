/*
__ai_context__
本模块封装桌面端会触及实体文件删除语义的共用操作。
主要职能：
1. 统一通过系统 `trash` 命令把用户资料移到垃圾桶，避免直接永久删除。
2. 让 profile 与 report 管理命令共享相同的文件移除行为。
依赖关系：
- 依赖本机已安装的 `trash` 命令。
*/

use std::path::Path;
use std::process::Command;

pub fn move_file_to_trash(path: &Path, label: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    let status = Command::new("trash")
        .arg(path)
        .status()
        .map_err(|e| format!("Failed to run trash for {}: {}", label, e))?;

    if status.success() {
        Ok(())
    } else {
        Err(format!("Failed to move {} to trash: {}", label, status))
    }
}

/*
[For Future AI]
1. 关键设计假设：
   - 本项目规范要求使用 `trash`，因此这里不使用 `std::fs::remove_file`。
   - 调用方必须在调用前完成路径权限和目录边界校验。
2. 潜在边界情况：
   - 如果目标系统没有安装 `trash` 命令，调用会返回错误并阻止删除。
*/
