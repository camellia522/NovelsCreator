import pkg from '../../package.json'

/** 产品名称（固定） */
export const APP_NAME = 'NovelsCreator'

/** 开发者 / 版权署名（发布与关于页展示） */
export const APP_AUTHOR = 'camellia522'

/** 开发者 GitHub 主页 */
export const APP_GITHUB_URL = 'https://github.com/camellia522'

/** 版权行（安装包 metadata 请与 package.json build.copyright 保持一致） */
export const APP_COPYRIGHT = `Copyright © 2026 ${APP_AUTHOR}`

/** 语义化版本，与 package.json 同步，迭代时只改 package.json */
export const APP_VERSION = pkg.version

/** 窗口标题 / 品牌展示：NovelsCreator v0.2.0 */
export const APP_TITLE = `${APP_NAME} v${APP_VERSION}`

/**
 * 当前里程碑：0.2.0
 * - 知识库 / 大纲 / 章节 / 社会层 Dify 客户端闭环
 * - 设置（外观 / Dify / 工作区）、主题与 Monaco
 * - 备份管理、线条图标、E2E 脚本
 */
