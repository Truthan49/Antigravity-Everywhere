import * as lark from '@larksuiteoapi/node-sdk';
import { feishuConfigStore } from './src/lib/feishu/config';
const config = feishuConfigStore.get();
const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });

function makeCard(text: string) {
  return JSON.stringify({
    config: { wide_screen_mode: true },
    elements: [{ tag: "markdown", content: text }]
  });
}

async function run() {
  const feishuStore = require('./src/lib/feishu/store').feishuStore.load();
  const openId = Object.keys(feishuStore)[0];
  console.log('Sending to', openId);

  const res = await client.im.message.create({
    params: { receive_id_type: 'open_id' },
    data: { receive_id: openId, content: makeCard("Initial Text!"), msg_type: 'interactive' }
  });
  console.log('Created ID:', res.data?.message_id);

  if (res.data?.message_id) {
    const patchRes = await client.im.message.patch({
      path: { message_id: res.data.message_id },
      data: { content: makeCard("Updated Text!!") }
    });
    console.log('Patch Res:', patchRes.code, patchRes.msg);
  }
}
run();
