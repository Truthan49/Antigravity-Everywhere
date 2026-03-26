#!/usr/bin/env python3
"""
调用 Antigravity Gateway API，在 mytools workspace 执行 /ai-topic-discovery workflow。
用法: python3 scripts/call_workflow.py
"""
import requests, time, sys, json

BASE = "http://localhost:3000"
WORKSPACE = "file:///path/to/mytools"  # REPLACE THIS WITH YOUR WORKSPACE PATH
MODEL = "MODEL_PLACEHOLDER_M26"
WORKFLOW_CMD = "/ai-topic-discovery"

# 颜色输出
def c(text, code): return f"\033[{code}m{text}\033[0m"
def info(msg):  print(c(f"[INFO] {msg}", "36"))
def ok(msg):    print(c(f"[OK]   {msg}", "32"))
def warn(msg):  print(c(f"[WAIT] {msg}", "33"))
def err(msg):   print(c(f"[ERR]  {msg}", "31"))

def main():
    # 1. 检查服务器
    info("检查 Gateway 状态...")
    try:
        servers = requests.get(f"{BASE}/api/servers", timeout=5).json()
        ws_names = [s["workspace"].split("/")[-1] for s in servers]
        ok(f"发现 {len(servers)} 个 language_server: {', '.join(ws_names)}")
    except Exception as e:
        err(f"无法连接 Gateway: {e}")
        sys.exit(1)

    # 2. 创建对话
    info(f"在 {WORKSPACE} 创建新对话...")
    r = requests.post(f"{BASE}/api/conversations", json={"workspace": WORKSPACE})
    if r.status_code != 200:
        err(f"创建失败: {r.text}")
        sys.exit(1)
    cid = r.json()["cascadeId"]
    ok(f"对话已创建: {cid}")

    # 3. 发送 workflow 命令
    info(f"发送 workflow 命令: {WORKFLOW_CMD}")
    r = requests.post(f"{BASE}/api/conversations/{cid}/send",
        json={"text": WORKFLOW_CMD, "model": MODEL})
    if r.status_code != 200:
        err(f"发送失败: {r.text}")
        sys.exit(1)
    ok("消息已提交，等待 AI 处理...\n")

    # 4. 轮询等待结果
    prev_count = 0
    idle_rounds = 0
    max_wait = 300  # 最长等 5 分钟

    for i in range(max_wait // 2):
        time.sleep(2)
        elapsed = (i + 1) * 2

        try:
            r = requests.get(f"{BASE}/api/conversations/{cid}/steps", timeout=10)
            data = r.json()
            steps = data.get("steps", [])
        except:
            continue

        count = len(steps)
        if count == prev_count:
            idle_rounds += 1
            # 每 10 秒打印一次等待状态
            if idle_rounds % 5 == 0:
                warn(f"[{elapsed}s] 等待中... ({count} 步)")
            # 连续 60 秒无变化且有步骤 → 可能完成
            if idle_rounds > 30 and count > 0:
                ok("AI 似乎已完成（60秒无新步骤）")
                break
            continue

        idle_rounds = 0
        prev_count = count

        # 打印最新步骤摘要
        last = steps[-1]
        step_type = last.get("type", "").replace("CORTEX_STEP_TYPE_", "")
        status = last.get("status", "").replace("CORTEX_STEP_STATUS_", "")

        if step_type == "PLANNER_RESPONSE":
            text = last.get("plannerResponse", {}).get("modifiedResponse", "")
            preview = text[:80].replace("\n", " ")
            info(f"[{elapsed}s] #{count} AI 回复 ({status}): {preview}...")
        elif step_type == "TASK_BOUNDARY":
            tb = last.get("taskBoundary", {})
            info(f"[{elapsed}s] #{count} 任务: {tb.get('taskName','')} — {tb.get('taskStatus','')}")
        elif step_type == "RUN_COMMAND":
            cmd = last.get("runCommand", {}).get("command", "")[:60]
            info(f"[{elapsed}s] #{count} 执行命令: {cmd}")
        elif step_type == "NOTIFY_USER":
            nu = last.get("notifyUser", {})
            msg = nu.get("message", "")[:80]
            warn(f"[{elapsed}s] #{count} 需要审批: {msg}")
            if nu.get("isBlocking"):
                info("自动 Proceed...")
                requests.post(f"{BASE}/api/conversations/{cid}/proceed",
                    json={"uri": "", "model": MODEL})
        elif step_type == "SEARCH_WEB":
            q = last.get("searchWeb", {}).get("query", "")
            info(f"[{elapsed}s] #{count} 搜索: {q}")
        else:
            info(f"[{elapsed}s] #{count} {step_type} ({status})")

    # 5. 输出最终结果
    print("\n" + "=" * 80)
    print(c("  最终结果", "1;36"))
    print("=" * 80 + "\n")

    r = requests.get(f"{BASE}/api/conversations/{cid}/steps")
    steps = r.json().get("steps", [])

    print(c(f"总步骤数: {len(steps)}", "33"))
    print(c(f"对话 ID:  {cid}", "33"))
    print()

    # 提取所有 AI 回复
    ai_replies = []
    for s in steps:
        if s.get("plannerResponse"):
            text = s["plannerResponse"].get("modifiedResponse", "")
            if text:
                ai_replies.append(text)

    if ai_replies:
        # 打印最后一条（通常是最终结果）
        print(c("=== 最终 AI 输出 ===", "1;32"))
        print(ai_replies[-1])
    else:
        warn("未获取到 AI 回复")

    # 保存完整输出到文件
    output_file = f"/tmp/workflow_result_{cid[:8]}.md"
    with open(output_file, "w") as f:
        for i, reply in enumerate(ai_replies):
            f.write(f"## AI 回复 #{i+1}\n\n{reply}\n\n---\n\n")
    ok(f"完整结果已保存到: {output_file}")

if __name__ == "__main__":
    main()
