# Dashboard vs 高级数据分析 功能差异化方案

**创建日期**: 2026-01-13

---

## 一、产品定位

| 产品 | 定位 | 目标用户 | 月费 |
|------|------|----------|------|
| **Dashboard** | 日常运营监控 | 店长/收银员 | 免费（含所有套餐） |
| **高级数据分析** | 深度商业洞察 | 经营者/财务/连锁总部 | ¥12,800/月 |

---

## 二、功能对比矩阵

### 2.1 数据时间范围

| 功能 | Dashboard（基础版） | 高级数据分析（BI） |
|------|:------------------:|:-----------------:|
| 今日数据 | ✅ | ✅ |
| 本周数据 | ✅ | ✅ |
| 本月数据 | ✅ | ✅ |
| 自定义日期范围 | ❌ 最多30天 | ✅ 无限制 |
| 历史数据查询 | ❌ 仅近3个月 | ✅ 全部历史 |
| 同比分析（去年同期） | ❌ | ✅ |
| 环比分析（上期对比） | ✅ 简单 | ✅ 详细 |

### 2.2 分析维度

| 维度 | Dashboard（基础版） | 高级数据分析（BI） |
|------|:------------------:|:-----------------:|
| 按时间（日） | ✅ | ✅ |
| 按时间（周/月/季/年） | ❌ | ✅ |
| 按商品 | ✅ Top 10 | ✅ 全部 + 钻取 |
| 按商品类目 | ❌ | ✅ |
| 按支付方式 | ✅ | ✅ + 趋势 |
| 按时段（小时） | ✅ | ✅ + 热力图 |
| 按员工/收银员 | ❌ | ✅ |
| 按门店（多店） | ❌ | ✅ |
| 按客户/会员 | ❌ | ✅ （需CRM模块） |

### 2.3 图表与可视化

| 图表类型 | Dashboard（基础版） | 高级数据分析（BI） |
|----------|:------------------:|:-----------------:|
| 折线图/面积图 | ✅ | ✅ |
| 柱状图 | ✅ | ✅ |
| 饼图/环形图 | ✅ | ✅ |
| 热力图（时段×星期） | ❌ | ✅ |
| 漏斗图（转化分析） | ❌ | ✅ |
| 排行榜（动态） | ✅ 固定Top10 | ✅ 可配置 |
| 地图（区域分析） | ❌ | ✅ （连锁版） |
| 自定义仪表板布局 | ❌ | ✅ |
| 数据大屏模式 | ❌ | ✅ |

### 2.4 高级分析功能

| 功能 | Dashboard（基础版） | 高级数据分析（BI） |
|------|:------------------:|:-----------------:|
| ABC 商品分析 | ❌ | ✅ |
| 商品关联分析 | ❌ | ✅ |
| RFM 客户分析 | ❌ | ✅ （需CRM） |
| 库存周转分析 | ❌ | ✅ （需库存） |
| 利润率分析 | ❌ | ✅ |
| 销售预测 | ❌ | ✅ |
| 异常检测告警 | ❌ | ✅ |
| 目标达成追踪 | ❌ | ✅ |

### 2.5 报表与导出

| 功能 | Dashboard（基础版） | 高级数据分析（BI） |
|------|:------------------:|:-----------------:|
| 屏幕截图 | ✅ 浏览器自带 | ✅ |
| Excel 导出 | ❌ | ✅ |
| PDF 报表 | ❌ | ✅ |
| 定时报表邮件 | ❌ | ✅ |
| 自定义报表模板 | ❌ | ✅ |
| API 数据接口 | ❌ | ✅ |

---

## 三、功能限制实现方案

### 3.1 前端实现

```typescript
// src/hooks/use-feature-gate.ts
import { useSubscription } from '@/hooks/use-subscription';

export function useFeatureGate() {
  const { enabledModules } = useSubscription();

  const hasBI = enabledModules.includes('BI') || enabledModules.includes('ANALYTICS');

  return {
    // 时间范围限制
    maxDateRange: hasBI ? Infinity : 30, // 天
    maxHistoryMonths: hasBI ? Infinity : 3,

    // 维度限制
    canAnalyzeByCategory: hasBI,
    canAnalyzeByEmployee: hasBI,
    canAnalyzeByStore: hasBI,
    canAnalyzeByCustomer: hasBI,

    // 图表限制
    canUseHeatmap: hasBI,
    canUseFunnel: hasBI,
    canCustomizeLayout: hasBI,
    canUseDataScreen: hasBI,

    // 高级分析
    canUseABC: hasBI,
    canUsePrediction: hasBI,
    canUseAlerts: hasBI,

    // 导出限制
    canExportExcel: hasBI,
    canExportPDF: hasBI,
    canScheduleReports: hasBI,
  };
}
```

### 3.2 升级提示组件

```typescript
// src/components/ui/upgrade-prompt.tsx
interface UpgradePromptProps {
  feature: string;
  description: string;
}

export function UpgradePrompt({ feature, description }: UpgradePromptProps) {
  return (
    <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
        <div>
          <h4 className="font-medium text-blue-900">{feature}</h4>
          <p className="text-sm text-blue-700 mt-1">{description}</p>
          <Link
            href="/settings/subscription"
            className="text-sm text-blue-600 hover:underline mt-2 inline-flex items-center gap-1"
          >
            升级到高级数据分析 <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
```

### 3.3 模块代码映射

在 `prisma/seed/seed.ts` 中更新：

```typescript
{
  productCode: 'SW-MOD-BI',
  name: 'Advanced Analytics',
  nameZh: '高级数据分析',
  nameJa: '高度データ分析',
  description: '深度商业洞察：多维度分析、销售预测、自定义报表、数据导出',
  productType: 'MODULE',
  category: 'MODULE',
  priceMonthly: 12800,
  enablesModule: 'BI', // 启用 BI 模块
  trialDays: 14,
}
```

---

## 四、UI 设计方案

### 4.1 Dashboard 基础版 - 保持现有布局

```
┌─────────────────────────────────────────────────────────────┐
│  Dashboard                    [今日 ▼] [本周] [本月]         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ 今日销售 │ │ 订单数   │ │ 客单价   │ │ 取消率   │           │
│  │ ¥125,800│ │ 45单    │ │ ¥2,795  │ │ 2.2%    │           │
│  │ +12.5%  │ │ +8.3%   │ │ +3.8%   │ │ -0.5%   │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
├─────────────────────────────────────────────────────────────┤
│  [概览] [销售分析] [商品分析] [订单分析] [支付分析]            │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐ ┌──────────────────────┐ │
│  │     销售趋势（7天）            │ │  热销商品 Top 10      │ │
│  │     📈 Area Chart            │ │  1. 招牌拉面 ¥32,400  │ │
│  │                              │ │  2. 炸鸡套餐 ¥28,600  │ │
│  │                              │ │  3. ...               │ │
│  └──────────────────────────────┘ └──────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────┐ ┌──────────────────────┐ │
│  │     支付方式占比              │ │  ⭐ 解锁更多分析      │ │
│  │     🍩 Pie Chart             │ │  • 多维度深度分析      │ │
│  │                              │ │  • 销售预测           │ │
│  │                              │ │  • Excel/PDF 导出     │ │
│  │                              │ │  [了解高级数据分析 →]  │ │
│  └──────────────────────────────┘ └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 高级数据分析 - 独立页面

```
┌─────────────────────────────────────────────────────────────┐
│  高级数据分析                                    [导出 ▼]    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 2026/01/01 ~ 2026/01/13 │ 对比: 去年同期 ▼ │ 门店: 全部 ▼│
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  [销售分析] [商品分析] [客户分析] [员工分析] [预测] [报表]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    销售趋势对比                        │  │
│  │  ─── 本期 ¥1,258,000                                  │  │
│  │  --- 去年同期 ¥1,125,000 (+11.8%)                     │  │
│  │  📈 Dual Area Chart with comparison                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌─────────────────────┐ ┌─────────────────────────────┐  │
│  │ 销售时段热力图       │ │ 商品 ABC 分析                │  │
│  │ ┌─┬─┬─┬─┬─┬─┬─┐     │ │ A类(80%销售): 12款 (15%)    │  │
│  │ │█│█│░│░│█│█│░│ 周一 │ │ B类(15%销售): 28款 (35%)    │  │
│  │ │░│█│█│░│█│█│█│ 周二 │ │ C类(5%销售):  40款 (50%)    │  │
│  │ │░│░│█│█│█│░│░│ ... │ │ [查看详情]                   │  │
│  │ └─┴─┴─┴─┴─┴─┴─┘     │ │                             │  │
│  │ 11 12 13 14 18 19 20│ └─────────────────────────────┘  │
│  └─────────────────────┘                                   │
│                                                             │
│  ┌─────────────────────┐ ┌─────────────────────────────┐  │
│  │ 类目销售占比         │ │ 员工业绩排名                 │  │
│  │ 🍩 Pie + Drill-down │ │ 1. 田中 ¥458,000 (142单)    │  │
│  │                     │ │ 2. 山田 ¥392,000 (128单)    │  │
│  │                     │ │ 3. 佐藤 ¥325,000 (98单)     │  │
│  └─────────────────────┘ └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 五、实现优先级

### Phase 1: 基础限制（1周）
- [ ] 创建 `useFeatureGate` hook
- [ ] 在 Dashboard 添加升级提示卡片
- [ ] 限制日期范围选择器（基础版最多30天）
- [ ] 更新订阅产品描述

### Phase 2: 高级分析页面（2周）
- [ ] 创建 `/analytics` 路由（需要 BI 模块）
- [ ] 实现同比分析 API
- [ ] 添加按类目/员工维度
- [ ] 实现销售时段热力图

### Phase 3: 导出与报表（1周）
- [ ] Excel 导出功能
- [ ] PDF 报表生成
- [ ] 基础报表模板

### Phase 4: 高级功能（2周）
- [ ] ABC 商品分析
- [ ] 简单销售预测（移动平均）
- [ ] 数据大屏模式
- [ ] 定时报表邮件（可选）

---

## 六、技术实现要点

### 6.1 同比分析 API

```typescript
// src/app/api/analytics/comparison/route.ts
export async function GET(request: Request) {
  const { startDate, endDate, compareType } = parseParams(request);

  // compareType: 'lastPeriod' | 'lastYear' | 'custom'
  const compareDates = calculateCompareDates(startDate, endDate, compareType);

  const [currentData, compareData] = await Promise.all([
    fetchSalesData(startDate, endDate),
    fetchSalesData(compareDates.start, compareDates.end),
  ]);

  return {
    current: currentData,
    compare: compareData,
    changes: calculateChanges(currentData, compareData),
  };
}
```

### 6.2 热力图数据结构

```typescript
interface HeatmapData {
  dayOfWeek: number; // 0-6
  hour: number; // 0-23
  value: number; // 销售额或订单数
  intensity: number; // 0-1 归一化强度
}

// API Response
{
  heatmap: HeatmapData[],
  maxValue: number,
  peakTime: { dayOfWeek: number, hour: number },
}
```

### 6.3 ABC 分析算法

```typescript
function calculateABC(products: ProductSales[]): ABCResult {
  // 按销售额降序排序
  const sorted = products.sort((a, b) => b.revenue - a.revenue);
  const total = sorted.reduce((sum, p) => sum + p.revenue, 0);

  let cumulative = 0;
  return sorted.map(product => {
    cumulative += product.revenue;
    const percentage = cumulative / total;

    return {
      ...product,
      category: percentage <= 0.8 ? 'A' : percentage <= 0.95 ? 'B' : 'C',
      cumulativePercentage: percentage,
    };
  });
}
```

---

## 七、导航与权限

### 7.1 菜单结构

```typescript
// 基础版用户看到:
nav: [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  // ...其他模块
]

// 订阅了 BI 模块的用户看到:
nav: [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: '高级分析', href: '/analytics', icon: TrendingUp }, // 新增
  // ...其他模块
]
```

### 7.2 模块配置

```typescript
// src/config/modules.ts
export const MODULES = {
  DASHBOARD: {
    code: 'DASHBOARD',
    name: 'Dashboard',
    nameZh: '数据看板',
    icon: BarChart3,
    href: '/dashboard',
    includedInAllPlans: true,
  },
  BI: {
    code: 'BI',
    name: 'Advanced Analytics',
    nameZh: '高级数据分析',
    icon: TrendingUp,
    href: '/analytics',
    includedInAllPlans: false,
    requiredProduct: 'SW-MOD-BI',
  },
};
```

---

## 八、定价合理性分析

| 功能价值 | 估算价值 |
|----------|----------|
| 多维度分析 | ¥3,000/月 |
| 同比/历史分析 | ¥2,000/月 |
| 销售预测 | ¥3,000/月 |
| Excel/PDF 导出 | ¥2,000/月 |
| 数据大屏 | ¥2,000/月 |
| **合计** | **¥12,000/月** |

定价 ¥12,800/月 略高于功能价值，属于合理区间。可考虑：
- 年付优惠：¥9,800/月（¥117,600/年）
- 与其他模块捆绑优惠

---

## 九、竞品参考

| 竞品 | BI 功能定价 | 备注 |
|------|------------|------|
| Square | 内置基础，高级另付 | ~$30/月 |
| Toast | 内置基础 | 高级需企业版 |
| Smaregi | ¥8,000/月起 | 按功能分级 |
| Airレジ | 免费基础 | 高级功能付费 |

---

## 十、总结

本方案通过以下方式实现 Dashboard 和高级数据分析的差异化：

1. **时间范围限制** - 基础版最多30天/3个月历史
2. **维度限制** - 基础版无类目/员工/门店维度
3. **图表限制** - 基础版无热力图/漏斗图
4. **导出限制** - 基础版无 Excel/PDF 导出
5. **高级功能限制** - ABC分析、预测、告警仅BI版

实现方式采用 feature flag 模式，通过 `useFeatureGate` hook 控制功能可见性，同时在基础版中展示升级提示，引导用户升级。
