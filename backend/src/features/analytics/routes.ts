import express, { Response } from 'express';
import nacl from 'tweetnacl';
import axios from 'axios';
import pool, { isMockMode } from '../../db.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const router = express.Router();

// Generate server key pair on startup
const serverKeyPair = nacl.box.keyPair();

const botRegex = /bot|googlebot|crawler|spider|robot|crawling|lighthouse|pingdom|uptime|semrush|ahrefs|mj12bot|yandex|baidu|slurp|facebookexternalhit|ia_archiver|selenium|puppeteer|headless/i;

const lastSpikeAlert: Record<string, number> = {};

function isVpnOrProxy(req: express.Request): boolean {
  const headers = req.headers || {};
  if (headers['via'] || headers['forwarded'] || headers['proxy-connection']) {
    return true;
  }
  const xForwardedFor = headers['x-forwarded-for'];
  if (typeof xForwardedFor === 'string' && xForwardedFor.includes(',')) {
    return true;
  }
  return false;
}

// Public endpoint to get server's public key (in hex)
router.get('/public-key', (req, res) => {
  res.json({ publicKey: Buffer.from(serverKeyPair.publicKey).toString('hex') });
});

// Public endpoint to post encrypted event
router.post('/events', async (req, res) => {
  const { ciphertext, ephemPubKey, nonce } = req.body;

  if (!ciphertext || !ephemPubKey || !nonce) {
    return res.status(400).json({ error: 'Missing required encryption fields.' });
  }

  try {
    const decryptedBytes = nacl.box.open(
      Buffer.from(ciphertext, 'hex'),
      Buffer.from(nonce, 'hex'),
      Buffer.from(ephemPubKey, 'hex'),
      serverKeyPair.secretKey
    );

    if (!decryptedBytes) {
      return res.status(400).json({ error: 'Failed to decrypt event payload.' });
    }

    const jsonString = Buffer.from(decryptedBytes).toString('utf8');
    const event = JSON.parse(jsonString);

    const { event_type, path, session_id, referrer, device_type, country, domain, payload } = event;
    const detectedCountry = (req.headers['cf-ipcountry'] as string) || country || 'unknown';

    let block = false;
    let blockReason = '';
    let redirectUrl: string | null = null;
    const clientIp = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').toString().split(',')[0].trim();

    if (domain) {
      try {
        const rulesResult = await pool.query(
          `SELECT * FROM analytics_rules WHERE domain = $1`,
          [domain]
        );

        if (rulesResult.rows.length > 0) {
          const rule = rulesResult.rows[0];
          const userAgent = payload?.user_agent || '';

          // 0. Offline Redirect Check
          if (rule.is_offline) {
            block = true;
            blockReason = 'Domain offline';
            redirectUrl = 'https://google.com';
          }

          // 1. Bot Cloaking
          if (!block && rule.enable_cloaking) {
            if (botRegex.test(userAgent)) {
              block = true;
              blockReason = 'Bot / Crawler detected';
            }
          }

          // 2. VPN/Proxy Block
          if (!block && rule.enable_vpn_blocking) {
            if (isVpnOrProxy(req)) {
              block = true;
              blockReason = 'VPN / Proxy detected';
            }
          }

          // 3. Geo-fencing
          if (!block) {
            const allowedCountries = Array.isArray(rule.allowed_countries)
              ? rule.allowed_countries
              : JSON.parse(rule.allowed_countries || '[]');
            const blockedCountries = Array.isArray(rule.blocked_countries)
              ? rule.blocked_countries
              : JSON.parse(rule.blocked_countries || '[]');

            if (blockedCountries.length > 0 && blockedCountries.includes(detectedCountry)) {
              block = true;
              blockReason = `Blacklisted country (${detectedCountry})`;
            } else if (allowedCountries.length > 0 && !allowedCountries.includes(detectedCountry)) {
              block = true;
              blockReason = `Whitelisted country check failed (${detectedCountry})`;
            }
          }

          // 4. Device filtering
          if (!block) {
            const allowedDevices = Array.isArray(rule.allowed_devices)
              ? rule.allowed_devices
              : JSON.parse(rule.allowed_devices || '[]');
            const blockedDevices = Array.isArray(rule.blocked_devices)
              ? rule.blocked_devices
              : JSON.parse(rule.blocked_devices || '[]');

            const normalizedDevice = (device_type || 'desktop').toLowerCase();

            if (blockedDevices.length > 0 && blockedDevices.includes(normalizedDevice)) {
              block = true;
              blockReason = `Blacklisted device (${normalizedDevice})`;
            } else if (allowedDevices.length > 0 && !allowedDevices.includes(normalizedDevice)) {
              block = true;
              blockReason = `Whitelisted device check failed (${normalizedDevice})`;
            }
          }

          // Decide redirect url based on block outcome
          if (block) {
            redirectUrl = redirectUrl || rule.block_redirect_url || null;
          } else {
            redirectUrl = rule.redirect_url || null;
          }

          // 5. Telegram Notifications
          if (rule.telegram_alerts_enabled && rule.telegram_bot_token && rule.telegram_chat_id) {
            let sendAlert = false;
            let alertText = '';

            if (block) {
              sendAlert = true;
              alertText = `🚫 *Traffic Blocked on ${domain}*\n` +
                          `• *Reason*: ${blockReason}\n` +
                          `• *Path*: \`${path || '/'}\`\n` +
                          `• *Country*: ${detectedCountry}\n` +
                          `• *Device*: ${device_type || 'desktop'}\n` +
                          `• *IP*: \`${clientIp}\`\n` +
                          `• *User-Agent*: \`${userAgent.slice(0, 100)}\``;
            } else {
              // Check if milestone alerts are configured
              const threshold = parseInt(rule.telegram_view_threshold || '0', 10);
              let milestoneHit = false;
              let viewCount = 0;

              if (threshold > 0) {
                if (isMockMode) {
                  const allRes = await pool.query(`SELECT * FROM analytics_events`);
                  viewCount = allRes.rows.filter((e: any) => e.domain === domain && e.event_type === 'pageview').length + 1;
                } else {
                  const countRes = await pool.query(
                    `SELECT COUNT(*) FROM analytics_events WHERE domain = $1 AND event_type = 'pageview'`,
                    [domain]
                  );
                  viewCount = parseInt(countRes.rows[0].count, 10) + 1;
                }

                if (rule.telegram_view_repeat) {
                  milestoneHit = (viewCount % threshold === 0);
                } else {
                  milestoneHit = (viewCount === threshold);
                }
              }

              if (milestoneHit) {
                sendAlert = true;
                alertText = `📈 *Traffic Milestone on ${domain}*\n` +
                            `• *Views*: \`${viewCount}\`\n` +
                            `• *Threshold*: Every \`${threshold}\` views` +
                            (rule.telegram_view_repeat ? ' (Repeating)' : '');
              } else {
                // Check if session already exists to only alert on new visitors
                let sessionExists = false;
                if (isMockMode) {
                  const allEvents = await pool.query(`SELECT * FROM analytics_events`);
                  sessionExists = allEvents.rows.some((e: any) => e.session_id === (session_id || 'anonymous'));
                } else {
                  const sessionCheck = await pool.query(
                    `SELECT id FROM analytics_events WHERE session_id = $1 LIMIT 1`,
                    [session_id || 'anonymous']
                  );
                  sessionExists = sessionCheck.rows.length > 0;
                }
                if (!sessionExists) {
                  sendAlert = true;
                  alertText = `🟢 *New Visitor on ${domain}*\n` +
                              `• *Path*: \`${path || '/'}\`\n` +
                              `• *Country*: ${detectedCountry}\n` +
                              `• *Device*: ${device_type || 'desktop'}\n` +
                              `• *Referrer*: \`${referrer || 'direct'}\`\n` +
                              `• *IP*: \`${clientIp}\``;
                }
              }
            }

            if (sendAlert) {
              const botToken = rule.telegram_bot_token;
              const chatId = rule.telegram_chat_id;
              axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                chat_id: chatId,
                text: alertText,
                parse_mode: 'Markdown'
              }).catch((tErr) => {
                console.error('[TELEGRAM ALERT ERROR]:', tErr.message);
              });
            }
          }

          // 6. Anomaly/Spike Alert Detection
          if (rule.enable_anomaly_alerts && rule.telegram_bot_token && rule.telegram_chat_id && !block && (event_type || 'pageview') === 'pageview') {
            const now = Date.now();
            const cooldownMs = 15 * 60 * 1000;
            const lastAlertTime = lastSpikeAlert[domain] || 0;
            if (now - lastAlertTime > cooldownMs) {
              let views_5m = 0;
              let views_24h = 0;
              if (isMockMode) {
                const allRes = await pool.query(`SELECT * FROM analytics_events`);
                const domainEvents = allRes.rows.filter((e: any) => e.domain === domain && e.event_type === 'pageview');
                views_5m = domainEvents.filter((e: any) => (now - new Date(e.created_at).getTime()) <= 5 * 60 * 1000).length + 1;
                views_24h = domainEvents.filter((e: any) => (now - new Date(e.created_at).getTime()) <= 24 * 60 * 60 * 1000).length + 1;
              } else {
                const views5mRes = await pool.query(
                  `SELECT COUNT(*) FROM analytics_events
                   WHERE domain = $1 AND event_type = 'pageview' AND created_at >= NOW() - INTERVAL '5 minutes'`,
                  [domain]
                );
                views_5m = parseInt(views5mRes.rows[0].count, 10) + 1;

                const views24hRes = await pool.query(
                  `SELECT COUNT(*) FROM analytics_events
                   WHERE domain = $1 AND event_type = 'pageview' AND created_at >= NOW() - INTERVAL '24 hours'`,
                  [domain]
                );
                views_24h = parseInt(views24hRes.rows[0].count, 10) + 1;
              }

              if (views_5m >= 5) {
                const avgRate5m = views_24h / 288;
                if (views_5m > 3 * avgRate5m) {
                  lastSpikeAlert[domain] = now;
                  const alertText = `🚨 *Traffic Spike Detected on ${domain}*\n` +
                                     `• *Views (last 5m)*: \`${views_5m}\`\n` +
                                     `• *24h Avg Rate (5m)*: \`${avgRate5m.toFixed(2)}\`\n` +
                                     `• *Trigger*: Exceeded 3x average baseline (minimum 5 views)`;

                  axios.post(`https://api.telegram.org/bot${rule.telegram_bot_token}/sendMessage`, {
                    chat_id: rule.telegram_chat_id,
                    text: alertText,
                    parse_mode: 'Markdown'
                  }).catch((tErr) => {
                    console.error('[TELEGRAM ANOMALY ALERT ERROR]:', tErr.message);
                  });
                }
              }
            }
          }
        }
      } catch (err: any) {
        console.error('Error checking analytics rules:', err.message);
      }
    }

    const eventPayload = payload ? { ...payload } : {};
    if (block) {
      eventPayload.blocked = true;
      eventPayload.block_reason = blockReason;
    }

    await pool.query(
      `INSERT INTO analytics_events (event_type, path, session_id, referrer, device_type, country, domain, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        block ? 'blocked_pageview' : (event_type || 'pageview'),
        path || '/',
        session_id || 'anonymous',
        referrer || 'direct',
        device_type || 'desktop',
        detectedCountry,
        domain || 'unknown',
        JSON.stringify(eventPayload)
      ]
    );

    res.json({ ok: true, block, redirectUrl });
  } catch (err: any) {
    console.error('Analytics event processing error:', err.message);
    res.status(500).json({ error: 'Failed to process analytics event.' });
  }
});

// Protected endpoint to retrieve analytics stats for dashboard
router.get('/stats', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, event_type, path, session_id, referrer, device_type, country, payload, created_at
       FROM analytics_events
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics statistics.' });
  }
});

// Protected endpoint to clear/reset all analytics data
router.delete('/reset', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await pool.query('DELETE FROM analytics_events');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset analytics logs.' });
  }
});

// Protected endpoint to retrieve all configured domains from rules
router.get('/domains', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await pool.query(`SELECT domain FROM analytics_rules`);
    res.json(result.rows.map(row => row.domain));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch configured domains.' });
  }
});

// Protected endpoint to retrieve traffic rules for a specific domain
router.get('/rules', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { domain } = req.query;
  if (!domain) {
    return res.status(400).json({ error: 'Domain query parameter is required.' });
  }

  try {
    const result = await pool.query(
      `SELECT * FROM analytics_rules WHERE domain = $1`,
      [domain]
    );

    if (result.rows.length === 0) {
      return res.json({
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
        is_offline: false,
        telegram_view_threshold: 0,
        telegram_view_repeat: false,
        enable_anomaly_alerts: false
      });
    }

    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch analytics rules.' });
  }
});

// Protected endpoint to toggle domain online/offline status
router.post('/rules/toggle-status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { domain, is_offline } = req.body;
  if (!domain) {
    return res.status(400).json({ error: 'Domain is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO analytics_rules (
        domain,
        is_offline,
        updated_at
      )
      VALUES ($1, $2, NOW())
      ON CONFLICT (domain)
      DO UPDATE SET
        is_offline = EXCLUDED.is_offline,
        updated_at = NOW()
      RETURNING *`,
      [domain, !!is_offline]
    );

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Failed to toggle status:', err.message);
    res.status(500).json({ error: 'Failed to toggle status.' });
  }
});

// Protected endpoint to upsert traffic rules for a domain
router.post('/rules', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const {
    domain,
    allowed_countries,
    blocked_countries,
    allowed_devices,
    blocked_devices,
    redirect_url,
    block_redirect_url,
    enable_cloaking,
    enable_vpn_blocking,
    telegram_bot_token,
    telegram_chat_id,
    telegram_alerts_enabled,
    is_offline,
    telegram_view_threshold,
    telegram_view_repeat,
    enable_anomaly_alerts
  } = req.body;

  if (!domain) {
    return res.status(400).json({ error: 'Domain is required.' });
  }

  try {
    const query = `
      INSERT INTO analytics_rules (
        domain,
        allowed_countries,
        blocked_countries,
        allowed_devices,
        blocked_devices,
        redirect_url,
        block_redirect_url,
        enable_cloaking,
        enable_vpn_blocking,
        telegram_bot_token,
        telegram_chat_id,
        telegram_alerts_enabled,
        is_offline,
        telegram_view_threshold,
        telegram_view_repeat,
        enable_anomaly_alerts,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (domain)
      DO UPDATE SET
        allowed_countries = EXCLUDED.allowed_countries,
        blocked_countries = EXCLUDED.blocked_countries,
        allowed_devices = EXCLUDED.allowed_devices,
        blocked_devices = EXCLUDED.blocked_devices,
        redirect_url = EXCLUDED.redirect_url,
        block_redirect_url = EXCLUDED.block_redirect_url,
        enable_cloaking = EXCLUDED.enable_cloaking,
        enable_vpn_blocking = EXCLUDED.enable_vpn_blocking,
        telegram_bot_token = EXCLUDED.telegram_bot_token,
        telegram_chat_id = EXCLUDED.telegram_chat_id,
        telegram_alerts_enabled = EXCLUDED.telegram_alerts_enabled,
        is_offline = COALESCE(EXCLUDED.is_offline, analytics_rules.is_offline),
        telegram_view_threshold = EXCLUDED.telegram_view_threshold,
        telegram_view_repeat = EXCLUDED.telegram_view_repeat,
        enable_anomaly_alerts = EXCLUDED.enable_anomaly_alerts,
        updated_at = NOW()
      RETURNING *
    `;

    const result = await pool.query(query, [
      domain,
      JSON.stringify(allowed_countries || []),
      JSON.stringify(blocked_countries || []),
      JSON.stringify(allowed_devices || []),
      JSON.stringify(blocked_devices || []),
      redirect_url || '',
      block_redirect_url || '',
      !!enable_cloaking,
      !!enable_vpn_blocking,
      telegram_bot_token || '',
      telegram_chat_id || '',
      !!telegram_alerts_enabled,
      is_offline === undefined ? false : !!is_offline,
      parseInt(telegram_view_threshold || '0', 10),
      !!telegram_view_repeat,
      !!enable_anomaly_alerts
    ]);

    res.json(result.rows[0]);
  } catch (err: any) {
    console.error('Failed to save rules:', err.message);
    res.status(500).json({ error: 'Failed to save analytics rules.' });
  }
});

export default router;
