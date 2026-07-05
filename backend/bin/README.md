# Meta Ads MCP Server

[![Go](https://img.shields.io/badge/Go-1.23+-00ADD8?logo=go)](https://go.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green)](https://modelcontextprotocol.io)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/letri)

A Go [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server providing full read+write access to the [Meta Marketing API v25.0](https://developers.facebook.com/docs/marketing-apis) — **206 tools** covering every major endpoint for Facebook Ads, Instagram Ads, and the Meta Ads ecosystem.

> [!NOTE]
> **Unofficial** — This project is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.

## Features

- **206 tools** — comprehensive Meta Marketing API coverage
- **Read + write** — create campaigns, ad sets, ads, upload creatives, manage audiences, and more
- **Campaigns** — create, update, delete, duplicate, copy across accounts, with full bid strategy support
- **Ad Sets** — full targeting, promoted objects, optimization goals, bid amounts, scheduling
- **Ads & Creatives** — create ads with any creative format, preview in multiple formats
- **Image & Video Upload** — upload from local files or URLs, with dedicated video upload host
- **Audiences** — custom audiences (CRM, website, app), lookalike audiences, user matching
- **Insights & Reporting** — account, campaign, ad set, and ad level analytics with breakdowns
- **Product Catalogs** — manage catalogs, product sets, feeds, and batch operations for dynamic ads
- **Billing** — transaction history, spend tracking, spend caps
- **Conversions API (CAPI)** — server-side event tracking via the Conversions API
- **Business Manager** — pages, Instagram accounts, system users, asset groups
- **Targeting** — interest, behavior, demographic, and location search with reach estimates
- **App Secret Proof** — automatic HMAC-SHA256 computation when app secret is configured
- **Rate limit aware** — parses `X-App-Usage` headers, backs off on throttling
- **10-connection concurrency** — configurable parallel request limit
- **Rich errors** — full Meta error details including `fbtrace_id` for support tickets
- **Extensible** — plug in custom credential backends via the `CredentialProvider` interface

## Quick Start

```bash
# Install
go install github.com/richardpowellus/meta-ads-mcp-server/cmd/meta-ads-mcp-server@latest

# Run
export META_ADS_ACCESS_TOKEN="your-access-token"
meta-ads-mcp-server
```

The server communicates over stdio using JSON-RPC 2.0 — connect it to any MCP-compatible client.

## Installation

### Option 1: Go Install (recommended)

```bash
go install github.com/richardpowellus/meta-ads-mcp-server/cmd/meta-ads-mcp-server@latest
```

Requires Go 1.23 or later.

### Option 2: Docker

```bash
docker run -i --rm \
  -e META_ADS_ACCESS_TOKEN="your-access-token" \
  ghcr.io/richardpowellus/meta-ads-mcp-server
```

### Option 3: Binary Download

Download prebuilt binaries for Linux, macOS, and Windows from [GitHub Releases](https://github.com/richardpowellus/meta-ads-mcp-server/releases).

## MCP Client Configuration

### Claude Desktop / VS Code / GitHub Copilot

Add to your MCP configuration file:

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "meta-ads-mcp-server",
      "env": {
        "META_ADS_ACCESS_TOKEN": "your-access-token",
        "META_AD_ACCOUNT_ID": "act_123456789",
        "META_APP_SECRET": "optional-app-secret"
      }
    }
  }
}
```

### Docker

```json
{
  "mcpServers": {
    "meta-ads": {
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "META_ADS_ACCESS_TOKEN",
        "-e", "META_AD_ACCOUNT_ID",
        "ghcr.io/richardpowellus/meta-ads-mcp-server"
      ],
      "env": {
        "META_ADS_ACCESS_TOKEN": "your-access-token",
        "META_AD_ACCOUNT_ID": "act_123456789"
      }
    }
  }
}
```

## Configuration

| Variable | Required | Description |
|---|---|---|
| `META_ADS_ACCESS_TOKEN` | Yes | Meta access token (user token, system user token, or page token) |
| `META_AD_ACCOUNT_ID` | No | Default ad account ID in `act_XXXXXXXXX` format. Overridable per tool call. |
| `META_BUSINESS_ID` | No | Default business ID. Overridable per tool call. |
| `META_APP_SECRET` | No | App secret for computing `appsecret_proof`. Recommended for production. |

### Getting an Access Token

#### For Development

1. Go to the [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your app and request the `ads_management` and `ads_read` permissions
3. Click **Generate Access Token**
4. Copy the token — it expires in ~1 hour

#### For Production

1. Create a [System User](https://business.facebook.com/settings/system-users) in Business Manager
2. Generate a token with `ads_management` scope
3. System user tokens don't expire — ideal for MCP servers

### Getting Your Ad Account ID

1. Go to [Meta Ads Manager](https://www.facebook.com/adsmanager/)
2. Your account ID is in the URL: `act=XXXXXXXXX`
3. Use the format `act_XXXXXXXXX` (include the `act_` prefix)

## Tools

206 tools organized across 27 categories. Click a category to see the tools.

<details>
<summary>Accounts (13 tools)</summary>

| Tool | Description |
|---|---|
| `list_accounts` | List all configured Meta Ads accounts |
| `get_ad_account` | Get ad account details (name, currency, timezone, status, spend cap) |
| `update_ad_account` | Update ad account settings |
| `list_ad_account_users` | List users with access to the ad account |
| `get_user_ad_accounts` | List ad accounts accessible by a user |
| `set_account_spend_cap` | Set or remove the account-level spend cap |
| `list_ad_labels` | List ad labels in the account |
| `create_ad_label` | Create a new ad label |
| `get_ad_label` | Get ad label details |
| `delete_ad_label` | Delete an ad label |
| `assign_ad_label` | Assign labels to campaigns, ad sets, or ads |
| `remove_ad_label` | Remove labels from objects |
| `generate_ad_preview` | Generate an ad preview from a creative spec |

</details>

<details>
<summary>Activities (3 tools)</summary>

| Tool | Description |
|---|---|
| `get_account_activities` | Get recent account activities (budget changes, status changes) |
| `get_account_audit_log` | Get the audit log showing who made what changes |
| `get_ad_activity` | Get activity log for a specific ad, ad set, or campaign |

</details>

<details>
<summary>Ad Library (2 tools)</summary>

| Tool | Description |
|---|---|
| `search_ad_library` | Search the Meta Ad Library for ads by keyword, page, or country |
| `get_ad_library_report` | Get aggregated spend and impression data from the Ad Library |

</details>

<details>
<summary>Ads (8 tools)</summary>

| Tool | Description |
|---|---|
| `list_ads` | List ads, optionally filtered by ad set or campaign |
| `create_ad` | Create a new ad with name, ad set, creative, and status |
| `get_ad` | Get ad details by ID |
| `update_ad` | Update an existing ad |
| `delete_ad` | Delete an ad |
| `get_ad_insights` | Get performance metrics for an ad |
| `get_ad_previews` | Get previews for an existing ad |
| `copy_ad` | Duplicate an ad to the same or different ad set |

</details>

<details>
<summary>Ad Sets (8 tools)</summary>

| Tool | Description |
|---|---|
| `list_adsets` | List ad sets, optionally filtered by campaign or status |
| `create_adset` | Create an ad set with targeting, optimization goal, and billing event |
| `get_adset` | Get ad set details by ID |
| `update_adset` | Update an existing ad set |
| `delete_adset` | Delete an ad set |
| `get_adset_insights` | Get performance metrics for an ad set |
| `copy_adset` | Duplicate an ad set to the same or different campaign |
| `get_adset_targeting_sentence` | Get human-readable targeting description |

</details>

<details>
<summary>Async Reports (4 tools)</summary>

| Tool | Description |
|---|---|
| `create_async_report` | Create an async insights report (returns report_run_id to poll) |
| `get_async_report_status` | Check the status of an async report |
| `get_async_report_results` | Get results of a completed async report |
| `list_report_runs` | List recent async report runs |

</details>

<details>
<summary>Audiences (11 tools)</summary>

| Tool | Description |
|---|---|
| `list_custom_audiences` | List custom audiences |
| `create_custom_audience` | Create a custom audience (CRM, website, app-based) |
| `get_custom_audience` | Get custom audience details |
| `update_custom_audience` | Update a custom audience |
| `delete_custom_audience` | Delete a custom audience |
| `add_audience_users` | Add users to a custom audience with hashed identifiers |
| `remove_audience_users` | Remove users from a custom audience |
| `create_lookalike_audience` | Create a lookalike audience from an existing source |
| `get_audience_health` | Get audience health metrics and operation status |
| `share_custom_audience` | Share an audience with another ad account |
| `get_audience_sharing_status` | Get the sharing status of a custom audience |

</details>

<details>
<summary>Auth (3 tools)</summary>

| Tool | Description |
|---|---|
| `exchange_token` | Exchange a short-lived token for a long-lived token |
| `debug_token` | Inspect token properties (scopes, expiry, app) |
| `get_token_info` | Get info about the currently configured access token |

</details>

<details>
<summary>Billing (3 tools)</summary>

| Tool | Description |
|---|---|
| `get_billing_transactions` | Get billing activity log (funding, charges, invoices, payments) |
| `get_account_spend` | Get account-level spend insights for a date range |
| `get_spend_by_day` | Get daily spend breakdown |

</details>

<details>
<summary>Brand Safety (6 tools)</summary>

| Tool | Description |
|---|---|
| `list_block_lists` | List publisher block lists |
| `create_block_list` | Create a new publisher block list |
| `get_block_list` | Get block list details and entries |
| `add_to_block_list` | Add publisher URLs or app IDs to a block list |
| `remove_from_block_list` | Remove entries from a block list |
| `delete_block_list` | Delete a block list |

</details>

<details>
<summary>Budget Planning (8 tools)</summary>

| Tool | Description |
|---|---|
| `list_budget_schedules` | List budget schedules for a campaign |
| `create_budget_schedule` | Create a budget schedule for time-based budget distribution |
| `update_budget_schedule` | Update a budget schedule |
| `delete_budget_schedule` | Delete a budget schedule |
| `list_rf_predictions` | List Reach & Frequency predictions |
| `create_rf_prediction` | Create a new R&F prediction for forecasting |
| `get_rf_prediction` | Get R&F prediction details |
| `get_minimum_budgets` | Get minimum budget requirements based on targeting and bid strategy |

</details>

<details>
<summary>Business Manager (13 tools)</summary>

| Tool | Description |
|---|---|
| `get_business` | Get business details |
| `list_business_ad_accounts` | List ad accounts owned by or shared with the business |
| `list_business_pages` | List all pages associated with the business |
| `list_business_owned_pages` | List pages owned by the business |
| `list_business_instagram_accounts` | List connected Instagram accounts |
| `get_page_instagram_account` | Get the Instagram account linked to a Facebook Page |
| `list_business_system_users` | List system users for the business |
| `get_user_accounts` | Get ad accounts accessible by a user |
| `get_user_promotable_events` | Get events the user can promote |
| `list_business_asset_groups` | List business asset groups |
| `get_asset_group_ad_accounts` | Get ad accounts in an asset group |
| `get_asset_group_pixels` | Get pixels in an asset group |
| `assign_asset_group_accounts` | Assign ad accounts to an asset group |

</details>

<details>
<summary>Campaigns (8 tools)</summary>

| Tool | Description |
|---|---|
| `list_campaigns` | List campaigns with status and date filtering |
| `create_campaign` | Create a campaign with objective, bid strategy, budget, and spend cap |
| `get_campaign` | Get campaign details by ID |
| `update_campaign` | Update an existing campaign |
| `delete_campaign` | Delete a campaign (sets status to DELETED) |
| `get_campaign_insights` | Get performance metrics for a campaign |
| `duplicate_campaign` | Duplicate a campaign including ad sets and ads |
| `copy_campaign` | Copy a campaign to a different ad account |

</details>

<details>
<summary>Canvas / Instant Experiences (5 tools)</summary>

| Tool | Description |
|---|---|
| `list_canvases` | List Instant Experiences for the account |
| `create_canvas` | Create an Instant Experience with body elements |
| `get_canvas` | Get Instant Experience details |
| `update_canvas` | Update an Instant Experience |
| `delete_canvas` | Delete an Instant Experience |

</details>

<details>
<summary>Product Catalogs (17 tools)</summary>

| Tool | Description |
|---|---|
| `list_catalogs` | List product catalogs |
| `get_catalog` | Get catalog details |
| `list_product_sets` | List product sets in a catalog |
| `create_product_set` | Create a product set with filter rules |
| `get_product_set` | Get product set details |
| `delete_product_set` | Delete a product set |
| `list_products` | List products in a catalog |
| `get_product` | Get product details |
| `create_product` | Create a product in a catalog |
| `delete_product` | Delete a product |
| `list_product_feeds` | List product feeds |
| `create_product_feed` | Create a product feed (URL or file-based) |
| `get_product_feed` | Get feed details |
| `update_product_feed` | Update feed name or schedule |
| `delete_product_feed` | Delete a product feed |
| `batch_products` | Batch create, update, or delete products |
| `get_batch_status` | Check batch operation status |

</details>

<details>
<summary>Conversions (10 tools)</summary>

| Tool | Description |
|---|---|
| `list_custom_conversions` | List custom conversions |
| `create_custom_conversion` | Create a custom conversion |
| `get_custom_conversion` | Get custom conversion details |
| `delete_custom_conversion` | Delete a custom conversion |
| `list_offline_event_sets` | List offline event sets |
| `create_offline_event_set` | Create an offline event set |
| `upload_offline_events` | Upload offline conversion events |
| `get_offline_event_set_stats` | Get offline event set statistics |
| `assign_offline_event_set_accounts` | Assign ad accounts to an offline event set |
| `send_conversion_events` | Send server-side events via the Conversions API (CAPI) |

</details>

<details>
<summary>Creatives (5 tools)</summary>

| Tool | Description |
|---|---|
| `list_creatives` | List ad creatives |
| `create_creative` | Create an ad creative (image, video, carousel, etc.) |
| `get_creative` | Get creative details |
| `update_creative` | Update a creative |
| `delete_creative` | Delete a creative |

</details>

<details>
<summary>Diagnostics (4 tools)</summary>

| Tool | Description |
|---|---|
| `get_delivery_insights` | Get delivery diagnostics and cost insights |
| `get_campaign_recommendations` | Get optimization recommendations for a campaign |
| `get_adset_recommendations` | Get optimization recommendations for an ad set |
| `get_ad_recommendations` | Get recommendations and relevance diagnostics for an ad |

</details>

<details>
<summary>Experiments (6 tools)</summary>

| Tool | Description |
|---|---|
| `list_ad_studies` | List ad studies (A/B tests, holdout experiments) |
| `create_ad_study` | Create a new ad study |
| `get_ad_study` | Get ad study details |
| `get_ad_study_results` | Get experiment results |
| `get_brand_lift_results` | Get brand lift survey data |
| `delete_ad_study` | Delete an ad study |

</details>

<details>
<summary>Images (6 tools)</summary>

| Tool | Description |
|---|---|
| `upload_image` | Upload an image from a local file or URL |
| `list_images` | List ad images |
| `get_image` | Get image details by hash |
| `delete_image` | Delete an image by hash |
| `get_image_crops` | Get available image crops |
| `get_image_by_url` | Get image data from a URL |

</details>

<details>
<summary>Insights (4 tools)</summary>

| Tool | Description |
|---|---|
| `get_account_insights` | Get account-level performance metrics with breakdowns |
| `get_campaign_insights_report` | Get insights across all campaigns |
| `get_adset_insights_report` | Get insights across all ad sets |
| `get_ad_insights_report` | Get insights across all ads |

</details>

<details>
<summary>Leads (5 tools)</summary>

| Tool | Description |
|---|---|
| `list_lead_forms` | List lead generation forms |
| `create_lead_form` | Create a lead form |
| `get_lead_form` | Get lead form details |
| `get_leads` | Get leads submitted to a form |
| `get_lead` | Get a single lead by ID |

</details>

<details>
<summary>Pixels (3 tools)</summary>

| Tool | Description |
|---|---|
| `list_pixels` | List Meta Pixels for the account |
| `get_pixel` | Get pixel details |
| `get_pixel_stats` | Get event statistics for a pixel |

</details>

<details>
<summary>Previews (2 tools)</summary>

| Tool | Description |
|---|---|
| `get_ad_preview` | Get an HTML preview of an existing ad |
| `generate_preview` | Generate a preview from a creative spec without creating an ad |

</details>

<details>
<summary>Rules (6 tools)</summary>

| Tool | Description |
|---|---|
| `list_ad_rules` | List automated ad rules |
| `create_ad_rule` | Create an automated rule |
| `get_ad_rule` | Get rule details |
| `update_ad_rule` | Update an existing rule |
| `delete_ad_rule` | Delete a rule |
| `get_rule_execution_history` | Get rule execution history |

</details>

<details>
<summary>Targeting (10 tools)</summary>

| Tool | Description |
|---|---|
| `search_interests` | Search interest-based targeting options |
| `search_behaviors` | Search behavior-based targeting |
| `search_demographics` | Search demographic targeting |
| `search_locations` | Search geographic targeting locations |
| `get_targeting_categories` | Browse available targeting categories |
| `get_reach_estimate` | Get reach estimate for a targeting spec |
| `get_delivery_estimate` | Get delivery estimates with daily outcomes curve |
| `get_targeting_browse` | Browse targeting options by category |
| `get_broad_targeting_categories` | Get broad targeting categories |
| `search_targeting_options` | General-purpose targeting search by class |

</details>

<details>
<summary>Videos (6 tools)</summary>

| Tool | Description |
|---|---|
| `upload_video` | Upload a video from a local file or URL (uses graph-video host) |
| `list_videos` | List ad videos |
| `get_video` | Get video details |
| `get_video_thumbnails` | Get video thumbnail images |
| `delete_video` | Delete a video |
| `get_video_upload_status` | Check video upload/processing status |

</details>

## Bugs Fixed

This server was built to fix [7 bugs filed against `@mikusnuz/meta-ads-mcp`](https://github.com/mikusnuz/meta-ads-mcp/issues):

| Bug | Fix |
|---|---|
| Image upload fails with OAuthException | Proper multipart POST to `/adimages` with `Bearer` auth header |
| Missing `bid_strategy` on campaign creation | First-class `bid_strategy` parameter with all strategy options |
| Missing `is_adset_budget_sharing_enabled` | Supported on `create_campaign` for ABO/CBO selection |
| Missing `promoted_object` on ad set creation | Full `promoted_object` support via JSON passthrough |
| No spend cap support | `set_account_spend_cap` + spend cap on campaign create/update |
| Video upload URL-only | Local file upload via `graph-video.facebook.com` multipart POST |
| No billing/transaction history | `get_billing_transactions`, `get_account_spend`, `get_spend_by_day` |

## Architecture

```
MCP Client ←→ stdio JSON-RPC ←→ meta-ads-mcp-server ←→ Meta Graph API v25.0
```

- **Transport**: stdio (standard input/output) using JSON-RPC 2.0
- **API Version**: Meta Graph API v25.0
- **Auth**: `Authorization: Bearer {token}` + optional `appsecret_proof` (HMAC-SHA256)
- **Video Uploads**: Uses dedicated `graph-video.facebook.com` host
- **Rate Limiting**: Parses `X-App-Usage` headers; backs off on 4/17/32/613 error codes
- **Concurrency**: 10 parallel requests (configurable)
- **Retries**: Automatic retry on transient errors and rate limits with exponential backoff
- **Pagination**: Cursor-based with `after`/`before`/`limit` parameters; `auto_paginate` option per tool

## Multi-Account Support

Configure multiple accounts by naming your environment variables:

```bash
# Account "production"
export META_ADS_ACCESS_TOKEN_PRODUCTION="token-1"
export META_AD_ACCOUNT_ID_PRODUCTION="act_111111"

# Account "staging"
export META_ADS_ACCESS_TOKEN_STAGING="token-2"
export META_AD_ACCOUNT_ID_STAGING="act_222222"
```

Then specify the account in each tool call:

```json
{
  "account": "production",
  "ad_account_id": "act_111111"
}
```

Or use the default (unnamed) account:

```bash
export META_ADS_ACCESS_TOKEN="your-token"
export META_AD_ACCOUNT_ID="act_123456"
```

## Building from Source

```bash
git clone https://github.com/richardpowellus/meta-ads-mcp-server.git
cd meta-ads-mcp-server
go build -o meta-ads-mcp-server ./cmd/meta-ads-mcp-server
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

Please report security vulnerabilities privately. See [SECURITY.md](SECURITY.md) for details.

## License

MIT — see [LICENSE](LICENSE) for details.

## Support

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/letri)

---

*Built with ❤️ for the MCP ecosystem. Not affiliated with Meta Platforms, Inc.*
