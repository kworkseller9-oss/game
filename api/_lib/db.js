import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

let sql;
function client() {
  if (!sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL не задан');
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

export const q = (text, params = []) => client().query(text, params);
export const one = async (text, params = []) => (await q(text, params))[0];

const SCHEMA = [
  `create table if not exists users (
    id serial primary key,
    login text unique not null,
    email text,
    pass_hash text not null,
    role text not null default 'user',
    status text not null default 'active',
    xp int not null default 0,
    created_at timestamptz not null default now()
  )`,
  `create table if not exists rooms (
    id serial primary key,
    code text unique not null,
    name text not null,
    host_id int not null,
    max_players int not null default 10,
    mode text not null default 'classic',
    password text,
    status text not null default 'waiting',
    phase text,
    day int not null default 0,
    step int not null default 0,
    phase_ends_at timestamptz,
    winner text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table if not exists room_players (
    room_id int not null references rooms(id) on delete cascade,
    user_id int not null references users(id) on delete cascade,
    role text,
    alive boolean not null default true,
    joined_at timestamptz not null default now(),
    primary key (room_id, user_id)
  )`,
  `create table if not exists messages (
    id serial primary key,
    room_id int not null references rooms(id) on delete cascade,
    user_id int,
    channel text not null default 'all',
    text text not null,
    created_at timestamptz not null default now()
  )`,
  `create index if not exists messages_room_idx on messages(room_id, id)`,
  `create table if not exists actions (
    room_id int not null references rooms(id) on delete cascade,
    day int not null,
    phase text not null,
    actor_id int not null,
    target_id int,
    primary key (room_id, day, phase, actor_id)
  )`,
  `create table if not exists history (
    id serial primary key,
    user_id int not null references users(id) on delete cascade,
    room_id int,
    mode text,
    role text,
    result text not null,
    created_at timestamptz not null default now()
  )`,
];

let ready = null;
export function ensure() {
  if (!ready) {
    ready = (async () => {
      for (const s of SCHEMA) await q(s);
      const login = (process.env.ADMIN_LOGIN || '').trim();
      const pass = process.env.ADMIN_PASSWORD || '';
      if (login && pass) {
        const u = await one('select id, pass_hash from users where login = $1', [login]);
        if (!u) {
          await q(
            "insert into users(login, pass_hash, role) values ($1, $2, 'admin')",
            [login, await bcrypt.hash(pass, 10)]
          );
        } else if (!(await bcrypt.compare(pass, u.pass_hash))) {
          await q("update users set pass_hash = $2, role = 'admin', status = 'active' where id = $1", [
            u.id,
            await bcrypt.hash(pass, 10),
          ]);
        }
      }
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}
