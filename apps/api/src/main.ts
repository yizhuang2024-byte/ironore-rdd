import { config } from './config.js';
import { buildServer } from './server.js';

const app = await buildServer();

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`API 文件：http://localhost:${config.PORT}/docs`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.log.info(`收到 ${signal}，正在關閉…`);
    void app.close().then(() => process.exit(0));
  });
}
