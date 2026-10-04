export interface Config {
  port: number;
  jwtSecret: string;
  dbPath: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  /** Where the invite page sends students who do not have the app yet. */
  downloadUrl: string;
}

export function loadConfig(env = process.env): Config {
  const jwtSecret = env.JWT_SECRET ?? (env.NODE_ENV === 'production' ? undefined : 'dev-only-jwt-secret-change-me');
  if (!jwtSecret) throw new Error('JWT_SECRET is required in production');
  return {
    port: Number(env.PORT ?? 4000),
    jwtSecret,
    dbPath: env.DB_PATH ?? 'brightboard.db',
    livekitUrl: env.LIVEKIT_URL ?? 'ws://localhost:7880',
    livekitApiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    livekitApiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
    downloadUrl: env.DOWNLOAD_URL ?? 'https://github.com/',
  };
}
