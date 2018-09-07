import moment from 'moment'
import { isEmpty } from 'lodash'
import { query, sql } from 'pgr'

const debug = false

const Player = {
    async find(shardId, { id, name }) {
        return query.one(sql`
            SELECT id, name, last_fetched_at AS "lastFetchedAt"
            FROM players p
            WHERE shard_id = ${shardId}
                ${sql.if('AND id = ?', id)}
                ${sql.if('AND name = ?', name)}
        `, {
            rowMapper: row => ({ ...row, shardId }),
            debug,
        })
    },

    async createOrUpdate(pubgPlayer) {
        const { name, shardId } = pubgPlayer.attributes

        const player = {
            id: pubgPlayer.id,
            name,
        }

        const now = Date.now()
        const matches = pubgPlayer.relationships.matches.data.map((d, i) => [
            d.id,
            shardId,
            moment.utc(now - (i * 1000)).format('YYYY-MM-DD HH:mm:ss'),
        ]).slice(0, 50)
        const matchPlayers = matches.map(m => [m[0], player.id, player.name])

        await query(sql`
            INSERT INTO players (id, shard_id, name, last_fetched_at)
            VALUES (${player.id}, ${shardId}, ${player.name}, TIMEZONE('utc', NOW()))
            ON CONFLICT (id, shard_id) DO UPDATE
                SET last_fetched_at = TIMEZONE('utc', NOW())
        `, { debug })

        if (!isEmpty(matches)) {
            await query(sql`
                INSERT INTO matches (id, shard_id, created_at)
                VALUES ${matches}
                ON CONFLICT DO NOTHING
            `, { debug })
        }

        if (!isEmpty(matchPlayers)) {
            await query(sql`
                INSERT INTO match_players (match_id, player_id, player_name)
                VALUES ${matchPlayers}
                ON CONFLICT DO NOTHING
            `, { debug })
        }


        return this.find(shardId, { id: pubgPlayer.id })
    },
}

export default Player
