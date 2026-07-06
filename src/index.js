const { createApp } = require("./server");
const { loadConfig } = require("./config");

const config = loadConfig();
const { server } = createApp({ config });

server.listen(config.port, () => {
  process.stdout.write(`Listening on http://127.0.0.1:${config.port}\n`);
});
