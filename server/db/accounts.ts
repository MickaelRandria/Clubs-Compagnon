import { sql } from 'drizzle-orm';
import type { Account, AccountStore } from '../auth-http.js';
import type { DiscordUser } from '../discord.js';
import { getDb } from './client.js';

const row = (r: Record<string, unknown>): Account => ({
  id: Number(r.id), username: String(r.username),
  displayName: r.display_name === null ? null : String(r.display_name),
  avatarUrl: r.avatar_url === null ? null : String(r.avatar_url),
});

/** Un compte par identifiant Discord. Une reconnexion rafraîchit pseudo et avatar. */
export const accountStore: AccountStore = {
  upsert: async (user: DiscordUser) => {
    const result = await getDb().execute(sql`
      insert into club_accounts(discord_id, username, display_name, avatar_url)
      values (${user.discordId}, ${user.username}, ${user.displayName}, ${user.avatarUrl})
      on conflict (discord_id) do update set
        username = excluded.username, display_name = excluded.display_name,
        avatar_url = excluded.avatar_url, last_seen_at = now()
      returning id, username, display_name, avatar_url`);
    return row(result.rows[0] as Record<string, unknown>);
  },
  find: async (id: number) => {
    const result = await getDb().execute(sql`
      select id, username, display_name, avatar_url from club_accounts where id = ${id} limit 1`);
    const first = result.rows[0] as Record<string, unknown> | undefined;
    return first ? row(first) : undefined;
  },
};
