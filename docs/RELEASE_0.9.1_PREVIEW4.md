# AgentPlay 0.9.1 Preview 4 发布回执

已公开：[下载页](https://github.com/wg5759/AgentPlay/releases/tag/v0.9.1-preview.4)。发布时间2026-09-05T18:31:37Z（北京时间9月6日02:31）。未签名Prerelease，不是签名Stable；旧Preview3资产保留作回滚。

## 已完成

- PR44合并1b92c03，PR45合并ded8d64；发布标签绑定ded8d64543c437e3a1f69240f2f65670cf43f361。实际应用业务源码与构建基线b02fc9a无差异。
- 发布提交ded8d64及文档PR46合并后的[主线Source Quality Gate](https://github.com/wg5759/AgentPlay/actions/runs/33985313077)、[Pages](https://github.com/wg5759/AgentPlay/actions/runs/33985312609)通过；公开官网已实际回读到Preview4下载目标。开放Dependabot告警核验为0。
- 由同一标准安装器覆盖原桌面安装，386个旧安装文件逐一备份核哈希；桌面快捷方式仍指向原安装位置，模型配置哈希未变。
- 安装态原生窗口结束/关闭/重开、常驻退出、字幕修改/撤销、区间剪辑、合成文档云端只读问答与损坏任务存储下继续播放通过。
- 安装态14项音视频矩阵在完整且固定SHA验证的FFmpeg组件、原生选择授权与应用内打开条件下通过；以原生isFullscreen与影院布局回读验ESC，而不是只看测试事件变量。
- 9项发布资产均已无登录完整下载、逐字节SHA-256验证；两包解出的EXE/ASAR与桌面相同，154项打包源码核验匹配。这些维护者下载不算外部用户增长。

## 精确身份

| 对象 | SHA-256 |
| --- | --- |
| 应用ASAR | 6984572CA88DA486FA1EBAC8AA8142063BD23AEEFDECEFE3BC0932F01F0319C8 |
| 标准安装器 | F968019C6BE6DFBDBC02FD5B57BE2A1ECE3A7835B744B00CF5960290A4523720 |
| 便携ZIP | 73696C082AB05F4269C2B1A5E7A448E2E3D65FEC015C94B67AF50E93CF2FD18B |

包内含发布清单、校验和、验证报告、安全扫描、209包/292关系SPDX、终端安装脚本及安装态播放回执。安装器/应用均NotSigned；不绕过SmartScreen，不购买证书。

## 不掩盖的缺口

空白profile边下载组件边验收时观察到WMA/Opus探针超时，连续外部启动有一次超时；原因没有充分定位，不能写成已修复。已通过的14项矩阵不代表首次联网安装或14次OS二次启动全部通过。测试脚本还修正了preload等待、页面选择及全屏权威状态读取，不把脚本误报当成产品修复。

原生嵌入仅连接/几何试点，不作为默认后端；不声明DRM、损坏文件、HDR或macOS/Linux完整验收。真人创作者试用仍未开展，16条模型严格分类基线15条一致不能包装为普遍100%准确率。

维护者本地证据：release/public-verify-v0.9.1-preview.4/receipt.json、release/installed-backup-preview4-hU9inv/receipt.json、release/reliability-acceptance-d5CZhW/receipt.json、release/inline-ui-btTYMM/receipt.json、release/window-recovery-installed-preview4-20260905.json。私人配置备份、原视频及内部审查草稿不随本次发布分发。
