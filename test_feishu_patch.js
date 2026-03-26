const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, 'data', 'feishu-config.json');
if (!fs.existsSync(configPath)) {
  console.error("Config not found at", configPath);
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const lark = require('@larksuiteoapi/node-sdk');
const client = new lark.Client({ appId: config.appId, appSecret: config.appSecret });

async function test() {
  console.log('Patching...');
  try {
    const res = await client.im.message.patch({
      path: { message_id: 'om_x100b530ebc0d24b4c4c3291e5e651f3' },
      data: { content: JSON.stringify({ text: "Test patch update from backend!" }) }
    });
    console.log('Result:', res);
  } catch (e) {
    console.error('Network Error:', e);
  }
}
test();
