export interface Config {
  port: number;
  jwtSecret: string;
  dbPath: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
}

export function loadConfig(env = process.env): Config {
  const jwtSecret = env.JWT_SECRET ?? (env.NODE_ENV === 'production' ? undefined : 'dev-only-jwt-secret-change-me');
  if (!jwtSecret) throw new Error('JWT_SECRET is required in production');
  return {
    port: Number(env.PORT ?? 4000),
    jwtSecret,
    dbPath: env.DB_PATH ?? 'classroom.db',
    livekitUrl: env.LIVEKIT_URL ?? 'ws://localhost:7880',
    livekitApiKey: env.LIVEKIT_API_KEY ?? 'devkey',
    livekitApiSecret: env.LIVEKIT_API_SECRET ?? 'secret',
  };
}
