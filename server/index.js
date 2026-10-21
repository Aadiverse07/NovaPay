import 'dotenv/config';

try {
  const [{ config }, { createApp }] = await Promise.all([import('./src/config.js'), import('./src/app.js')]);
  const app = createApp({ config });
  app.listen(config.PORT, () => console.log(`NovaPay → http://localhost:${config.PORT}/dashboard.html  | PayPal sandbox: ${config.hasPayPal ? 'on' : 'off'} | AI: ${config.hasAI ? config.ANTHROPIC_MODEL : 'off'}`));
} catch (error) {
  const message = error instanceof Error && error.message.startsWith('Invalid NovaPay configuration:') ? error.message : 'NovaPay server failed to start.';
  console.error(message);
  process.exitCode = 1;
}
