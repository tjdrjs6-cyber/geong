import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import mysql from 'mysql2/promise'
import { houseCoinFor, houseCoinSlot, HOUSE_COIN_MS, BEETLE_ID, weedCoinMultiplier, WEED_MAX } from './game.mjs'
import { CHARACTER_IDS, STARTING_COINS, claimDaily, spinRoulette, normalizeOwned, pull, settleWeed, validateCredentials, validateNickname, weedIntervalMs, weedCoinsPerHour, weedEarnedBetweenSlots, weedFieldEarnedBetweenSlots, WEED_HOUR_MS, POWER, settleBattle, DECO_IDS, DECO_NEW_BONUS, normalizeDecos, pullDecos, validateHouse, normalizeHouse, validateMail, MAIL_DAILY_COINS, checkInDay, normalizeDupes, addDupes, sellCharacter, sellDeco, MAILBOX_MAX, validateSuggestion, SUGGEST_REPLY_MAX_CHARS, SUGGEST_DAILY_MAX } from './game.mjs'

const scrypt = promisify(scryptCb)
const PORT = Number(process.env.PORT || 3000)
const COOKIE = 'gm_session'
const SESSION_DAYS = 30
const MAX_BODY = 16 * 1024

let pool
let ready = false
let readyError = ''

function databaseUrl() {
  return process.env.DATABASE_URL || process.env.DRIZZLE_DATABASE_URL || ''
}

async function prepareDatabase() {
  const url = new URL(databaseUrl())
  pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ...(process.env.DB_SSL === 'false' ? {} : { ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true } }),
    connectionLimit: 5,
    waitForConnections: true,
  })
  // Additive, repeatable migration; existing accounts and saves are preserved.
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_rps (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    slot VARCHAR(24) NOT NULL DEFAULT '',
    stage TINYINT UNSIGNED NOT NULL DEFAULT 1,
    phase VARCHAR(16) NOT NULL DEFAULT 'none',
    choice VARCHAR(8) NOT NULL DEFAULT '',
    deadline BIGINT NOT NULL DEFAULT 0,
    result VARCHAR(8) NOT NULL DEFAULT '',
    opponent VARCHAR(8) NOT NULL DEFAULT ''
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_profile_privacy (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    show_char TINYINT(1) NOT NULL DEFAULT 1,
    show_deco TINYINT(1) NOT NULL DEFAULT 1,
    show_house TINYINT(1) NOT NULL DEFAULT 1
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_accounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(20) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_gm_accounts_username (username)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_sessions (
    token_hash CHAR(64) PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    expires_at DATETIME NOT NULL,
    KEY ix_gm_sessions_account (account_id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_saves (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    gems INT NOT NULL,
    owned JSON NOT NULL,
    last_daily VARCHAR(10) NOT NULL DEFAULT '',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_battle (
    account_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    character_id VARCHAR(32) NOT NULL,
    since_ms BIGINT NOT NULL,
    damage INT NOT NULL DEFAULT 0
  )`)
  try { await pool.query("ALTER TABLE gm_battle ADD COLUMN second_id VARCHAR(32) NOT NULL DEFAULT ''") } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_expedition_boss (
    raid_day VARCHAR(10) NOT NULL, server_id TINYINT UNSIGNED NOT NULL,
    hp BIGINT NOT NULL DEFAULT 4000000, last_tick BIGINT NOT NULL,
    PRIMARY KEY (raid_day, server_id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_expedition_hp_migration (
    raid_day VARCHAR(10) NOT NULL,
    server_id TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (raid_day,server_id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_expedition_member (
    raid_day VARCHAR(10) NOT NULL, account_id BIGINT UNSIGNED NOT NULL,
    server_id TINYINT UNSIGNED NOT NULL, character_id VARCHAR(32) NOT NULL,
    joined_ms BIGINT NOT NULL, PRIMARY KEY (raid_day, account_id),
    KEY ix_gm_expedition_room (raid_day, server_id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_expedition_paid (
    raid_day VARCHAR(10) NOT NULL, server_id TINYINT UNSIGNED NOT NULL,
    account_id BIGINT UNSIGNED NOT NULL, PRIMARY KEY (raid_day, server_id, account_id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_wild_weeds (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    spawn_slot BIGINT NOT NULL DEFAULT 0,
    picked_slot BIGINT NOT NULL DEFAULT -1,
    pos_x SMALLINT NOT NULL DEFAULT 50,
    pos_y SMALLINT NOT NULL DEFAULT 70,
    inventory INT UNSIGNED NOT NULL DEFAULT 0,
    golden_inventory INT UNSIGNED NOT NULL DEFAULT 0,
    weed_type VARCHAR(12) NOT NULL DEFAULT 'normal'
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_wild_weed_spawns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    spawn_slot BIGINT NOT NULL,
    pos_x SMALLINT NOT NULL,
    pos_y SMALLINT NOT NULL,
    weed_type VARCHAR(12) NOT NULL DEFAULT 'normal',
    picked TINYINT(1) NOT NULL DEFAULT 0,
    KEY ix_wild_spawns_account (account_id, picked, spawn_slot)
  )`)
  for (const field of ["golden_inventory INT UNSIGNED NOT NULL DEFAULT 0", "weed_type VARCHAR(12) NOT NULL DEFAULT 'normal'"]) {
    try { await pool.query(`ALTER TABLE gm_wild_weeds ADD COLUMN ${field}`) } catch(error) { if(!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_weeding (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    character_id VARCHAR(20) NOT NULL,
    since_ms BIGINT NOT NULL
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_decos (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    items JSON NOT NULL
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_house_coin (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    salt VARCHAR(64) NOT NULL,
    last_slot BIGINT NOT NULL DEFAULT 0
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_house (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    layout JSON NOT NULL
  )`)
  try { await pool.query("ALTER TABLE gm_saves ADD COLUMN last_roulette VARCHAR(16) NOT NULL DEFAULT ''") } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  // Existing databases may already have last_roulette VARCHAR(10); the slot value is 11 chars (YYYY-MM-DD + A/B).
  await pool.query("ALTER TABLE gm_saves MODIFY COLUMN last_roulette VARCHAR(16) NOT NULL DEFAULT ''")
  try { await pool.query('ALTER TABLE gm_saves ADD COLUMN diamonds BIGINT UNSIGNED NOT NULL DEFAULT 0') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  try { await pool.query('ALTER TABLE gm_saves ADD COLUMN fragments BIGINT UNSIGNED NOT NULL DEFAULT 0') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_forge (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    weapon VARCHAR(12) NOT NULL,
    level TINYINT UNSIGNED NOT NULL DEFAULT 0
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_diamond_recharge (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    last_ms BIGINT NOT NULL
  )`)

  try { await pool.query('ALTER TABLE gm_accounts ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  try { await pool.query('ALTER TABLE gm_accounts ADD COLUMN nickname VARCHAR(6) NULL') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  try { await pool.query('CREATE UNIQUE INDEX uq_gm_accounts_nickname ON gm_accounts (nickname)') } catch (error) { if (!error || error.code !== 'ER_DUP_KEYNAME') throw error }
  try { await pool.query("ALTER TABLE gm_saves ADD COLUMN featured VARCHAR(32) NOT NULL DEFAULT ''") } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_mail (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    from_id BIGINT UNSIGNED NOT NULL,
    to_id BIGINT UNSIGNED NOT NULL,
    message VARCHAR(120) NOT NULL DEFAULT '',
    coins INT NOT NULL DEFAULT 0,
    sent_day VARCHAR(10) NOT NULL,
    created_ms BIGINT NOT NULL,
    seen TINYINT(1) NOT NULL DEFAULT 0,
    claimed TINYINT(1) NOT NULL DEFAULT 0,
    KEY ix_gm_mail_to (to_id, id),
    KEY ix_gm_mail_from_day (from_id, sent_day)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_announcements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    message VARCHAR(400) NOT NULL,
    created_ms BIGINT NOT NULL
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_global_chat (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    message VARCHAR(120) NOT NULL,
    created_ms BIGINT NOT NULL,
    KEY ix_gm_global_chat_time (id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_global_chat_seen (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    last_seen_id BIGINT UNSIGNED NOT NULL DEFAULT 0
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_global_chat_cooldown (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    last_sent_ms BIGINT NOT NULL DEFAULT 0
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_announcement_seen (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    last_seen_id BIGINT UNSIGNED NOT NULL DEFAULT 0
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_dupes (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    items JSON NOT NULL
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_suggest (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    message VARCHAR(200) NOT NULL,
    created_ms BIGINT NOT NULL,
    day VARCHAR(10) NOT NULL,
    reply VARCHAR(400) NULL,
    reply_ms BIGINT NULL,
    KEY ix_gm_suggest_account_day (account_id, day)
  )`)
  const [slotTable] = await pool.query("SHOW TABLES LIKE 'gm_weed_slots'")
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_weed_slots (
    account_id BIGINT UNSIGNED NOT NULL,
    character_id VARCHAR(20) NOT NULL,
    since_ms BIGINT NOT NULL,
    PRIMARY KEY (account_id, character_id)
  )`)
  // One-time move of the old single weeding friend into the 3-slot table.
  if (!slotTable.length) await pool.query("INSERT IGNORE INTO gm_weed_slots (account_id, character_id, since_ms) SELECT account_id, character_id, since_ms FROM gm_weeding WHERE character_id <> ''")
  try { await pool.query('ALTER TABLE gm_weeding ADD COLUMN beetle TINYINT(1) NOT NULL DEFAULT 0') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  for (const field of ['diamonds', 'fragments']) { try { await pool.query(`ALTER TABLE gm_mail ADD COLUMN ${field} INT UNSIGNED NOT NULL DEFAULT 0`) } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error } }
  try { await pool.query('ALTER TABLE gm_mail ADD COLUMN to_deleted TINYINT(1) NOT NULL DEFAULT 0') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  try { await pool.query('ALTER TABLE gm_mail ADD COLUMN from_deleted TINYINT(1) NOT NULL DEFAULT 0') } catch (error) { if (!error || error.code !== 'ER_DUP_FIELDNAME') throw error }
  // Promote only an existing account; never create an administrator implicitly.
  // Configure ADMIN_USERNAME as a private Railway environment variable.
  const adminUsername = process.env.ADMIN_USERNAME?.trim()
  if (adminUsername) {
    const [result] = await pool.query('UPDATE gm_accounts SET is_admin = 1 WHERE username = ?', [adminUsername])
    if (result.affectedRows === 0) console.warn('[api] configured administrator account does not exist yet')
  }
  // Keep the designated administrator's collection complete on every deployment.
  if (adminUsername) {
    const [admins] = await pool.query('SELECT id FROM gm_accounts WHERE username = ? AND is_admin = 1', [adminUsername])
    for (const admin of admins) await grantAdminCollection(admin.id)
  }
  ready = true
}

/** Grants every existing character and decoration without deleting any user data. */
async function grantAdminCollection(accountId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [saves] = await conn.query('SELECT owned FROM gm_saves WHERE account_id = ? FOR UPDATE', [accountId])
    const oldOwned = saves[0] ? normalizeOwned(typeof saves[0].owned === 'string' ? JSON.parse(saves[0].owned) : saves[0].owned) : []
    const allOwned = [...new Set([...oldOwned, ...CHARACTER_IDS])]
    if (saves.length) {
      await conn.query('UPDATE gm_saves SET owned = ? WHERE account_id = ?', [JSON.stringify(allOwned), accountId])
    } else {
      await conn.query('INSERT INTO gm_saves (account_id, gems, owned, last_daily) VALUES (?, ?, ?, ?)', [accountId, STARTING_COINS, JSON.stringify(allOwned), ''])
    }
    const [rows] = await conn.query('SELECT items FROM gm_decos WHERE account_id = ? FOR UPDATE', [accountId])
    const current = rows[0] ? normalizeDecos(typeof rows[0].items === 'string' ? JSON.parse(rows[0].items) : rows[0].items) : {}
    const complete = { ...current }
    for (const id of DECO_IDS) complete[id] = Math.max(1, complete[id] || 0)
    await conn.query('INSERT INTO gm_decos (account_id, items) VALUES (?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items)', [accountId, JSON.stringify(complete)])
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}

async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, 64, { N: 16384, r: 8, p: 1 })
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password, stored) {
  const [scheme, saltB64, keyB64] = String(stored).split('$')
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// Constant-cost dummy hash so unknown usernames take as long as wrong passwords.
const DUMMY_HASH = await hashPassword('not-a-real-password')

const tokenHash = token => createHash('sha256').update(token).digest('hex')

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return ''
}

function sessionCookie(token, maxAge) {
  // SameSite=None + Secure lets the cookie work inside the Manus Preview iframe; JSON-only POSTs block cross-site forms.
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${maxAge}`
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(body))
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('json_required'), { status: 415 })
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw Object.assign(new Error('body_too_large'), { status: 413 })
    chunks.push(chunk)
  }
  try { return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch { throw Object.assign(new Error('invalid_json'), { status: 400 }) }
}

// Simple in-memory throttle for failed logins (per IP + username).
const failures = new Map()
function throttleKey(req, username) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim()
  return `${ip}|${String(username).toLowerCase()}`
}
function isThrottled(key) {
  const entry = failures.get(key)
  if (!entry) return false
  if (Date.now() - entry.first > 10 * 60_000) { failures.delete(key); return false }
  return entry.count >= 8
}
function recordFailure(key) {
  const entry = failures.get(key)
  if (!entry || Date.now() - entry.first > 10 * 60_000) failures.set(key, { first: Date.now(), count: 1 })
  else entry.count += 1
}

function saveView(row) {
  const owned = typeof row.owned === 'string' ? JSON.parse(row.owned) : row.owned
  return { version: 1, gems: Number(row.gems), diamonds: Number(row.diamonds ?? 0), fragments: Number(row.fragments ?? 0), owned: normalizeOwned(owned), lastDaily: row.last_daily || '', lastRoulette: row.last_roulette || '' }
}

async function startSession(res, accountId, username, nickname, save, admin = false) {
  const token = randomBytes(32).toString('base64url')
  await pool.query('INSERT INTO gm_sessions (token_hash, account_id, expires_at) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? DAY))', [tokenHash(token), accountId, SESSION_DAYS])
  send(res, 200, { user: { username, nickname: nickname || null, admin: Boolean(admin) }, ...(await accountState(accountId)), save }, { 'Set-Cookie': sessionCookie(token, SESSION_DAYS * 86400) })
}

async function currentAccount(req) {
  const token = readCookie(req, COOKIE)
  if (!token || token.length > 100) return null
  const [rows] = await pool.query(
    'SELECT a.id, a.username, a.nickname, a.is_admin FROM gm_sessions s JOIN gm_accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > UTC_TIMESTAMP()',
    [tokenHash(token)],
  )
  const account = rows[0] ?? null
  // Test-only replenishment. Never enable TEST_SERVER on the production service.
  if (account && process.env.TEST_SERVER === 'true' && account.username === 'test') {
    await pool.query('UPDATE gm_saves SET gems = 1000000000, diamonds = 1000000000, fragments = 1000000000 WHERE account_id = ?', [account.id])
  }
  return account
}

/** Runs a read-modify-write of one account's save inside a row-locked transaction. */
async function withSave(accountId, change) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [rows] = await conn.query('SELECT gems, diamonds, fragments, owned, last_daily, last_roulette FROM gm_saves WHERE account_id = ? FOR UPDATE', [accountId])
    const state = rows[0] ? saveView(rows[0]) : { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
    const outcome = change(state)
    if (outcome.ok) {
      await conn.query(
        'INSERT INTO gm_saves (account_id, gems, owned, last_daily, last_roulette) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE gems = VALUES(gems), owned = VALUES(owned), last_daily = VALUES(last_daily), last_roulette = VALUES(last_roulette)',
        [accountId, outcome.state.gems, JSON.stringify(outcome.state.owned), outcome.state.lastDaily, outcome.state.lastRoulette || ''],
      )
      if (outcome.after) await outcome.after(conn)
    }
    await conn.commit()
    return outcome
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}

/** Per-account house-coin row (created with a secret random salt on first use). */
async function houseCoinRow(db, accountId, lock = false) {
  await db.query('INSERT IGNORE INTO gm_house_coin (account_id, salt, last_slot) VALUES (?, ?, 0)', [accountId, randomBytes(16).toString('hex')])
  const [rows] = await db.query(`SELECT salt, last_slot FROM gm_house_coin WHERE account_id = ?${lock ? ' FOR UPDATE' : ''}`, [accountId])
  return rows[0]
}

const DIAMOND_RECHARGE_MS = 60 * 60 * 1000
const diamondHourSlot = ms => Math.floor(ms / DIAMOND_RECHARGE_MS) * DIAMOND_RECHARGE_MS
async function rechargeDiamonds(accountId) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const now = Date.now()
    const [saves] = await conn.query('SELECT diamonds FROM gm_saves WHERE account_id = ? FOR UPDATE', [accountId])
    if (!saves.length) { await conn.commit(); return }
    await conn.query('INSERT IGNORE INTO gm_diamond_recharge (account_id, last_ms) VALUES (?, ?)', [accountId, diamondHourSlot(now)])
    const [rows] = await conn.query('SELECT last_ms FROM gm_diamond_recharge WHERE account_id = ? FOR UPDATE', [accountId])
    const last = Number(rows[0].last_ms)
    const slot = diamondHourSlot(now)
    const hours = Math.max(0, Math.floor((slot - diamondHourSlot(last)) / DIAMOND_RECHARGE_MS))
    const current = Number(saves[0].diamonds)
    const next = Math.min(20, current + hours * 5)
    if (next !== current) await conn.query('UPDATE gm_saves SET diamonds = ? WHERE account_id = ?', [next, accountId])
    if (hours > 0 || current >= 20) await conn.query('UPDATE gm_diamond_recharge SET last_ms = ? WHERE account_id = ?', [slot, accountId])
    await conn.commit()
  } catch (error) { await conn.rollback().catch(() => {}); throw error }
  finally { conn.release() }
}

async function getSave(accountId) {
  await rechargeDiamonds(accountId)
  const [rows] = await pool.query('SELECT gems, diamonds, fragments, owned, last_daily, last_roulette FROM gm_saves WHERE account_id = ?', [accountId])
  return rows[0] ? saveView(rows[0]) : { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
}

const parseJson = value => (typeof value === 'string' ? JSON.parse(value) : value)

async function getDecos(accountId) {
  const [rows] = await pool.query('SELECT items FROM gm_decos WHERE account_id = ?', [accountId])
  return rows[0] ? normalizeDecos(parseJson(rows[0].items)) : {}
}

async function getHouse(accountId) {
  const [rows] = await pool.query('SELECT layout FROM gm_house WHERE account_id = ?', [accountId])
  return normalizeHouse(rows[0] ? parseJson(rows[0].layout) : null)
}

/** Everything the client needs after login or refresh. */
async function getFeatured(accountId) {
  const [rows] = await pool.query('SELECT featured FROM gm_saves WHERE account_id = ?', [accountId])
  return rows[0]?.featured || null
}
async function sentToday(conn, accountId) {
  const [rows] = await conn.query('SELECT COALESCE(SUM(coins), 0) AS total FROM gm_mail WHERE from_id = ? AND sent_day = ?', [accountId, checkInDay()])
  return Number(rows[0].total)
}
async function mailbox(accountId) {
  const [rows] = await pool.query('SELECT m.id, m.from_id, m.message, m.coins, m.diamonds, m.fragments, m.created_ms, m.seen, m.claimed, a.nickname FROM gm_mail m LEFT JOIN gm_accounts a ON a.id = m.from_id WHERE m.to_id = ? AND m.to_deleted = 0 ORDER BY m.id DESC LIMIT ?', [accountId, MAILBOX_MAX])
  const mail = rows.map(row => ({ id: Number(row.id), from: Number(row.from_id) === 0 ? '원정대 보상' : (row.nickname || '알 수 없음'), message: row.message, coins: Number(row.coins), diamonds: Number(row.diamonds), fragments: Number(row.fragments), at: Number(row.created_ms), seen: Boolean(row.seen), claimed: Boolean(row.claimed) }))
  const [out] = await pool.query('SELECT m.id, m.message, m.coins, m.diamonds, m.fragments, m.created_ms, m.seen, m.claimed, a.nickname FROM gm_mail m LEFT JOIN gm_accounts a ON a.id = m.to_id WHERE m.from_id = ? AND m.from_deleted = 0 ORDER BY m.id DESC LIMIT ?', [accountId, MAILBOX_MAX])
  const sent = out.map(row => ({ id: Number(row.id), to: row.nickname || '알 수 없음', message: row.message, coins: Number(row.coins), diamonds: Number(row.diamonds), fragments: Number(row.fragments), at: Number(row.created_ms), seen: Boolean(row.seen), claimed: Boolean(row.claimed) }))
  return { mail, sent, max: MAILBOX_MAX, unread: mail.filter(item => !item.seen).length, sentToday: await sentToday(pool, accountId), dailyLimit: MAIL_DAILY_COINS }
}
/** Hides a recipient's inbox letters beyond the newest MAILBOX_MAX; coins still waiting in them go to the recipient. */
async function trimInbox(conn, toId) {
  const [old] = await conn.query('SELECT id, coins, diamonds, fragments, claimed FROM gm_mail WHERE to_id = ? AND to_deleted = 0 ORDER BY id DESC LIMIT 1000 OFFSET ?', [toId, MAILBOX_MAX])
  if (!old.length) return
  const coins = old.reduce((sum, row) => sum + (row.claimed ? 0 : Number(row.coins)), 0)
  await conn.query(`UPDATE gm_mail SET to_deleted = 1, claimed = 1, seen = 1 WHERE id IN (${old.map(() => '?').join(',')})`, old.map(row => row.id))
  const diamonds = old.reduce((sum, row) => sum + (row.claimed ? 0 : Number(row.diamonds)), 0)
  const fragments = old.reduce((sum, row) => sum + (row.claimed ? 0 : Number(row.fragments)), 0)
  if (coins || diamonds || fragments) await conn.query('UPDATE gm_saves SET gems = gems + ?, diamonds = diamonds + ?, fragments = fragments + ? WHERE account_id = ?', [coins, diamonds, fragments, toId])
}
async function trimSent(conn, fromId) {
  const [old] = await conn.query('SELECT id FROM gm_mail WHERE from_id = ? AND from_deleted = 0 ORDER BY id DESC LIMIT 1000 OFFSET ?', [fromId, MAILBOX_MAX])
  if (old.length) await conn.query(`UPDATE gm_mail SET from_deleted = 1 WHERE id IN (${old.map(() => '?').join(',')})`, old.map(row => row.id))
}
async function getDupes(accountId) {
  const [rows] = await pool.query('SELECT items FROM gm_dupes WHERE account_id = ?', [accountId])
  return rows[0] ? normalizeDupes(parseJson(rows[0].items)) : {}
}
async function inTransaction(work) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    if (result && result.error) await conn.rollback(); else await conn.commit()
    return result
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}
async function suggestions(account) {
  const [rows] = await pool.query('SELECT s.id, s.account_id, s.message, s.created_ms, s.reply, s.reply_ms, a.nickname FROM gm_suggest s LEFT JOIN gm_accounts a ON a.id = s.account_id ORDER BY s.id DESC LIMIT 100')
  const [today] = await pool.query('SELECT COUNT(*) AS n FROM gm_suggest WHERE account_id = ? AND day = ?', [account.id, checkInDay()])
  return {
    items: rows.map(row => ({ id: Number(row.id), from: Number(row.from_id) === 0 ? '원정대 보상' : (row.nickname || '알 수 없음'), message: row.message, at: Number(row.created_ms), reply: row.reply || null, replyAt: row.reply_ms ? Number(row.reply_ms) : null, mine: Number(row.account_id) === Number(account.id) })),
    admin: Boolean(account.is_admin), todayCount: Number(today[0].n), dailyMax: SUGGEST_DAILY_MAX,
  }
}
const FORGE_WEAPONS = ['pink', 'blue', 'yellow']
const FORGE_CHANCES = [100,95,90,85,80,75,70,65,60,55,50,45,40,35,30,25,20,15,10,5]
const forgeBonus = level => level <= 14 ? level + 1 : level === 20 ? 50 : 20 + (level - 15) * 5
async function getForge(accountId) {
  const [rows] = await pool.query('SELECT weapon, level FROM gm_forge WHERE account_id = ?', [accountId])
  return rows[0] ? { weapon: rows[0].weapon, level: Number(rows[0].level), bonus: forgeBonus(Number(rows[0].level)) } : null
}
async function accountState(accountId) {
  const box = await mailbox(accountId)
  return { forge: await getForge(accountId), dupes: await getDupes(accountId), featured: await getFeatured(accountId), mailUnread: box.unread, save: await getSave(accountId), weed: await getWeed(accountId), battle: await getBattle(accountId), decos: await getDecos(accountId), house: await getHouse(accountId), now: Date.now() }
}

async function getWeed(accountId) {
  return readWeed(pool, accountId)
}

async function getBattle(accountId) {
  const [rows] = await pool.query('SELECT character_id, second_id, since_ms, damage FROM gm_battle WHERE account_id = ?', [accountId])
  return rows[0] ? { id: rows[0].character_id, secondId: rows[0].second_id || null, since: Number(rows[0].since_ms), damage: Number(rows[0].damage) } : null
}

/** Settles defeated enemies into coins and optionally switches the fighting friend, atomically with the save. */
async function updateBattle(accountId, nextCharacter) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [saves] = await conn.query('SELECT gems, diamonds, fragments, owned, last_daily, last_roulette FROM gm_saves WHERE account_id = ? FOR UPDATE', [accountId])
    const state = saves[0] ? saveView(saves[0]) : { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
    const [rows] = await conn.query('SELECT character_id, second_id, since_ms, damage FROM gm_battle WHERE account_id = ? FOR UPDATE', [accountId])
    const now = Date.now()
    let battle = rows[0] ? { id: rows[0].character_id, secondId: rows[0].second_id || null, since: Number(rows[0].since_ms), damage: Number(rows[0].damage) } : null
    if (nextCharacter && !state.owned.includes(nextCharacter)) { await conn.rollback(); return { error: 'not_owned' } }
    if (nextCharacter) {
      const [busy] = await conn.query('SELECT 1 FROM gm_weed_slots WHERE account_id = ? AND character_id = ? UNION ALL SELECT 1 FROM gm_weeding WHERE account_id = ? AND beetle = 1 AND ? = ?', [accountId, nextCharacter, accountId, nextCharacter, BEETLE_ID])
      if (busy.length) { await conn.rollback(); return { error: 'busy_weed' } }
    }
    const [forgeRows] = await conn.query('SELECT level FROM gm_forge WHERE account_id = ?', [accountId])
    const weaponBonus = forgeRows.length ? forgeBonus(Number(forgeRows[0].level)) : 0
    let earned = 0
    if (battle) {
      const settled = settleBattle(battle.since, battle.damage, now, (POWER[battle.id] ?? 10) + (battle.secondId ? (POWER[battle.secondId] ?? 10) : 0) + weaponBonus)
      earned = settled.kills
      battle = { ...battle, since: settled.since, damage: settled.damage }
    }
    if (nextCharacter) battle = battle ? (battle.id === nextCharacter || battle.secondId === nextCharacter ? (battle.secondId === nextCharacter ? { ...battle, secondId: null } : battle.secondId ? { ...battle, id: battle.secondId, secondId: null } : null) : battle.secondId ? { ...battle, secondId: nextCharacter } : { ...battle, secondId: nextCharacter }) : { id: nextCharacter, secondId: null, since: now, damage: 0 }
    if (!battle) {
      if (earned > 0) await conn.query('UPDATE gm_saves SET fragments = fragments + ? WHERE account_id = ?', [earned, accountId])
      state.fragments = (state.fragments ?? 0) + earned
      await conn.query('DELETE FROM gm_battle WHERE account_id = ?', [accountId])
      await conn.commit()
      return { save: state, battle: null, earned, now }
    }
    state.fragments = (state.fragments ?? 0) + earned
    if (earned > 0) await conn.query('UPDATE gm_saves SET fragments = fragments + ? WHERE account_id = ?', [earned, accountId])
    await conn.query('INSERT INTO gm_battle (account_id, character_id, second_id, since_ms, damage) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE character_id = VALUES(character_id), second_id = VALUES(second_id), since_ms = VALUES(since_ms), damage = VALUES(damage)', [accountId, battle.id, battle.secondId || '', battle.since, battle.damage])
    await conn.commit()
    return { save: state, battle, earned, now }
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}

/** Weeding view: up to 3 members (each with its own timer) plus the 풍뎅이 helper flag. */
async function readWeed(db, accountId, lock = false) {
  const [slots] = await db.query(`SELECT character_id, since_ms FROM gm_weed_slots WHERE account_id = ? ORDER BY since_ms, character_id${lock ? ' FOR UPDATE' : ''}`, [accountId])
  const [rows] = await db.query(`SELECT beetle FROM gm_weeding WHERE account_id = ?${lock ? ' FOR UPDATE' : ''}`, [accountId])
  const members = slots.map(r => ({ id: r.character_id, since: Number(r.since_ms) }))
  const beetle = Boolean(rows[0]?.beetle) && members.length > 0 && !members.some(m => m.id === BEETLE_ID)
  return members.length ? { members, beetle } : null
}
/** Settles weeding coins and optionally switches the weeding friend, atomically with the save. */
/** Credits weeding + battle coins automatically, so nobody has to open the fields to collect. */
async function autoSettle(accountId) {
  let earned = 0
  const weed = await updateWeed(accountId, {})
  if (!weed.error) earned += weed.earned
  const battle = await updateBattle(accountId, null)
  // Battle rewards are enhancement fragments, not diamonds.
  return earned
}
/** op: { add?: id, remove?: id, beetle?: boolean } — settles every member's coins first, then applies the change. */
async function updateWeed(accountId, op = {}) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [saves] = await conn.query('SELECT gems, diamonds, fragments, owned, last_daily, last_roulette FROM gm_saves WHERE account_id = ? FOR UPDATE', [accountId])
    const state = saves[0] ? saveView(saves[0]) : { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
    const current = await readWeed(conn, accountId, true)
    const now = Date.now()
    let members = current ? current.members : []
    let beetle = current ? current.beetle : false
    const fail = async error => { await conn.rollback(); return { error } }
    if (op.add) {
      if (!state.owned.includes(op.add)) return fail('not_owned')
      if (members.some(m => m.id === op.add)) return fail('already_weeding')
      if (members.length >= WEED_MAX) return fail('weed_full')
      const [busy] = await conn.query('SELECT 1 FROM gm_battle WHERE account_id = ? AND (character_id = ? OR second_id = ?)', [accountId, op.add, op.add])
      if (busy.length) return fail('busy_battle')
    }
    if (op.remove && !members.some(m => m.id === op.remove)) return fail('not_weeding')
    // Settle every member at the multiplier that applied until now.
    let earned = 0
    if (members.length) {
      // All active members share one field base; use latest anchor to avoid paying
      // hours before a newly joined member was assigned.
      const fromSlot = Math.max(...members.map(m => Math.floor(m.since / WEED_HOUR_MS)))
      const toSlot = Math.floor(now / WEED_HOUR_MS)
      earned = weedFieldEarnedBetweenSlots(members.map(m => m.id), fromSlot, toSlot) * weedCoinMultiplier(beetle)
    }
    members = members.map(m => ({ id: m.id, since: Math.floor(now / WEED_HOUR_MS) * WEED_HOUR_MS }))
    if (op.add) { members.push({ id: op.add, since: Math.floor(now / WEED_HOUR_MS) * WEED_HOUR_MS }); if (op.add === BEETLE_ID) beetle = false }
    if (op.remove) members = members.filter(m => m.id !== op.remove)
    if (op.beetle !== undefined) {
      if (op.beetle) {
        if (!state.owned.includes(BEETLE_ID)) return fail('not_owned')
        if (!members.length) return fail('not_weeding')
        if (members.some(m => m.id === BEETLE_ID)) return fail('beetle_is_weeder')
        const [busy] = await conn.query('SELECT 1 FROM gm_battle WHERE account_id = ? AND character_id = ?', [accountId, BEETLE_ID])
        if (busy.length) return fail('busy_battle')
      }
      beetle = Boolean(op.beetle)
    }
    if (!members.length) beetle = false
    if (!op.add && !op.remove && op.beetle === undefined && !current) return fail('not_weeding')
    state.gems += earned
    await conn.query('INSERT INTO gm_saves (account_id, gems, owned, last_daily) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE gems = VALUES(gems)', [accountId, state.gems, JSON.stringify(state.owned), state.lastDaily])
    await conn.query('DELETE FROM gm_weed_slots WHERE account_id = ?', [accountId])
    for (const m of members) await conn.query('INSERT INTO gm_weed_slots (account_id, character_id, since_ms) VALUES (?, ?, ?)', [accountId, m.id, m.since])
    await conn.query("INSERT INTO gm_weeding (account_id, character_id, since_ms, beetle) VALUES (?, '', ?, ?) ON DUPLICATE KEY UPDATE character_id = '', beetle = VALUES(beetle)", [accountId, now, beetle ? 1 : 0])
    await conn.commit()
    return { save: state, weed: members.length ? { members, beetle } : null, earned, now }
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}

const getAnnouncements = async (accountId) => {
  const [items] = await pool.query('SELECT id, message, created_ms FROM gm_announcements ORDER BY id DESC LIMIT 10')
  const [seen] = await pool.query('SELECT last_seen_id FROM gm_announcement_seen WHERE account_id = ?', [accountId])
  const lastSeen = Number(seen[0]?.last_seen_id || 0)
  return { items: items.map(x => ({ id: Number(x.id), message: x.message, at: Number(x.created_ms) })), unread: items.some(x => Number(x.id) > lastSeen) }
}

// Chat tables are also checked on demand so older Railway databases can recover
// without wiping any existing accounts, messages, or saves.
async function ensureGlobalChatTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_global_chat (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    account_id BIGINT UNSIGNED NOT NULL,
    message VARCHAR(120) NOT NULL,
    created_ms BIGINT NOT NULL,
    KEY ix_gm_global_chat_time (id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS gm_global_chat_cooldown (
    account_id BIGINT UNSIGNED PRIMARY KEY,
    last_sent_ms BIGINT NOT NULL DEFAULT 0
  )`)
}

// The expedition day starts at 09:00 Asia/Seoul, independent of server timezone.
const EXP_HP = 4000000
const EXP_TICK = 3000
function expeditionWindow(now = Date.now()) {
  const kst = new Date(now + 9 * 3600000)
  const midnight = Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate()) - 9*3600000
  const actualStart = midnight + 9*3600000 - (kst.getUTCHours() < 9 ? 86400000 : 0)
  const d = new Date(actualStart + 9*3600000)
  return {day:d.toISOString().slice(0,10),start:actualStart,next:actualStart+86400000}
}
// Existing raid damage is preserved: old remaining HP - 6,000,000.
// The migration marker is transactional, so retries/concurrent requests cannot
// subtract the difference twice. Fresh raids already start at 4,000,000.
async function expeditionMigrateHp(conn,day,serverId) {
  const [rows]=await conn.query('SELECT hp FROM gm_expedition_boss WHERE raid_day=? AND server_id=? FOR UPDATE',[day,serverId])
  if(!rows.length)return
  const [marked]=await conn.query('INSERT IGNORE INTO gm_expedition_hp_migration (raid_day,server_id) VALUES (?,?)',[day,serverId])
  if(marked.affectedRows) {
    // Newly created bosses have full 4m HP. Existing old-cap bosses
    // can be distinguished only by persisted creation metadata; see below.
    const oldHp=Number(rows[0].hp)
    if(true) await conn.query('UPDATE gm_expedition_boss SET hp=? WHERE raid_day=? AND server_id=?',[Math.max(0,oldHp-6000000),day,serverId])
  }
}
async function expeditionSettle(conn, day, serverId, now) {
  const [bossRows] = await conn.query('SELECT hp,last_tick FROM gm_expedition_boss WHERE raid_day=? AND server_id=? FOR UPDATE',[day,serverId])
  if (!bossRows.length) return null
  const boss=bossRows[0]
  let hp=Number(boss.hp),last=Number(boss.last_tick)
  const ticks=hp>0 ? Math.max(0,Math.floor((now-last)/EXP_TICK)) : 0
  if(ticks) {
    const [members]=await conn.query('SELECT m.character_id,f.level AS forge_level FROM gm_expedition_member m LEFT JOIN gm_forge f ON f.account_id=m.account_id WHERE m.raid_day=? AND m.server_id=?',[day,serverId])
    // One permanent weapon bonus per participating account, regardless of party size.
    const power=members.reduce((sum,m)=>sum+(POWER[m.character_id]||0)+(m.forge_level===null?0:forgeBonus(Number(m.forge_level))),0)
    hp=Math.max(0,hp-ticks*power)
    last+=ticks*EXP_TICK
    await conn.query('UPDATE gm_expedition_boss SET hp=?,last_tick=? WHERE raid_day=? AND server_id=?',[hp,last,day,serverId])
    if(hp===0) {
      const [players]=await conn.query('SELECT account_id FROM gm_expedition_member WHERE raid_day=? AND server_id=?',[day,serverId])
      for(const player of players) {
        const [paid]=await conn.query('INSERT IGNORE INTO gm_expedition_paid (raid_day,server_id,account_id) VALUES (?,?,?)',[day,serverId,player.account_id])
        if(paid.affectedRows) {
          // System mail: reward is credited only when the recipient claims it.
          // The mail `coins` column is the game's coin balance (`gm_saves.gems`).
          await conn.query(
            'INSERT INTO gm_mail (from_id,to_id,message,coins,fragments,sent_day,created_ms) VALUES (?,?,?,?,?,?,?)',
            [0,player.account_id,'원정대 보스를 토벌하였습니다!',300,30,day,now]
          )
          await trimInbox(conn,player.account_id)
        }
      }
    }
  }
  return hp
}
// Retrying a deadlocked transaction is safe: InnoDB rolls back the victim.
const isDbContention = error => ['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(error?.code)
async function retryDbContention(task, attempts=3) {
  for(let attempt=0;attempt<attempts;attempt++) {
    try {return await task()}
    catch(error) {
      if(!isDbContention(error)||attempt===attempts-1)throw error
      await new Promise(resolve=>setTimeout(resolve,50*(attempt+1)+Math.floor(Math.random()*70)))
    }
  }
}
// A badge must never mutate boss rows or settle rewards. This query is read-only.
async function expeditionBadge(accountId) {
  const {day}=expeditionWindow()
  const [rows]=await pool.query('SELECT server_id FROM gm_expedition_member WHERE raid_day=? AND account_id=? LIMIT 1',[day,accountId])
  return {day,deployed:rows.length>0}
}
async function expeditionSnapshot(accountId) {
  const now=Date.now(), {day,start,next}=expeditionWindow(now)
  const conn=await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [mine]=await conn.query('SELECT server_id,character_id FROM gm_expedition_member WHERE raid_day=? AND account_id=?',[day,accountId])
    const servers=[]
    for(let id=1;id<=3;id++) {
      const [insertedBoss]=await conn.query('INSERT IGNORE INTO gm_expedition_boss (raid_day,server_id,hp,last_tick) VALUES (?,?,?,?)',[day,id,EXP_HP,start])
      if(insertedBoss.affectedRows)await conn.query('INSERT IGNORE INTO gm_expedition_hp_migration (raid_day,server_id) VALUES (?,?)',[day,id])
      await expeditionMigrateHp(conn,day,id)
      const hp=await expeditionSettle(conn,day,id,now)
      const [members]=await conn.query('SELECT m.account_id,a.nickname,m.character_id,f.weapon AS forge_weapon,f.level AS forge_level FROM gm_expedition_member m JOIN gm_accounts a ON a.id=m.account_id LEFT JOIN gm_forge f ON f.account_id=m.account_id WHERE m.raid_day=? AND m.server_id=? ORDER BY m.joined_ms,m.account_id',[day,id])
      servers.push({id,hp,members:members.map(m=>({name:m.nickname||'유저',characterId:m.character_id,weapon:m.forge_weapon||null,weaponLevel:m.forge_weapon?Number(m.forge_level):null,me:String(m.account_id)===String(accountId)}))})
    }
    await conn.commit()
    return {day,next,servers,mine:mine.length?{serverId:mine[0].server_id,characterId:mine[0].character_id}:null,now}
  } catch(e){await conn.rollback();throw e} finally {conn.release()}
}
async function expeditionJoin(accountId,serverId,characterId) {
  const now=Date.now(),{day,start}=expeditionWindow(now)
  const conn=await pool.getConnection()
  try {
    await conn.beginTransaction()
    const [insertedBoss]=await conn.query('INSERT IGNORE INTO gm_expedition_boss (raid_day,server_id,hp,last_tick) VALUES (?,?,?,?)',[day,serverId,EXP_HP,start])
      if(insertedBoss.affectedRows)await conn.query('INSERT IGNORE INTO gm_expedition_hp_migration (raid_day,server_id) VALUES (?,?)',[day,serverId])
      await expeditionMigrateHp(conn,day,serverId)
    const hp=await expeditionSettle(conn,day,serverId,now)
    const [old]=await conn.query('SELECT server_id FROM gm_expedition_member WHERE raid_day=? AND account_id=?',[day,accountId])
    if(old.length && Number(old[0].server_id)!==serverId) {await conn.rollback();return 'exp_already_joined'}
    if(hp<=0) {await conn.rollback();return 'exp_boss_dead'}
    const [count]=await conn.query('SELECT COUNT(*) AS n FROM gm_expedition_member WHERE raid_day=? AND server_id=?',[day,serverId])
    if(!old.length && Number(count[0].n)>=10){await conn.rollback();return 'exp_full'}
    const [owned]=await conn.query('SELECT owned FROM gm_saves WHERE account_id=?',[accountId])
    const ids=owned.length?normalizeOwned(parseJson(owned[0].owned)):[]
    if(!ids.includes(characterId)){await conn.rollback();return 'not_owned'}
    if(old.length) await conn.query('UPDATE gm_expedition_member SET character_id=? WHERE raid_day=? AND account_id=?',[characterId,day,accountId])
    else await conn.query('INSERT INTO gm_expedition_member (raid_day,account_id,server_id,character_id,joined_ms) VALUES (?,?,?,?,?)',[day,accountId,serverId,characterId,now])
    await conn.commit();return null
  } catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')return 'exp_already_joined';throw e}finally{conn.release()}
}
const rpsRewards = [10,20,50,100,200]
const rpsMoves = ['rock','scissors','paper']
const rpsSlot = () => {
  const now = Date.now() + 9 * 3600000
  return `${new Date(now).toISOString().slice(0,10)}-${Math.floor((now % 86400000) / 10800000)}`
}
const rpsNextAt = () => Math.floor((Date.now()+9*3600000)/10800000+1)*10800000-9*3600000
const rpsAdmin = account => account.username === 'tjdrjs885' // Dedicated unlimited-play account; independent of is_admin DB flag
const emptyRps = () => ({slot:'',stage:1,phase:'none',choice:'',deadline:0,result:'',opponent:''})
async function rpsRow(db,id,lock=false) {
  const [rows]=await db.query(`SELECT * FROM gm_rps WHERE account_id=?${lock?' FOR UPDATE':''}`,[id])
  return rows[0] || emptyRps()
}
async function rpsTransaction(id, callback) {
  const conn=await pool.getConnection()
  try {
    // Create missing row before opening a transaction. A locking read of an
    // absent row followed by INSERT IGNORE can deadlock with concurrent reads.
    await conn.query('INSERT IGNORE INTO gm_rps (account_id) VALUES (?)',[id])
    await conn.beginTransaction()
    const row=await rpsRow(conn,id,true)
    const result=await callback(conn,row)
    await conn.commit()
    return result
  } catch(e) {await conn.rollback().catch(()=>{});throw e}
  finally {conn.release()}
}
const rpsPublic = (row,admin=false) => ({
  nextAt:rpsNextAt(), admin, used:row.slot===rpsSlot() && !(admin && ['lost','claimed'].includes(row.phase)), stage:Number(row.stage),
  phase:row.slot===rpsSlot()?row.phase:'none',
  deadline:Number(row.deadline), choice:row.choice,
  result:row.result, opponent:row.opponent,
  reward:rpsRewards[Math.min(4,Number(row.stage)-1)]
})
// Persist up to five unpicked weeds; spawn one at each elapsed hour even if older weeds remain.
const WILD_WEED_HOUR = 3600000
async function wildWeedState(accountId, db=pool) {
  const slot=Math.floor(Date.now()/WILD_WEED_HOUR)
  await db.query('INSERT IGNORE INTO gm_wild_weeds (account_id,spawn_slot,picked_slot,pos_x,pos_y,weed_type) VALUES (?,?,?,?,?,?)', [accountId,slot,-1,12+Math.floor(Math.random()*76),49+Math.floor(Math.random()*38),Math.random()<0.15?'golden':'normal'])
  const [baseRows]=await db.query('SELECT * FROM gm_wild_weeds WHERE account_id=? FOR UPDATE',[accountId])
  const base=baseRows[0]
  const [allRows]=await db.query('SELECT * FROM gm_wild_weed_spawns WHERE account_id=? ORDER BY spawn_slot,id FOR UPDATE',[accountId])
  // Migrate the old single-weed state once, without losing uncollected weeds.
  if(allRows.length===0 && Number(base.picked_slot)<Number(base.spawn_slot)) {
    await db.query('INSERT INTO gm_wild_weed_spawns (account_id,spawn_slot,pos_x,pos_y,weed_type) VALUES (?,?,?,?,?)',[accountId,Number(base.spawn_slot),base.pos_x,base.pos_y,base.weed_type])
  }
  const [activeRows]=await db.query('SELECT * FROM gm_wild_weed_spawns WHERE account_id=? AND picked=0 ORDER BY spawn_slot,id FOR UPDATE',[accountId])
  let active=activeRows
  // Use the legacy spawn_slot as the last processed hour, including when already at capacity.
  let last=Number(base.spawn_slot)
  if(last<slot){
    const newCount=Math.min(5-active.length,slot-last)
    for(let i=0;i<newCount;i++){
      let x=12+Math.floor(Math.random()*76),y=49+Math.floor(Math.random()*38)
      for(let attempt=0;attempt<20 && active.some(w=>Math.hypot(Number(w.pos_x)-x,Number(w.pos_y)-y)<20);attempt++){
        x=12+Math.floor(Math.random()*76);y=49+Math.floor(Math.random()*38)
      }
      const type=Math.random()<0.15?'golden':'normal'
      const spawnSlot=last+i+1
      const [insert]=await db.query('INSERT INTO gm_wild_weed_spawns (account_id,spawn_slot,pos_x,pos_y,weed_type) VALUES (?,?,?,?,?)',[accountId,spawnSlot,x,y,type])
      active.push({id:insert.insertId,spawn_slot:spawnSlot,pos_x:x,pos_y:y,weed_type:type})
    }
    await db.query('UPDATE gm_wild_weeds SET spawn_slot=? WHERE account_id=?',[slot,accountId])
  }
  const weeds=active.map(w=>({id:Number(w.id),x:Number(w.pos_x),y:Number(w.pos_y),type:w.weed_type==='golden'?'golden':'normal'}))
  return {visible:weeds.length>0,weeds,x:weeds[0]?.x??50,y:weeds[0]?.y??70,type:weeds[0]?.type??'normal',count:Number(base.inventory),goldenCount:Number(base.golden_inventory),slot,nextAt:(slot+1)*WILD_WEED_HOUR}
}
const routes = {
  'POST /api/wild-weed/state': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    send(res,200,{weed:await inTransaction(conn=>wildWeedState(account.id,conn))})
  },
  'POST /api/wild-weed/pick': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    const result=await inTransaction(async conn=>{
      const weed=await wildWeedState(account.id,conn)
      const {id}=await readJson(req)
      const picked=weed.weeds.find(w=>w.id===Number(id))
      if(!picked)return {error:'weed_already_picked'}
      await conn.query('UPDATE gm_wild_weed_spawns SET picked=1 WHERE account_id=? AND id=? AND picked=0',[account.id,picked.id])
      if(picked.type==='golden') {
        await conn.query('UPDATE gm_wild_weeds SET golden_inventory=golden_inventory+1 WHERE account_id=?',[account.id])
        return {weed:{...weed,weeds:weed.weeds.filter(w=>w.id!==picked.id),visible:weed.weeds.length>1,goldenCount:weed.goldenCount+1}}
      }
      await conn.query('UPDATE gm_wild_weeds SET inventory=inventory+1 WHERE account_id=?',[account.id])
      return {weed:{...weed,weeds:weed.weeds.filter(w=>w.id!==picked.id),visible:weed.weeds.length>1,count:weed.count+1}}
    })
    if(result.error)return send(res,409,result)
    send(res,200,result)
  },
  'POST /api/wild-weed/sell': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    const result=await inTransaction(async conn=>{
      const weed=await wildWeedState(account.id,conn)
      const {count,type}=await readJson(req)
      const golden=type==='golden'
      const owned=golden?weed.goldenCount:weed.count
      if(!Number.isSafeInteger(count)||count<1||count>owned)return {error:'not_enough_weeds'}
      await conn.query(`UPDATE gm_wild_weeds SET ${golden?'golden_inventory':'inventory'}=${golden?'golden_inventory':'inventory'}-? WHERE account_id=?`,[count,account.id])
      await conn.query('UPDATE gm_saves SET gems=gems+? WHERE account_id=?',[count*(golden?50:5),account.id])
      return {weed:{...weed,...(golden?{goldenCount:owned-count}:{count:owned-count})}}
    })
    if(result.error)return send(res,409,result)
    send(res,200,{...result,save:await getSave(account.id)})
  },

  'POST /api/shop/buy': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    const {quantity}=await readJson(req)
    if(quantity!==1 && quantity!==10)return send(res,400,{error:'invalid_shop_quantity'})
    const cost=quantity*5
    const conn=await pool.getConnection()
    try{
      await conn.beginTransaction()
      const [rows]=await conn.query('SELECT gems FROM gm_saves WHERE account_id=? FOR UPDATE',[account.id])
      if(!rows.length || Number(rows[0].gems)<cost){await conn.rollback();return send(res,409,{error:'not_enough_coins'})}
      await conn.query('UPDATE gm_saves SET gems=gems-?,fragments=fragments+? WHERE account_id=?',[cost,quantity,account.id])
      await conn.commit()
      send(res,200,{save:await getSave(account.id)})
    }catch(e){await conn.rollback().catch(()=>{});throw e}finally{conn.release()}
  },
  'GET /api/forge': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, {error:'login_required'})
    send(res, 200, {forge: await getForge(account.id)})
  },
  'POST /api/forge/select': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, {error:'login_required'})
    const {weapon} = await readJson(req)
    if (!FORGE_WEAPONS.includes(weapon)) return send(res,400,{error:'forge_invalid_weapon'})
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('SELECT id FROM gm_accounts WHERE id=? FOR UPDATE',[account.id])
      const [rows] = await conn.query('SELECT weapon FROM gm_forge WHERE account_id=? FOR UPDATE',[account.id])
      if (rows.length) { await conn.rollback(); return send(res,409,{error:'forge_already_selected'}) }
      await conn.query('INSERT INTO gm_forge(account_id,weapon,level) VALUES(?,?,0)',[account.id,weapon])
      await conn.commit()
      send(res,200,{forge:{weapon,level:0,bonus:1}})
    } catch(e) {await conn.rollback().catch(()=>{});throw e} finally {conn.release()}
  },
  'POST /api/forge/upgrade': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, {error:'login_required'})
    await readJson(req)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [saves] = await conn.query('SELECT gems,fragments FROM gm_saves WHERE account_id=? FOR UPDATE',[account.id])
      const [rows] = await conn.query('SELECT weapon,level FROM gm_forge WHERE account_id=? FOR UPDATE',[account.id])
      if (!rows.length) {await conn.rollback();return send(res,409,{error:'forge_no_weapon'})}
      const level=Number(rows[0].level)
      if(level>=20){await conn.rollback();return send(res,409,{error:'forge_max'})}
      const fragments=level+1, coins=(level+1)*5
      if(!saves.length || (!rpsAdmin(account) && Number(saves[0].fragments)<fragments)){await conn.rollback();return send(res,409,{error:'forge_no_fragments'})}
      if(!rpsAdmin(account) && Number(saves[0].gems)<coins){await conn.rollback();return send(res,409,{error:'not_enough_coins'})}
      // Settle battle damage with the OLD bonus before raising weapon level.
      const [battles]=await conn.query('SELECT character_id,second_id,since_ms,damage FROM gm_battle WHERE account_id=? FOR UPDATE',[account.id])
      let earned=0
      if(battles.length){
        const b=battles[0]
        const oldPower=(POWER[b.character_id]??10)+(b.second_id?(POWER[b.second_id]??10):0)+forgeBonus(level)
        const settled=settleBattle(Number(b.since_ms),Number(b.damage),Date.now(),oldPower)
        earned=settled.kills
        await conn.query('UPDATE gm_battle SET since_ms=?,damage=? WHERE account_id=?',[settled.since,settled.damage,account.id])
      }
      const success=randomInt(100)<FORGE_CHANCES[level]
      await conn.query('UPDATE gm_saves SET gems=gems-?,fragments=fragments-?+? WHERE account_id=?',[rpsAdmin(account)?0:coins,rpsAdmin(account)?0:fragments,earned,account.id])
      if(success) await conn.query('UPDATE gm_forge SET level=level+1 WHERE account_id=?',[account.id])
      await conn.commit()
      const newLevel=level+(success?1:0)
      send(res,200,{success,forge:{weapon:rows[0].weapon,level:newLevel,bonus:forgeBonus(newLevel)},save:await getSave(account.id)})
    } catch(e) {await conn.rollback().catch(()=>{});throw e} finally {conn.release()}
  },
  'GET /api/rps': async(req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    send(res,200,rpsPublic(await rpsRow(pool,account.id),rpsAdmin(account)))
  },
  'POST /api/rps/start': async(req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    await readJson(req)
    const out=await retryDbContention(()=>rpsTransaction(account.id,async(conn,row)=>{
      if(row.slot===rpsSlot() && !(rpsAdmin(account) && ['lost','claimed'].includes(row.phase)))return {error:'rps_used',...rpsPublic(row,rpsAdmin(account))}
      await conn.query("UPDATE gm_rps SET slot=?,stage=1,phase='choosing',choice='',deadline=?,result='',opponent='' WHERE account_id=?",[rpsSlot(),Date.now()+5000,account.id])
      return {used:true,admin:rpsAdmin(account),nextAt:rpsNextAt(),stage:1,phase:'choosing',deadline:Date.now()+5000,reward:10}
    }))
    send(res,out.error?409:200,out)
  },
  'POST /api/rps/choose': async(req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    const {move}=await readJson(req)
    if(!rpsMoves.includes(move))return send(res,400,{error:'rps_move'})
    const out=await retryDbContention(()=>rpsTransaction(account.id,async(conn,row)=>{
      if(row.slot!==rpsSlot()||row.phase!=='choosing'||Date.now()>Number(row.deadline))return {error:'rps_closed'}
      await conn.query("UPDATE gm_rps SET choice=? WHERE account_id=?",[move,account.id])
      return {...rpsPublic({...row,choice:move},rpsAdmin(account)),phase:'choosing'}
    }))
    send(res,out.error?409:200,out)
  },
  'POST /api/rps/resolve': async(req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    await readJson(req)
    const out=await retryDbContention(()=>rpsTransaction(account.id,async(conn,row)=>{
      if(row.slot!==rpsSlot())return {error:'rps_closed'}
      if(row.phase!=='choosing'&&row.phase!=='waiting')return rpsPublic(row,rpsAdmin(account))
      if(Date.now()<Number(row.deadline))return {error:'rps_wait'}
      const choice=row.choice
      // A draw occurs about 15% of the time; otherwise wins and losses
      // are evenly distributed. No move still counts as a loss.
      const opponent=choice ? (() => {
        const roll=Math.random()
        if(roll<0.15)return choice
        const other=rpsMoves.filter(move=>move!==choice)
        return other[roll<0.575?0:1]
      })() : rpsMoves[Math.floor(Math.random()*rpsMoves.length)]
      const result=!choice?'lose':choice===opponent?'draw':
        ((choice==='rock'&&opponent==='scissors')||(choice==='scissors'&&opponent==='paper')||(choice==='paper'&&opponent==='rock'))?'win':'lose'
      const finalWin=result==='win'&&Number(row.stage)===5
      const phase=finalWin?'claimed':result==='lose'?'lost':result==='win'?'won':'draw'
      await conn.query("UPDATE gm_rps SET phase=?,result=?,opponent=? WHERE account_id=?",[phase,result,opponent,account.id])
      if(finalWin)await conn.query("UPDATE gm_saves SET gems=gems+200 WHERE account_id=?",[account.id])
      return {...rpsPublic({...row,phase,result,opponent},rpsAdmin(account)),phase,result,opponent,coins:finalWin?200:undefined}
    }))
    send(res,out.error?409:200,out)
  },
  'POST /api/rps/next': async(req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    await readJson(req)
    const out=await retryDbContention(()=>rpsTransaction(account.id,async(conn,row)=>{
      if(row.slot!==rpsSlot()||!['won','draw'].includes(row.phase))return {error:'rps_closed'}
      if(row.phase==='won'&&Number(row.stage)>=5)return {error:'rps_closed'}
      const stage=Number(row.stage)+(row.phase==='won'?1:0)
      const deadline=Date.now()+5000
      await conn.query("UPDATE gm_rps SET stage=?,phase='choosing',choice='',deadline=?,result='',opponent='' WHERE account_id=?",[stage,deadline,account.id])
      return {used:true,stage,phase:'choosing',deadline,reward:rpsRewards[stage-1]}
    }))
    send(res,out.error?409:200,out)
  },
  'POST /api/rps/claim': async(req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    await readJson(req)
    const out=await retryDbContention(()=>rpsTransaction(account.id,async(conn,row)=>{
      if(row.slot!==rpsSlot()||row.phase!=='won')return {error:'rps_closed'}
      const coins=rpsRewards[Number(row.stage)-1]
      await conn.query("UPDATE gm_rps SET phase='claimed' WHERE account_id=?",[account.id])
      await conn.query("UPDATE gm_saves SET gems=gems+? WHERE account_id=?",[coins,account.id])
      return {coins,phase:'claimed'}
    }))
    if(out.error)return send(res,409,out)
    send(res,200,{...out,admin:rpsAdmin(account),used:!rpsAdmin(account),nextAt:rpsNextAt(),save:await getSave(account.id)})
  },
  'GET /api/expedition/badge': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    send(res,200,await expeditionBadge(account.id))
  },
  'GET /api/expedition': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    send(res,200,await retryDbContention(()=>expeditionSnapshot(account.id)))
  },
  'POST /api/expedition/join': async (req,res) => {
    const account=await currentAccount(req)
    if(!account)return send(res,401,{error:'login_required'})
    const {serverId,characterId}=await readJson(req)
    if(![1,2,3].includes(serverId)||typeof characterId!=='string'||!CHARACTER_IDS.includes(characterId))return send(res,400,{error:'not_owned'})
    const error=await retryDbContention(()=>expeditionJoin(account.id,serverId,characterId))
    if(error)return send(res,409,{error})
    send(res,200,await retryDbContention(()=>expeditionSnapshot(account.id)))
  },
  'GET /api/global-chat': async (req, res) => {
    await ensureGlobalChatTables()
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const [rows] = await pool.query(`SELECT c.id, c.message, c.created_ms, a.nickname, a.username
      FROM gm_global_chat c JOIN gm_accounts a ON a.id = c.account_id
      ORDER BY c.id DESC LIMIT 100`)
    const [last] = await pool.query('SELECT last_sent_ms FROM gm_global_chat_cooldown WHERE account_id = ?', [account.id])
    const [seen] = await pool.query('SELECT last_seen_id FROM gm_global_chat_seen WHERE account_id = ?', [account.id])
    const lastSeenId = Number(seen[0]?.last_seen_id || 0)
    const latestId = Number(rows[0]?.id || 0)
    send(res, 200, { items: rows.reverse().map(x => ({ id: Number(x.id), message: x.message, at: Number(x.created_ms), nickname: x.nickname || x.username })), nextAt: Number(last[0]?.last_sent_ms || 0) + 10000, now: Date.now(), unread: latestId > lastSeenId })
  },
  'POST /api/global-chat-seen': async (req, res) => {
    await ensureGlobalChatTables()
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await pool.query(`INSERT INTO gm_global_chat_seen (account_id, last_seen_id)
      SELECT ?, COALESCE(MAX(id), 0) FROM gm_global_chat
      ON DUPLICATE KEY UPDATE last_seen_id = GREATEST(last_seen_id, VALUES(last_seen_id))`, [account.id])
    send(res, 200, { ok: true })
  },
  'POST /api/global-chat': async (req, res) => {
    await ensureGlobalChatTables()
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const body = await readJson(req)
    const message = String(body?.message || '').trim()
    if (!message || [...message].length > 30) return send(res, 400, { error: 'chat_invalid' })
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('INSERT IGNORE INTO gm_global_chat_cooldown (account_id, last_sent_ms) VALUES (?, 0)', [account.id])
      const [last] = await conn.query('SELECT last_sent_ms FROM gm_global_chat_cooldown WHERE account_id = ? FOR UPDATE', [account.id])
      const now = Date.now()
      const nextAt = Number(last[0]?.last_sent_ms || 0) + 10000
      if (now < nextAt) { await conn.rollback(); return send(res, 429, { error: 'chat_cooldown', nextAt, now }) }
      await conn.query('UPDATE gm_global_chat_cooldown SET last_sent_ms = ? WHERE account_id = ?', [now, account.id])
      await conn.query('INSERT INTO gm_global_chat (account_id, message, created_ms) VALUES (?, ?, ?)', [account.id, message, now])
      await conn.commit()
      send(res, 200, { ok: true, nextAt: now + 10000, now })
    } catch (error) { await conn.rollback().catch(() => {}); throw error }
    finally { conn.release() }
  },
  'GET /api/announcements': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    send(res, 200, await getAnnouncements(account.id))
  },
  'POST /api/announcements/seen': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const [rows] = await pool.query('SELECT COALESCE(MAX(id), 0) AS id FROM gm_announcements')
    await pool.query('INSERT INTO gm_announcement_seen (account_id, last_seen_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_seen_id = GREATEST(last_seen_id, VALUES(last_seen_id))', [account.id, Number(rows[0].id)])
    send(res, 200, await getAnnouncements(account.id))
  },
  'POST /api/admin/announcements': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    if (!account.is_admin || account.username !== 'tjdrjs885') return send(res, 403, { error: 'admin_only' })
    const { message } = await readJson(req)
    const value = typeof message === 'string' ? message.trim() : ''
    if (!value || [...value].length > 100) return send(res, 400, { error: 'announcement_invalid' })
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.query('INSERT INTO gm_announcements (message, created_ms) VALUES (?, ?)', [value, Date.now()])
      await conn.query('DELETE FROM gm_announcements WHERE id NOT IN (SELECT id FROM (SELECT id FROM gm_announcements ORDER BY id DESC LIMIT 10) latest)')
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    send(res, 200, await getAnnouncements(account.id))
  },
  'POST /api/admin/announcements/edit': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    if (!account.is_admin || account.username !== 'tjdrjs885') return send(res, 403, { error: 'admin_only' })
    const body = await readJson(req)
    const id = Number(body.id)
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (!Number.isSafeInteger(id) || id <= 0 || !message || [...message].length > 100) return send(res, 400, { error: 'announcement_invalid' })
    const [result] = await pool.query('UPDATE gm_announcements SET message = ? WHERE id = ?', [message, id])
    if (!result.affectedRows) return send(res, 404, { error: 'announcement_not_found' })
    send(res, 200, await getAnnouncements(account.id))
  },
  'POST /api/auth/register': async (req, res) => {
    const { username, password, nickname } = await readJson(req)
    const invalid = validateCredentials(username, password) || validateNickname(nickname)
    if (invalid) return send(res, 400, { error: invalid })
    const nick = nickname.trim()
    const passwordHash = await hashPassword(password)
    let accountId
    try {
      const [result] = await pool.query('INSERT INTO gm_accounts (username, password_hash, nickname) VALUES (?, ?, ?)', [username, passwordHash, nick])
      accountId = result.insertId
    } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: String(error.message).includes('nickname') ? 'nickname_taken' : 'username_taken' })
      throw error
    }
    const save = { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
    await pool.query('INSERT INTO gm_saves (account_id, gems, owned, last_daily) VALUES (?, ?, ?, ?)', [accountId, save.gems, '[]', ''])
    return startSession(res, accountId, username, nick, save)
  },
  'POST /api/auth/login': async (req, res) => {
    const { username, password } = await readJson(req)
    if (typeof username !== 'string' || typeof password !== 'string' || password.length > 72) return send(res, 400, { error: 'invalid_credentials' })
    const key = throttleKey(req, username)
    if (isThrottled(key)) return send(res, 429, { error: 'too_many_attempts' })
    const [rows] = await pool.query('SELECT id, username, nickname, is_admin, password_hash FROM gm_accounts WHERE username = ?', [username])
    const account = rows[0]
    const valid = await verifyPassword(password, account ? account.password_hash : DUMMY_HASH)
    if (!account || !valid) { recordFailure(key); return send(res, 401, { error: 'invalid_credentials' }) }
    failures.delete(key)
    if (account.is_admin) await grantAdminCollection(account.id)
    return startSession(res, account.id, account.username, account.nickname, await getSave(account.id), account.is_admin)
  },
  'POST /api/auth/logout': async (req, res) => {
    await readJson(req)
    const token = readCookie(req, COOKIE)
    if (token) await pool.query('DELETE FROM gm_sessions WHERE token_hash = ?', [tokenHash(token)])
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) })
  },
  'GET /api/diamonds/recharge': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await rechargeDiamonds(account.id)
    const [rows] = await pool.query('SELECT s.diamonds, r.last_ms FROM gm_saves s LEFT JOIN gm_diamond_recharge r ON r.account_id = s.account_id WHERE s.account_id = ?', [account.id])
    const diamonds = Number(rows[0]?.diamonds ?? 0)
    const now = Date.now()
    const nextAt = diamonds >= 20 ? null : diamondHourSlot(now) + DIAMOND_RECHARGE_MS
    send(res, 200, { diamonds, nextAt, now, max: 20 })
  },
  'GET /api/me': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 200, { user: null })
    if (account.is_admin) await grantAdminCollection(account.id)
    const autoEarned = await autoSettle(account.id)
    send(res, 200, { autoEarned, user: { username: account.username, nickname: account.nickname || null, admin: Boolean(account.is_admin) }, ...(await accountState(account.id)) })
  },
  'POST /api/nickname': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { nickname } = await readJson(req)
    const invalid = validateNickname(nickname)
    if (invalid) return send(res, 400, { error: invalid })
    try { await pool.query('UPDATE gm_accounts SET nickname = ? WHERE id = ?', [nickname.trim(), account.id]) } catch (error) {
      if (error && error.code === 'ER_DUP_ENTRY') return send(res, 409, { error: 'nickname_taken' })
      throw error
    }
    send(res, 200, { user: { username: account.username, nickname: nickname.trim(), admin: Boolean(account.is_admin) } })
  },
  'GET /api/profile/privacy': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const [rows] = await pool.query('SELECT show_char, show_deco, show_house FROM gm_profile_privacy WHERE account_id = ?', [account.id])
    const row = rows[0]
    send(res, 200, { privacy: { char: row ? Boolean(row.show_char) : true, deco: row ? Boolean(row.show_deco) : true, house: row ? Boolean(row.show_house) : true } })
  },
  'POST /api/profile/privacy': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { char, deco, house } = await readJson(req)
    if ([char, deco, house].some(v => typeof v !== 'boolean')) return send(res, 400, { error: 'invalid_privacy' })
    await pool.query('INSERT INTO gm_profile_privacy (account_id, show_char, show_deco, show_house) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE show_char=VALUES(show_char), show_deco=VALUES(show_deco), show_house=VALUES(show_house)', [account.id, Number(char), Number(deco), Number(house)])
    send(res, 200, { privacy: { char, deco, house } })
  },
  'GET /api/users': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const [rows] = await pool.query('SELECT a.nickname, a.id, s.owned, s.featured, f.weapon AS forge_weapon, f.level AS forge_level, d.items, p.show_char, p.show_deco, p.show_house FROM gm_accounts a LEFT JOIN gm_saves s ON s.account_id = a.id LEFT JOIN gm_decos d ON d.account_id = a.id LEFT JOIN gm_forge f ON f.account_id = a.id LEFT JOIN gm_profile_privacy p ON p.account_id = a.id WHERE a.nickname IS NOT NULL AND a.is_admin = 0 LIMIT 300')
    const users = rows.map(row => {
      const me = Number(row.id) === Number(account.id)
      const privacy = { char: row.show_char === null || row.show_char === undefined ? true : Boolean(row.show_char), deco: row.show_deco === null || row.show_deco === undefined ? true : Boolean(row.show_deco), house: row.show_house === null || row.show_house === undefined ? true : Boolean(row.show_house) }
      const rawOwned = normalizeOwned(parseJson(row.owned || '[]'))
      const owned = me || privacy.char ? rawOwned : []
      const decos = me || privacy.deco ? Object.keys(normalizeDecos(row.items ? parseJson(row.items) : {})) : []
      const featured = row.featured && rawOwned.includes(row.featured) ? row.featured : (rawOwned[0] || null)
      return { nickname: row.nickname, owned, decos, featured, me, privacy, weapon: row.forge_weapon || null, weaponLevel: row.forge_weapon ? Number(row.forge_level) : null }
    })
    users.sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko-KR', { sensitivity: 'base', numeric: true }))
    send(res, 200, { users, total: CHARACTER_IDS.length, decoTotal: DECO_IDS.length })
  },
  'GET /api/house/coin': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    send(res, 200, { coin: null, nextAt: 0, now: Date.now() })
  },
  'POST /api/house/coin': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    send(res, 410, { error: 'house_coin_disabled' })
  },
  'POST /api/users/house': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { nickname } = await readJson(req)
    if (typeof nickname !== 'string' || !nickname.trim()) return send(res, 404, { error: 'mail_no_user' })
    const [rows] = await pool.query('SELECT id, nickname FROM gm_accounts WHERE nickname = ? AND is_admin = 0', [nickname.trim()])
    if (!rows[0]) return send(res, 404, { error: 'mail_no_user' })
    if (Number(rows[0].id) !== Number(account.id)) {
      const [privacyRows] = await pool.query('SELECT show_house FROM gm_profile_privacy WHERE account_id = ?', [rows[0].id])
      if (privacyRows[0] && !Boolean(privacyRows[0].show_house)) return send(res, 403, { error: 'house_private' })
    }
    send(res, 200, { nickname: rows[0].nickname, house: await getHouse(rows[0].id) })
  },
  'POST /api/weed/start': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { id } = await readJson(req)
    if (typeof id !== 'string' || !CHARACTER_IDS.includes(id)) return send(res, 400, { error: 'not_owned' })
    const outcome = await updateWeed(account.id, { add: id })
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, outcome)
  },
  'POST /api/weed/beetle': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { on } = await readJson(req)
    const outcome = await updateWeed(account.id, { beetle: Boolean(on) })
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, outcome)
  },
  'POST /api/weed/stop': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { id } = await readJson(req)
    if (typeof id !== 'string' || !CHARACTER_IDS.includes(id)) return send(res, 400, { error: 'not_weeding' })
    const outcome = await updateWeed(account.id, { remove: id })
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, outcome)
  },
  'POST /api/weed/claim': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await readJson(req)
    const outcome = await updateWeed(account.id, {})
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, outcome)
  },
  'POST /api/battle/start': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { id } = await readJson(req)
    if (typeof id !== 'string' || !CHARACTER_IDS.includes(id)) return send(res, 400, { error: 'not_owned' })
    const outcome = await updateBattle(account.id, id)
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, outcome)
  },
  'POST /api/settle': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await readJson(req)
    const earned = await autoSettle(account.id)
    send(res, 200, { earned, save: await getSave(account.id), weed: await getWeed(account.id), battle: await getBattle(account.id), now: Date.now() })
  },
  'POST /api/battle/claim': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await readJson(req)
    const outcome = await updateBattle(account.id, null)
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, outcome)
  },
  'POST /api/featured': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { id } = await readJson(req)
    const save = await getSave(account.id)
    if (typeof id !== 'string' || !save.owned.includes(id)) return send(res, 400, { error: 'not_owned' })
    await pool.query('UPDATE gm_saves SET featured = ? WHERE account_id = ?', [id, account.id])
    send(res, 200, { featured: id })
  },
  'GET /api/mail': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    send(res, 200, await mailbox(account.id))
  },
  'POST /api/mail/seen': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await readJson(req)
    await pool.query('UPDATE gm_mail SET seen = 1 WHERE to_id = ? AND seen = 0 AND to_deleted = 0', [account.id])
    send(res, 200, { ok: true })
  },
  'POST /api/mail/send': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const body = await readJson(req)
    const to = typeof body.to === 'string' ? body.to.trim() : ''
    const [targets] = await pool.query('SELECT id FROM gm_accounts WHERE nickname = ? AND is_admin = 0', [to])
    if (!targets[0]) return send(res, 404, { error: 'mail_no_user' })
    const toId = targets[0].id
    if (Number(toId) === Number(account.id)) return send(res, 400, { error: 'mail_self' })
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [saves] = await conn.query('SELECT gems FROM gm_saves WHERE account_id = ? FOR UPDATE', [account.id])
      const balance = saves[0] ? Number(saves[0].gems) : 0
      const already = await sentToday(conn, account.id)
      const checked = validateMail(body, { sentToday: already, balance, admin: Boolean(account.is_admin) })
      if (checked.error) { await conn.rollback(); return send(res, 400, { error: checked.error }) }
      if (checked.coins > 0 && !account.is_admin) await conn.query('UPDATE gm_saves SET gems = gems - ? WHERE account_id = ?', [checked.coins, account.id])
      await conn.query('INSERT INTO gm_mail (from_id, to_id, message, coins, sent_day, created_ms) VALUES (?, ?, ?, ?, ?, ?)', [account.id, toId, checked.text, checked.coins, checkInDay(), Date.now()])
      await trimInbox(conn, toId)
      await trimSent(conn, account.id)
      await conn.commit()
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw error
    } finally {
      conn.release()
    }
    send(res, 200, { save: await getSave(account.id), to, ...(await mailbox(account.id)) })
  },
  'POST /api/admin/mail/broadcast': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    // The permission is enforced on the server, not merely hidden in the UI.
    if (!account.is_admin || account.username !== 'tjdrjs885') return send(res, 403, { error: 'admin_only' })
    const body = await readJson(req)
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const coins = Number(body.coins)
    const diamonds = Number(body.diamonds ?? 0)
    const fragments = Number(body.fragments ?? 0)
    if (![diamonds, fragments].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1000000)) return send(res, 400, { error: 'invalid_broadcast' })
    if (!message || message.length > 200 || !Number.isSafeInteger(coins) || coins < 0 || coins > 1000000) {
      return send(res, 400, { error: 'invalid_broadcast' })
    }
    const conn = await pool.getConnection()
    let count = 0
    try {
      await conn.beginTransaction()
      const [recipients] = await conn.query('SELECT id FROM gm_accounts WHERE is_admin = 0 ORDER BY id')
      count = recipients.length
      if (count > 10000) { await conn.rollback(); return send(res, 400, { error: 'too_many_recipients' }) }
      const now = Date.now()
      for (const recipient of recipients) {
        await conn.query('INSERT INTO gm_mail (from_id, to_id, message, coins, diamonds, fragments, sent_day, created_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [account.id, recipient.id, message, coins, diamonds, fragments, checkInDay(), now])
        await trimInbox(conn, recipient.id)
      }
      await trimSent(conn, account.id)
      await conn.commit()
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw error
    } finally { conn.release() }
    send(res, 200, { count, coins, diamonds, fragments })
  },
  'POST /api/mail/claim': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { id } = await readJson(req)
    const conn = await pool.getConnection()
    let total = 0
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query(
        id == null
          ? 'SELECT id, coins, diamonds, fragments FROM gm_mail WHERE to_id = ? AND claimed = 0 AND (coins > 0 OR diamonds > 0 OR fragments > 0) AND to_deleted = 0 FOR UPDATE'
          : 'SELECT id, coins, diamonds, fragments FROM gm_mail WHERE to_id = ? AND claimed = 0 AND (coins > 0 OR diamonds > 0 OR fragments > 0) AND to_deleted = 0 AND id = ? FOR UPDATE',
        id == null ? [account.id] : [account.id, Number(id)],
      )
      total = rows.reduce((sum, row) => sum + Number(row.coins), 0)
      const diamondTotal = rows.reduce((sum, row) => sum + Number(row.diamonds), 0)
      const fragmentTotal = rows.reduce((sum, row) => sum + Number(row.fragments), 0)
      if (rows.length) {
        await conn.query(`UPDATE gm_mail SET claimed = 1, seen = 1 WHERE id IN (${rows.map(() => '?').join(',')})`, rows.map(row => row.id))
        await conn.query('UPDATE gm_saves SET gems = gems + ?, diamonds = diamonds + ?, fragments = fragments + ? WHERE account_id = ?', [total, diamondTotal, fragmentTotal, account.id])
      }
      await conn.commit()
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw error
    } finally {
      conn.release()
    }
    send(res, 200, { claimed: total, save: await getSave(account.id), ...(await mailbox(account.id)) })
  },
  'POST /api/pull': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { count } = await readJson(req)
    // Operator accounts have unlimited coins: pulls never spend their balance.
    let dupes = {}
    const outcome = await withSave(account.id, state => {
      let result = pull(account.is_admin ? { ...state, gems: 1_000_000_000 } : state, count, n => randomInt(n))
      if (result.ok && account.is_admin) result = { ...result, state: { ...result.state, gems: state.gems } }
      if (!result.ok) return result
      // Duplicate copies go to the storage box, in the same transaction as the pull.
      return { ...result, after: async conn => {
        const [rows] = await conn.query('SELECT items FROM gm_dupes WHERE account_id = ? FOR UPDATE', [account.id])
        dupes = addDupes(rows[0] ? parseJson(rows[0].items) : {}, result.results)
        await conn.query('INSERT INTO gm_dupes (account_id, items) VALUES (?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items)', [account.id, JSON.stringify(dupes)])
      } }
    })
    if (!outcome.ok) return send(res, 400, { error: outcome.error })
    send(res, 200, { save: outcome.state, results: outcome.results, dupes })
  },
  'POST /api/claw/refresh': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await rechargeDiamonds(account.id)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query('SELECT diamonds FROM gm_saves WHERE account_id = ? FOR UPDATE', [account.id])
      if (!rows.length || (!account.is_admin && Number(rows[0].diamonds) < 2)) {
        await conn.rollback()
        return send(res, 400, { error: 'not_enough_diamonds' })
      }
      if (!account.is_admin) await conn.query('UPDATE gm_saves SET diamonds = diamonds - 2 WHERE account_id = ?', [account.id])
      await conn.commit()
      return send(res, 200, { save: await getSave(account.id) })
    } catch (error) { await conn.rollback().catch(() => {}); throw error }
    finally { conn.release() }
  },
  'POST /api/claw/play': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await rechargeDiamonds(account.id)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const body = await readJson(req)
      const { aligned } = body
      const admin = Boolean(account.is_admin)
      const [rows] = await conn.query('SELECT diamonds FROM gm_saves WHERE account_id = ? FOR UPDATE', [account.id])
      if (!rows.length || (!admin && Number(rows[0].diamonds) < 1)) {
        await conn.rollback()
        return send(res, 400, { error: 'not_enough_diamonds' })
      }
      // Always grab when aligned; grip may release at each distance interval.
      const x = Math.max(0, Math.min(100, Number(body.x) || 0))
      const y = Math.max(0, Math.min(100, Number(body.y) || 0))
      const segments = Math.max(1, Math.ceil(Math.hypot(x - 88, y - 12) / 14))
      // Each travel interval has its own independent survival roll.
      // The interval nearest the chute is band 1; farther intervals are
      // progressively easier, using the tuned v1.18 probabilities.
      const bandChances = [0, .60, .65, .70, .75, .79, .82, .86, .90]
      let won = aligned === true
      let dropAt = -1
      let chanceProduct = 1
      for (let step = 1; step <= segments; step++) {
        const remainingBand = segments - step + 1
        const probability = bandChances[Math.min(remainingBand, 8)]
        chanceProduct *= probability
        if (won && randomInt(1000000) >= Math.round(probability * 1000000)) {
          won = false
          dropAt = step
        }
      }
      // chance is the full-trip probability, not an individual interval's.
      const chance = aligned === true ? Math.round(chanceProduct * 10000) / 100 : 0
      const prize = won ? DECO_IDS[randomInt(DECO_IDS.length)] : null
      if (!admin) await conn.query('UPDATE gm_saves SET diamonds = diamonds - 1 WHERE account_id = ?', [account.id])
      let bonus = 0
      if (prize) {
        const [decoRows] = await conn.query('SELECT items FROM gm_decos WHERE account_id = ? FOR UPDATE', [account.id])
        const decos = decoRows.length ? normalizeDecos(parseJson(decoRows[0].items)) : {}
        if (!decos[prize]) {
          bonus = DECO_NEW_BONUS
          await conn.query('UPDATE gm_saves SET gems = gems + ? WHERE account_id = ?', [bonus, account.id])
        }
        decos[prize] = (decos[prize] || 0) + 1
        await conn.query('INSERT INTO gm_decos (account_id, items) VALUES (?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items)', [account.id, JSON.stringify(decos)])
      }
      await conn.commit()
      send(res, 200, { won, chance, dropAt, segments, prize, bonus, save: await getSave(account.id), decos: await getDecos(account.id) })
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw error
    } finally { conn.release() }
  },
  'POST /api/deco/pull': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { count } = await readJson(req)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [saves] = await conn.query('SELECT gems, diamonds, fragments, owned, last_daily, last_roulette FROM gm_saves WHERE account_id = ? FOR UPDATE', [account.id])
      const state = saves[0] ? saveView(saves[0]) : { version: 1, gems: STARTING_COINS, owned: [], lastDaily: '' }
      const [rows] = await conn.query('SELECT items FROM gm_decos WHERE account_id = ? FOR UPDATE', [account.id])
      const decos = rows[0] ? normalizeDecos(parseJson(rows[0].items)) : {}
      // Operator accounts have unlimited coins: deco pulls never spend their balance.
      const outcome = pullDecos(account.is_admin ? 1_000_000_000 : state.gems, decos, count, n => randomInt(n))
      if (!outcome.ok) { await conn.rollback(); return send(res, 400, { error: outcome.error }) }
      if (!account.is_admin) state.gems = outcome.gems
      await conn.query('INSERT INTO gm_saves (account_id, gems, owned, last_daily) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE gems = VALUES(gems)', [account.id, state.gems, JSON.stringify(state.owned), state.lastDaily])
      await conn.query('INSERT INTO gm_decos (account_id, items) VALUES (?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items)', [account.id, JSON.stringify(outcome.decos)])
      await conn.commit()
      send(res, 200, { save: state, decos: outcome.decos, results: outcome.results })
    } catch (error) {
      await conn.rollback().catch(() => {})
      throw error
    } finally {
      conn.release()
    }
  },
  'POST /api/house/save': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { layout } = await readJson(req)
    const checked = validateHouse(layout, await getDecos(account.id), (await getSave(account.id)).owned)
    if (checked.error) return send(res, 400, { error: checked.error })
    await pool.query('INSERT INTO gm_house (account_id, layout) VALUES (?, ?) ON DUPLICATE KEY UPDATE layout = VALUES(layout)', [account.id, JSON.stringify(checked.layout)])
    send(res, 200, { house: checked.layout })
  },
  'POST /api/mail/delete': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { id, box } = await readJson(req)
    if (!Number.isInteger(id)) return send(res, 400, { error: 'mail_not_found' })
    const outcome = await inTransaction(async conn => {
      if (box === 'sent') {
        const [r] = await conn.query('UPDATE gm_mail SET from_deleted = 1 WHERE id = ? AND from_id = ? AND from_deleted = 0', [id, account.id])
        return r.affectedRows ? { claimed: 0 } : { error: 'mail_not_found' }
      }
      const [rows] = await conn.query('SELECT coins, diamonds, fragments, claimed FROM gm_mail WHERE id = ? AND to_id = ? AND to_deleted = 0 FOR UPDATE', [id, account.id])
      if (!rows[0]) return { error: 'mail_not_found' }
      // Deleting a letter never loses its coins: unclaimed coins are received first.
      const claimed = rows[0].claimed ? 0 : Number(rows[0].coins)
      await conn.query('UPDATE gm_mail SET to_deleted = 1, claimed = 1, seen = 1 WHERE id = ?', [id])
      if (!rows[0].claimed) await conn.query('UPDATE gm_saves SET gems = gems + ?, diamonds = diamonds + ?, fragments = fragments + ? WHERE account_id = ?', [claimed, Number(rows[0].diamonds), Number(rows[0].fragments), account.id])
      return { claimed }
    })
    if (outcome.error) return send(res, 404, { error: outcome.error })
    send(res, 200, { claimed: outcome.claimed, save: await getSave(account.id), ...(await mailbox(account.id)) })
  },
  'POST /api/sell': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { kind, id, count } = await readJson(req)
    if (typeof id !== 'string' || (kind !== 'char' && kind !== 'deco')) return send(res, 400, { error: 'sell_invalid' })
    const outcome = await inTransaction(async conn => {
      await conn.query('SELECT gems FROM gm_saves WHERE account_id = ? FOR UPDATE', [account.id])
      let coins = 0
      if (kind === 'char') {
        const [rows] = await conn.query('SELECT items FROM gm_dupes WHERE account_id = ? FOR UPDATE', [account.id])
        const sold = sellCharacter(rows[0] ? parseJson(rows[0].items) : {}, id, count)
        if (sold.error) return sold
        await conn.query('INSERT INTO gm_dupes (account_id, items) VALUES (?, ?) ON DUPLICATE KEY UPDATE items = VALUES(items)', [account.id, JSON.stringify(sold.dupes)])
        coins = sold.coins
      } else {
        const [rows] = await conn.query('SELECT items FROM gm_decos WHERE account_id = ? FOR UPDATE', [account.id])
        const [house] = await conn.query('SELECT layout FROM gm_house WHERE account_id = ?', [account.id])
        const placed = normalizeHouse(house[0] ? parseJson(house[0].layout) : null).pieces.filter(piece => piece.id === id).length
        const sold = sellDeco(rows[0] ? parseJson(rows[0].items) : {}, id, count, placed)
        if (sold.error) return sold
        await conn.query('UPDATE gm_decos SET items = ? WHERE account_id = ?', [JSON.stringify(sold.decos), account.id])
        coins = sold.coins
      }
      await conn.query('UPDATE gm_saves SET gems = gems + ? WHERE account_id = ?', [coins, account.id])
      return { coins }
    })
    if (outcome.error) return send(res, 400, { error: outcome.error })
    send(res, 200, { coins: outcome.coins, save: await getSave(account.id), dupes: await getDupes(account.id), decos: await getDecos(account.id) })
  },
  'GET /api/suggest': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    send(res, 200, await suggestions(account))
  },
  'POST /api/suggest': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    const { message } = await readJson(req)
    const checked = validateSuggestion(message)
    if (checked.error) return send(res, 400, { error: checked.error })
    const outcome = await inTransaction(async conn => {
      await conn.query('SELECT id FROM gm_accounts WHERE id = ? FOR UPDATE', [account.id])
      const [today] = await conn.query('SELECT COUNT(*) AS n FROM gm_suggest WHERE account_id = ? AND day = ?', [account.id, checkInDay()])
      if (!account.is_admin && Number(today[0].n) >= SUGGEST_DAILY_MAX) return { error: 'suggest_daily_limit' }
      await conn.query('INSERT INTO gm_suggest (account_id, message, created_ms, day) VALUES (?, ?, ?, ?)', [account.id, checked.text, Date.now(), checkInDay()])
      return { ok: true }
    })
    if (outcome.error) return send(res, 429, { error: outcome.error })
    send(res, 200, await suggestions(account))
  },
  'POST /api/suggest/reply': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    if (!account.is_admin) return send(res, 403, { error: 'admin_only' })
    const { id, reply } = await readJson(req)
    const checked = validateSuggestion(reply, SUGGEST_REPLY_MAX_CHARS)
    if (checked.error) return send(res, 400, { error: checked.error })
    const [r] = await pool.query('UPDATE gm_suggest SET reply = ?, reply_ms = ? WHERE id = ?', [checked.text, Date.now(), Number(id)])
    if (!r.affectedRows) return send(res, 404, { error: 'suggest_not_found' })
    send(res, 200, await suggestions(account))
  },
  'POST /api/suggest/delete': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    if (!account.is_admin) return send(res, 403, { error: 'admin_only' })
    const { id } = await readJson(req)
    const [r] = await pool.query('DELETE FROM gm_suggest WHERE id = ?', [Number(id)])
    if (!r.affectedRows) return send(res, 404, { error: 'suggest_not_found' })
    send(res, 200, await suggestions(account))
  },
  'POST /api/roulette': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await readJson(req)
    const outcome = await withSave(account.id, state => spinRoulette(state))
    if (!outcome.ok) return send(res, 409, { error: outcome.error, save: outcome.state })
    send(res, 200, { index: outcome.index, prize: outcome.prize, save: outcome.state })
  },
  'POST /api/daily': async (req, res) => {
    const account = await currentAccount(req)
    if (!account) return send(res, 401, { error: 'login_required' })
    await readJson(req)
    const outcome = await withSave(account.id, state => claimDaily(state))
    send(res, 200, { claimed: outcome.ok, save: outcome.state })
  },
}

const WEB_ROOT = resolve(fileURLToPath(new URL('../dist/', import.meta.url)))
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.ico': 'image/x-icon', '.json': 'application/json' }
async function serveFrontend(req, res, path) {
  let decoded
  try { decoded = decodeURIComponent(path) } catch { return send(res, 400, { error: 'bad_path' }) }
  const file = resolve(WEB_ROOT, '.' + (decoded === '/' ? '/index.html' : decoded))
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + sep)) return send(res, 403, { error: 'forbidden' })
  try {
    const info = await stat(file)
    if (!info.isFile()) throw new Error('not_file')
    const data = await readFile(file)
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' })
    return res.end(req.method === 'HEAD' ? undefined : data)
  } catch { return send(res, 404, { error: 'not_found' }) }
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url || '/', 'http://local').pathname
  if (path === '/api/health') return send(res, 200, { ok: true, database: ready ? 'ready' : 'starting' })
  const handler = routes[`${req.method} ${path}`]
  if (!handler) {
    if (req.method === 'GET' || req.method === 'HEAD') return serveFrontend(req, res, path)
    return send(res, 404, { error: 'not_found' })
  }
  if (!ready) return send(res, 503, { error: 'starting' })
  try {
    await handler(req, res)
  } catch (error) {
    const status = error && error.status
    if (status) return send(res, status, { error: error.message })
    console.error('[api]', req.method, path, error && error.code ? error.code : error)
    send(res, 500, { error: 'server_error' })
  }
})

server.listen(PORT, () => {
  console.log(`[api] listening on ${PORT}`)
  // Bind first, then prepare the database so health checks answer during startup.
  const attempt = async (tries) => {
    try { await prepareDatabase(); console.log('[api] database ready') } catch (error) {
      readyError = error && error.code ? error.code : String(error)
      console.error('[api] database not ready:', readyError)
      if (tries > 0) setTimeout(() => attempt(tries - 1), 3000)
    }
  }
  attempt(20)
})
