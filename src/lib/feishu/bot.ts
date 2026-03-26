import * as lark from '@larksuiteoapi/node-sdk';
import { feishuStore } from './store';
import { feishuConfigStore, workspaceBotStore } from './config';
import type { WorkspaceBotConfig } from './config';
import { getOwnerConnection, refreshOwnerMap, convOwnerMap, tryAllServers, getAllConnections, getDynamicConversations } from '@/lib/bridge/gateway';
import * as grpc from '@/lib/bridge/grpc';
import { getWorkspaces, getConversations, addLocalConversation, getGlobalModel, setGlobalModel } from '@/lib/bridge/statedb';
import { discoverLanguageServers } from '@/lib/bridge/discovery';

const _feishuAppClients = new Map<string, lark.Client>();

export function getAppClient(appId?: string, appSecret?: string): lark.Client {
  if (!appId || !appSecret) {
    const config = feishuConfigStore.get();
    appId = config.appId;
    appSecret = config.appSecret;
  }
  if (!appId || !appSecret) {
    throw new Error('Missing Feishu credentials. Please configure the bot first.');
  }

  const key = `${appId}:${appSecret}`;
  let client = _feishuAppClients.get(key);
  if (!client) {
    client = new lark.Client({ appId, appSecret });
    _feishuAppClients.set(key, client);
  }
  return client;
}

function buildCard(text: string) {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [{ tag: "markdown", content: text }]
  });
}

// Helper to send text to feishu
export async function sendFeishuText(receiveId: string, text: string, appId?: string, appSecret?: string, receiveIdType: string = 'open_id') {
  try {
    const res = await getAppClient(appId, appSecret).im.message.create({
      params: { receive_id_type: receiveIdType as any },
      data: {
        receive_id: receiveId,
        content: buildCard(text),
        msg_type: 'interactive',
      },
    });
    return res.data?.message_id;
  } catch (e: any) {
    console.error('Feishu send error:', e);
    throw e; // rethrow so caller try-catch handles it!
  }
}

async function updateFeishuText(messageId: string, text: string, appId?: string, appSecret?: string) {
  try {
    const res = await getAppClient(appId, appSecret).im.message.patch({
      path: { message_id: messageId },
      data: { content: buildCard(text) }
    });
    console.error(`[FEISHU_PATCH_RES] ID=${messageId} -> HTTP ${res.code} ${res.msg}`);
  } catch (e) {
    console.error(`[FEISHU_PATCH_EXCEPTION] ID=${messageId} ->`, e);
  }
}

export async function broadcastFeishuMessage(text: string) {
  const storeData = feishuStore.load();
  const openIds = Object.keys(storeData);
  if (openIds.length === 0) return;
  for (const openId of openIds) {
    await sendFeishuText(openId, text);
  }
}

async function handleWorkspaceSelected(openId: string, wsUri: string) {
  // Find a valid server connection to start cascade
  await refreshOwnerMap();
  const anyConn = Array.from(convOwnerMap.values())[0];
  if (!anyConn) {
    await sendFeishuText(openId, '未找到可用的语言服务器引擎。');
    return;
  }

  const allConvs = await getDynamicConversations();
  const wsConvs = allConvs.filter(c => {
    const sw = c.workspace || '';
    return sw === wsUri || sw.includes(wsUri) || wsUri.includes(sw);
  }).slice(0, 8);
  
  if (wsConvs.length > 0) {
    const listStr = wsConvs.map((c, i) => `${i + 1}. [${c.mtime ? new Date(c.mtime).toLocaleDateString() : '未知时间'}] ${c.title || c.id.slice(0,8)}`).join('\n');
    const optNew = `${wsConvs.length + 1}. ✨ [创建全新会话]`;
    
    feishuStore.updateSession(openId, { 
      state: 'selecting_workspace_history', 
      historyCache: wsConvs.map(c => c.id),
      workspacesCache: [wsUri] 
    });
    
    await sendFeishuText(openId, `已选择工作区：\`${wsUri.split('/').pop()}\`\n\n找到相关的历史会话，请选择要继续，或创建全新:\n\n${listStr}\n${optNew}`);
  } else {
    await sendFeishuText(openId, '正在初始化新会话，请稍候...');
    try {
      const res = await grpc.startCascade(anyConn.port, anyConn.csrf, anyConn.apiKey, wsUri);
      const newId = res.cascadeId;
      if (newId) {
        addLocalConversation(newId, wsUri, '来自飞书的新对话');
        feishuStore.updateSession(openId, { state: 'idle', activeCascadeId: newId });
        await sendFeishuText(openId, `✅ 成功绑定新会话！现在您可以直接输入问题。`);
      }
    } catch (e: any) {
      await sendFeishuText(openId, `创建失败: ${e.message}`);
    }
  }
}

// Global active streams to prevent multiple listeners per cascadeId
const activeStreams = new Map<string, () => void>();

export async function subscribeToAgent(cascadeId: string, feishuOpenId: string, targetAppId?: string, targetAppSecret?: string): Promise<void> {
  return new Promise(async (resolveSub) => {
    if (activeStreams.has(cascadeId)) {
      activeStreams.get(cascadeId)!(); // abort existing
    }

    const conn = await getOwnerConnection(cascadeId);
    if (!conn) {
      resolveSub();
      return;
    }

  let lastSentText = '';
  let replyMessageId: string | undefined;
  let fullSteps: any[] = [];
  let isThinking = true;

  // We immediately create a placeholder message in Feishu
  sendFeishuText(feishuOpenId, '⏳ 思考中...', targetAppId, targetAppSecret).then(msgId => {
    replyMessageId = msgId;
  });

  const updateFeishu = async () => {
    // Find the latest user input so we don't repeat history
    let lastUserInputIndex = -1;
    for (let i = fullSteps.length - 1; i >= 0; i--) {
      if (fullSteps[i]?.type === 'CORTEX_STEP_TYPE_USER_INPUT') {
        lastUserInputIndex = i;
        break;
      }
    }

    let text = '';
    for (let i = lastUserInputIndex + 1; i < fullSteps.length; i++) {
      const step = fullSteps[i];
      if (!step) continue;
      if (step.notifyUser?.notificationContent) {
        text += step.notifyUser.notificationContent + '\n\n';
      } else if (step.plannerResponse) {
        const rawText = step.plannerResponse.modifiedResponse || step.plannerResponse.response || '';
        const cleanText = rawText.replace(/<thought>[\s\S]*?(?:<\/thought>|$)/g, '').trim();
        if (cleanText) text += cleanText + '\n\n';
      }
      if (step.errorMessage?.message || step.errorMessage?.errorMessage) {
        text += '❌ ' + (step.errorMessage.message || step.errorMessage.errorMessage) + '\n\n';
      }
    }
    text = text.trim();

    if (!replyMessageId) return; // Wait for Feishu to allocate the bubble before discarding diffs!
    if (!text && isThinking) return;
    if (text === lastSentText && isThinking) return;

    lastSentText = text;
    const displayText = text || '等待输入...';
    console.error(`[FEISHU_TEXT_PATCH] ID=${replyMessageId} text_len=${text.length} -> "${displayText.slice(0, 50)}..."`);
    await updateFeishuText(replyMessageId, displayText + (isThinking ? ' ⏳' : ''), targetAppId, targetAppSecret);
  };

  const timer = setInterval(updateFeishu, 1500); // 1.5s interval to avoid Feishu rate limits

  let hasTransitionedToRunning = false;

  const abort = grpc.streamAgentState(
    conn.port,
    conn.csrf,
    cascadeId,
    (update: any) => {
      // Resolve the parent Promise the very first time we get state, ensuring the stream is alive!
      resolveSub();

      const stepsUpdate = update?.mainTrajectoryUpdate?.stepsUpdate;
      const status = update?.status || '';
      
      if (status !== 'CASCADE_RUN_STATUS_DONE' && status !== 'CASCADE_RUN_STATUS_IDLE') {
        hasTransitionedToRunning = true;
      }

      if ((status === 'CASCADE_RUN_STATUS_DONE' || status === 'CASCADE_RUN_STATUS_ERROR') && hasTransitionedToRunning) {
        if (isThinking) {
          isThinking = false;
          clearInterval(timer);
          updateFeishu();
          
          // Do NOT blindly abort() here! Keep the stream open just a little bit longer in case trailing updates arrive,
          // or just let the NEXT message's subscribeToAgent call the cleanup function in activeStreams.
          setTimeout(() => {
             // Optional Feishu broadcast hook upon completion
             const statusText = status === 'CASCADE_RUN_STATUS_DONE' ? '✅ 任务执行完毕' : '❌ 任务执行出错';
             sendFeishuText(feishuOpenId, `🔔 [Gateway 提醒]\n会话 ${cascadeId.slice(0, 8)} ${statusText}。`, targetAppId, targetAppSecret);
          }, 1000);
        }
      }

      if (stepsUpdate?.steps?.length) {
        const indices: number[] = stepsUpdate.indices || [];
        const newSteps: any[] = stepsUpdate.steps || [];
        const totalLength: number = stepsUpdate.totalLength || 0;

        if (indices.length > 0 && indices.length === newSteps.length) {
          if (totalLength > fullSteps.length) fullSteps.length = totalLength;
          for (let i = 0; i < indices.length; i++) fullSteps[indices[i]] = newSteps[i];
        } else if (newSteps.length >= fullSteps.length) {
          fullSteps = [...newSteps];
        }
        console.error(`[STREAM_UPDATE] fullSteps len=${fullSteps.length}`);
      }
    },
    (err: Error) => {
      isThinking = false;
      clearInterval(timer);
      console.warn('Stream disconnect', err);
      resolveSub(); // In case it errors immediately
    }
  );

  activeStreams.set(cascadeId, () => {
    clearInterval(timer);
    abort();
    activeStreams.delete(cascadeId);
  });
  }); // End Promise
}

let activeWSClient: lark.WSClient | null = null;

// --- Workspace-specific WSClients ---
const workspaceWSClients = new Map<string, lark.WSClient>();

export async function startFeishuClient(): Promise<{ success: boolean; error?: string }> {
  const config = feishuConfigStore.get();
  if (!config.appId || !config.appSecret) {
    console.log('[Feishu] No AppID or AppSecret found, skipping WSClient initialization.');
    return { success: false, error: 'AppID/Secret为空' };
  }

  // Currently lark-wsclient doesn't expose a clean stop/disconnect method publicly out of the box that works universally
  // We can just create a new client and let the old one garbage collect or sever its connection by discarding references
  // (In a perfect scenario, there'd be activeWSClient.disconnect() or .stop())
  if (activeWSClient) {
    console.log('[Feishu] Discarding previous WSClient instance.');
  }

  try {
    activeWSClient = new lark.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
    });

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        console.error('[FEISHU_RAW_EVENT_RECEIVED]', JSON.stringify(data).slice(0, 400));
        const openId = (data?.sender?.sender_id as any)?.open_id;
        const unionId = (data?.sender?.sender_id as any)?.union_id;
    if (!openId) {
      console.error('[Feishu] No openId found in event data. Full sender:', JSON.stringify(data?.sender));
      return;
    }

    let text = '';
    try {
      if (data.message.message_type === 'text') {
        text = JSON.parse(data.message.content).text;
      }
    } catch {}

    const session = feishuStore.getSession(openId);
    text = text.trim();
    
    // Explicitly persist the session to disk if it's their first interaction
    // This allows the broadcast API to discover their openId later!
    feishuStore.updateSession(openId, { state: session.state, unionId });

    const helpContent = `👋 欢迎使用 Antigravity 飞书智能助手！

我可以通过指令帮您无缝连接本地的 Antigravity 开发环境。请尝试发送以下指令：

📁 /new, /p —— 查看并切换工作区 (自动提供历史会话或新建)
🕰️ /history, /h —— 恢复近期的历史会话
🧠 /model, /m —— 切换全局默认 AI 模型
📊 /usage, /u —— 查询这 30 天的总 Token 消耗量
💡 /help, /? —— 查看此帮助信息

👉 提示：在每次开始提问前，请先确保您已经选定了一个项目工作空间。`;

    const lowerText = text.toLowerCase();

    if (lowerText === '/help' || lowerText === '帮助' || lowerText === '/h' || lowerText === '/?' || lowerText === '?' || lowerText === 'help') {
      await sendFeishuText(openId, helpContent);
      return;
    }

    if (lowerText === '/usage' || lowerText === '/u') {
      try {
        const data = await tryAllServers((p, c, a) => grpc.getModelConfigs(p, c, a));
        const models = data.clientModelConfigs || [];
        
        let quotaText = '各模型当前可用额度：\n';
        models.forEach((m: any) => {
          if (m.quotaInfo?.remainingFraction !== undefined) {
            const pct = Math.round(m.quotaInfo.remainingFraction * 100);
            quotaText += `- ${m.label}: ${pct}%\n`;
          }
        });

        const convs = await getDynamicConversations();
        const totalConvs = convs.length;
        const totalSteps = convs.reduce((sum, c) => sum + (c.steps || 0), 0);
        
        await sendFeishuText(openId, `📊 [全局用量查询]\n\n${quotaText}\n本地终端统计：\n- 总会话数: ${totalConvs.toLocaleString()}\n- 交互轮数: ${totalSteps.toLocaleString()}`);
      } catch (e: any) {
        await sendFeishuText(openId, `查询失败: ${e.message}`);
      }
      return;
    }

    if (lowerText === '/model' || lowerText === '/m') {
      try {
        const data = await tryAllServers((p, c, a) => grpc.getModelConfigs(p, c, a));
        const models = data.clientModelConfigs || [];
        if (models.length === 0) {
          await sendFeishuText(openId, '当前没有可用的模型。');
          return;
        }
        const currentModel = getGlobalModel() || 'MODEL_AUTO';
        const listStr = models.map((m: any, i: number) => {
          const isCurrent = m.modelOrAlias?.model === currentModel;
          return `${i + 1}. ${m.label} ${isCurrent ? '✅ (当前)' : ''}`;
        }).join('\n');
        feishuStore.updateSession(openId, { state: 'selecting_model', modelsCache: models.map((m:any) => ({ id: m.modelOrAlias?.model, label: m.label })) });
        await sendFeishuText(openId, `请选择全局默认使用的模型编号 (1-${models.length}):\n\n${listStr}`);
      } catch (e: any) {
        await sendFeishuText(openId, `获取模型列表失败: ${e.message}`);
      }
      return;
    }

    if (lowerText === '/new' || lowerText === '/projects' || lowerText === '/list' || lowerText === '/switch' || lowerText === '/p' || lowerText === '/n') {
      const wss = getWorkspaces();
      if (!wss || wss.length === 0) {
        await sendFeishuText(openId, '当前没有可用的工作区。');
        return;
      }
      const listStr = wss.map((w, i) => `${i + 1}. \`${w.uri.split('/').pop() || w.uri}\``).join('\n');
      feishuStore.updateSession(openId, { state: 'selecting_workspace', workspacesCache: wss.map(w => w.uri) });
      await sendFeishuText(openId, `请选择工作区编号 (1-${wss.length}):\n\n${listStr}`);
      return;
    }

    if (lowerText === '/history' || lowerText === '/his') {
      const convs = (await getDynamicConversations()).slice(0, 10);
      if (convs.length === 0) {
        await sendFeishuText(openId, '近期没有历史会话。');
        return;
      }
      const listStr = convs.map((c, i) => `${i + 1}. [${c.mtime ? new Date(c.mtime).toLocaleDateString() : '未知时间'}] ${c.title || c.id.slice(0,8)}`).join('\n');
      feishuStore.updateSession(openId, { state: 'selecting_history', historyCache: convs.map(c => c.id) });
      await sendFeishuText(openId, `请选择要恢复的历史会话编号 (1-${convs.length}):\n\n${listStr}`);
      return;
    }

    if (session.state === 'selecting_model') {
      const idx = parseInt(text) - 1;
      const modelsConfigs = session.modelsCache || [];
      if (!isNaN(idx) && idx >= 0 && idx < modelsConfigs.length) {
        const selModel = typeof modelsConfigs[idx] === 'string' ? modelsConfigs[idx] : (modelsConfigs[idx] as any).id;
        const selLabel = typeof modelsConfigs[idx] === 'string' ? selModel : (modelsConfigs[idx] as any).label;
        
        setGlobalModel(selModel);
        feishuStore.updateSession(openId, { state: 'idle', preferredModel: selModel });
        await sendFeishuText(openId, `✅ 成功设置全局默认模型为: **${selLabel}**\n(Web UI 同步生效)`);
      } else {
        await sendFeishuText(openId, '编号无效，请重试或发送 /m 重新选择。');
      }
      return;
    }

    if (session.state === 'selecting_workspace') {
      const idx = parseInt(text) - 1;
      const wss = session.workspacesCache || [];
      if (!isNaN(idx) && idx >= 0 && idx < wss.length) {
        const wsUri = wss[idx];
        const wsName = wsUri.split('/').pop() || wsUri;
        
        // Check if this workspace has bound workspace bots
        const boundBots = workspaceBotStore.getAll().filter(
          b => b.workspaceUri === wsUri && b.enabled && b.appId && b.appSecret
        );
        
        if (boundBots.length > 0) {
          // Offer delegation choice
          const botListStr = boundBots.map((b, i) => 
            `${i + 1}. 🤖 委托给专属机器人 **${b.label || b.appId.slice(0, 10) + '...'}**${b.preferredModel ? ` (模型: ${b.preferredModel})` : ''}`
          ).join('\n');
          const globalOption = `${boundBots.length + 1}. 🌐 继续使用全局机器人处理`;
          
          feishuStore.updateSession(openId, {
            state: 'selecting_delegation',
            workspacesCache: [wsUri],
            // Store bot appIds for lookup when user responds
            historyCache: boundBots.map(b => b.appId),
          });
          
          await sendFeishuText(openId, 
            `已选择工作区：\`${wsName}\`\n\n` +
            `🔔 检测到该工作区已绑定 ${boundBots.length} 个专属机器人：\n\n` +
            `${botListStr}\n${globalOption}\n\n` +
            `请选择编号 (1-${boundBots.length + 1})：`
          );
        } else {
          // No workspace bots — proceed directly (original flow)
          await handleWorkspaceSelected(openId, wsUri);
        }
      } else {
        await sendFeishuText(openId, '编号无效，请重试或发送 /new 重新选择。');
      }
      return;
    }
    
    if (session.state === 'selecting_delegation') {
      const idx = parseInt(text) - 1;
      const wsUri = session.workspacesCache?.[0];
      const botAppIds = session.historyCache || [];
      
      if (!wsUri) {
        await sendFeishuText(openId, '会话状态异常，请重新发送 /new');
        feishuStore.updateSession(openId, { state: 'idle' });
        return;
      }
      
      if (!isNaN(idx) && idx >= 0 && idx < botAppIds.length) {
        // User chose to delegate to a workspace bot
        const selectedBot = workspaceBotStore.getByAppId(botAppIds[idx]);
        if (!selectedBot) {
          await sendFeishuText(openId, '未找到对应的专属机器人配置，请重试。');
          return;
        }
        
        const botLabel = selectedBot.label || selectedBot.appId.slice(0, 10) + '...';
        
        // Send a notification to the user via the workspace bot so they can continue there
        try {
          if (!session.unionId) {
            throw new Error('当前会话未记录您的跨应用 union_id，暂无法跨应用唤醒机器人。请在专属机器人中主动发消息开启会话。');
          }
          await sendFeishuText(session.unionId,
            `👋 您好！全局机器人已将您引导至此。\n\n` +
            `我是 **${botLabel}** 专属机器人，绑定工作区：\`${wsUri.split('/').pop()}\`\n\n` +
            `请直接在此对话中输入您的问题或指令，我会专注处理该工作区的任务。`,
            selectedBot.appId, selectedBot.appSecret, 'union_id'
          );
          
          await sendFeishuText(openId, 
            `✅ 已通知专属机器人 **${botLabel}**\n\n` +
            `📲 请切换到专属机器人的对话窗口继续操作。\n` +
            `💡 提示：您也可以随时回到这里使用全局指令（/new, /model 等）。`
          );
        } catch (e: any) {
          await sendFeishuText(openId, `⚠️ 无法联系专属机器人: ${e.message}\n\n将使用全局机器人继续...`);
          await handleWorkspaceSelected(openId, wsUri);
        }
        
        feishuStore.updateSession(openId, { state: 'idle' });
      } else if (!isNaN(idx) && idx === botAppIds.length) {
        // User chose to continue with global bot
        await sendFeishuText(openId, '好的，将使用全局机器人继续。');
        await handleWorkspaceSelected(openId, wsUri);
      } else {
        await sendFeishuText(openId, `编号无效，请输入 1-${botAppIds.length + 1}。`);
      }
      return;
    }

    if (session.state === 'selecting_workspace_history') {
      const idx = parseInt(text) - 1;
      const hists = session.historyCache || [];
      const wsUri = session.workspacesCache?.[0];

      if (!isNaN(idx) && idx >= 0 && idx < hists.length) {
        const selId = hists[idx];
        feishuStore.updateSession(openId, { state: 'idle', activeCascadeId: selId });
        await sendFeishuText(openId, `✅ 成功恢复历史会话！可继续提问。`);
      } else if (!isNaN(idx) && idx === hists.length) {
        await sendFeishuText(openId, `正在初始化新会话，请稍候...`);
        await refreshOwnerMap();
        const anyConn = Array.from(convOwnerMap.values())[0];
        if (!anyConn) {
          await sendFeishuText(openId, '未找到可用的语言服务器引擎。');
          return;
        }
        try {
          const res = await grpc.startCascade(anyConn.port, anyConn.csrf, anyConn.apiKey, wsUri!);
          const newId = res.cascadeId;
          if (newId) {
            addLocalConversation(newId, wsUri!, '来自飞书的新对话');
            feishuStore.updateSession(openId, { state: 'idle', activeCascadeId: newId });
            await sendFeishuText(openId, `✅ 成功绑定新会话！现在您可以直接输入问题。`);
          }
        } catch (e: any) {
          await sendFeishuText(openId, `创建失败: ${e.message}`);
        }
      } else {
        await sendFeishuText(openId, '编号无效，请重试或发送 /new 重新选择。');
      }
      return;
    }

    if (session.state === 'selecting_history') {
      const idx = parseInt(text) - 1;
      const hists = session.historyCache || [];
      if (!isNaN(idx) && idx >= 0 && idx < hists.length) {
        const selId = hists[idx];
        feishuStore.updateSession(openId, { state: 'idle', activeCascadeId: selId });
        await sendFeishuText(openId, `✅ 成功恢复历史会话！可继续提问。`);
      } else {
        await sendFeishuText(openId, '编号无效，请重试或发送 /history 重新选择。');
      }
      return;
    }

    // Normal message mode
    if (!session.activeCascadeId) {
      await sendFeishuText(openId, helpContent);
      return;
    }

    // Forward to Antigravity
    let conn = await getOwnerConnection(session.activeCascadeId);
    if (!conn) {
      await refreshOwnerMap();
      conn = await getOwnerConnection(session.activeCascadeId);
      if (!conn) {
        await sendFeishuText(openId, '无法连接到该会话的服务端，可能服务端已下线。');
        return;
      }
    }

    try {
      let targetModel = session.preferredModel || getGlobalModel() || 'MODEL_AUTO';
      
      if (targetModel === 'MODEL_AUTO') {
        try {
          const mData = await grpc.getModelConfigs(conn.port, conn.csrf, conn.apiKey);
          if (mData?.clientModelConfigs?.length) {
            const models = mData.clientModelConfigs;
            const priority = ['MODEL_PLACEHOLDER_M26', 'MODEL_PLACEHOLDER_M37', 'MODEL_PLACEHOLDER_M36', 'MODEL_PLACEHOLDER_M35', 'MODEL_PLACEHOLDER_M47'];
            let found = false;
            for (const p of priority) {
              const conf = models.find((m: any) => m.modelOrAlias?.model === p);
              if (conf && conf.quotaInfo?.remainingFraction !== undefined && conf.quotaInfo.remainingFraction > 0) {
                targetModel = p;
                found = true;
                break;
              }
            }
            if (!found) {
              targetModel = models.find((m: any) => m.modelOrAlias?.model === 'MODEL_PLACEHOLDER_M47')?.modelOrAlias?.model
                            || models[0]?.modelOrAlias?.model || 'MODEL_PLACEHOLDER_M26';
            }
          } else {
            targetModel = 'MODEL_PLACEHOLDER_M26';
          }
        } catch (e) {
          console.warn('[Feishu] Auto model resolution failed, fallback to M26', e);
          targetModel = 'MODEL_PLACEHOLDER_M26';
        }
      }

      console.log(`[Feishu] 🚀 Forwarding message to Cascade ${session.activeCascadeId} using model: ${targetModel}`);
      // MUST subscribe BEFORE sending the message so the backend does not drop it due to 0 active subscribers!
      await subscribeToAgent(session.activeCascadeId, openId);
      await grpc.sendMessage(conn.port, conn.csrf, conn.apiKey, session.activeCascadeId, text, targetModel);
    } catch (e: any) {
      await sendFeishuText(openId, `发送失败: ${e.message}`);
    }
  } // ends the async (data) => function body
    }); // ends eventDispatcher.register({...});

    await activeWSClient.start({ eventDispatcher });
    console.log('[Feishu] Global WebSocket client started successfully.');
    
    // Attempt a proactive broadcast if possible
    try {
      await broadcastFeishuMessage("✅ [系统测试] 您已在 Antigravity 成功保存配置，长链接收发通道目前完全畅通无阻！");
    } catch {}

    // Also boot all enabled workspace bots
    await startAllWorkspaceBots();

    return { success: true };
  } catch (e: any) {
    console.error('[Feishu] Failed to start WebSocket client:', e);
    return { success: false, error: e.message };
  }
}

/**
 * Start a workspace-specific Feishu WebSocket client.
 * Messages received by this bot are automatically scoped to the bound workspace.
 */
export async function startWorkspaceBotClient(botConfig: WorkspaceBotConfig): Promise<{ success: boolean; error?: string }> {
  if (!botConfig.appId || !botConfig.appSecret || !botConfig.enabled) {
    return { success: false, error: '配置不完整或未启用' };
  }

  // Stop existing client for this workspace if any
  const existing = workspaceWSClients.get(botConfig.workspaceUri);
  if (existing) {
    console.log(`[Feishu] Discarding previous WSClient for workspace: ${botConfig.workspaceUri}`);
  }

  try {
    const wsClient = new lark.WSClient({
      appId: botConfig.appId,
      appSecret: botConfig.appSecret,
    });

    const wsUri = botConfig.workspaceUri;
    const wsLabel = botConfig.label || wsUri.split('/').pop() || wsUri;

    const eventDispatcher = new lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        console.error(`[FEISHU_WS_BOT] workspace=${wsLabel}`, JSON.stringify(data).slice(0, 300));
        const openId = (data?.sender?.sender_id as any)?.open_id;
        if (!openId) return;

        let text = '';
        try {
          if (data.message.message_type === 'text') {
            text = JSON.parse(data.message.content).text;
          }
        } catch {}
        text = text.trim();

        feishuStore.updateSession(openId, { state: 'idle' });

        if (!text || text === '/help' || text === '?' || text === 'help') {
          await sendFeishuText(openId,
            `🤖 您好！我是 **${wsLabel}** 的专属机器人。\n\n` +
            `💬 请直接发送指令或问题，我会专注于操作此工作区的代码与任务。\n` +
            `📁 绑定工作区: \`${wsUri.split('/').pop()}\``,
            botConfig.appId, botConfig.appSecret
          );
          return;
        }

        // Find the language server for this specific workspace
        const servers = await discoverLanguageServers();
        const targetServer = servers.find(s => 
          s.workspace?.includes(wsUri.replace('file://', '')) || wsUri.includes(s.workspace || '\0')
        ) || servers[0];

        if (!targetServer) {
          await sendFeishuText(openId, '❌ 未找到该工作区的运行实例，请先启动对应的工作空间。', botConfig.appId, botConfig.appSecret);
          return;
        }

        const session = feishuStore.getSession(openId);
        let cascadeId = session.activeCascadeId;

        // If no active cascade or it belongs to a different workspace, start a new one
        if (!cascadeId) {
          try {
            const { getApiKey } = await import('@/lib/bridge/statedb');
            const apiKey = getApiKey();
            if (!apiKey) {
              await sendFeishuText(openId, '❌ API Key 未找到。', botConfig.appId, botConfig.appSecret);
              return;
            }
            const res = await grpc.startCascade(targetServer.port, targetServer.csrf, apiKey, wsUri);
            cascadeId = res.cascadeId;
            if (cascadeId) {
              addLocalConversation(cascadeId, wsUri, `来自 ${wsLabel} 机器人`);
              feishuStore.updateSession(openId, { state: 'idle', activeCascadeId: cascadeId });
            }
          } catch (e: any) {
            await sendFeishuText(openId, `❌ 创建会话失败: ${e.message}`, botConfig.appId, botConfig.appSecret);
            return;
          }
        }

        if (!cascadeId) return;

        try {
          const { getApiKey } = await import('@/lib/bridge/statedb');
          const apiKey = getApiKey();
          let targetModel = botConfig.preferredModel || session.preferredModel || getGlobalModel() || 'MODEL_AUTO';
          
          if (targetModel === 'MODEL_AUTO') {
            try {
              const mData = await grpc.getModelConfigs(targetServer.port, targetServer.csrf, apiKey!);
              if (mData?.clientModelConfigs?.length) {
                const models = mData.clientModelConfigs;
                const priority = ['MODEL_PLACEHOLDER_M26', 'MODEL_PLACEHOLDER_M37', 'MODEL_PLACEHOLDER_M36', 'MODEL_PLACEHOLDER_M35', 'MODEL_PLACEHOLDER_M47'];
                let found = false;
                for (const p of priority) {
                  const conf = models.find((m: any) => m.modelOrAlias?.model === p);
                  if (conf && conf.quotaInfo?.remainingFraction !== undefined && conf.quotaInfo.remainingFraction > 0) {
                    targetModel = p;
                    found = true;
                    break;
                  }
                }
                if (!found) {
                  targetModel = models.find((m: any) => m.modelOrAlias?.model === 'MODEL_PLACEHOLDER_M47')?.modelOrAlias?.model
                                || models[0]?.modelOrAlias?.model || 'MODEL_PLACEHOLDER_M26';
                }
              } else {
                targetModel = 'MODEL_PLACEHOLDER_M26';
              }
            } catch (e) {
              console.warn('[Feishu] Auto model resolution failed, fallback to M26', e);
              targetModel = 'MODEL_PLACEHOLDER_M26';
            }
          }
          
          
          // MUST subscribe BEFORE sending the message!
          await subscribeToAgent(cascadeId, openId, botConfig.appId, botConfig.appSecret);
          await grpc.sendMessage(targetServer.port, targetServer.csrf, apiKey!, cascadeId, text, targetModel);
        } catch (e: any) {
          await sendFeishuText(openId, `❌ 发送失败: ${e.message}`, botConfig.appId, botConfig.appSecret);
        }
      }
    });

    await wsClient.start({ eventDispatcher });
    workspaceWSClients.set(wsUri, wsClient);
    console.log(`[Feishu] Workspace bot started: ${wsLabel} (appId=${botConfig.appId.slice(0, 10)}...)`);
    return { success: true };
  } catch (e: any) {
    console.error(`[Feishu] Failed to start workspace bot for ${botConfig.workspaceUri}:`, e);
    return { success: false, error: e.message };
  }
}

/** Start all enabled workspace bots */
export async function startAllWorkspaceBots() {
  const bots = workspaceBotStore.getAll().filter(b => b.enabled);
  for (const bot of bots) {
    if (!workspaceWSClients.has(bot.workspaceUri)) {
      await startWorkspaceBotClient(bot);
    }
  }
}

/** Stop a workspace bot */
export function stopWorkspaceBotClient(workspaceUri: string) {
  const client = workspaceWSClients.get(workspaceUri);
  if (client) {
    console.log(`[Feishu] Stopping workspace bot for: ${workspaceUri}`);
    workspaceWSClients.delete(workspaceUri);
  }
}

/** Get status of all workspace bots */
export function getWorkspaceBotStatuses() {
  const bots = workspaceBotStore.getAll();
  return bots.map(b => ({
    workspaceUri: b.workspaceUri,
    label: b.label,
    appId: b.appId,
    preferredModel: b.preferredModel,
    enabled: b.enabled,
    connected: workspaceWSClients.has(b.workspaceUri)
  }));
}



