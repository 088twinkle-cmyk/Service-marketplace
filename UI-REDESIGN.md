# Service Marketplace 前端重设计说明

> 一句话总结：修好了浏览器端的路由崩溃问题，然后把整个前端从「能用的脚手架」重做成了有完整设计系统、桌面/平板/手机都成立的两端市场界面。
>
> 品牌主张：**Find trusted professionals. Book services at your price.**

---

## 一、先修的那个报错

`Uncaught Error: useNavigate() may be used only in the context of a <Router> component.`

**根因**：项目里同时存在两套路由环境，却被同一个 `expo-router` 指了过去。

- Expo / Metro（原生 + Expo Web）走**真正的 `expo-router`**，由 `app/_layout.tsx` 提供导航上下文；
- Vite 浏览器端（`npm run dev`）不能跑原生路由，必须走 `src/shims/expo-router.tsx`，而 shim 内部是用 `react-router-dom` 的 `useNavigate()` 实现的，所以它必须在 `<BrowserRouter>` 里面。

问题出在 `tsconfig.json` 里有一行 `"expo-router": ["./src/shims/expo-router.tsx"]` 的路径别名。Metro 是**认 tsconfig 的 `paths`** 的，于是 Expo 端也被悄悄换成了浏览器 shim —— shim 去调 `useNavigate()`，而外层根本没有 React Router，报错就从 Navbar 冒出来了。

**修法**（三点，互不牵连）：

| 文件 | 改动 |
| --- | --- |
| `tsconfig.json` | 删掉 `expo-router` 这一条别名，其他别名与配置一律不动 |
| `vite.config.js` | 保留 `expo-router → src/shims/expo-router.tsx` 的 Vite 别名，并在旁边写明「这条别名不能写进 tsconfig」的原因 |
| `src/main.tsx` | 用相对路径 `./shims/expo-router` 导入 `__setImperativeNavigator`，层级保持 `BrowserRouter → RouterBridge → SafeAreaProvider → AuthGuard → Navbar + AppRoutes` |

Navbar 的逻辑一行没动，`app/` 目录和 Expo Router 也没动。回归由 `src/routing.test.tsx` 守着：它直接 import 真正的 `src/main.tsx` 在 jsdom 里跑一遍，一旦别名被加回去就会红。

---

## 二、设计系统

所有视觉决策集中在一个文件里：**`src/theme/tokens.ts`**（屏幕里不允许再写死颜色和魔法数字）。

- **颜色**：主色是精炼过的靛蓝 `#4F46E5`（hover/深色 `#4338CA`），浅色底 `#F7F8FC`，卡片纯白，正文 `#0F172A`，次要文字 `#64748B`，描边 `#E6E8F0`；绿色只用于「已验证/成功」，琥珀色用于「待处理」，红色用于「错误」。状态色的语义固定，不做装饰。
- **间距 / 圆角**：`4/8/12/16/20/24/32/40/56` 的 8pt 栅格；圆角 `6–24 + pill`。
- **字体**：`displayXl 46 → h1 30 → h2 24 → h3 19 → body 15 → small 13 → caption 12`，标题用 700/800 字重并收紧字距，正文 15/23 行高保证长文可读。
- **阴影**：`xs / sm / md / lg / primary` 五档，统一用 `boxShadow` 字符串（react-native-web 不再报废弃警告，RN 0.86 也直接支持）。
- **断点**：`< 768` 手机单列 16px 边距；`≥ 768` 平板 24px 两列；`≥ 1024` 桌面 32px、内容列最大 1200px；`≥ 1280` 更密的网格。由 `src/theme/responsive.ts` 的 `useResponsive()` 统一提供 `isMobile / isTablet / isDesktop / columns / gutter / pick()`。

### 可复用组件（`src/components/ui/`）

`Button`（primary / secondary / outline / ghost / danger / success，sm 36 / md 44 / lg 52，含 loading、图标、hint、fullWidth）、`Card / SectionCard / Divider`、`Input / PasswordInput`（标签、占位、聚焦环、错误文案、帮助文案、必填星号）、`Badge / StatusBadge / VerifiedBadge / statusMeta`、`Avatar`（首字母彩色兜底 + 认证徽章）、`Rating`、`SectionHeader`、`EmptyState / ErrorState / LoadingState`、`Skeleton`（卡片/列表/统计/网格骨架）、`Chip`、`StatCard`、`StepTrail`、`ProgressBar`、`Container / Grid`、`Dialog`、`PageHeader`、`Icon`（内置线性图标集，不引外部图标库）。

业务组件全部重写并复用这些原子：`ServiceCard`（+ `variant="row"`）、`ProviderCard`、`ServiceListing`、`GigCard`、`LocationBar`、`ScreenShell`、`AuthLayout`、`FeedbackModal`、`Navbar`、`BookingCalendar`、`ReviewList`、`ProfileSection`、`ServiceListSkeleton`。

---

## 三、逐屏改了什么

**导航栏**（`components/Navbar.tsx`）
白底 + 细描边 + 吸顶，左边品牌标记与字标；中间桌面端导航（首页 / 浏览服务 / 消息）；右边根据身份切换：未登录显示「Become an Expert」+「Sign In」，客户显示「My account」，服务商显示「Provider dashboard」+「Account」，登录后统一是头像 + 退出。窄屏折叠成「头像 + 汉堡菜单」，菜单里再放完所有入口，不会互相压盖。功能（角色识别、头像刷新、退出、跳转）原样保留。

**首页**（`customer/HomeScreen.tsx`）
Hero 用标准的品牌文案：主标题 “Find the Right Professional for Your Service”，副文案 “Book trusted local professionals for beauty, grooming, wellness, and other services — at a price that works for you.”，主按钮「Book a service」+ 次级按钮「Become an Expert」。下面是搜索框（带热门关键词）、城市切换、信任条（KYC 认证 / 时段预约 / 覆盖城市数）、分类宫格、推荐服务网格、精选服务商、四步流程、为什么选择我们、服务商招募卡与站点页脚。**所有数字与列表都来自后端**，没有数据的板块直接不渲染。

**搜索**（`customer/SearchScreen.tsx`）
左侧/上方筛选卡（分类、价格区间、最低评分、已认证、可预约、排序）+ 结果网格，全部映射到后端已有的查询参数（`search / city / category / min_price / max_price / min_rating / verified / available / ordering / max_km`），输入 350ms 防抖，筛选条件以 chip 形式回显，可一键清空。没有 GPS 时不会假装有「距离最近」排序。

**服务详情 / 服务商主页**（`customer/ServiceDetailScreen.tsx`、`shared/ProviderProfileScreen.tsx`，新增路由 `/provider/:id`）
图集 + 缩略图、价格卡（含服务商头像、评分、认证徽章、位置）、描述、服务商简介、评价列表和右栏预订卡。服务商主页只用接口真实存在的字段：照片、姓名、认证状态、评分、服务列表、位置、作品、评价、可预约性。

**预约流程**（`customer/BookScreen.tsx`）
「选服务 → 确认价格 → 选日期时间 → 确认下单」，日历直接读取服务商的可用时段（绿=可约、灰=已约、红=被屏蔽），提交走 `bookingsApi.createBooking({service, slot_id})`，取消规则提示 24 小时截止。

**聊天**（`customer/ChatScreen.tsx`）
左侧会话列表（头像、服务名、最后一条消息、未读）、右侧气泡对话（自己/对方两种气泡、时间戳、已读状态）、底部输入框 + 发送，支持图片消息。空列表、加载骨架、无选中会话都有独立状态。API 调用完全没改。

**客户端仪表盘**（`customer/CustomerDashboardScreen.tsx`）
欢迎语 + SaaS 风格统计卡（全部/待处理/已完成/已取消）、下一场预约、带状态徽章的预约历史、账户信息与头像上传、修改密码、最近浏览与最近搜索。

**服务商侧（业务面板）**
`ProviderHomeScreen` 概览卡（活跃服务、待处理请求、进行中、已完工、累计成交额、评分——全部来自接口），加待办清单、最近预约、快捷入口（服务/时间/预约/认证）与「订单如何流转」说明；`ProviderServicesScreen` 发布表单（照片上传、校验、KYC 门禁）+ 我的服务列表；`ProviderAvailabilityScreen` 日历 + 时段统计 + 快捷添加；`ProviderBookingsScreen` 状态筛选（全部/待处理/进行中/已完成/已关闭）与接受/拒绝/取消、进入聊天；`ProviderKycScreen` 状态横幅 + 三步进度 + 上传卡 + 拒绝原因；`ProviderOnboardingScreen` 资料表单 + 步骤条。

**登录 / 注册 / 验证码 / 忘记密码 / 重置密码**（`screens/auth/*`）
桌面端左侧品牌面板 + 右侧表单卡，移动端压缩成同一张卡；密码可见性切换、行内校验、错误提示、重发倒计时，登录成功按角色分流（客户 → 首页，服务商 → `/provider-home`）。流程与接口调用保持不变。

**空态 / 加载 / 错误**
每个主要页面都有骨架屏、空状态插画式卡片和可重试的错误卡片（例如搜索页失败会显示「We could not load services」+「Try again」，而不是白屏或假数据）。

---

## 四、顺手修掉的一个真实问题：图片地址

Django 返回的媒体地址是绝对地址（`http://127.0.0.1:8001/media/...`），在别人的电脑、手机或预览域名上根本打不开。现在 `resolveMediaUrl()`（`src/config/api.ts`）会把 loopback / 内网网段的地址收敛成同源的 `/media/...`，浏览器侧走 Vite（线上走反向代理）转发，原生端再自动补上 API 主机；真正的远端 CDN 地址保持原样。`ServiceCard`、`Avatar`、服务详情图集都统一走了这个函数。

---

## 五、验证结果

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npm run typecheck` | 通过，0 错误 |
| 单元 / 路由测试 | `npm test` | 4 个文件、34 个用例全绿（含 25 条「每条路由都能渲染」的冒烟用例、移动端/桌面端双断点、空态与错误态、媒体地址解析） |
| 生产构建 | `npm run build` | 通过，461 个模块，`dist/assets/index.js` 731 kB（gzip 221 kB） |
| 真后端联调 | `npm run test:integration` | 7 个用例全绿（JWT 登录与刷新、KYC 私密性、完整下单→议价→支付→聊天→交付→评价流程），并额外用**真实 Django 数据**渲染了首页、搜索页、客户端仪表盘与服务商工作台 |
| Expo 端 | `npx expo start` | Metro 正常启动，Web 端 1015 个模块打包成功；产物里**不含**浏览器 shim，证明原生/Expo 仍走真正的 `expo-router` |

联调用的是一次性的本地环境：`pip install -r backend/requirements.txt` + `python manage.py migrate` + `python manage.py seed_demo`（演示账号 `anita@demo.marketplace` / `sita@demo.marketplace`，密码 `DemoPass!2024`）。后端代码、数据库结构、接口契约一行未改。

---

## 六、怎么跑起来

```bash
# 1) 后端（另开一个终端）
cd backend
python -m venv .venv && .venv\Scripts\activate      # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py seed_demo                          # 演示数据，可选
python manage.py runserver 0.0.0.0:8001

# 2) 浏览器端（本项目的主界面，Vite + React Native Web）
cd frontend
npm install
npm run dev            # http://localhost:5173

# 3) Expo / 原生端（同一个 app/ 目录，真正的 expo-router）
npx expo start         # 按 w 打开 Expo Web，或用 Expo Go 扫码

# 4) 生产构建与预览
npm run build && npm run preview
```

`npm run dev` 已经把 `/api`、`/media`、`/admin` 反向代理到 `127.0.0.1:8001`，所以浏览器里不需要配任何跨域或环境变量；如果后端换了地址，用 `VITE_BACKEND_ORIGIN` 覆盖即可。

项目地址：<https://github.com/088twinkle-cmyk/Service-marketplace>（分支 `arena/a71a9980-service-marketplace`）

---

## 七、改动清单（主要文件）

- 路由修复：`frontend/tsconfig.json`、`frontend/vite.config.js`、`frontend/src/main.tsx`、`frontend/src/routing.test.tsx`
- 设计系统：`frontend/src/theme/tokens.ts`、`responsive.ts`、`colors.ts`、`sharedStyles.ts`、`frontend/src/web.css`、`frontend/index.html`
- 组件库：`frontend/src/components/ui/*`（15 个原子组件）+ 重写的业务组件（Navbar、ServiceCard、ProviderCard、ServiceListing、LocationBar、AuthLayout、BookingCalendar、ReviewList、ProfileSection、ScreenShell、FeedbackModal、WorkflowPlaceholder 等）
- 页面：`frontend/src/screens/**`（客户 7 屏、服务商 6 屏、认证 5 屏、公共 3 屏）
- 数据层补充：`frontend/src/hooks/useServiceCatalog.ts`（真实筛选 + 防抖）、`frontend/src/config/api.ts`（媒体地址解析）、`frontend/src/services/api/servicesApi.ts`（补充 `provider_reviews` 字段）
- 测试：`frontend/src/routes.smoke.test.tsx`、`frontend/src/config/api.test.ts`、`frontend/src/integration/marketplace.itest.tsx`
