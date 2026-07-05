import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export let isMockMode = false;
const mockDb = {
  users: [] as any[],
  notes: [] as any[],
  trackedPages: [] as any[],
  trackedAds: [] as any[],
  analytics_events: [] as any[],
  analytics_rules: [] as any[],
  telegram_chats: {} as Record<string, any>,
  telegram_messages: {} as Record<string, any>,
  telegram_media: {} as Record<string, any>,
  projects: [] as any[],
  project_links: [] as any[],
  team_messages: [] as any[],
  broadcasts: [] as any[],
  mail_accounts: [] as any[]
};

export async function initDB() {
  try {
    const client = await pool.connect();
    client.release();
    
    // Postgres is online -> Verify standard tables
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email_hash BYTEA NOT NULL UNIQUE,
        password_hash BYTEA NOT NULL,
        username VARCHAR(255),
        totp_secret_enc BYTEA,
        avatar_url TEXT,
        last_seen_at TIMESTAMP DEFAULT NOW(),
        is_online BOOLEAN DEFAULT FALSE,
        role VARCHAR(50) DEFAULT 'admin',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP DEFAULT NOW();
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'admin';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS master_key TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status VARCHAR(255);

      CREATE TABLE IF NOT EXISTS team_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
        receiver_id UUID REFERENCES users(id) ON DELETE CASCADE,
        channel VARCHAR(100),
        text TEXT,
        file_payload JSONB,
        reply_to_id UUID REFERENCES team_messages(id) ON DELETE SET NULL,
        is_edited BOOLEAN DEFAULT FALSE,
        is_deleted BOOLEAN DEFAULT FALSE,
        reactions JSONB DEFAULT '{}',
        link_preview JSONB,
        is_pinned BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES team_messages(id) ON DELETE SET NULL;
      ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;
      ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE;
      ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS reactions JSONB DEFAULT '{}';
      ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS link_preview JSONB;
      ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

      CREATE TABLE IF NOT EXISTS chat_reads (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        channel VARCHAR(100),
        dm_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        last_read_message_id UUID REFERENCES team_messages(id) ON DELETE SET NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, channel, dm_user_id)
      );

      CREATE TABLE IF NOT EXISTS analytics_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        path VARCHAR(255),
        session_id VARCHAR(100),
        referrer TEXT,
        device_type VARCHAR(50),
        country VARCHAR(10),
        domain VARCHAR(255),
        payload JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS domain VARCHAR(255);

      CREATE TABLE IF NOT EXISTS encrypted_notes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        content_enc BYTEA NOT NULL,
        nonce BYTEA NOT NULL,
        public_token VARCHAR(64) UNIQUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        path VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webhook_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id UUID REFERENCES webhooks(id) ON DELETE CASCADE,
        headers JSONB NOT NULL,
        payload JSONB NOT NULL,
        received_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tracked_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        page_name VARCHAR(255) NOT NULL,
        page_link TEXT NOT NULL,
        last_checked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tracked_ads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id UUID REFERENCES tracked_pages(id) ON DELETE CASCADE,
        ad_id VARCHAR(255) NOT NULL,
        ad_copy TEXT,
        media_url TEXT,
        platforms JSONB NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        start_date VARCHAR(255),
        end_date VARCHAR(255),
        raw_payload JSONB,
        first_seen_at TIMESTAMP DEFAULT NOW(),
        last_seen_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS telegram_avatars (
        chat_id VARCHAR(100) PRIMARY KEY,
        data_url TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS telegram_chats (
        client_key VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS telegram_messages (
        id VARCHAR(100) PRIMARY KEY,
        chat_id VARCHAR(100) NOT NULL,
        client_key VARCHAR(255) NOT NULL,
        data JSONB NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS telegram_media (
        id VARCHAR(100) PRIMARY KEY,
        data_url TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS analytics_rules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        domain VARCHAR(255) NOT NULL UNIQUE,
        allowed_countries JSONB NOT NULL DEFAULT '[]',
        blocked_countries JSONB NOT NULL DEFAULT '[]',
        allowed_devices JSONB NOT NULL DEFAULT '[]',
        blocked_devices JSONB NOT NULL DEFAULT '[]',
        redirect_url TEXT,
        block_redirect_url TEXT,
        enable_cloaking BOOLEAN DEFAULT FALSE,
        enable_vpn_blocking BOOLEAN DEFAULT FALSE,
        telegram_bot_token TEXT,
        telegram_chat_id TEXT,
        telegram_alerts_enabled BOOLEAN DEFAULT FALSE,
        is_offline BOOLEAN DEFAULT FALSE,
        telegram_view_threshold INT DEFAULT 0,
        telegram_view_repeat BOOLEAN DEFAULT FALSE,
        enable_anomaly_alerts BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'Planning',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS project_links (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      ALTER TABLE analytics_rules ADD COLUMN IF NOT EXISTS is_offline BOOLEAN DEFAULT FALSE;
      ALTER TABLE analytics_rules ADD COLUMN IF NOT EXISTS telegram_view_threshold INT DEFAULT 0;
      ALTER TABLE analytics_rules ADD COLUMN IF NOT EXISTS telegram_view_repeat BOOLEAN DEFAULT FALSE;
      ALTER TABLE analytics_rules ADD COLUMN IF NOT EXISTS enable_anomaly_alerts BOOLEAN DEFAULT FALSE;
      ALTER TABLE analytics_rules ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE project_links ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE tracked_pages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
      ALTER TABLE tracked_ads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

      CREATE TABLE IF NOT EXISTS temp_mail_accounts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        domain VARCHAR(255) NOT NULL,
        address VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        token TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('PostgreSQL database initiated successfully.');
  } catch (err) {
    console.warn('⚠️ Local PostgreSQL database offline. Falling back to logless In-Memory Mock Database mode.');
    isMockMode = true;
  }
}

// Override query to fallback to memory mock array if PostgreSQL is offline
const originalQuery = pool.query.bind(pool);
pool.query = (async (text: any, params: any) => {
  if (!isMockMode) {
    try {
      return await originalQuery(text, params);
    } catch (err) {
      isMockMode = true;
    }
  }

  // Handle In-Memory Queries Mock
  const sql = typeof text === 'string' ? text.trim() : text.text.trim();
  
  if (sql.includes('INSERT INTO users')) {
    // The auth route now sends 5 params: [emailHash, passwordHash, username, role, masterKey]
    const [email_hash, password_hash, username, role = 'admin', master_key] = params;
    const newUser = {
      id: crypto.randomUUID(),
      email_hash,
      password_hash,
      username: username || `User_${Math.floor(Math.random() * 10000)}`,
      totp_secret_enc: null,
      role: mockDb.users.length === 0 ? 'superadmin' : role,
      status: 'active',
      master_key: master_key || null,
      created_at: new Date()
    };
    mockDb.users.push(newUser);
    return { rows: [newUser] };
  }
  
  if (sql.includes('FROM users WHERE email_hash')) {
    const [email_hash] = params;
    const user = mockDb.users.find(u => u.email_hash.toString('hex') === email_hash.toString('hex'));
    return { rows: user ? [user] : [] };
  }

  if (sql.includes('SELECT count(id) FROM users')) {
    return { rows: [{ count: mockDb.users.length.toString() }] };
  }

  if (sql.includes('SELECT id, username, role, status, last_seen_at, created_at FROM users')) {
    return { rows: [...mockDb.users].reverse().slice(0, 50) };
  }

  if (sql.includes('SELECT * FROM broadcasts')) {
    return { rows: [...mockDb.broadcasts].reverse() };
  }

  if (sql.includes('INSERT INTO broadcasts')) {
    const [message, type, created_at] = params;
    const b = { id: crypto.randomUUID(), message, type, created_at };
    mockDb.broadcasts.push(b);
    return { rows: [b] };
  }

  if (sql.includes('UPDATE users SET status = $1 WHERE id = $2')) {
    const [status, id] = params;
    const user = mockDb.users.find(u => u.id === id);
    if (user) {
      user.status = status;
      return { rows: [user] };
    }
    return { rows: [] };
  }

  if (sql.includes('UPDATE users SET password_hash = $1 WHERE id = $2')) {
    const [password_hash, id] = params;
    const user = mockDb.users.find(u => u.id === id);
    if (user) {
      user.password_hash = password_hash;
      return { rows: [user] };
    }
    return { rows: [] };
  }



  if (sql.includes('UPDATE users SET totp_secret_enc')) {
    const [totp_secret_enc, id] = params;
    const user = mockDb.users.find(u => u.id === id);
    if (user) {
      user.totp_secret_enc = totp_secret_enc;
    }
    return { rows: user ? [user] : [] };
  }

  if (sql.includes('SELECT id, username, avatar_url, is_online, last_seen_at')) {
    return { rows: mockDb.users.map(u => ({ 
      id: u.id, 
      username: u.username, 
      avatar_url: u.avatar_url, 
      is_online: u.is_online, 
      last_seen_at: u.last_seen_at,
      custom_status: u.custom_status || null
    })) };
  }

  if (sql.includes('UPDATE users SET custom_status = $1 WHERE id = $2')) {
    const [custom_status, id] = params;
    const user = mockDb.users.find(u => u.id === id);
    if (user) {
      user.custom_status = custom_status;
      return { rows: [user] };
    }
    return { rows: [] };
  }

  if (sql.includes('INSERT INTO team_messages')) {
    const [sender_id, receiver_id, channel, text, file_payload, reply_to_id, link_preview] = params;
    const msg = {
      id: crypto.randomUUID(),
      sender_id,
      receiver_id,
      channel,
      text,
      file_payload: typeof file_payload === 'string' ? JSON.parse(file_payload) : file_payload,
      reply_to_id,
      is_edited: false,
      is_deleted: false,
      reactions: {},
      link_preview: typeof link_preview === 'string' ? JSON.parse(link_preview) : link_preview,
      is_pinned: false,
      created_at: new Date()
    };
    mockDb.team_messages.push(msg);
    return { rows: [msg] };
  }

  if (sql.includes('UPDATE team_messages SET')) {
    if (sql.includes('text =') && sql.includes('is_edited =')) {
      const [text, id] = params;
      const msg = mockDb.team_messages.find(m => m.id === id);
      if (msg) {
        msg.text = text;
        msg.is_edited = true;
      }
      return { rows: msg ? [msg] : [] };
    }
    if (sql.includes('is_deleted =')) {
      const [id] = params;
      const msg = mockDb.team_messages.find(m => m.id === id);
      if (msg) {
        msg.is_deleted = true;
      }
      return { rows: msg ? [msg] : [] };
    }
    if (sql.includes('reactions =')) {
      const [reactions, id] = params;
      const msg = mockDb.team_messages.find(m => m.id === id);
      if (msg) {
        msg.reactions = typeof reactions === 'string' ? JSON.parse(reactions) : reactions;
      }
      return { rows: msg ? [msg] : [] };
    }
    if (sql.includes('is_pinned =')) {
      const [is_pinned, id] = params;
      const msg = mockDb.team_messages.find(m => m.id === id);
      if (msg) {
        msg.is_pinned = is_pinned;
      }
      return { rows: msg ? [msg] : [] };
    }
  }

  if (sql.includes('FROM team_messages')) {
    if (sql.includes('channel =')) {
      const [channel] = params;
      return { rows: mockDb.team_messages.filter(m => m.channel === channel).sort((a, b) => a.created_at.getTime() - b.created_at.getTime()) };
    }
    if (sql.includes('receiver_id')) {
      const [user1, user2] = params;
      return { 
        rows: mockDb.team_messages.filter(m => 
          (m.sender_id === user1 && m.receiver_id === user2) || 
          (m.sender_id === user2 && m.receiver_id === user1)
        ).sort((a, b) => a.created_at.getTime() - b.created_at.getTime()) 
      };
    }
    return { rows: mockDb.team_messages.sort((a, b) => a.created_at.getTime() - b.created_at.getTime()) };
  }

  if (sql.includes('INSERT INTO encrypted_notes')) {
    const [user_id, content_enc, nonce, public_token] = params;
    const newNote = {
      id: crypto.randomUUID(),
      user_id,
      content_enc,
      nonce,
      public_token,
      created_at: new Date(),
      updated_at: new Date()
    };
    mockDb.notes.push(newNote);
    return { rows: [newNote] };
  }

  if (sql.includes('UPDATE encrypted_notes')) {
    const [content_enc, nonce, id, user_id] = params;
    const note = mockDb.notes.find(n => n.id === id && n.user_id === user_id);
    if (note) {
      note.content_enc = content_enc;
      note.nonce = nonce;
      note.updated_at = new Date();
      return { rows: [note] };
    }
    return { rows: [] };
  }

  if (sql.includes('DELETE FROM encrypted_notes')) {
    const [id, user_id] = params;
    const index = mockDb.notes.findIndex(n => n.id === id && n.user_id === user_id);
    if (index !== -1) {
      const deleted = mockDb.notes.splice(index, 1)[0];
      return { rows: [deleted] };
    }
    return { rows: [] };
  }

  if (sql.includes('SELECT id, content_enc, nonce, public_token')) {
    const [user_id] = params;
    const userNotes = mockDb.notes.filter(n => n.user_id === user_id);
    return { rows: userNotes };
  }

  if (sql.includes('SELECT content_enc, nonce FROM encrypted_notes WHERE public_token')) {
    const [public_token] = params;
    const note = mockDb.notes.find(n => n.public_token === public_token);
    return { rows: note ? [note] : [] };
  }

  // Telegram Mock Intercepts
  if (sql.includes('SELECT data FROM telegram_chats WHERE client_key')) {
    const [client_key] = params;
    const data = mockDb.telegram_chats[client_key];
    return { rows: data ? [{ data }] : [] };
  }

  if (sql.includes('INSERT INTO telegram_chats')) {
    const [client_key, data] = params;
    mockDb.telegram_chats[client_key] = data;
    return { rows: [] };
  }

  if (sql.includes('SELECT data FROM telegram_messages WHERE id')) {
    const [id] = params;
    const data = mockDb.telegram_messages[id];
    return { rows: data ? [{ data }] : [] };
  }

  if (sql.includes('INSERT INTO telegram_messages')) {
    const [id, chat_id, client_key, data] = params;
    mockDb.telegram_messages[id] = data;
    return { rows: [] };
  }

  if (sql.includes('SELECT data_url FROM telegram_media WHERE id')) {
    const [id] = params;
    const data = mockDb.telegram_media[id];
    return { rows: data ? [{ data_url: data }] : [] };
  }

  if (sql.includes('INSERT INTO telegram_media')) {
    const [id, data_url] = params;
    mockDb.telegram_media[id] = data_url;
    return { rows: [] };
  }

  // Analytics Intercepts
  if (sql.includes('INSERT INTO analytics_events')) {
    const [event_type, path, session_id, referrer, device_type, country, domain, payload] = params;
    const newEvent = {
      id: crypto.randomUUID(),
      event_type,
      path,
      session_id,
      referrer,
      device_type,
      country,
      domain,
      payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      created_at: new Date()
    };
    mockDb.analytics_events.push(newEvent);
    return { rows: [newEvent] };
  }

    if (sql.includes('SELECT DISTINCT domain FROM analytics_events WHERE user_id = $1')) {
      const [user_id] = params;
      const domains = Array.from(new Set(mockDb.analytics_events.filter(e => e.user_id === user_id).map(e => e.domain)));
      return { rows: domains.map(d => ({ domain: d })) };
    }

    if (sql.includes('SELECT * FROM analytics_events')) {
      const [user_id] = params;
      const userEvents = mockDb.analytics_events.filter(e => e.user_id === user_id);
      return { rows: [...userEvents].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()) };
    }

  if (sql.includes('DELETE FROM analytics_events')) {
    mockDb.analytics_events = [];
    return { rows: [] };
  }

  if (sql.includes('FROM analytics_events')) {
    return { rows: [...mockDb.analytics_events].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()) };
  }

  if (sql.includes('INSERT INTO analytics_rules') || sql.includes('ON CONFLICT (domain) DO UPDATE')) {
    if (params.length === 2) {
      const [domain, is_offline] = params;
      let rule = mockDb.analytics_rules.find(r => r.domain === domain);
      if (rule) {
        rule.is_offline = !!is_offline;
        rule.updated_at = new Date();
      } else {
        rule = {
          id: crypto.randomUUID(),
          domain,
          allowed_countries: [],
          blocked_countries: [],
          allowed_devices: [],
          blocked_devices: [],
          redirect_url: '',
          block_redirect_url: '',
          enable_cloaking: false,
          enable_vpn_blocking: false,
          telegram_bot_token: '',
          telegram_chat_id: '',
          telegram_alerts_enabled: false,
          is_offline: !!is_offline,
          created_at: new Date(),
          updated_at: new Date()
        };
        mockDb.analytics_rules.push(rule);
      }
      return { rows: [rule] };
    }

    const [domain, allowed_countries, blocked_countries, allowed_devices, blocked_devices, redirect_url, block_redirect_url, enable_cloaking, enable_vpn_blocking, telegram_bot_token, telegram_chat_id, telegram_alerts_enabled, is_offline, telegram_view_threshold, telegram_view_repeat, enable_anomaly_alerts, user_id] = params;
    let rule = mockDb.analytics_rules.find(r => r.domain === domain && r.user_id === user_id);
    const parseJson = (val: any) => {
      if (!val) return [];
      if (typeof val === 'string') return JSON.parse(val);
      return val;
    };
    if (rule) {
      rule.allowed_countries = parseJson(allowed_countries);
      rule.blocked_countries = parseJson(blocked_countries);
      rule.allowed_devices = parseJson(allowed_devices);
      rule.blocked_devices = parseJson(blocked_devices);
      rule.redirect_url = redirect_url;
      rule.block_redirect_url = block_redirect_url;
      rule.enable_cloaking = enable_cloaking;
      rule.enable_vpn_blocking = enable_vpn_blocking;
      rule.telegram_bot_token = telegram_bot_token;
      rule.telegram_chat_id = telegram_chat_id;
      rule.telegram_alerts_enabled = telegram_alerts_enabled;
      rule.is_offline = !!is_offline;
      rule.telegram_view_threshold = telegram_view_threshold ? parseInt(telegram_view_threshold) : 0;
      rule.telegram_view_repeat = !!telegram_view_repeat;
      rule.enable_anomaly_alerts = !!enable_anomaly_alerts;
      rule.updated_at = new Date();
    } else {
      rule = {
        id: crypto.randomUUID(),
        domain,
        allowed_countries: parseJson(allowed_countries),
        blocked_countries: parseJson(blocked_countries),
        allowed_devices: parseJson(allowed_devices),
        blocked_devices: parseJson(blocked_devices),
        redirect_url,
        block_redirect_url,
        enable_cloaking,
        enable_vpn_blocking,
        telegram_bot_token,
        telegram_chat_id,
        telegram_alerts_enabled,
        is_offline: !!is_offline,
        telegram_view_threshold: telegram_view_threshold ? parseInt(telegram_view_threshold) : 0,
        telegram_view_repeat: !!telegram_view_repeat,
        enable_anomaly_alerts: !!enable_anomaly_alerts,
        created_at: new Date(),
        updated_at: new Date(),
        user_id
      };
      mockDb.analytics_rules.push(rule);
    }
    return { rows: [rule] };
  }

  if (sql.includes('FROM analytics_rules WHERE domain =') || sql.includes('FROM analytics_rules WHERE domain=')) {
    const [domain, user_id] = params;
    const rule = mockDb.analytics_rules.find(r => r.domain === domain && r.user_id === user_id);
    return { rows: rule ? [rule] : [] };
  }

  if (sql.includes('INSERT INTO projects')) {
    const [user_id, name, description, status, settings] = params;
    const newProject = {
      id: crypto.randomUUID(),
      user_id,
      name,
      description: description || '',
      status: status || 'Planning',
      settings: typeof settings === 'string' ? JSON.parse(settings) : (settings || {}),
      created_at: new Date(),
      updated_at: new Date()
    };
    mockDb.projects.push(newProject);
    return { rows: [newProject] };
  }

  if (sql.includes('UPDATE projects')) {
    const [name, description, status, settings, id, user_id] = params;
    const project = mockDb.projects.find(p => p.id === id && p.user_id === user_id);
    if (project) {
      project.name = name;
      project.description = description;
      project.status = status;
      project.settings = typeof settings === 'string' ? JSON.parse(settings) : (settings || {});
      project.updated_at = new Date();
      return { rows: [project] };
    }
    return { rows: [] };
  }

  if (sql.includes('DELETE FROM projects')) {
    const [id, user_id] = params;
    const index = mockDb.projects.findIndex(p => p.id === id && p.user_id === user_id);
    if (index !== -1) {
      const deleted = mockDb.projects.splice(index, 1)[0];
      mockDb.project_links = mockDb.project_links.filter(l => l.project_id !== id);
      return { rows: [deleted] };
    }
    return { rows: [] };
  }

    if (sql.includes('SELECT p.*, count(pl.id) as link_count FROM projects p')) {
      const [user_id] = params;
      const userProjects = mockDb.projects.filter(p => p.user_id === user_id);
      return { rows: [...userProjects].sort((a, b) => b.created_at.getTime() - a.created_at.getTime()) };
    }

  if (sql.includes('INSERT INTO project_links')) {
    const [project_id, name, url] = params;
    const newLink = {
      id: crypto.randomUUID(),
      project_id,
      name,
      url,
      created_at: new Date()
    };
    mockDb.project_links.push(newLink);
    return { rows: [newLink] };
  }

  if (sql.includes('SELECT * FROM project_links WHERE project_id = $1')) {
    const [project_id] = params;
    return { rows: mockDb.project_links.filter(l => l.project_id === project_id) };
  }

  if (sql.includes('DELETE FROM project_links')) {
    const [id] = params;
    const index = mockDb.project_links.findIndex(l => l.id === id);
    if (index !== -1) {
      const deleted = mockDb.project_links.splice(index, 1)[0];
      return { rows: [deleted] };
    }
    return { rows: [] };
  }

  if (sql.includes('FROM project_links')) {
    return { rows: [...mockDb.project_links] };
  }

  if (sql.includes('SELECT id, address, domain, token, created_at FROM temp_mail_accounts')) {
    const [user_id] = params;
    return { rows: (mockDb.mail_accounts || []).filter(a => a.user_id === user_id) };
  }

  if (sql.includes('INSERT INTO temp_mail_accounts')) {
    const [user_id, domain, address, password, token] = params;
    const newAccount = {
      id: crypto.randomUUID(),
      user_id,
      domain,
      address,
      password,
      token,
      created_at: new Date()
    };
    if (!mockDb.mail_accounts) mockDb.mail_accounts = [];
    mockDb.mail_accounts.push(newAccount);
    return { rows: [newAccount] };
  }

  if (sql.includes('RESTORE_MOCK_DATA')) {
    const [payloadStr] = params;
    const backup = JSON.parse(payloadStr);
    if (backup.data) {
      if (backup.data.users) mockDb.users = backup.data.users;
      if (backup.data.notes) mockDb.notes = backup.data.notes;
      if (backup.data.messages) mockDb.team_messages = backup.data.messages;
      if (backup.data.projects) mockDb.projects = backup.data.projects;
      if (backup.data.links) mockDb.project_links = backup.data.links;
      if (backup.data.mail) mockDb.mail_accounts = backup.data.mail;
      if (backup.data.analytics) mockDb.analytics_events = backup.data.analytics;
    }
    return { rows: [{ success: true }] };
  }

  return { rows: [] };
}) as any;

export default pool;
