import 'dotenv/config';
import { config } from './src/config.js';
import { createApp } from './src/app.js';

const app = createApp({ config });
app.listen(config.PORT, () => console.log(`NovaPay → http://localhost:${config.PORT}/dashboard.html  | PayPal sandbox: ${config.hasPayPal ? 'on' : 'off'} | AI: ${config.hasAI ? config.ANTHROPIC_MODEL : 'off'}`));
