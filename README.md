# 移除 uview-plus 官方文档网站广告与反调试

一个 Tampermonkey 油猴脚本，用于屏蔽 uview-plus 官方文档网站 的扫码弹窗广告、Google AdSense 全屏插页广告、反广告拦截横幅，并解除该站点的开发者工具检测（F12 白屏）。
功能
模块	作用
免广告状态伪造	预置 adExpire3 / adExpire2 / vipNoGoogleAdsExpire，让站点前端判定为已付费用户
广告接口劫持	拦截 fetch / axios.post 中指向 uiadmin.net/api/v1/wxapp/ad 的请求，返回伪造的会员响应
扫码弹窗屏蔽	隐藏 .uv-ad-shell / .uv-ad-panel，仅隐藏不删除，规避站点的 DOM 自愈检测
反检测欺骗	注入屏幕外的假弹窗节点（#pleasePrNotCrack、.v-modal、.el-dialog__wrapper），并拦截 documentElement.style.opacity = 0 的整页惩罚
Google Vignette 屏蔽	清理挂在 <html> 直接子级的 ins.adsbygoogle、aswift_* iframe
Funding Choices 横幅屏蔽	隐藏底部反广告拦截提示条
侧栏卡片广告隐藏	隐藏 .jump-linker
反调试解除	解除 disable-devtool 的 F12 白屏、rewriteHTML: "" 清空页面、window.close() 自关
F12 / 右键恢复	仅拦截 console.clear（不影响 DevTools 控制台），捕获阶段放行右键与键盘事件


安装
1. 安装浏览器扩展 Tampermonkey
2. 新建脚本，粘贴脚本全部内容，保存
3. 刷新 uview-plus 官方文档网站
原理
站点共有三层广告与保护机制，脚本分别对应处理：
第一层，业务层。 每个页面 footer 挂载一个 Vue组件，组件 mounted() 后延迟 1 秒执行 checkVip()，读取 localStorage.adExpire3 判断是否展示弹窗。校验规则为 now < t <= now + 43200，超出12 小时窗口会被判定为伪造值。脚本持续写入一个合法窗口内的值，并每 30 秒续期，使弹窗根本不会进入创建流程。
第二层，检测层。 站点发现弹窗 DOM 被移除后，会重新插入或将整个页面 opacity 设为 0。脚本改为「只隐藏不删除」，并注入屏幕外的同 id / 同 class 假节点，同时给 opacity 的 setter 加过滤，让站点的自愈逻辑判定弹窗仍然存在。
第三层，广告层。 Google AdSense 的 Vignette 全屏广告与 Vue 弹窗无关，由 AdSense 脚本直接注入到 <html> 子级，携带 inline !important。这类样式无法用普通 CSS 覆盖，脚本改用 style.setProperty(..., 'important') 在 JS 侧强制覆写，并用 MutationObserver（挂在 documentElement）+ 1 秒轮询持续清理，因为该广告会被周期性重新注入。
反调试部分。 站点在 2.9defb9cb.js 中使用 disable-devtool v0.3.9，开启 clearLog 和 disableMenu，检测到调试器时执行 document.documentElement.innerHTML = ""，这就是 F12 白屏的原因。脚本通过三个手段解除：覆盖 console.clear 为空函数、持续设置 DisableDevtool.isSuspend = true、在 Element.prototype.innerHTML 的 setter 中丢弃空字符串赋值。
配置
修改脚本头部元信息即可：
// @name         移除 uview-plus 官方文档网站广告与反调试
// @namespace    https://github.com/<你的用户名>/uview-plus-no-ad
// @version      3.1.0
// @description  屏蔽 uview-plus 官方文档网站广告与反调试
// @author       <你的用户名>
// @match        https://uview-plus.jiangruyi.com/*
// @run-at       document-start
已知限制
- 站点构建产物更新后，uv-ad-* 类名与混淆后的接口路径可能变化，脚本需同步更新选择器与 AD_API_PATTERN
- 广告接口路径 uiadmin.net/api/v1/wxapp/ad 若改为 GraphQL 或其他形式，接口劫持会失效，但 localStorage 伪装与 DOM 隐藏仍然有效
- 站点可能引入新的检测手段（如检测 console.clear 是否被覆盖），届时需补充对抗
声明
本脚本仅供学习交流与个人学习使用，请勿用于商业目的。使用者应自行承担因使用本脚本产生的一切后果，脚本作者不对任何因使用或不当使用本脚本导致的损失承担责任。
