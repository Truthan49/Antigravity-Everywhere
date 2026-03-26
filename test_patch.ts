import * as lark from '@larksuiteoapi/node-sdk';
import { feishuConfigStore } from './src/lib/feishu/config';
const config = feishuConfigStore.get();
console.log('Got Config:', !!config.appId);
const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });

async function run() {
  try {
    const res = await client.im.message.patch({
      path: { message_id: 'om_x100b530ebc0d24b4c4c3291e5e651f3' },
      data: { content: JSON.stringify({ text: "Test API Update!" }) }
    });
    console.log('PATCH RESPONSE:', res);
  } catch (e) {
    console.error('PATCH EXCEPTION:', e);
  }
}
run();
