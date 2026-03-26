const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('data/grpc-intercept-1774022423994.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('发文件和图片了')) {
    try {
      const data = JSON.parse(line);
      fs.writeFileSync('data/payload.json', JSON.stringify(data, null, 2));
      console.log('Found payload!');
      process.exit(0);
    } catch (e) {
      console.error(e);
    }
  }
});
