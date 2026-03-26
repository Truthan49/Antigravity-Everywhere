import * as lark from '@larksuiteoapi/node-sdk';
import * as fs from 'fs';

async function run() {
  try {
    const config = require('./src/lib/feishu/config').feishuConfigStore.get();
    if (!config || !config.appId) {
       console.error("Feishu config not found");
       return;
    }
    const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });

    const feishuStore = require('./src/lib/feishu/store').feishuStore.load();
    const openIds = Object.keys(feishuStore);
    if (openIds.length === 0) {
      console.error("No users found in feishu store.");
      return;
    }
    const openId = openIds[0];
    console.log('Sending plan to Feishu user:', openId);

    const markdownText = fs.readFileSync('/Users/hanyi/.gemini/antigravity/brain/3d015661-1cdf-4b71-b802-42caa6c1fb9e/implementation_plan.md', 'utf8');

    const res = await client.im.message.create({
      params: { receive_id_type: 'open_id' },
      data: { 
        receive_id: openId, 
        msg_type: 'interactive',
        content: JSON.stringify({
          config: { wide_screen_mode: true },
          header: {
            title: { tag: "plain_text", content: "📋 项目优化与漏洞修复计划" },
            template: "turquoise"
          },
          elements: [{
            tag: "markdown",
            content: markdownText
          }]
        })
      }
    });

    if (res.code === 0) {
      console.log("Successfully sent message to Feishu!");
    } else {
      console.error("Failed to send:", res);
    }
  } catch (error) {
    console.error("Script error:", error);
  }
}

run();
