# MedVerify Reliability Research Roadmap
## 从工程原型转向可复现实验研究的技术路线与操作目的

> 适用仓库：`xinrongli-figskat/Medverify-Agent`  
> 当前研究定位：**Medical LLM Agent + Reliability Harness**  
> 当前阶段：**Phase 2 Benchmark Construction 后半段 → 准备进入 Phase 3 Baseline / Ablation Experiments**  
> 本文目的：作为 Codespace 内的研究施工总路线，约束后续开发、实验、数据冻结、回归和分析流程。

---

# 0. 总原则：从 Developer 转向 Experimenter

当前 MedVerify 已经不缺“还能再加什么功能”，而缺：

1. 一个被冻结的实验平台；
2. 一个开发集与独立保留集；
3. 明确的实验条件；
4. 固定的指标；
5. 可重复的执行协议；
6. 正式的 baseline / ablation / held-out 结果；
7. 统计分析与研究结论。

从此之后，优先级从：

```text
继续加功能
→ 修更多局部 bug
→ 再加一个 Tool
```

切换为：

```text
冻结实验条件
→ 构建 benchmark
→ 运行受控实验
→ 分析结果
→ 形成研究结论
```

---

# 1. 当前研究问题

## 核心问题

当医疗 LLM Agent 使用 PubMed 等外部医学证据工具时：

```text
Tool Failure
工具故障
        ↓
Agent Interpretation
智能体对工具状态的理解
        ↓
Evidence State
证据状态
        ↓
Final Medical Answer
最终医学回答
```

系统是否会把：

```text
Retrieval Failed
检索失败
```

错误解释为：

```text
No Evidence Exists
不存在医学证据
```

这类错误属于：

```text
Epistemic Failure
认识论错误
```

即：

> 系统对“自己知道什么、不知道什么”产生了错误判断。

---

# 2. 当前已完成的基础

目前可以视为已经完成或基本完成的核心能力：

## 2.1 Agent Execution Layer

- Cloudflare Workers / Agents 运行链路；
- GLM 远程模型调用；
- Durable Object 会话；
- WebSocket / 流式输出；
- Emergency / PubMed / General Education 三路分流；
- PubMed ESearch + ESummary；
- Exact PMID 查询；
- Query Guard；
- Tool Budget；
- Finalization Guard；
- Tool syntax 输出拦截；
- Citation identifier grounding。

## 2.2 Reliability Harness

- 25 个 reliability cases；
- 79 个 immutable raw runs；
- 独立 Agent 实例隔离；
- 自动 assertions；
- final answer 非空检查；
- tool syntax leakage 检测；
- PMID / PMCID / DOI grounding；
- 自动 verdict 与人工 verdict 分离；
- offline re-evaluation；
- deterministic fault injection；
- HTTP 429 / 500 / timeout / network error；
- malformed JSON / invalid schema；
- zero results / successful records；
- Failure Ledger；
- Regression workflow。

## 2.3 Benchmark 基础

- benchmark protocol `1.0.0` 已冻结；
- 7 个 coverage cells；
- 10 个 development scenario families；
- 50 个 development variants；
- 已设计：
  - language variation；
  - negation；
  - paraphrase；
  - irrelevant context；
  - repeated runs；
- development / held-out 防污染规则；
- 单变体 live runner；
- result ledger 校验；
- 自动 / 人工 / adjudication 三层 verdict。

---

# 3. 当前真正的研究缺口

以下内容尚未完成，因此目前还不能称为“正式研究结果”。

## 3.1 Benchmark 还没有 readiness

当前：

```text
50 development variants
已生成
但没有整体运行
```

四项 pilot：

```text
2 / 4 完成
2 / 4 未运行
整体仍 BLOCKED
```

### 操作目的

在正式实验前，先证明：

> benchmark runner、raw recording、verdict、ledger、fault injection 和环境本身能稳定闭环。

否则后续任何结果都可能混入实验平台问题。

---

## 3.2 Held-out Set 仍为 0

当前没有真正独立的：

```text
Held-out Evaluation Set
保留评估集
```

### 操作目的

防止：

```text
发现 bug
→ 针对 bug 写规则
→ 用同样 bug case 测试
→ 看起来性能很好
```

也就是避免：

```text
Test-set Overfitting
测试集过拟合
```

---

## 3.3 Baseline / Ablation 尚未正式运行

当前 Full MedVerify 工程实现已经比较完整，但没有正式比较：

```text
Condition A
Prompt-only Baseline

Condition B
Runtime-constrained

Condition C
Structured-outcome

Condition D
Full Failure-aware MedVerify
```

### 操作目的

回答：

> 到底是哪一层 Reliability Control 真正有效？

而不是只证明：

> “新版比旧版好”。

---

## 3.4 Robustness 仍只有设计

目前已设计：

- paraphrase；
- negation；
- irrelevant context；
- language variation；
- repeated execution；

但没有正式实验数据。

### 操作目的

回答：

> Reliability improvement 是否只对某一个 prompt 有效，还是对语义等价输入也稳定？

---

## 3.5 Cross-model 尚未开始

当前尚未正式比较多个底层 LLM。

### 操作目的

判断 failure 是：

```text
Model-specific
模型特有
```

还是：

```text
Architecture-level
工具型 LLM Agent 的共性问题
```

---

# 4. 新研究里程碑

从现在开始，不再仅使用工程里程碑 `M2.x` 作为主线。

新增 Research Milestones：

```text
R1 — Benchmark Readiness
R2 — Development Experiments
R3 — Ablation Study
R4 — Held-out Evaluation
R5 — Robustness / Cross-model
R6 — Statistical Analysis & Report
```

---

# 5. R1 — Benchmark Readiness

## 目标

把 MedVerify 从：

```text
“可运行的工程系统”
```

冻结成：

```text
“可以产生研究数据的实验平台”
```

---

## 5.1 完成剩余 pilot

### 操作

确认四项 pilot 全部完成。

### 验收标准

```text
pilot_1 = PASS
pilot_2 = PASS
pilot_3 = PASS
pilot_4 = PASS
```

不允许：

```text
BLOCKED
UNKNOWN
环境失败被当作 Agent FAIL
```

### 操作目的

证明：

- runner 可以启动；
- fault seam 可触发；
- raw 可以保存；
- verdict 可以计算；
- ledger 可以更新；
- 进程可以正常结束。

---

## 5.2 冻结 50 个 Development Variants

### 操作

对现有 50 个 development variants 只做：

- schema validation；
- family / cell 对齐检查；
- 唯一 ID 检查；
- perturbation 类型检查；
- expected contract 检查。

冻结后不再为了结果好看而修改内容。

### 操作目的

建立：

```text
Frozen Development Set
冻结开发集
```

后续允许用它：

- 调试；
- 做初步实验；
- 做 ablation；
- 发现错误；

但所有修改必须记录。

---

## 5.3 建立 Held-out Set

建议第一版：

```text
100 个 held-out variants
```

最低不要少于：

```text
50 个
```

### 设计原则

Held-out 不能只是 development 的简单复制。

应覆盖：

- unseen paraphrases；
- unseen modifiers；
- 新的语序；
- 中文 / 英文；
- mixed-language；
- irrelevant context；
- negation；
- tool failure；
- schema failure；
- zero-results；
- success control。

### 严格规则

在正式 evaluation 之前：

```text
不得查看 held-out 的模型输出
不得根据 held-out 调规则
不得根据 held-out 修改 Prompt
不得根据 held-out 修改 Query Guard
不得根据 held-out 增加词表
```

### 操作目的

真正测量：

```text
Generalisation
泛化能力
```

而不是：

```text
Memorised Regression
记住已知错误
```

---

## 5.4 冻结 Experimental Conditions

必须明确四组实验条件。

### Condition A — Prompt-only Baseline
仅提示词基线

```text
LLM
+
PubMed Tool
+
Prompt Instructions
```

不启用：

- structured outcome；
- runtime schema control；
- query guard；
- output hard filter；
- fail-closed finalization。

---

### Condition B — Runtime-constrained
运行时约束组

在 A 基础上加入：

- Tool Budget；
- toolChoice / activeTools 限制；
- finalization 禁用工具；
- step budget。

---

### Condition C — Structured-outcome
结构化工具状态组

在 B 基础上加入：

- Zod runtime schema；
- successful_records；
- zero_results；
- invalid_response；
- tool_failure；
- stage-aware failure。

---

### Condition D — Full MedVerify
完整故障感知组

在 C 基础上加入：

- Query Guard；
- Exact PMID Guard；
- Citation Grounding；
- Outcome-aware Finalization；
- Fail-closed Output；
- Tool Syntax Filter；
- Reliability Assertions。

---

## 5.5 冻结 Metrics

至少固定以下指标。

### Failure-state Classification Accuracy
故障状态分类准确率

```text
SUCCESS
ZERO_RESULTS
INVALID_RESPONSE
TOOL_FAILURE
```

---

### Unsafe Evidence Conclusion Rate
不安全证据结论率

例如：

```text
timeout
↓
“没有医学证据”
```

判定为 FAIL。

---

### Citation Grounding Rate
引用来源绑定率

检查：

- PMID；
- PMCID；
- DOI；

是否来自本次成功 records。

---

### Query Fidelity
检索查询忠实度

检查：

```text
proposedQuery
vs
executedQuery
vs
user intent
```

---

### Tool Compliance
工具规则遵守率

检查：

- 调用次数；
- 工具名称；
- finalization 阶段；
- prohibited syntax；
- expected path。

---

### Abstention Accuracy
保留判断准确率

当：

```text
tool_failure
invalid_response
```

发生时，是否正确表达：

```text
Evidence State Unknown
证据状态未知
```

---

## 5.6 冻结 Repeat Protocol

建议：

```text
Development:
每个 case 先 run 1 次

Selected robustness subset:
每个 case run 5 次

Held-out:
正式评估时按固定次数执行
```

固定：

- temperature；
- model；
- seed（如框架支持）；
- max tokens；
- tool budget；
- timeout；
- worker commit；
- evaluator commit。

### 操作目的

让重复运行结果具有可比较性。

---

## 5.7 冻结 Raw Format

Raw 必须继续不可变。

每个 raw 至少记录：

```text
run_id
case_id
variant_id
condition
model
git_commit
evaluator_version
timestamp

user_input
route
proposed_query
executed_query

tool_name
tool_input
tool_output
tool_state
tool_call_count

pubmed_outcome
failure_category
failure_stage

final_answer

automatic_assertions
original_verdict
manual_review_required
```

### 操作目的

保证：

```text
实验数据可追溯
可离线重评
不可篡改
```

---

## 5.8 R1 验收标准

只有以下全部满足才进入正式实验：

```text
[ ] 4/4 pilot PASS
[ ] 50 development variants frozen
[ ] held-out set created
[ ] held-out contamination rules frozen
[ ] A/B/C/D conditions documented
[ ] metrics frozen
[ ] repeat protocol frozen
[ ] model parameters frozen
[ ] raw format frozen
[ ] evaluator version frozen
[ ] benchmark protocol validation PASS
```

---

# 6. R2 — Development Experiments

## 目标

使用 development set 运行完整实验链路。

---

## 6.1 先跑 Condition A

### 操作目的

获得真正的：

```text
Prompt-only Baseline
```

而不是拿历史旧 raw 当 baseline。

---

## 6.2 运行 Condition B

### 操作目的

单独衡量：

```text
Runtime Constraints
运行时约束
```

带来的提升。

---

## 6.3 运行 Condition C

### 操作目的

衡量：

```text
Structured Tool Outcome
结构化工具状态
```

是否显著减少：

- tool failure / zero-results 混淆；
- invalid response false-success；
- epistemic overclaim。

---

## 6.4 运行 Condition D

### 操作目的

评估完整 Full MedVerify。

---

## 6.5 Development 结果只用于理解系统

重要：

```text
Development result
≠
Final research result
```

它允许：

- 找错误；
- 调实验 pipeline；
- 验证 metric；
- 确认 ablation 有意义；

但不能用来宣称最终泛化性能。

---

# 7. R3 — Ablation Study

## 目标

回答：

> 哪个模块真正贡献了 Reliability Improvement？

---

## 建议对比

```text
A → Prompt-only
B → + Runtime Constraints
C → + Structured Outcome
D → + Query Guard + Citation Grounding + Fail-closed Finalization
```

---

## 关键分析

观察：

```text
A vs B
```

回答：

> “只限制行为”有没有用？

观察：

```text
B vs C
```

回答：

> “结构化工具状态”有没有用？

观察：

```text
C vs D
```

回答：

> “完整控制层”有没有额外收益？

---

## 不要只看总 PASS

至少按 failure family 分析：

```text
HTTP failure
network failure
timeout
parse error
schema error
zero results
successful records
query drift
citation grounding
tool leakage
```

### 操作目的

避免：

```text
overall score 提高
但关键高风险 failure 仍然很差
```

---

# 8. R4 — Held-out Evaluation

## 前置条件

进入 Held-out 之前必须：

```text
freeze production code
freeze prompt
freeze guard rules
freeze evaluator
freeze metrics
```

建议打 Git tag：

```text
research-v1-freeze
```

---

## 严格规则

Held-out 一旦打开：

```text
不得继续调规则后重新声称同一 held-out 为独立测试
```

如果修改系统：

```text
held-out v1
```

必须视为已经暴露。

后续要重新建立：

```text
held-out v2
```

---

## 操作目的

获得第一份真正可用于研究结论的数据。

---

# 9. R5 — Robustness Evaluation

## 9.1 Semantic Perturbation
语义扰动

测试：

```text
paraphrase
negation
irrelevant context
language variation
mixed-language
```

### 操作目的

验证：

> task semantics 不变时，系统行为是否稳定。

---

## 9.2 Repeated Execution
重复执行

建议对选定高价值 cases：

```text
run 5 次
```

计算：

```text
pass@1
repeated-pass rate
failure frequency
trajectory consistency
```

### 操作目的

区分：

```text
偶然通过
```

和：

```text
稳定可靠
```

---

## 9.3 Cross-model Evaluation
跨模型评估

最低目标：

```text
Model A = 当前 GLM
Model B = 一个强闭源模型
Model C = 一个开放 / 开源模型
```

保持不变：

- benchmark；
- harness；
- tool；
- metrics；
- fault injection。

只替换：

```text
Backend LLM
```

### 操作目的

判断：

```text
Failure 是模型特异性
还是 Agent 架构共性
```

---

# 10. R6 — Statistical Analysis

## 推荐目录

```text
analysis/
├── aggregate_results.py
├── compute_metrics.py
├── bootstrap_ci.py
├── ablation_analysis.py
├── robustness_analysis.py
└── failure_analysis.py
```

---

## 10.1 aggregate_results.py

作用：

```text
读取 raw
→ 合并 run-level 数据
→ 输出 analysis-ready table
```

---

## 10.2 compute_metrics.py

作用：

计算：

- failure-state accuracy；
- unsafe evidence conclusion rate；
- citation grounding；
- query fidelity；
- tool compliance；
- abstention accuracy。

---

## 10.3 bootstrap_ci.py

作用：

对关键指标计算：

```text
95% Confidence Interval
95% 置信区间
```

---

## 10.4 ablation_analysis.py

作用：

比较：

```text
A / B / C / D
```

---

## 10.5 robustness_analysis.py

作用：

分析：

- paraphrase；
- language；
- repeated runs；
- cross-model。

---

## 10.6 failure_analysis.py

作用：

输出：

```text
Failure Taxonomy Distribution
失效类型分布
```

例如：

```text
schema_error
timeout
query_drift
tool_leakage
citation_grounding
unsafe_overclaim
```

---

# 11. 当前不优先做的内容

为了避免重新陷入功能堆叠，以下内容暂时不是研究主线。

## 暂缓

- Full-text RAG；
- Vector Database；
- Multi-Agent；
- Long-term Memory；
- Fine-tuning；
- 大规模 UI 重构；
- 大规模 Emergency 规则扩展；
- MCP 功能扩展；
- 自动 GRADE；
- 自动 Systematic Review。

### 原因

这些会增加系统复杂度，但不能直接回答当前研究问题：

> Tool failure semantics 是否会传播为错误医学证据判断？

---

# 12. 但以下产品安全问题必须单独处理

这些不是主要研究变量，但如果公开部署，必须修。

## 12.1 用户会话隔离

高优先级。

当前如果多个用户共享默认 Durable Object：

```text
可能导致：
医疗对话互相可见
历史互相影响
图片共享
MCP 配置共享
```

公开 Demo 前必须修复。

---

## 12.2 Production Fetch Resilience

真实 NCBI 请求需要：

- explicit timeout；
- retry/backoff；
- 429 handling；
- rate-limit control。

注意：

> 这些生产能力与“研究故障注入”不同。

Fault injection 是为了实验；
production resilience 是为了真实运行。

---

## 12.3 README 与文档同步

必须更新：

```text
README
handoff
failure ledger
benchmark status
```

确保：

```text
代码状态
=
文档状态
```

---

# 13. Git 与研究数据规则

## 13.1 Raw 不可修改

```text
runs_raw/
```

禁止：

- 覆盖；
- 手工修改 verdict；
- 重新格式化；
- 为了让实验通过而改历史文件。

---

## 13.2 不混淆三类 Verdict

必须区分：

```text
Original Verdict
原始运行时自动结果

Offline Verdict
当前 evaluator 对旧 raw 的重评

Manual Verdict
人工复核
```

---

## 13.3 每次正式实验记录 commit

正式 run 必须记录：

```text
git rev-parse HEAD
```

---

## 13.4 正式实验前工作树必须干净

建议检查：

```bash
git status --short
git diff --cached
git rev-parse HEAD
```

---

# 14. 建议新增研究目录

```text
docs/research/
├── benchmark_protocol.md
├── experimental_conditions.md
├── metrics.md
├── heldout_policy.md
├── analysis_plan.md
└── research_log.md

tests/research/
├── development/
├── heldout/
└── perturbations/

analysis/
├── aggregate_results.py
├── compute_metrics.py
├── bootstrap_ci.py
├── ablation_analysis.py
├── robustness_analysis.py
└── failure_analysis.py

results/
├── development/
├── ablation/
├── heldout/
├── robustness/
└── cross_model/
```

---

# 15. 当前立即执行顺序

恢复开发后严格按以下顺序推进：

```text
Step 1
只读检查当前 Git / benchmark / pilot 状态

Step 2
解决剩余 2 个 pilot blocker

Step 3
确认 4/4 pilot PASS

Step 4
冻结 50 development variants

Step 5
构建并封存 held-out set

Step 6
编写 experimental_conditions.md

Step 7
编写 metrics.md

Step 8
编写 analysis_plan.md

Step 9
冻结实验版本 / Git tag

Step 10
运行 Condition A

Step 11
运行 Condition B

Step 12
运行 Condition C

Step 13
运行 Condition D

Step 14
完成 development ablation

Step 15
正式打开 held-out

Step 16
运行 held-out evaluation

Step 17
做 repeated / perturbation experiments

Step 18
做 cross-model evaluation

Step 19
统计分析

Step 20
写 Results / Discussion / Technical Report
```

---

# 16. 研究冻结线

在真正开始正式实验前，必须明确区分：

```text
Engineering Mode
工程模式
```

和：

```text
Research Evaluation Mode
研究评估模式
```

---

## Engineering Mode

允许：

- 修改代码；
- 调 prompt；
- 调 guard；
- 修改 development cases；
- 修 evaluator；
- 修 runner。

---

## Research Evaluation Mode

进入后：

```text
禁止为了结果修改系统
禁止看到 held-out 后再调规则
禁止覆盖 raw
禁止修改 evaluator 后继续混用旧结果
```

如确需修改：

```text
必须开始新的 experiment version
```

---

# 17. 成功标准

这项研究最终不是为了证明：

```text
MedVerify 很厉害
```

而是为了回答：

```text
1. Tool Failure 是否会被误解成 Evidence Absence？

2. Structured Outcome 是否能降低这种错误？

3. Fail-closed Finalization 是否能减少不安全医学结论？

4. Reliability Control 是否比 Prompt-only 更稳定？

5. 这些提升能否在 held-out、重复运行和不同模型上保持？
```

只有这些问题被数据回答后，项目才真正从：

```text
Reliability Engineering Project
可靠性工程项目
```

转变为：

```text
Research Study
研究项目
```

---

# 18. 当前阶段一句话定位

```text
工程平台基本完成
↓
Benchmark 结构已完成大半
↓
正式实验尚未开始
↓
下一目标：R1 Benchmark Readiness
```

当前最重要的任务不是继续增加 Agent 功能，而是：

> **把实验条件、benchmark、held-out、metrics 和 raw protocol 全部冻结，然后开始第一次真正可用于研究结论的 baseline / ablation experiment。**

