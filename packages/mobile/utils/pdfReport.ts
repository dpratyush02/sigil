/**
 * SIGIL — PDF Evidence Report Generator
 *
 * Generates a real HTML-based PDF evidence report using expo-print + expo-sharing.
 * Court/share-ready: branding, on-chain data, similarity breakdown, QR codes via API.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { SigilAlert } from '../services/scanner';

function qrUrl(data: string, size = 120): string {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&bgcolor=131313&color=FACC15&format=png`;
}

function confidenceColor(score: number): string {
  if (score >= 85) return '#EF4444';
  if (score >= 70) return '#F97316';
  return '#6B7280';
}

function confidenceLabel(score: number): string {
  if (score >= 85) return 'HIGH CONFIDENCE';
  if (score >= 70) return 'MEDIUM CONFIDENCE';
  return 'LOW CONFIDENCE';
}

export function buildEvidenceHtml(alert: SigilAlert): string {
  const score = Math.round(alert.confidence ?? alert.similarity ?? 0);
  const color = confidenceColor(score);
  const label = confidenceLabel(score);
  const now = new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' });
  const detectedAt = new Date(alert.detectedAt).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'medium' });

  const polyUrl = alert.txHash ? `https://polygonscan.com/tx/${alert.txHash}` : null;
  const sourceUrl = alert.sourceUrl ?? null;

  const layers = alert.layers ?? null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>SIGIL Evidence Report</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    background: #131313;
    color: #E5E7EB;
    padding: 40px;
    min-height: 100vh;
  }
  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 80px;
    font-weight: 900;
    color: rgba(250,204,21,0.04);
    pointer-events: none;
    white-space: nowrap;
    letter-spacing: 20px;
  }
  .container { max-width: 780px; margin: 0 auto; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 28px;
    border-bottom: 2px solid #FACC15;
    margin-bottom: 32px;
  }
  .brand { font-size: 36px; font-weight: 900; color: #FACC15; letter-spacing: 8px; }
  .brand-sub { font-size: 11px; color: #6B7280; letter-spacing: 3px; margin-top: 4px; }
  .report-meta { text-align: right; }
  .report-title { font-size: 14px; font-weight: 700; color: #9CA3AF; letter-spacing: 2px; }
  .report-date { font-size: 12px; color: #6B7280; margin-top: 4px; }
  .confidence-banner {
    background: ${color}22;
    border: 1.5px solid ${color}66;
    border-radius: 12px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
  }
  .confidence-score {
    font-size: 32px;
    font-weight: 900;
    color: ${color};
  }
  .confidence-info { flex: 1; }
  .confidence-label { font-size: 13px; font-weight: 800; color: ${color}; letter-spacing: 2px; }
  .confidence-sub { font-size: 12px; color: #9CA3AF; margin-top: 2px; }
  .section { margin-bottom: 28px; }
  .section-title {
    font-size: 10px;
    font-weight: 800;
    color: #FACC15;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px solid #2A2A2A;
  }
  .card {
    background: #1E1E1E;
    border-radius: 12px;
    border: 1px solid #2A2A2A;
    padding: 20px;
  }
  .field-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 8px 0;
    border-bottom: 1px solid #2A2A2A;
    gap: 16px;
  }
  .field-row:last-child { border-bottom: none; }
  .field-label {
    font-size: 10px;
    font-weight: 700;
    color: #6B7280;
    letter-spacing: 1.5px;
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 140px;
  }
  .field-value {
    font-size: 12px;
    color: #E5E7EB;
    font-family: 'Courier New', monospace;
    word-break: break-all;
    text-align: right;
    flex: 1;
  }
  .field-value.highlight { color: #FACC15; font-weight: 700; }
  .field-value.danger { color: #EF4444; }
  .similarity-bars { display: flex; flex-direction: column; gap: 10px; }
  .bar-row { display: flex; align-items: center; gap: 12px; }
  .bar-label { font-size: 11px; color: #9CA3AF; width: 120px; flex-shrink: 0; }
  .bar-track {
    flex: 1;
    height: 6px;
    background: #2A2A2A;
    border-radius: 99px;
    overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 99px; background: #FACC15; }
  .bar-fill.red { background: #EF4444; }
  .bar-pct { font-size: 11px; color: #9CA3AF; width: 36px; text-align: right; }
  .diff-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .diff-panel {
    background: #131313;
    border-radius: 8px;
    padding: 12px;
    border-left: 3px solid;
  }
  .diff-title {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 2px;
    margin-bottom: 8px;
  }
  .diff-code { font-size: 10px; font-family: 'Courier New', monospace; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
  .qr-row {
    display: flex;
    gap: 24px;
    justify-content: center;
  }
  .qr-item { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .qr-label { font-size: 10px; color: #6B7280; letter-spacing: 1px; text-align: center; }
  .qr-img { border-radius: 8px; border: 1px solid #2A2A2A; }
  .footer {
    margin-top: 40px;
    padding-top: 20px;
    border-top: 1px solid #2A2A2A;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-brand { font-size: 16px; font-weight: 900; color: #FACC15; letter-spacing: 4px; }
  .footer-note { font-size: 10px; color: #4B5563; text-align: right; line-height: 1.6; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 1px;
    margin-right: 6px;
  }
  .badge-red { background: #EF444422; color: #EF4444; border: 1px solid #EF444444; }
  .badge-yellow { background: #FACC1522; color: #FACC15; border: 1px solid #FACC1544; }
  .badge-gray { background: #6B728022; color: #9CA3AF; border: 1px solid #6B728044; }
  a { color: #FACC15; text-decoration: none; }
</style>
</head>
<body>
<div class="watermark">SIGIL</div>
<div class="container">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="brand">SIGIL</div>
      <div class="brand-sub">OWNERSHIP CLAIM RECORD</div>
    </div>
    <div class="report-meta">
      <div class="report-title">EVIDENCE REPORT</div>
      <div class="report-date">Generated: ${now}</div>
      <div class="report-date">Report ID: ${alert.id.slice(0, 16).toUpperCase()}</div>
    </div>
  </div>

  <!-- Confidence Banner -->
  <div class="confidence-banner">
    <div class="confidence-score">${score}%</div>
    <div class="confidence-info">
      <div class="confidence-label">${label}</div>
      <div class="confidence-sub">
        ${alert.source} · Detected ${detectedAt}
        ${alert.reviewed ? ' · <strong style="color:#22C55E">✓ REVIEWED</strong>' : ''}
      </div>
    </div>
  </div>

  <!-- Asset Details -->
  <div class="section">
    <div class="section-title">Asset Information</div>
    <div class="card">
      <div class="field-row">
        <div class="field-label">CONTENT NAME</div>
        <div class="field-value highlight">${escHtml(alert.contentName)}</div>
      </div>
      <div class="field-row">
        <div class="field-label">CONTENT TYPE</div>
        <div class="field-value">${escHtml(alert.contentType)}</div>
      </div>
      <div class="field-row">
        <div class="field-label">DETECTION SOURCE</div>
        <div class="field-value">${escHtml(alert.source)}</div>
      </div>
      ${sourceUrl ? `
      <div class="field-row">
        <div class="field-label">SOURCE URL</div>
        <div class="field-value"><a href="${escHtml(sourceUrl)}">${escHtml(sourceUrl)}</a></div>
      </div>` : ''}
      ${alert.reason ? `
      <div class="field-row">
        <div class="field-label">DETECTION REASON</div>
        <div class="field-value">${escHtml(alert.reason)}</div>
      </div>` : ''}
    </div>
  </div>

  <!-- On-Chain Registration -->
  <div class="section">
    <div class="section-title">On-Chain Registration — Polygon Mainnet</div>
    <div class="card">
      ${alert.txHash ? `
      <div class="field-row">
        <div class="field-label">TRANSACTION HASH</div>
        <div class="field-value">${escHtml(alert.txHash)}</div>
      </div>` : ''}
      ${alert.contentHash ? `
      <div class="field-row">
        <div class="field-label">CONTENT HASH</div>
        <div class="field-value">${escHtml(alert.contentHash)}</div>
      </div>` : ''}
      ${alert.ipfsCid ? `
      <div class="field-row">
        <div class="field-label">IPFS METADATA CID</div>
        <div class="field-value">${escHtml(alert.ipfsCid)}</div>
      </div>` : ''}
      ${alert.watermark ? `
      <div class="field-row">
        <div class="field-label">SIGIL WATERMARK</div>
        <div class="field-value">${escHtml(alert.watermark)}</div>
      </div>` : ''}
      <div class="field-row">
        <div class="field-label">NETWORK</div>
        <div class="field-value">Polygon Mainnet (Chain ID: 137)</div>
      </div>
      <div class="field-row">
        <div class="field-label">CONTRACT</div>
        <div class="field-value">0xf2bF22597e3562253409B57c723dd91ff168D80a</div>
      </div>
    </div>
  </div>

  <!-- Similarity Breakdown -->
  ${layers ? `
  <div class="section">
    <div class="section-title">Similarity Analysis Breakdown</div>
    <div class="card">
      <div class="similarity-bars">
        ${layers.exact ? `
        <div class="bar-row">
          <div class="bar-label">Exact Match</div>
          <div class="bar-track"><div class="bar-fill red" style="width:100%"></div></div>
          <div class="bar-pct" style="color:#EF4444">100%</div>
        </div>` : ''}
        <div class="bar-row">
          <div class="bar-label">Levenshtein</div>
          <div class="bar-track"><div class="bar-fill" style="width:${layers.levenshtein ?? 0}%"></div></div>
          <div class="bar-pct">${layers.levenshtein ?? 0}%</div>
        </div>
        <div class="bar-row">
          <div class="bar-label">Token Overlap</div>
          <div class="bar-track"><div class="bar-fill" style="width:${layers.tokenOverlap ?? 0}%"></div></div>
          <div class="bar-pct">${layers.tokenOverlap ?? 0}%</div>
        </div>
        <div class="bar-row">
          <div class="bar-label">Cosine Similarity</div>
          <div class="bar-track"><div class="bar-fill" style="width:${layers.cosine ?? 0}%"></div></div>
          <div class="bar-pct">${layers.cosine ?? 0}%</div>
        </div>
        <div class="bar-row">
          <div class="bar-label">Combined Score</div>
          <div class="bar-track"><div class="bar-fill red" style="width:${score}%"></div></div>
          <div class="bar-pct" style="color:${color};font-weight:700">${score}%</div>
        </div>
      </div>
    </div>
  </div>` : ''}

  <!-- Content Comparison -->
  ${(alert.evidence?.originalSnippet || alert.evidence?.foundSnippet) ? `
  <div class="section">
    <div class="section-title">Content Comparison</div>
    <div class="diff-grid">
      <div class="diff-panel" style="border-left-color:#22C55E">
        <div class="diff-title" style="color:#22C55E">● YOUR ORIGINAL</div>
        <div class="diff-code" style="color:#22C55E">${escHtml(alert.evidence?.originalSnippet ?? '')}</div>
      </div>
      <div class="diff-panel" style="border-left-color:#EF4444">
        <div class="diff-title" style="color:#EF4444">● FOUND COPY</div>
        <div class="diff-code" style="color:#EF4444">${escHtml(alert.evidence?.foundSnippet ?? '')}</div>
      </div>
    </div>
  </div>` : ''}

  <!-- QR Codes -->
  ${polyUrl || sourceUrl ? `
  <div class="section">
    <div class="section-title">Verification QR Codes</div>
    <div class="card">
      <div class="qr-row">
        ${polyUrl ? `
        <div class="qr-item">
          <img src="${qrUrl(polyUrl, 140)}" width="140" height="140" class="qr-img" alt="PolygonScan QR" />
          <div class="qr-label">POLYGONSCAN TX<br/><span style="color:#FACC15">On-Chain Proof</span></div>
        </div>` : ''}
        ${sourceUrl ? `
        <div class="qr-item">
          <img src="${qrUrl(sourceUrl, 140)}" width="140" height="140" class="qr-img" alt="Source URL QR" />
          <div class="qr-label">INFRINGING SOURCE<br/><span style="color:#EF4444">Detected Location</span></div>
        </div>` : ''}
      </div>
    </div>
  </div>` : ''}

  <!-- Legal Disclaimer -->
  <div class="section">
    <div class="card" style="border-color:#F9731633; background:#F9731608;">
      <div style="font-size:11px; color:#9CA3AF; line-height:18px;">
        <strong style="color:#F97316;">⚠ LEGAL DISCLAIMER</strong><br/>
        This report documents a timestamped blockchain registration claim and automated similarity analysis.
        It does <strong>not</strong> constitute legal proof of copyright ownership and should not be relied upon
        as a substitute for formal legal advice or copyright registration.
        Automated similarity scores may produce false positives. Always consult a qualified intellectual property
        attorney before taking any legal action based on this document.
        SIGIL makes no warranties as to the accuracy, completeness, or legal sufficiency of this report.
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-brand">SIGIL</div>
    <div class="footer-note">
      Timestamped ownership claim record — not a legal determination of copyright.<br />
      Generated by SIGIL · Polygon Mainnet · Report timestamp: ${now}
    </div>
  </div>

</div>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate and share a PDF evidence report for the given alert.
 * Returns the local file URI on success.
 */
export async function generateAndSharePDF(alert: SigilAlert): Promise<string> {
  const html = buildEvidenceHtml(alert);

  // Generate PDF via expo-print
  const { uri } = await Print.printToFileAsync({
    html,
    base64: false,
  });

  // Copy to a stable location with a meaningful filename
  const filename = `SIGIL_Evidence_${alert.contentName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
  const destUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: destUri });

  // Share
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(destUri, {
      mimeType: 'application/pdf',
      dialogTitle: `SIGIL Evidence — ${alert.contentName}`,
      UTI: 'com.adobe.pdf',
    });
  }

  return destUri;
}

/**
 * Save PDF locally without sharing dialog.
 */
export async function savePDFLocally(alert: SigilAlert): Promise<string> {
  const html = buildEvidenceHtml(alert);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const filename = `SIGIL_Evidence_${alert.contentName.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
  const destUri = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.copyAsync({ from: uri, to: destUri });
  return destUri;
}
