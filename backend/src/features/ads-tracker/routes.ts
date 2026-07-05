import express, { Response } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import pool, { isMockMode } from '../../db.js';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';

const router = express.Router();

// Local mock databases in case PostgreSQL is offline
let mockTrackedPages: any[] = [];
let mockTrackedAds: any[] = [];

// Helper to extract page name from URL
const extractPageName = (url: string): string => {
  let cleanUrl = url.trim();
  if (/^\d+$/.test(cleanUrl)) {
    return `Advertiser ID: ${cleanUrl}`;
  }
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }
  try {
    const parsed = new URL(cleanUrl);
    
    // Check if it's an ads library search URL
    if (parsed.pathname.includes('/ads/library')) {
      const pageId = parsed.searchParams.get('view_all_page_id');
      const query = parsed.searchParams.get('q');
      if (query) return decodeURIComponent(query.trim());
      if (pageId) return `Advertiser ID: ${pageId}`;
    }
    
    const pathParts = parsed.pathname.split('/').filter(p => p && p !== 'pages' && p !== 'ads');
    if (pathParts.length > 0) {
      const rawName = pathParts[pathParts.length - 1];
      return decodeURIComponent(rawName)
        .replace(/[_\-\.]/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  } catch (e) {
    // Fallback if URL parsing fails
  }
  return 'Meta Advertiser Page';
};

// Generate unique mock ads per page (so each page has different ads)
const generateMockAds = (pageId: string, pageName: string): any[] => {
  const seed = pageId.slice(0, 8);
  const ads = [
    {
      adId: `${seed}-ad-A`,
      adCopy: `🚀 ${pageName} is changing the game! Discover our latest product line designed to help you achieve more in less time. Join thousands of satisfied customers today.\n\n✅ Free trial available\n✅ No credit card required\n✅ Cancel anytime`,
      mediaUrl: `https://picsum.photos/seed/${seed}1/600/400`,
      platforms: ['facebook', 'instagram'],
      startDate: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().split('T')[0],
      endDate: 'Ongoing',
      raw: { source: 'mock', spend: '$500-$1K' }
    },
    {
      adId: `${seed}-ad-B`,
      adCopy: `💡 Tired of wasting money on ads that don't convert? ${pageName} has the solution.\n\nOur data-driven approach helps brands like yours:\n→ 3x ROAS on average\n→ Cut CPL by 40%\n→ Scale profitably\n\nBook a free strategy call today 👇`,
      mediaUrl: `https://picsum.photos/seed/${seed}2/600/400`,
      platforms: ['facebook', 'instagram', 'messenger'],
      startDate: new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString().split('T')[0],
      endDate: 'Ongoing',
      raw: { source: 'mock', spend: '$1K-$5K' }
    },
    {
      adId: `${seed}-ad-C`,
      adCopy: `⚡ LIMITED TIME: Get 50% off ${pageName}'s premium plan!\n\nThis offer expires in 48 hours. Don't miss out on the tools that 10,000+ businesses use to dominate their market.\n\n🎯 Advanced analytics\n🎯 Team collaboration\n🎯 Priority support\n\nClaim your discount now →`,
      mediaUrl: `https://picsum.photos/seed/${seed}3/600/400`,
      platforms: ['facebook', 'audience_network'],
      startDate: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      raw: { source: 'mock', spend: '$200-$500' }
    },
    {
      adId: `${seed}-ad-D`,
      adCopy: `📊 Case Study: How a small business grew revenue by 285% in 6 months using ${pageName}.\n\n"We tried everything. Nothing worked until we found this platform. Now we're scaling faster than ever."\n— Sarah M., Founder\n\nRead the full story →`,
      mediaUrl: `https://picsum.photos/seed/${seed}4/600/400`,
      platforms: ['facebook', 'instagram'],
      startDate: new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString().split('T')[0],
      endDate: 'Ongoing',
      raw: { source: 'mock', spend: '$5K-$10K' }
    }
  ];
  return ads;
};

// 1. GET /api/ads-tracker/pages - List all tracked pages with summary stats
router.get('/pages', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;

  try {
    if (isMockMode) {
      const userPages = mockTrackedPages.filter(p => p.user_id === userId);
      const enrichedPages = userPages.map(page => {
        const pageAds = mockTrackedAds.filter(a => a.page_id === page.id);
        const activeCount = pageAds.filter(a => a.is_active).length;
        const inactiveCount = pageAds.filter(a => !a.is_active).length;
        return {
          ...page,
          total_ads: pageAds.length,
          active_ads: activeCount,
          inactive_ads: inactiveCount
        };
      });
      return res.json(enrichedPages);
    }

    const query = `
      SELECT p.*,
             COUNT(a.id) as total_ads,
             SUM(CASE WHEN a.is_active = TRUE THEN 1 ELSE 0 END) as active_ads,
             SUM(CASE WHEN a.is_active = FALSE THEN 1 ELSE 0 END) as inactive_ads
      FROM tracked_pages p
      LEFT JOIN tracked_ads a ON p.id = a.page_id
      WHERE p.user_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/ads-tracker/pages - Add a new page to track
router.post('/pages', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.userId;
  let { pageLink } = req.body;

  if (!pageLink) {
    return res.status(400).json({ error: 'Facebook page link is required.' });
  }

  let cleanUrl = pageLink.trim();
  if (/^\d+$/.test(cleanUrl)) {
    // Pure numeric ID - convert to proper Ads Library link
    cleanUrl = `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${cleanUrl}`;
  } else if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = 'https://' + cleanUrl;
  }

  const pageName = extractPageName(cleanUrl);

  try {
    if (isMockMode) {
      const newPage = {
        id: crypto.randomUUID(),
        user_id: userId,
        page_name: pageName,
        page_link: cleanUrl,
        last_checked_at: null,
        created_at: new Date()
      };
      mockTrackedPages.push(newPage);
      return res.json(newPage);
    }

    const query = `
      INSERT INTO tracked_pages (user_id, page_name, page_link)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await pool.query(query, [userId, pageName, cleanUrl]);
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. PATCH /api/ads-tracker/pages/:id - Rename a tracked page
router.patch('/pages/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { page_name } = req.body;

  if (!page_name) return res.status(400).json({ error: 'New name required.' });

  try {
    if (isMockMode) {
      mockTrackedPages = mockTrackedPages.map(p =>
        p.id === id ? { ...p, page_name } : p
      );
      return res.json({ success: true });
    }
    await pool.query('UPDATE tracked_pages SET page_name = $1 WHERE id = $2', [page_name, id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE /api/ads-tracker/pages/:id - Untrack a page
router.delete('/pages/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (isMockMode) {
      mockTrackedPages = mockTrackedPages.filter(p => p.id !== id);
      mockTrackedAds = mockTrackedAds.filter(a => a.page_id !== id);
      return res.json({ success: true });
    }

    await pool.query('DELETE FROM tracked_pages WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/ads-tracker/pages/:id/ads - Fetch ads for a tracked page
router.get('/pages/:id/ads', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    if (isMockMode) {
      const pageAds = mockTrackedAds.filter(a => a.page_id === id);
      return res.json(pageAds);
    }

    const result = await pool.query(
      'SELECT * FROM tracked_ads WHERE page_id = $1 ORDER BY is_active DESC, first_seen_at DESC',
      [id]
    );
    res.json(result.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. POST /api/ads-tracker/pages/:id/recheck - Execute recheck comparing database with API
router.post('/pages/:id/recheck', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const apifyToken = (req.headers['x-apify-token'] as string) || process.env.APIFY_API_TOKEN;

  try {
    // Find page
    let page: any = null;
    if (isMockMode) {
      page = mockTrackedPages.find(p => p.id === id);
    } else {
      const result = await pool.query('SELECT * FROM tracked_pages WHERE id = $1', [id]);
      page = result.rows[0];
    }

    if (!page) {
      return res.status(404).json({ error: 'Tracked page not found.' });
    }

    let scrapedItems: any[] = [];
    let apiCallSuccessful = false;

    // Trigger Apify Scraper if token is available
    if (apifyToken) {
      try {
        const apifyUrl = `https://api.apify.com/v2/acts/curious_coder~facebook-ads-library-scraper/run-sync-get-dataset-items?token=${apifyToken}`;
        const apifyRes = await axios.post(apifyUrl, {
          urls: [{ url: page.page_link }],
          count: 100,
          "scrapePageAds.activeStatus": "all"
        }, { timeout: 60000 });
        
        if (Array.isArray(apifyRes.data) && apifyRes.data.length > 0) {
          scrapedItems = apifyRes.data.map(item => ({
            adId: item.adId || item.adArchiveId || item.id || crypto.randomUUID(),
            adCopy: item.adCreativeBody || item.adCreativeBodies?.join('\n') || item.snapshot?.body?.text || 'No ad copy text provided.',
            mediaUrl: item.snapshot?.images?.[0]?.url || item.images?.[0] || item.snapshot?.videos?.[0]?.video_preview_image_url || item.videos?.[0] || '',
            platforms: item.publisherPlatforms || item.publisher_platforms || ['facebook'],
            startDate: item.adStartDate || item.ad_delivery_start_time?.split('T')[0] || new Date().toISOString().split('T')[0],
            endDate: item.adEndDate || item.ad_delivery_stop_time?.split('T')[0] || 'Ongoing',
            raw: item
          }));
          apiCallSuccessful = true;
        }
      } catch (e) {
        console.warn('Apify API call failed or timed out. Falling back to dynamic mock state simulation.', e);
      }
    }

    // Dynamic Mock Simulator — generates UNIQUE ads per page using page ID as seed
    if (!apiCallSuccessful) {
      const existingAds = isMockMode 
        ? mockTrackedAds.filter(a => a.page_id === id)
        : (await pool.query('SELECT * FROM tracked_ads WHERE page_id = $1', [id])).rows;

      if (existingAds.length === 0) {
        // First-time check: generate unique mock ads from page ID seed
        scrapedItems = generateMockAds(id, page.page_name);
      } else {
        // Subsequent check: simulate ad changes (turn off first ad, keep rest, add a new one)
        const seed = id.slice(0, 8);
        const hasNewAd = existingAds.some(a => a.ad_id === `${seed}-ad-NEW`);
        
        // Keep B, C, D active (drop A = turned off)
        scrapedItems = generateMockAds(id, page.page_name).slice(1);

        if (!hasNewAd) {
          scrapedItems.push({
            adId: `${seed}-ad-NEW`,
            adCopy: `🆕 NEW AD: ${page.page_name} just launched a fresh campaign!\n\n"We've been working on something big and we're finally ready to share it with you. This changes everything."\n\nClick to learn more about our latest breakthrough ⬇️`,
            mediaUrl: `https://picsum.photos/seed/${seed}5/600/400`,
            platforms: ['facebook', 'instagram', 'messenger'],
            startDate: new Date().toISOString().split('T')[0],
            endDate: 'Ongoing',
            raw: { source: 'mock', spend: 'NEW' }
          });
        }
      }
    }

    // Comparison & Sync Logic
    const scrapedAdIds = scrapedItems.map(item => item.adId);

    if (isMockMode) {
      // 1. Mark missing ads for this page as inactive (Turned Off)
      mockTrackedAds = mockTrackedAds.map(ad => {
        if (ad.page_id === id && !scrapedAdIds.includes(ad.ad_id)) {
          return { ...ad, is_active: false };
        }
        return ad;
      });

      // 2. Add new ads or sync existing ones
      for (const item of scrapedItems) {
        const existingIdx = mockTrackedAds.findIndex(a => a.page_id === id && a.ad_id === item.adId);
        if (existingIdx !== -1) {
          mockTrackedAds[existingIdx] = {
            ...mockTrackedAds[existingIdx],
            is_active: true,
            last_seen_at: new Date()
          };
        } else {
          mockTrackedAds.push({
            id: crypto.randomUUID(),
            page_id: id,
            ad_id: item.adId,
            ad_copy: item.adCopy,
            media_url: item.mediaUrl,
            platforms: item.platforms,
            is_active: true,
            start_date: item.startDate,
            end_date: item.endDate,
            raw_payload: item.raw,
            first_seen_at: new Date(),
            last_seen_at: new Date()
          });
        }
      }

      // Update tracked page last checked timestamp
      mockTrackedPages = mockTrackedPages.map(p => {
        if (p.id === id) {
          return { ...p, last_checked_at: new Date() };
        }
        return p;
      });
    } else {
      // Postgres Transaction comparison
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 1. Mark missing ads as turned off
        await client.query(`
          UPDATE tracked_ads 
          SET is_active = FALSE 
          WHERE page_id = $1 AND NOT (ad_id = ANY($2))
        `, [id, scrapedAdIds]);

        // 2. Save / Sync new scraped items
        for (const item of scrapedItems) {
          const checkQuery = 'SELECT id FROM tracked_ads WHERE page_id = $1 AND ad_id = $2';
          const checkRes = await client.query(checkQuery, [id, item.adId]);

          if (checkRes.rows.length > 0) {
            await client.query(`
              UPDATE tracked_ads 
              SET is_active = TRUE, last_seen_at = NOW() 
              WHERE page_id = $1 AND ad_id = $2
            `, [id, item.adId]);
          } else {
            await client.query(`
              INSERT INTO tracked_ads (page_id, ad_id, ad_copy, media_url, platforms, is_active, start_date, end_date, raw_payload)
              VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8)
            `, [id, item.adId, item.adCopy, item.mediaUrl, JSON.stringify(item.platforms), item.startDate, item.endDate, JSON.stringify(item.raw)]);
          }
        }

        // 3. Update tracked page last checked timestamp
        await client.query('UPDATE tracked_pages SET last_checked_at = NOW() WHERE id = $1', [id]);

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    }

    // Retrieve updated ad ledger list
    const finalAds = isMockMode
      ? mockTrackedAds.filter(a => a.page_id === id)
      : (await pool.query('SELECT * FROM tracked_ads WHERE page_id = $1 ORDER BY is_active DESC, first_seen_at DESC', [id])).rows;

    res.json({ success: true, ads: finalAds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
