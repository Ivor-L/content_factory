export function formatDashboardTimestamp(input: string | number | Date | null | undefined) {
  if (input === null || input === undefined) {
    return "未知时间";
  }

  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return typeof input === "string" ? input : "未知时间";
  }

  const pad = (value: number) => value.toString().padStart(2, "0");
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());

  return `${month}/${day} ${hours}:${minutes} UTC`;
}
