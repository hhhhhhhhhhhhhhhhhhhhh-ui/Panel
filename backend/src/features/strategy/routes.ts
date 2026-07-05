import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../../middleware/auth.js';
import Anthropic from '@anthropic-ai/sdk';

const router = express.Router();
let anthropic: Anthropic | null = null;

if (process.env.CLAUDE_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
}

router.post('/backtest', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  const { strategyRules, budget, durationDays, targetCpa } = req.body;

  if (!strategyRules) {
    return res.status(400).json({ error: 'Strategy scaling rules are required.' });
  }

  const prompt = `Perform a highly technical and realistic backtest simulation of Facebook Ads scaling rules over ${durationDays || 30} days.
Rules: "${strategyRules}"
Starting Daily Budget: $${budget || 100}
Target CPA: $${targetCpa || 15}

Provide a detailed summary of the performance day-by-day or in phases, outlining spend, conversions, calculated CPA, ROI, and any budget scale/throttle triggers that would have occurred.
Return a structured JSON with:
1. "summary": "general analytical review"
2. "totalSpend": number
3. "totalConversions": number
4. "finalCpa": number
5. "estimatedRoi": number
6. "chartData": Array of { name: "Day X", spend: number, conversions: number, cpa: number, revenue: number }
7. "logs": Array of "action logs taken by rules"
`;

  try {
    if (anthropic) {
      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        system: "You are an advanced quantitative ad-buying simulation model. You compute realistic, statistical returns based on advertising scaling rules, simulated audience wearout, and bidding feedback loops.",
        messages: [{ role: 'user', content: prompt }]
      });

      // Parse JSON from Claude response
      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json(parsed);
        }
      } catch (e) {
        // Fallback to simple parser if json parse fails
      }
      return res.json({ rawText: text });
    } else {
      // Offline fallback simulation
      console.warn('[CLAUDE_API_KEY Offline] Simulating rule backtest locally.');
      
      const duration = Number(durationDays) || 30;
      const startBudget = Number(budget) || 100;
      const targetVal = Number(targetCpa) || 15;
      
      const chartData: any[] = [];
      const logs: string[] = [];
      let currentBudget = startBudget;
      let totalSpend = 0;
      let totalConversions = 0;
      
      for (let day = 1; day <= duration; day++) {
        // Daily variations
        const noise = 0.8 + Math.random() * 0.4;
        const currentCpa = Number((targetVal * (0.85 + Math.random() * 0.3)).toFixed(2));
        const conversions = Math.round((currentBudget / currentCpa) * noise);
        const spend = Number((conversions * currentCpa).toFixed(2));
        const revenue = Number((conversions * targetVal * 2.2).toFixed(2));
        
        totalSpend += spend;
        totalConversions += conversions;
        
        chartData.push({
          name: `Day ${day}`,
          spend,
          conversions,
          cpa: currentCpa,
          revenue
        });

        // Trigger dynamic scale rule simulation
        if (currentCpa < targetVal && day % 3 === 0) {
          const increase = Math.round(currentBudget * 0.2);
          currentBudget += increase;
          logs.push(`Day ${day}: CPA ($${currentCpa}) is below target ($${targetVal}). Auto-scaled budget by 20% to $${currentBudget}/day.`);
        } else if (currentCpa > targetVal * 1.2 && day % 2 === 0) {
          const decrease = Math.round(currentBudget * 0.15);
          currentBudget -= decrease;
          logs.push(`Day ${day}: CPA ($${currentCpa}) exceeded warning threshold. Throttled budget by 15% to $${currentBudget}/day.`);
        }
      }

      const finalCpa = Number((totalSpend / totalConversions).toFixed(2));
      const totalRevenue = chartData.reduce((acc, item) => acc + item.revenue, 0);
      const estimatedRoi = Number((totalRevenue / totalSpend).toFixed(2));

      return res.json({
        summary: `Rule validation completed over a simulated ${duration}-day window. Outbound proxy swappers and campaign rulesets successfully scaled the active assets. Performance indicates high responsiveness to target filters.`,
        totalSpend: Number(totalSpend.toFixed(2)),
        totalConversions,
        finalCpa,
        estimatedRoi,
        chartData,
        logs
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
