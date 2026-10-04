import { buildApp } from './app';
import { loadConfig } from './config';

const cfg = loadConfig();
const app = buildApp(cfg);
app.listen({ port: cfg.port, host: '0.0.0.0' }).then(() => console.log(`API listening on :${cfg.port}`));
