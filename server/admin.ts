/** Only stable Discord IDs from server configuration grant administrator access. */
export const adminDiscordIds = () => (process.env.DISCORD_ADMIN_IDS ?? '').split(',').map(id => id.trim()).filter(id => /^\d{17,20}$/.test(id));

export function createAdminCheck(findDiscordId: (accountId: number) => Promise<string | undefined>) {
  return async (accountId: number): Promise<boolean> => {
    const admins = adminDiscordIds();
    if (admins.length === 0) return false;
    const discordId = await findDiscordId(accountId);
    return discordId !== undefined && admins.includes(discordId);
  };
}
