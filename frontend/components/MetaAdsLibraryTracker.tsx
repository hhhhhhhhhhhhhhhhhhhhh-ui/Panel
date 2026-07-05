'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/hooks/useAuth';
import { decrypt } from '../lib/crypto';
import {
  Plus, Search, Trash2, RefreshCw, ExternalLink, Calendar,
  AlertCircle, Info, Copy, Download, Star, Cpu, DownloadCloud,
  FileText, Check, Sparkles, Eye, Link2, X, ChevronRight,
  BarChart3, Clock, TrendingUp, Filter, Share2, Bookmark,
  ArrowUpRight, Maximize2, ChevronDown, Menu, ArrowLeft
} from 'lucide-react';

/* ─── Types ─────────────────────────────────────────────── */
interface TrackedPage {
  id: string;
  page_name: string;
  page_link: string;
  last_checked_at: string | null;
  total_ads: number;
  active_ads: number;
  inactive_ads: number;
}

interface TrackedAd {
  id: string;
  page_id: string;
  ad_id: string;
  ad_copy: string;
  media_url: string;
  platforms: string[];
  is_active: boolean;
  start_date: string;
  end_date: string;
  first_seen_at: string;
  last_seen_at: string;
  is_favorite?: boolean;
  raw_payload?: any;
}

/* ─── Helpers ───────────────────────────────────────────── */
const PLATFORM_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E1306C',
  messenger: '#0084FF',
  audience_network: '#FF6600',
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'FB',
  instagram: 'IG',
  messenger: 'MSG',
  audience_network: 'AN',
};

function decodeAdText(text: string): string {
  if (!text) return '';
  try {
    let d = text;
    d = d.replace(/\\u([0-9a-fA-F]{4})/g, (_, g) => String.fromCharCode(parseInt(g, 16)));
    d = d.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
    d = d.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    d = d.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (typeof window !== 'undefined') {
      const doc = new DOMParser().parseFromString(d, 'text/html');
      d = doc.body.textContent || d;
    }
    return d.trim();
  } catch { return text; }
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'AD';
}

const GRADIENT_PAIRS = [
  ['#6366f1', '#8b5cf6'],
  ['#0ea5e9', '#6366f1'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#0ea5e9'],
  ['#ec4899', '#8b5cf6'],
  ['#f97316', '#eab308'],
];

function getGradient(id: string): string[] {
  const idx = id.charCodeAt(0) % GRADIENT_PAIRS.length;
  return GRADIENT_PAIRS[idx];
}

/* ─── Platform Badge Component ──────────────────────────── */
function PlatformBadge({ platform }: { platform: string }) {
  const key = platform.toLowerCase();
  const color = PLATFORM_COLORS[key] || '#64748b';
  const label = PLATFORM_LABELS[key] || platform.slice(0, 2).toUpperCase();
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold font-mono"
      style={{ color, background: `${color}10`, border: `1px solid ${color}25` }}
    >
      {label}
    </span>
  );
}

/* ─── Ad Copy Text Component (See More Truncator) ────────── */
function AdCopyText({ text, onCopyText, isTextCopied }: { text: string; onCopyText: () => void; isTextCopied: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (!text) return <div className="px-3 pb-2 pt-0.5 text-xs text-gray-400">No ad copy text.</div>;

  const lines = text.split('\n');
  const showSeeMore = lines.length > 4;
  const displayedText = isExpanded || !showSeeMore ? text : lines.slice(0, 4).join('\n');

  return (
    <div className="px-3 pb-2 pt-0.5 whitespace-pre-wrap text-[13px] text-[#050505] leading-relaxed break-words relative group/copy">
      {displayedText}
      {!isExpanded && showSeeMore && (
        <button
          onClick={() => setIsExpanded(true)}
          className="text-[#1877F2] font-semibold hover:underline text-[12px] ml-1 mt-0.5 inline-block focus:outline-none"
        >
          ... See more
        </button>
      )}
      <button
        onClick={onCopyText}
        className="absolute top-0 right-3 opacity-0 group-hover/copy:opacity-100 transition-opacity p-1 bg-white hover:bg-gray-100 border border-gray-200 rounded text-gray-500 shadow-sm"
        title="Copy text"
      >
        {isTextCopied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
      </button>
    </div>
  );
}

/* ─── Ad Card Component ─────────────────────────────────── */
function AdCard({
  ad,
  pageName,
  isFavorite,
  onToggleFavorite,
  onCopyText,
  onCopyAll,
  onDownload,
  onAnalyze,
  onExpand,
  copiedId,
  copiedTextId,
  aiActiveId,
  aiResult,
  aiLoading,
}: any) {
  const [showAI, setShowAI] = useState(false);
  const [localCopiedVariant, setLocalCopiedVariant] = useState<number | null>(null);

  const isCopied = copiedId === ad.ad_id;
  const isTextCopied = copiedTextId === ad.ad_id;
  const isAIOpen = aiActiveId === ad.ad_id;

  const handleCopyVariant = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setLocalCopiedVariant(idx);
    setTimeout(() => setLocalCopiedVariant(null), 2000);
  };

  // Extract Facebook snapshot details if raw_payload is present
  const snapshot = ad.raw_payload?.snapshot || {};
  const fbPageName = snapshot.page_name || pageName || 'Facebook Advertiser';
  const profilePic = snapshot.page_profile_picture_url || '';
  const ctaText = snapshot.cta_text || 'Learn more';
  const displayFormat = snapshot.display_format || 'IMAGE';
  const title = snapshot.title || '';
  const linkDescription = snapshot.link_description || '';
  const linkUrl = snapshot.link_url || ad.raw_payload?.url || '';

  // Get all images
  const images = snapshot.images || [];
  const adImages: string[] = [];
  if (images.length > 0) {
    images.forEach((img: any) => {
      if (img.original_image_url) adImages.push(img.original_image_url);
      if (img.resized_image_url) adImages.push(img.resized_image_url);
    });
  }
  // Remove duplicates and filter empty strings
  const uniqueImages = Array.from(new Set(adImages.filter(Boolean)));

  // Fallback to top-level media_url if no images found in snapshot
  if (uniqueImages.length === 0 && ad.media_url) {
    uniqueImages.push(ad.media_url);
  }

  return (
    <div className="bg-white border border-gray-250/90 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:shadow-xl group">
      
      {/* 1. Meta Ads Info Header (Standard Info Metadata Bar) */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50/50 text-[10px] text-gray-500 gap-2 font-sans">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-700">ID: {ad.ad_id}</span>
          <span className="text-gray-300">|</span>
          <div className="flex gap-0.5">
            {(ad.platforms || []).map((p: string) => (
              <PlatformBadge key={p} platform={p} />
            ))}
          </div>
          {ad.raw_payload?.gated_type && ad.raw_payload.gated_type !== 'ELIGIBLE' && (
            <>
              <span className="text-gray-300">|</span>
              <span className="bg-amber-50 text-amber-700 border border-amber-200 px-1 py-0.2 rounded text-[8px] font-bold">
                ⚠️ Gated: {ad.raw_payload.gated_type}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-bold px-1.5 py-0.5 rounded ${
            ad.is_active
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px]'
              : 'bg-gray-100 text-gray-500 border border-gray-200 text-[9px]'
          }`}>
            {ad.is_active ? '● Active' : '○ Inactive'}
          </span>
          <button
            onClick={() => onToggleFavorite(ad.ad_id)}
            className={`p-0.5 transition-all ${
              isFavorite ? 'text-amber-500' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Star size={13} className={isFavorite ? 'fill-amber-500' : ''} />
          </button>
        </div>
      </div>

      {/* 2. EXACT FACEBOOK AD FORMAT CONTAINER */}
      <div className="bg-[#f0f2f5]/40 p-2.5 flex-1">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm font-sans text-sm text-[#1c1e21] max-w-lg mx-auto">
          
          {/* FB Page Profile Header */}
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2.5">
              {profilePic ? (
                <img 
                  src={profilePic} 
                  alt={fbPageName} 
                  className="w-10 h-10 rounded-full object-cover border border-gray-200 bg-gray-100"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-inner">
                  {getInitials(fbPageName)}
                </div>
              )}
              <div>
                <h4 className="font-semibold text-[13px] hover:underline cursor-pointer text-[#050505] leading-tight">{fbPageName}</h4>
                <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[#65676b]">
                  <span>Sponsored</span>
                  <span>·</span>
                  <span className="hover:underline cursor-pointer">Public</span>
                </div>
              </div>
            </div>
            <button className="text-[#65676b] hover:bg-gray-100 p-1.5 rounded-full transition">
              <span className="font-bold tracking-tight text-xs">•••</span>
            </button>
          </div>

          {/* Ad Primary Copy Text with See More toggle */}
          <AdCopyText text={ad.ad_copy} onCopyText={() => onCopyText(ad)} isTextCopied={isTextCopied} />

          {/* Ad Media Section (Showing Carousel snapshot.cards OR Single Image Preview) */}
          {snapshot.cards && snapshot.cards.length > 0 ? (
            /* Carousel UI Component */
            <div className="border-y border-gray-200 bg-[#f0f2f5] p-2 flex gap-3 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
              {snapshot.cards.map((card: any, cidx: number) => {
                const cardImg = card.video_preview_image_url || card.original_image_url || card.resized_image_url || (card.images && card.images[0]?.original_image_url);
                return (
                  <div key={cidx} className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col w-56 shrink-0 shadow-sm">
                    {cardImg ? (
                      <div className="relative group/cardmedia h-40 bg-gray-50 border-b border-gray-150">
                        <img src={cardImg} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/cardmedia:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            onClick={() => onDownload({ ...ad, media_url: cardImg })}
                            className="bg-white/95 hover:bg-white text-gray-800 p-1.5 rounded-full shadow text-[10px] font-bold flex items-center gap-1"
                          >
                            <Download size={10} /> Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-40 bg-gray-100 flex items-center justify-center text-gray-400">
                        <Info size={16} />
                      </div>
                    )}
                    <div className="p-2.5 flex-1 flex flex-col justify-between bg-white min-h-[75px]">
                      <div className="min-w-0">
                        <h6 className="font-bold text-[11px] text-[#050505] truncate">{card.title || title || fbPageName}</h6>
                        <p className="text-[10px] text-[#65676b] truncate mt-0.5">{card.description || linkDescription || ''}</p>
                      </div>
                      <button className="w-full mt-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-[10px] py-1.5 rounded transition uppercase tracking-wide">
                        {card.cta_text || ctaText || 'Learn More'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Standard Ad Single Media View Component */
            <div className="border-y border-gray-200 bg-gray-50 overflow-hidden">
              {uniqueImages.length > 0 ? (
                <div className="relative group/media">
                  <img
                    src={uniqueImages[0]}
                    alt="Ad Creative Preview"
                    className="w-full object-cover max-h-96"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                  {/* Copy Link & Download Hover overlay */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/media:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => onDownload({ ...ad, media_url: uniqueImages[0] })}
                      className="bg-white/95 hover:bg-white text-gray-800 p-2 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-1.5 text-xs font-semibold px-3"
                    >
                      <Download size={12} /> Save Pic
                    </button>
                    <a
                      href={uniqueImages[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="bg-white/95 hover:bg-white text-gray-800 p-2 rounded-full shadow-lg transition-transform hover:scale-105 flex items-center gap-1.5 text-xs font-semibold px-3"
                    >
                      <Eye size={12} /> Open URL
                    </a>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 bg-gray-100 text-gray-400 gap-1">
                  <Info size={24} />
                  <span className="text-xs">No preview media available</span>
                </div>
              )}
            </div>
          )}

          {/* Ad Bottom Link Card & Call-To-Action (Facebook UI Format) - Only displayed if not carousel */}
          {(!snapshot.cards || snapshot.cards.length === 0) && (
            <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-[11px] text-[#65676b] uppercase tracking-wide truncate">
                  {linkUrl ? new URL(linkUrl).hostname.replace('www.', '') : 'facebook.com'}
                </p>
                <h5 className="font-bold text-[13px] text-[#050505] truncate mt-0.5">
                  {title || fbPageName}
                </h5>
                {linkDescription && (
                  <p className="text-[11px] text-[#65676b] truncate mt-0.5">
                    {linkDescription}
                  </p>
                )}
              </div>
              {ctaText && (
                <button className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold text-xs px-3.5 py-2 rounded-md transition shrink-0 uppercase tracking-wide">
                  {ctaText}
                </button>
              )}
            </div>
          )}

        </div>
      </div>

      {/* 3. INDEPENDENT OUTSIDE MEDIA DOWNLOAD HUB (Showing Raw & Resized separately with sizes) */}
      {images.length > 0 && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 bg-gray-50/20 space-y-2.5">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">Media Asset Hub</p>
          <div className="space-y-3">
            {images.map((img: any, idx: number) => (
              <div key={idx} className="bg-white border border-gray-200 rounded-lg p-2.5 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-sm">
                
                {/* Preview Thumbnail */}
                <div className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto">
                  <div className="w-12 h-12 rounded border border-gray-200 overflow-hidden bg-gray-100 shrink-0">
                    <img 
                      src={img.resized_image_url || img.original_image_url} 
                      className="w-full h-full object-cover" 
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">Creative Asset #{idx + 1}</p>
                    <p className="text-[10px] text-gray-400 font-mono truncate">
                      {img.image_crops && img.image_crops.length > 0 
                        ? `Crops: ${img.image_crops.length}` 
                        : 'Standard aspect ratio'}
                    </p>
                  </div>
                </div>

                {/* Dual Downloader Buttons */}
                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  {img.original_image_url && (
                    <button
                      onClick={() => onDownload({ ...ad, media_url: img.original_image_url })}
                      className="flex-1 sm:flex-initial text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-2.5 py-1.5 rounded hover:bg-indigo-100 transition flex items-center justify-center gap-1"
                      title="Download High-Res Raw Image"
                    >
                      <DownloadCloud size={11} />
                      <span>Raw</span>
                      <span className="text-[8px] opacity-75 font-normal">(HQ)</span>
                    </button>
                  )}
                  
                  {img.resized_image_url && (
                    <button
                      onClick={() => onDownload({ ...ad, media_url: img.resized_image_url })}
                      className="flex-1 sm:flex-initial text-[10px] bg-gray-100 border border-gray-200 text-gray-700 font-bold px-2.5 py-1.5 rounded hover:bg-gray-205 transition flex items-center justify-center gap-1"
                      title="Download Web-Optimized Resized Image"
                    >
                      <Download size={11} />
                      <span>Resized</span>
                      <span className="text-[8px] opacity-75 font-normal">(600px)</span>
                    </button>
                  )}
                </div>

              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Panel Hook */}
      {isAIOpen && (
        <div className="mx-3 my-2.5 rounded-xl border border-indigo-150 bg-indigo-50/50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-indigo-100">
            <span className="text-[10px] font-bold text-indigo-700 font-mono flex items-center gap-1.5">
              <Sparkles size={10} className="animate-pulse" /> AI Critique & Rewrites
            </span>
            <button onClick={() => onAnalyze(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          </div>
          {aiLoading ? (
            <div className="p-3 text-[10px] text-gray-500 font-mono animate-pulse">&gt; Analyzing copy angles...</div>
          ) : aiResult ? (
            <div className="p-3 space-y-3">
              <p className="text-[11px] text-gray-600 italic border-l-2 border-indigo-400 pl-2">{aiResult.critique}</p>
              <div className="space-y-2">
                {aiResult.variations.map((v: any, i: number) => (
                  <div key={i} className="bg-white rounded-lg p-2.5 border border-gray-150 shadow-sm">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[9px] text-indigo-700 font-mono font-bold">{v.type}</span>
                      <button
                        onClick={() => handleCopyVariant(v.text, i)}
                        className="text-[9px] text-gray-500 hover:text-indigo-600 flex items-center gap-1"
                      >
                        {localCopiedVariant === i ? <Check size={9} className="text-emerald-600" /> : <Copy size={9} />}
                        {localCopiedVariant === i ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-700 font-mono whitespace-pre-wrap">{v.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Footer Utility Actions */}
      <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50/50">
        <div className="flex items-center gap-1 text-[9px] text-gray-400 font-mono">
          <Calendar size={9} />
          <span>Active: {ad.start_date}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAnalyze(isAIOpen ? null : ad)}
            className={`px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition border ${
              isAIOpen
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-white border-gray-200 text-gray-500 hover:text-indigo-600 hover:border-indigo-200'
            }`}
          >
            <Cpu size={9} /> AI Rewrite
          </button>
          <button
            onClick={() => onCopyAll(ad)}
            className="px-2 py-1 rounded text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 transition border bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300"
          >
            {isCopied ? <Check size={9} className="text-emerald-600" /> : <Copy size={9} />}
            {isCopied ? 'Done' : 'Copy Payload'}
          </button>
        </div>
      </div>

    </div>
  );
}

/* ─── Main Component ────────────────────────────────────── */
export default function MetaAdsLibraryTracker() {
  const { token, masterKey } = useAuth();

  const [pages, setPages] = useState<TrackedPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<TrackedPage | null>(null);
  const [ads, setAds] = useState<TrackedAd[]>([]);

  const [pagesLoading, setPagesLoading] = useState(false);
  const [adsLoading, setAdsLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Input States
  const [showAddForm, setShowAddForm] = useState(false);
  const [pageLinkInput, setPageLinkInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);

  // Filter / Search
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'active' | 'inactive' | 'favorites'>('all');
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'platform' | 'status'>('date');
  const [showTimeline, setShowTimeline] = useState(false);

  // Ad Features
  const [favorites, setFavorites] = useState<string[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedTextId, setCopiedTextId] = useState<string | null>(null);
  const [aiAnalysisAdId, setAiAnalysisAdId] = useState<string | null>(null);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<any>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [expandedAdId, setExpandedAdId] = useState<string | null>(null);

  // Mobile
  const [mobileView, setMobileView] = useState<'pages' | 'ads'>('pages');

  // Rename
  const [renamingPageId, setRenamingPageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  /* ─── Auth helpers ─── */
  const getHeaders = useCallback(() => {
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (masterKey) {
      try {
        const enc = localStorage.getItem('operator_credentials_vault');
        const nonce = localStorage.getItem('operator_credentials_nonce');
        if (enc && nonce) {
          const creds = JSON.parse(decrypt(enc, nonce, masterKey));
          if (creds.apifyApiToken) h['x-apify-token'] = creds.apifyApiToken;
        }
      } catch {}
    }
    return h;
  }, [token, masterKey]);

  /* ─── Success toast ─── */
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  /* ─── Fetch Pages ─── */
  const fetchPages = useCallback(async () => {
    if (!token) return;
    setPagesLoading(true);
    try {
      const res = await axios.get('/api/ads-tracker/pages', { headers: { Authorization: `Bearer ${token}` } });
      setPages(res.data);
      if (res.data.length > 0 && !selectedPage) {
        setSelectedPage(res.data[0]);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch tracked pages.');
    } finally {
      setPagesLoading(false);
    }
  }, [token]);

  /* ─── Fetch Ads ─── */
  const fetchAds = useCallback(async (pageId: string) => {
    if (!token) return;
    setAdsLoading(true);
    try {
      const res = await axios.get(`/api/ads-tracker/pages/${pageId}/ads`, { headers: { Authorization: `Bearer ${token}` } });
      const storedFavs: string[] = JSON.parse(localStorage.getItem('ad_tracker_favorites') || '[]');
      setFavorites(storedFavs);
      setAds(res.data.map((ad: any) => ({
        ...ad,
        ad_copy: decodeAdText(ad.ad_copy),
        is_favorite: storedFavs.includes(ad.ad_id)
      })));
    } catch {
      setError('Failed to load ad history.');
    } finally {
      setAdsLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPages(); }, [fetchPages]);
  useEffect(() => {
    if (selectedPage) {
      fetchAds(selectedPage.id);
      setAiAnalysisAdId(null);
      setAiAnalysisResult(null);
    } else {
      setAds([]);
    }
  }, [selectedPage, fetchAds]);

  /* ─── Add Page ─── */
  const handleAddPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pageLinkInput.trim() || !token) return;
    setActionLoadingId('add-page');
    setError(null);
    try {
      const res = await axios.post('/api/ads-tracker/pages', { pageLink: pageLinkInput }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPages(prev => [res.data, ...prev]);
      setSelectedPage(res.data);
      setPageLinkInput('');
      setShowAddForm(false);
      setMobileView('ads');
      showSuccess(`"${res.data.page_name}" added to tracking ledger!`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to track advertiser page.');
    } finally {
      setActionLoadingId(null);
    }
  };

  /* ─── Delete Page ─── */
  const handleDeletePage = async (id: string) => {
    if (!token || !confirm('Remove this advertiser? All ad history will be deleted.')) return;
    try {
      await axios.delete(`/api/ads-tracker/pages/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setPages(prev => prev.filter(p => p.id !== id));
      if (selectedPage?.id === id) setSelectedPage(null);
      showSuccess('Advertiser removed from ledger.');
    } catch {
      setError('Failed to delete tracked page.');
    }
  };

  /* ─── Rename Page ─── */
  const handleRename = async (id: string) => {
    if (!renameValue.trim()) { setRenamingPageId(null); return; }
    try {
      await axios.patch(`/api/ads-tracker/pages/${id}`, { page_name: renameValue }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPages(prev => prev.map(p => p.id === id ? { ...p, page_name: renameValue } : p));
      if (selectedPage?.id === id) setSelectedPage(prev => prev ? { ...prev, page_name: renameValue } : null);
      setRenamingPageId(null);
      showSuccess('Page name updated.');
    } catch { setError('Failed to rename page.'); }
  };

  /* ─── Recheck ─── */
  const handleRecheck = async (id: string, fromCard = false) => {
    if (!token) return;
    setActionLoadingId(id);
    setError(null);
    try {
      const res = await axios.post(`/api/ads-tracker/pages/${id}/recheck`, {}, { headers: getHeaders() });
      const updatedAds = res.data.ads.map((ad: any) => ({
        ...ad,
        ad_copy: decodeAdText(ad.ad_copy),
        is_favorite: favorites.includes(ad.ad_id)
      }));
      const activeCount = updatedAds.filter((a: any) => a.is_active).length;
      setPages(prev => prev.map(p => p.id === id
        ? { ...p, last_checked_at: new Date().toISOString(), total_ads: updatedAds.length, active_ads: activeCount, inactive_ads: updatedAds.length - activeCount }
        : p
      ));
      if (selectedPage?.id === id) {
        setAds(updatedAds);
        setSelectedPage(prev => prev ? { ...prev, last_checked_at: new Date().toISOString(), total_ads: updatedAds.length, active_ads: activeCount, inactive_ads: updatedAds.length - activeCount } : null);
      }
      showSuccess(`Sync complete! Found ${updatedAds.length} ads.`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Scraper execution failed.');
    } finally {
      setActionLoadingId(null);
    }
  };

  /* ─── Copy Actions ─── */
  const handleCopyText = (ad: TrackedAd) => {
    navigator.clipboard.writeText(ad.ad_copy);
    setCopiedTextId(ad.ad_id);
    setTimeout(() => setCopiedTextId(null), 2000);
  };

  const handleCopyAll = (ad: TrackedAd) => {
    const text = [
      `Advertiser: ${selectedPage?.page_name}`,
      `Ad ID: ${ad.ad_id}`,
      `Status: ${ad.is_active ? 'Active' : 'Turned Off'}`,
      `Platforms: ${ad.platforms.join(', ')}`,
      `Start Date: ${ad.start_date}`,
      `End Date: ${ad.end_date}`,
      '',
      'Ad Copy:',
      ad.ad_copy,
    ].join('\n');
    navigator.clipboard.writeText(text);
    setCopiedId(ad.ad_id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  /* ─── Download ─── */
  const handleDownload = async (ad: TrackedAd) => {
    if (!ad.media_url) return;
    try {
      const r = await fetch(ad.media_url);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ad_${ad.ad_id}.${blob.type.split('/')[1] || 'jpg'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(ad.media_url, '_blank');
    }
  };

  /* ─── Favorites ─── */
  const handleToggleFavorite = (adId: string) => {
    const newFavs = favorites.includes(adId) ? favorites.filter(f => f !== adId) : [...favorites, adId];
    setFavorites(newFavs);
    localStorage.setItem('ad_tracker_favorites', JSON.stringify(newFavs));
    setAds(prev => prev.map(a => a.ad_id === adId ? { ...a, is_favorite: newFavs.includes(adId) } : a));
  };

  /* ─── AI Analyze ─── */
  const handleAnalyze = (ad: TrackedAd | null) => {
    if (!ad) { setAiAnalysisAdId(null); setAiAnalysisResult(null); return; }
    setAiAnalysisAdId(ad.ad_id);
    setAiAnalyzing(true);
    setAiAnalysisResult(null);
    setTimeout(() => {
      setAiAnalysisResult({
        critique: "Strong emotional hook but lacks urgency. The CTA could be more specific. Consider adding social proof or a concrete benefit number to boost CTR.",
        variations: [
          {
            type: "🔥 Pattern Interrupt Hook",
            text: `Stop scrolling. This changes everything about how you advertise.\n\n${ad.ad_copy.slice(0, 80)}...\n\n👉 See why 10,000+ brands switched.`
          },
          {
            type: "💡 Benefit-Led",
            text: `Here's what our customers see in 30 days:\n✅ 3x higher ROAS\n✅ 40% lower CPL\n✅ Zero guesswork\n\n${ad.ad_copy.slice(0, 60)}...\n\nStart your free trial today.`
          },
          {
            type: "⏰ Urgency / FOMO",
            text: `⚠️ This offer expires in 24 hours.\n\n${ad.ad_copy.slice(0, 70)}...\n\nDon't miss out — claim your spot now. 🔒`
          }
        ]
      });
      setAiAnalyzing(false);
    }, 1400);
  };

  /* ─── Export ─── */
  const handleExportJSON = () => {
    if (!selectedPage || !ads.length) return;
    const blob = new Blob([JSON.stringify({ page: selectedPage, ads }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ads_${selectedPage.page_name.replace(/\s+/g, '_')}.json`;
    a.click();
    showSuccess('JSON export downloaded!');
  };

  const handleExportCSV = () => {
    if (!selectedPage || !ads.length) return;
    const rows = [
      ['Ad ID', 'Status', 'Platforms', 'Start Date', 'End Date', 'Ad Copy'],
      ...ads.map(ad => [
        ad.ad_id, ad.is_active ? 'Active' : 'Inactive', ad.platforms.join('|'),
        ad.start_date, ad.end_date, `"${ad.ad_copy.replace(/"/g, '""')}"`
      ])
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ads_${selectedPage.page_name.replace(/\s+/g, '_')}.csv`;
    a.click();
    showSuccess('CSV export downloaded!');
  };

  /* ─── Computed Values ─── */
  const platformDistribution = (() => {
    const d: Record<string, number> = { facebook: 0, instagram: 0, messenger: 0, audience_network: 0 };
    let total = 0;
    ads.forEach(ad => ad.platforms.forEach(p => {
      const k = p.toLowerCase();
      if (k in d) { d[k]++; total++; }
    }));
    return { d, total };
  })();

  const filteredAds = ads
    .filter(ad => {
      const search = searchQuery.toLowerCase();
      const matchSearch = !search || ad.ad_copy.toLowerCase().includes(search) || ad.ad_id.toLowerCase().includes(search);
      const matchFilter =
        filterType === 'all' ||
        (filterType === 'active' && ad.is_active) ||
        (filterType === 'inactive' && !ad.is_active) ||
        (filterType === 'favorites' && favorites.includes(ad.ad_id));
      const matchPlatform = !platformFilter || ad.platforms.some(p => p.toLowerCase() === platformFilter);
      return matchSearch && matchFilter && matchPlatform;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
      if (sortBy === 'status') return (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0);
      return 0;
    });

  const timelineAds = [...ads].sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  /* ─── Render ─────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Toasts */}
      {(error || successMsg) && (
        <div className={`fixed top-4 right-4 z-50 max-w-sm w-full px-4 py-3 rounded-xl border text-xs font-medium shadow-xl flex items-center gap-2 ${
          error ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
        }`}>
          {error ? <AlertCircle size={13} className="text-red-600" /> : <Check size={13} className="text-emerald-600" />}
          <span className="flex-1">{error || successMsg}</span>
          <button onClick={() => { setError(null); setSuccessMsg(null); }}>
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Top Header ───────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          {/* Left: Logo + Mobile back */}
          <div className="flex items-center gap-2">
            {mobileView === 'ads' && (
              <button
                onClick={() => setMobileView('pages')}
                className="md:hidden p-1.5 rounded-lg bg-gray-100 text-gray-600"
              >
                <ArrowLeft size={15} />
              </button>
            )}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center">
                <BarChart3 size={14} className="text-white" />
              </div>
              <span className="font-bold text-sm text-gray-900 hidden sm:block">Meta Ads Tracker</span>
            </div>
          </div>

          {/* Center: Search (desktop) */}
          <div className="hidden md:flex flex-1 max-w-sm mx-4 items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search ads, keywords..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none w-full"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}>
                <X size={11} className="text-gray-400" />
              </button>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowAddForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition shadow-sm"
            >
              <Plus size={13} />
              <span className="hidden sm:block">Track Page</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Add Page Modal ───────────────────────────── */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowAddForm(false); }}>
          <div className="w-full max-w-lg bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Track a Facebook Advertiser</h3>
                <p className="text-[11px] text-gray-500 mt-0.5">Paste any Facebook page or Ads Library URL</p>
              </div>
              <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddPage} className="p-5 space-y-4">
              {/* Input */}
              <div className={`flex items-center gap-3 bg-gray-50 rounded-xl border-2 transition-all px-4 py-3 ${
                inputFocused ? 'border-indigo-500 bg-white shadow-sm' : 'border-gray-200'
              }`}>
                <Link2 size={16} className={`shrink-0 transition-colors ${inputFocused ? 'text-indigo-500' : 'text-gray-400'}`} />
                <input
                  ref={inputRef}
                  type="text"
                  value={pageLinkInput}
                  onChange={e => setPageLinkInput(e.target.value)}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="https://facebook.com/YourBrand or Page ID..."
                  className="bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none w-full font-mono"
                  required
                />
                {pageLinkInput && (
                  <button type="button" onClick={() => setPageLinkInput('')} className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Examples */}
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">Supported formats:</p>
                {[
                  'https://www.facebook.com/YourBrandName',
                  'https://www.facebook.com/ads/library/?view_all_page_id=12345',
                  '123456789012345  (Numeric Page ID)',
                ].map(ex => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPageLinkInput(ex.includes('(') ? '' : ex)}
                    className="block w-full text-left text-[10px] text-gray-600 hover:text-indigo-600 font-mono bg-gray-50 hover:bg-gray-100/80 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-indigo-200 transition"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!pageLinkInput.trim() || actionLoadingId === 'add-page'}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-sm"
              >
                {actionLoadingId === 'add-page' ? (
                  <><RefreshCw size={14} className="animate-spin" /> Adding to ledger...</>
                ) : (
                  <><Plus size={14} /> Start Tracking</>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Main Grid ────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto flex h-[calc(100vh-57px)]">

        {/* ── Left Sidebar: Pages Ledger ─────────────── */}
        <aside className={`w-full md:w-72 lg:w-80 md:flex flex-col border-r border-gray-200 bg-white flex-shrink-0 ${
          mobileView === 'pages' ? 'flex' : 'hidden'
        }`}>
          {/* Sidebar header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest font-mono">Advertiser Ledger</span>
            <span className="text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-mono font-bold">{pages.length}</span>
          </div>

          {/* Page list */}
          <div className="flex-1 overflow-y-auto bg-gray-50/35">
            {pagesLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
                <RefreshCw size={18} className="animate-spin text-indigo-500" />
                <span className="text-xs">Loading advertisers...</span>
              </div>
            ) : pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-white border border-gray-200 flex items-center justify-center">
                  <BarChart3 size={20} className="text-gray-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">No pages tracked yet</p>
                  <p className="text-[11px] text-gray-450 mt-1">Click "Track Page" to start monitoring advertisers</p>
                </div>
                <button
                  onClick={() => { setShowAddForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}
                  className="text-xs text-indigo-600 hover:text-indigo-500 flex items-center gap-1 font-medium"
                >
                  <Plus size={12} /> Add first advertiser
                </button>
              </div>
            ) : (
              <div className="py-2">
                {pages.map(page => {
                  const isSelected = selectedPage?.id === page.id;
                  const isChecking = actionLoadingId === page.id;
                  const [g1, g2] = getGradient(page.id);
                  const initials = getInitials(page.page_name);
                  const isRenaming = renamingPageId === page.id;

                  return (
                    <div
                      key={page.id}
                      onClick={() => { setSelectedPage(page); setMobileView('ads'); }}
                      className={`mx-2 mb-1 px-3 py-3 rounded-xl cursor-pointer transition-all group relative ${
                        isSelected
                          ? 'bg-indigo-50 border border-indigo-200/80 shadow-sm'
                          : 'hover:bg-white border border-transparent hover:border-gray-200'
                      }`}
                    >
                      {isSelected && <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-indigo-600 rounded-full" />}

                      <div className="flex items-center gap-2.5">
                        {/* Avatar (Checking ads for profile photo fallback) */}
                        {(() => {
                          const pageAds = ads.filter(a => a.page_id === page.id || (selectedPage?.id === page.id && a.raw_payload?.snapshot?.page_profile_picture_url));
                          const profilePhoto = pageAds.find(a => a.raw_payload?.snapshot?.page_profile_picture_url)?.raw_payload?.snapshot?.page_profile_picture_url;
                          
                          if (profilePhoto) {
                            return (
                              <img
                                src={profilePhoto}
                                alt={page.page_name}
                                className="w-8 h-8 rounded-xl object-cover shrink-0 border border-gray-200 bg-gray-150"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            );
                          }
                          return (
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-inner"
                              style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}
                            >
                              {initials}
                            </div>
                          );
                        })()}

                        <div className="flex-1 min-w-0">
                          {isRenaming ? (
                            <input
                              autoFocus
                              className="w-full bg-white border border-gray-300 rounded px-2 py-0.5 text-xs text-gray-900 outline-none"
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={() => handleRename(page.id)}
                              onKeyDown={e => { if (e.key === 'Enter') handleRename(page.id); if (e.key === 'Escape') setRenamingPageId(null); }}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <p className="text-xs font-semibold text-gray-800 group-hover:text-gray-900 truncate">{page.page_name}</p>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] text-emerald-600 font-mono font-bold">{page.active_ads || 0} active</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-[9px] text-gray-500 font-mono">{page.inactive_ads || 0} off</span>
                            <span className="text-gray-300">·</span>
                            <span className="text-[9px] text-gray-400 font-mono">{timeAgo(page.last_checked_at)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={e => { e.stopPropagation(); setRenamingPageId(page.id); setRenameValue(page.page_name); }}
                            className="p-1.5 rounded-lg hover:bg-gray-150 text-gray-400 hover:text-gray-650 transition"
                            title="Rename"
                          >
                            <FileText size={11} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleRecheck(page.id); }}
                            disabled={isChecking}
                            className="p-1.5 rounded-lg hover:bg-gray-150 text-gray-400 hover:text-indigo-600 transition"
                            title="Sync now"
                          >
                            <RefreshCw size={11} className={isChecking ? 'animate-spin text-indigo-600' : ''} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeletePage(page.id); }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-650 transition"
                            title="Remove"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar footer */}
          <div className="px-4 py-3 border-t border-gray-200 bg-white">
            <button
              onClick={() => { setShowAddForm(true); setTimeout(() => inputRef.current?.focus(), 50); }}
              className="w-full flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-600 hover:text-gray-900 text-xs font-medium py-2.5 rounded-xl transition"
            >
              <Plus size={13} /> Track new advertiser
            </button>
          </div>
        </aside>

        {/* ── Right: Ad Feed ────────────────────────── */}
        <main className={`flex-1 overflow-y-auto bg-gray-50/50 ${mobileView === 'ads' ? 'block' : 'hidden md:block'}`}>
          {!selectedPage ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                <BarChart3 size={28} className="text-gray-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-600">Select an advertiser</p>
                <p className="text-[11px] text-gray-400 mt-1 max-w-xs">Choose a tracked page from the ledger or add a new one to start viewing their ad library</p>
              </div>
              <button
                onClick={() => { setShowAddForm(true); setMobileView('pages'); }}
                className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition shadow-sm"
              >
                <Plus size={12} /> Track your first advertiser
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-4">

              {/* ── Page Header ─────────────────────────── */}
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900">{selectedPage.page_name}</h2>
                    <a href={selectedPage.page_link} target="_blank" rel="noreferrer" className="text-gray-400 hover:text-indigo-600 transition">
                      <ExternalLink size={13} />
                    </a>
                  </div>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">Last synced: {timeAgo(selectedPage.last_checked_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => handleRecheck(selectedPage.id)}
                    disabled={actionLoadingId === selectedPage.id}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl transition disabled:opacity-60 shadow-sm"
                  >
                    <RefreshCw size={12} className={actionLoadingId === selectedPage.id ? 'animate-spin' : ''} />
                    {actionLoadingId === selectedPage.id ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <div className="flex bg-white border border-gray-200 p-1 rounded-xl gap-1 shadow-sm">
                    <button onClick={handleExportJSON} disabled={!ads.length} className="text-[10px] text-gray-550 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-50 transition disabled:opacity-40 flex items-center gap-1 font-bold uppercase">
                      <DownloadCloud size={10} /> JSON
                    </button>
                    <button onClick={handleExportCSV} disabled={!ads.length} className="text-[10px] text-gray-550 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-50 transition disabled:opacity-40 flex items-center gap-1 border-l border-gray-100 font-bold uppercase">
                      <DownloadCloud size={10} /> CSV
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Stats Row ───────────────────────────── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Ads', value: selectedPage.total_ads || 0, color: 'text-gray-900', bg: 'bg-white' },
                  { label: 'Active', value: selectedPage.active_ads || 0, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                  { label: 'Turned Off', value: selectedPage.inactive_ads || 0, color: 'text-gray-500', bg: 'bg-white' },
                  { label: 'Saved', value: ads.filter(a => favorites.includes(a.ad_id)).length, color: 'text-amber-700', bg: 'bg-amber-50' },
                ].map(s => (
                  <div key={s.label} className={`${s.bg} border border-gray-200/80 rounded-xl p-3 text-center shadow-sm`}>
                    <p className="text-[9px] text-gray-500 uppercase font-mono font-bold mb-1">{s.label}</p>
                    <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* ── Platform Distribution ────────────────── */}
              {platformDistribution.total > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest font-mono">Placement Breakdown</span>
                    {platformFilter && (
                      <button onClick={() => setPlatformFilter(null)} className="text-[9px] text-indigo-600 hover:text-indigo-500 flex items-center gap-1 font-mono">
                        <X size={9} /> Clear filter
                      </button>
                    )}
                  </div>
                  {/* Bar */}
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100 gap-0.5">
                    {Object.entries(platformDistribution.d).map(([key, count]) => count > 0 && (
                      <div
                        key={key}
                        onClick={() => setPlatformFilter(platformFilter === key ? null : key)}
                        className="h-full rounded-full cursor-pointer transition-all hover:brightness-95"
                        style={{
                          width: `${(count / platformDistribution.total) * 100}%`,
                          background: PLATFORM_COLORS[key] || '#64748b',
                          opacity: platformFilter && platformFilter !== key ? 0.3 : 1
                        }}
                        title={`${key}: ${count} placements`}
                      />
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3">
                    {Object.entries(platformDistribution.d).map(([key, count]) => count > 0 && (
                      <button
                        key={key}
                        onClick={() => setPlatformFilter(platformFilter === key ? null : key)}
                        className={`flex items-center gap-1.5 text-[9px] font-mono transition rounded px-1.5 py-0.5 ${
                          platformFilter === key ? 'bg-gray-100 font-bold' : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PLATFORM_COLORS[key] }} />
                        <span className="capitalize">{key.replace('_', ' ')}: {count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Timeline Toggle ──────────────────────── */}
              {ads.length > 0 && (
                <button
                  onClick={() => setShowTimeline(!showTimeline)}
                  className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-xs font-medium transition ${
                    showTimeline ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 shadow-sm'
                  }`}
                >
                  <span className="flex items-center gap-2"><Clock size={12} /> Campaign Timeline</span>
                  <ChevronDown size={13} className={`transition-transform ${showTimeline ? 'rotate-180' : ''}`} />
                </button>
              )}
              {showTimeline && (
                <div className="bg-white border border-gray-200 rounded-xl p-4 relative ml-2 shadow-sm">
                  <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-150" />
                  <div className="pl-6 space-y-4">
                    {timelineAds.map(ad => (
                      <div key={ad.id} className="relative group/tl">
                        <div className={`absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${ad.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-gray-750 font-mono font-bold">{ad.start_date}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${ad.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-550'}`}>
                            {ad.is_active ? 'Active' : 'Off'}
                          </span>
                          <div className="flex gap-1">
                            {ad.platforms.map(p => <PlatformBadge key={p} platform={p} />)}
                          </div>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 line-clamp-1 group-hover/tl:line-clamp-none transition-all">{ad.ad_copy}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Filter + Search Bar ──────────────────── */}
              <div className="flex flex-wrap gap-2 items-center">
                {/* Mobile search */}
                <div className="flex md:hidden flex-1 items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
                  <Search size={12} className="text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="bg-transparent text-xs text-gray-900 placeholder-gray-400 outline-none w-full"
                  />
                </div>
                {/* Filter tabs */}
                <div className="flex gap-1 bg-white border border-gray-200 p-1 rounded-xl shadow-sm">
                  {(['all', 'active', 'inactive', 'favorites'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                        filterType === type ? 'bg-indigo-650 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {type === 'favorites' ? '★' : type}
                    </button>
                  ))}
                </div>
                {/* Sort */}
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as any)}
                  className="bg-white border border-gray-200 text-gray-650 text-[10px] font-mono rounded-xl px-3 py-2 outline-none hover:border-gray-300 transition shadow-sm"
                >
                  <option value="date">Sort: Date</option>
                  <option value="status">Sort: Status</option>
                  <option value="platform">Sort: Platform</option>
                </select>
                {/* Count */}
                <span className="text-[10px] text-gray-400 font-mono ml-auto">
                  {filteredAds.length} / {ads.length} ads
                </span>
              </div>

              {/* ── Ad Cards ────────────────────────────── */}
              {adsLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <RefreshCw size={22} className="animate-spin text-indigo-500" />
                  <p className="text-xs text-gray-400">Loading ad library...</p>
                </div>
              ) : filteredAds.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                  <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                    <Info size={20} className="text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">No ads found</p>
                  <p className="text-[11px] text-gray-400 max-w-xs">
                    {ads.length === 0 ? 'Click "Sync Now" to fetch this page\'s ads from the library.' : 'Try adjusting your filters.'}
                  </p>
                  {ads.length === 0 && (
                    <button
                      onClick={() => handleRecheck(selectedPage.id)}
                      disabled={actionLoadingId === selectedPage.id}
                      className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition shadow-sm"
                    >
                      <RefreshCw size={12} className={actionLoadingId === selectedPage.id ? 'animate-spin' : ''} />
                      Sync Now
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-6">
                  {filteredAds.map(ad => (
                    <AdCard
                      key={ad.id}
                      ad={ad}
                      pageName={selectedPage.page_name}
                      isFavorite={favorites.includes(ad.ad_id)}
                      onToggleFavorite={handleToggleFavorite}
                      onCopyText={handleCopyText}
                      onCopyAll={handleCopyAll}
                      onDownload={handleDownload}
                      onAnalyze={handleAnalyze}
                      onExpand={setExpandedAdId}
                      copiedId={copiedId}
                      copiedTextId={copiedTextId}
                      aiActiveId={aiAnalysisAdId}
                      aiResult={aiAnalysisAdId === ad.ad_id ? aiAnalysisResult : null}
                      aiLoading={aiAnalysisAdId === ad.ad_id ? aiAnalyzing : false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
