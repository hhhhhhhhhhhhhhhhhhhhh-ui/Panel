import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { Server } from 'socket.io';

const router = express.Router();
const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY || 'dummy_key' });

// Path to the downloaded binary
const BINARY_PATH = path.resolve(process.cwd(), 'bin', 'meta-ads-mcp-server.exe');

// .env file path (backend root or parent)
const ENV_PATHS = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
];
const ENV_FILE = ENV_PATHS.find(p => fs.existsSync(p)) || ENV_PATHS[0];

// ─── Config helpers ───────────────────────────────────────────────────────────
function readEnvFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(ENV_FILE, 'utf8');
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) result[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return result;
  } catch { return {}; }
}

function writeEnvKey(key: string, value: string) {
  let content = '';
  try { content = fs.readFileSync(ENV_FILE, 'utf8'); } catch {}

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_FILE, content, 'utf8');
  // Hot-update process.env so changes take effect immediately without restart
  process.env[key] = value;
}

// ─── GET /api/fb-mcp/config ───────────────────────────────────────────────────
router.get('/config', authMiddleware, (_req: AuthenticatedRequest, res: Response) => {
  const token = process.env.META_ADS_ACCESS_TOKEN || '';
  const accountId = process.env.META_AD_ACCOUNT_ID || '';
  const appSecret = process.env.META_APP_SECRET || '';
  const businessId = process.env.META_BUSINESS_ID || '';
  const plausibleUrl = process.env.PLAUSIBLE_DASHBOARD_URL || '';
  const tokenLen = token.length;
  const maskedToken = tokenLen > 10
    ? `${token.slice(0, 6)}${'•'.repeat(Math.min(tokenLen - 10, 30))}${token.slice(-4)}`
    : tokenLen > 0 ? '••••••••' : '';

  res.json({
    accessToken: maskedToken,
    accessTokenSet: !!token,
    adAccountId: accountId,
    appSecretSet: !!appSecret,
    businessId,
    plausibleDashboardUrl: plausibleUrl,
    binaryExists: fs.existsSync(BINARY_PATH),
  });
});

// ─── POST /api/fb-mcp/config ──────────────────────────────────────────────────
router.post('/config', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { accessToken, adAccountId, appSecret, businessId, plausibleDashboardUrl } = req.body;
  try {
    if (accessToken  !== undefined && accessToken  !== '') writeEnvKey('META_ADS_ACCESS_TOKEN', accessToken);
    if (adAccountId  !== undefined && adAccountId  !== '') writeEnvKey('META_AD_ACCOUNT_ID',    adAccountId);
    if (appSecret    !== undefined && appSecret    !== '') writeEnvKey('META_APP_SECRET',        appSecret);
    if (businessId   !== undefined && businessId   !== '') writeEnvKey('META_BUSINESS_ID',       businessId);
    if (plausibleDashboardUrl !== undefined) writeEnvKey('PLAUSIBLE_DASHBOARD_URL', plausibleDashboardUrl);
    res.json({ ok: true, message: 'Credentials saved and applied immediately.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/fb-mcp/config ────────────────────────────────────────────────
router.delete('/config', authMiddleware, (req: AuthenticatedRequest, res: Response) => {
  const { key } = req.body; // e.g. 'META_ADS_ACCESS_TOKEN'
  if (!key) return res.status(400).json({ error: 'key required' }) as any;
  try {
    let content = '';
    try { content = fs.readFileSync(ENV_FILE, 'utf8'); } catch {}
    content = content.replace(new RegExp(`^${key}=.*\\n?`, 'm'), '');
    fs.writeFileSync(ENV_FILE, content, 'utf8');
    delete process.env[key];
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// ─── MCP stdio bridge ────────────────────────────────────────────────────────
// Sends one JSON-RPC request to the binary via stdio and resolves with the result.
function callMcpTool(toolName: string, toolArgs: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      META_ADS_ACCESS_TOKEN: process.env.META_ADS_ACCESS_TOKEN || '',
      META_AD_ACCOUNT_ID:    process.env.META_AD_ACCOUNT_ID    || '',
      META_APP_SECRET:       process.env.META_APP_SECRET        || '',
    };

    const proc = spawn(BINARY_PATH, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    proc.on('close', () => {
      // Parse all JSON-RPC lines; grab the result matching our request id
      const lines = stdout.split('\n').filter(l => l.trim().startsWith('{'));
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.id === 1 && msg.result !== undefined) {
            resolve(msg.result);
            return;
          }
          if (msg.id === 1 && msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
            return;
          }
        } catch {}
      }
      if (stderr) reject(new Error(`MCP binary error: ${stderr.slice(0, 500)}`));
      else reject(new Error('No valid JSON-RPC response from MCP binary'));
    });

    proc.on('error', (err) => reject(new Error(`Failed to start MCP binary: ${err.message}`)));

    // Send: initialize then tools/call
    const init = JSON.stringify({
      jsonrpc: '2.0', id: 0, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'admin-panel', version: '1.0' } }
    });
    const call = JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: toolName, arguments: toolArgs }
    });

    proc.stdin.write(init + '\n');
    proc.stdin.write(call + '\n');
    proc.stdin.end();
  });
}

// ─── GET /api/fb-mcp/tools — list all 206 tools from binary ─────────────────
router.get('/tools', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tools = await new Promise<any[]>((resolve, reject) => {
      const env = {
        ...process.env,
        META_ADS_ACCESS_TOKEN: process.env.META_ADS_ACCESS_TOKEN || '',
        META_AD_ACCOUNT_ID:    process.env.META_AD_ACCOUNT_ID    || '',
      };
      const proc = spawn(BINARY_PATH, [], { env, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      proc.on('close', () => {
        const lines = stdout.split('\n').filter(l => l.trim().startsWith('{'));
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id === 1 && msg.result?.tools) { resolve(msg.result.tools); return; }
          } catch {}
        }
        reject(new Error('Could not retrieve tools list'));
      });
      proc.on('error', (e) => reject(e));
      const init = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'admin-panel', version: '1.0' } } });
      const list = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
      proc.stdin.write(init + '\n');
      proc.stdin.write(list + '\n');
      proc.stdin.end();
    });
    res.json({ tools });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/fb-mcp/call — universal tool executor ────────────────────────
router.post('/call', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { tool, args = {} } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool name required' }) as any;
  try {
    const result = await callMcpTool(tool, args);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/fb-mcp/ai-agent — Claude + MCP agentic loop ──────────────────
router.post('/ai-agent', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { prompt, strategy } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt required' }) as any;

  try {
    // Fetch real tool list from binary to give Claude all 206 tools
    const toolsRes = await fetch(`http://localhost:${process.env.PORT || 3001}/api/fb-mcp/tools`,
      { headers: { Authorization: req.headers.authorization || '' } }
    );
    const { tools: rawTools } = await toolsRes.json() as any;

    // Convert MCP tool schema → Anthropic tool schema
    const claudeTools = (rawTools || []).slice(0, 60).map((t: any) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema || { type: 'object', properties: {} }
    }));

    let message: any = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: `You are a Meta Ads optimization agent with access to the real Meta Marketing API via 206 tools.
Strategy context: ${strategy || 'Maximize ROAS, minimize CPA'}
Account ID: ${process.env.META_AD_ACCOUNT_ID || 'not configured'}
Only call tools you need. Be concise in your reasoning.`,
      messages: [{ role: 'user', content: prompt }],
      tools: claudeTools
    } as any);

    // Agentic tool-use loop
    while (message.stop_reason === 'tool_use') {
      const toolCalls = message.content.filter((c: any) => c.type === 'tool_use');
      const toolResults: any[] = [];

      for (const call of toolCalls) {
        let content: string;
        try {
          const result = await callMcpTool(call.name, call.input);
          content = JSON.stringify(result);
        } catch (e: any) {
          content = JSON.stringify({ error: e.message });
        }
        toolResults.push({ type: 'tool_result', tool_use_id: call.id, content });
      }

      message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: `You are a Meta Ads optimization agent. Strategy: ${strategy || 'Maximize ROAS'}`,
        messages: [
          { role: 'user', content: prompt },
          { role: 'assistant', content: message.content },
          { role: 'user', content: toolResults }
        ],
        tools: claudeTools
      } as any);
    }

    const textBlock = message.content.find((c: any) => c.type === 'text');
    res.json({ result: textBlock?.text || JSON.stringify(message.content) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Legacy endpoints (kept for backward compat) ─────────────────────────────
router.post('/auto-scale', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { campaignId, activeStrategy } = req.body;
  try {
    const result = await callMcpTool('get_campaigns', { limit: 10 });
    res.json({ outcome: { type: 'text', text: `Fetched campaigns: ${JSON.stringify(result)}` } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/ai-create', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { description } = req.body;
  try {
    if (process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY !== 'dummy_key') {
      const message = await anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1000,
        system: "You are an expert copywriter. Generate 2 short ad variations based on the description.",
        messages: [{ role: 'user', content: description }]
      });
      const textBlock = message.content.find((c: any) => c.type === 'text');
      return res.json({ aiCopy: { type: 'text', text: textBlock?.text || 'Variations generated.' } });
    } else {
      // Dummy response if no API key
      const dummyCopy = `### AI Generated Conversion Variations\n\n**Variation 1: Pain Point Target**\n*   **Headline:** Stop Losing Ad Accounts\n*   **Body:** Every image you upload contains tracking signatures. Purge them automatically while boosting visual output by 35%.\n*   **CTA:** Secure My Assets\n\n**Variation 2: Feature-Driven**\n*   **Headline:** Pro-Grade Media Editor\n*   **Body:** Instantly reformat banners for Instagram, TikTok, or YouTube.\n*   **CTA:** Optimize Now`;
      return res.json({ aiCopy: { type: 'text', text: dummyCopy } });
    }
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/optimize-targets', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await callMcpTool('get_insights', { level: 'campaign', fields: ['campaign_name','spend','ctr','cpc','cpm','impressions','clicks','actions'], date_preset: 'last_7d' });
    res.json({ log: { type: 'text', text: JSON.stringify(result, null, 2) } });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

router.post('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { adId, status } = req.body;
  try {
    const result = await callMcpTool('update_campaign', { campaign_id: adId, status });
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;

// ─── Socket.io real-time stream (polls real data) ────────────────────────────
export function registerFbRealtimeStream(io: Server) {
  io.of('/fb-realtime').on('connection', (socket) => {
    console.log('[FB] Real-time socket connected');
    let timer: NodeJS.Timeout;

    const streamMetrics = async () => {
      try {
        const data = await callMcpTool('get_campaigns', { fields: ['id','name','daily_budget','status','insights{spend,ctr,cpc,actions}'], limit: 10 });
        socket.emit('metrics_update', { campaigns: data?.data || [], history: [] });
      } catch {
        // If token not configured, emit empty
        socket.emit('metrics_update', { campaigns: [], history: [], error: 'Configure META_ADS_ACCESS_TOKEN in backend .env' });
      }
    };

    timer = setInterval(streamMetrics, 10000);
    streamMetrics();
    socket.on('disconnect', () => { clearInterval(timer); });
  });
}
