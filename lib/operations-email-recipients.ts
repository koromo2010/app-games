export function mergeOperationsEmailRecipients(configured: string | undefined, registered: string[]) {
  const recipients = [
    ...(configured ?? "").split(/[;,\n]/),
    ...registered,
  ]
    .map((email) => email.trim().toLocaleLowerCase("en-US"))
    .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return [...new Set(recipients)];
}
