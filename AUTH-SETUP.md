# Google 登录与进度同步

Firebase 项目 `northward-dea1f` 已创建，使用 Spark 免费方案。Google 登录已启用，GitHub Pages 域名已授权，Firestore 标准版默认数据库位于 `asia-east2`，账户隔离规则已发布。Google 登录与进度同步已通过正式域名验收。

## 项目配置步骤

1. 在 Firebase Console 创建 Northward 项目。首次使用需要账号持有人确认 Firebase 服务条款。无需启用 Google Analytics 或 Google 开发者计划。
2. Authentication → Sign-in method → 启用 Google，选择项目支持邮箱。
3. Authentication → Settings → Authorized domains → 添加 `imuxlucas.github.io`。本地测试可添加 `localhost`，不要把 URL 路径加入域名。
4. 创建 Cloud Firestore 默认数据库，使用生产模式。部署本仓库 `firestore.rules`，不可使用允许任何人访问的规则。
5. 项目设置 → 添加 Web app → 将公开 Web 配置填入 `firebase-config.js`。不要填写 OAuth client secret、服务账号 JSON 或私钥。
6. 验证真实登录、退出、跨设备恢复和已读撤销；合并功能分支后由 GitHub Pages 发布。

## 数据范围

云端路径为 `users/{uid}/learning/week-one`。只允许所属用户读写，允许的字段为 `read`（1–7 的布尔标记）、`last`（1–7）和服务端 `updatedAt`。不存在公开集合查询或管理接口。

阅读笔记始终留在本机，按账号分别保存。游客继续使用旧键 `northward-week-one-v1`，登录用户使用 `northward-account-v1:{uid}`。不会自动把游客笔记或其他账号的记录上传。菜单中的“合并本机已读进度”仅添加游客已读标记，不复制笔记。

未确认的修改在对应账号的 localStorage 队列中保留，登录并连接服务器后重试。不同章节用合并写入避免互相覆盖；同一章节的并发修改以服务器最后接受的写入为准。退出不会将账号数据混入游客记录。

## 验证

- `npm test`：旧数据迁移、账号隔离、离线撤销、重复操作、迟到的确认、上传字段和存储故障。
- `npm run test:rules`：Firestore 本地模拟器验证本人访问、拒绝游客/他人访问、拒绝笔记和非法字段。
- 模拟器项目始终使用 `demo-northward`，不连接正式云端数据。
- Firebase CLI 13.35.1 仅用于兼容本机 Java 17 的模拟器测试；生产浏览器使用 Firebase Web SDK 13.2.0。依赖不进入网页运行时。
- Firebase SDK 和测试库推荐 Node >= 24.12；本机 Node 22.22.2 下当前测试也通过。

已使用 Google 账号在 GitHub Pages 正式网站完成登录、进度写入，并在独立来源的浏览器存储中恢复进度；撤销已读双向同步通过。登录账号选择按用户节奏等待，关闭弹窗后可重试。

Google OAuth 网页客户端授权来源包含正式网站 `https://imuxlucas.github.io` 和本地开发 `http://localhost:8766`。实际认证使用 Firebase 官方 `signInWithPopup`，前端不保存 OAuth 客户端密钥。
