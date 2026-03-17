type ReadEnvOptions = {
  defaultValue?: string;
  optional?: boolean;
  allowEmpty?: boolean;
};

export function readEnv(name: string, options?: ReadEnvOptions): string | undefined {
  const raw = process.env[name];
  const value =
    raw === undefined || raw === null
      ? undefined
      : options?.allowEmpty
        ? raw
        : raw.trim() || undefined;

  if (value !== undefined) {
    return value;
  }

  if (options?.defaultValue !== undefined) {
    return options.defaultValue;
  }

  if (options?.optional) {
    return undefined;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}

export function requireEnv(name: string, allowEmpty = false): string {
  const value = readEnv(name, { optional: false, allowEmpty });
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
