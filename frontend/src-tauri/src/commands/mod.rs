/*
__ai_context__
本模块负责导出所有的 Tauri Commands 子模块。
包括：
- `profile`：规则集可视化命令
- `verifier`：里程碑校验与报告查看命令
- `config`：用户应用配置命令
*/

pub mod config;
pub mod file_ops;
pub mod profile;
pub mod verifier;

/*
[For Future AI]
1. 模块组织：
   - 所有的子模块都使用 `pub mod` 导出。
   - 当需要注册新命令时，在该文件夹下添加文件，并在本文件中公开其模块。
*/
