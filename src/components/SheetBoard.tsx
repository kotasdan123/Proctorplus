import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  RefreshCw,
  Save,
  Plus,
  Trash2,
  Eye,
  Search,
  ExternalLink,
  Download,
  Columns,
  Check,
  X,
  Database,
  Calendar,
  SlidersHorizontal,
  Table,
  CheckCircle2,
  AlertCircle,
  Edit2,
  Link2,
  Unlink,
  Info
} from 'lucide-react';
import { SheetData } from '../types';
import {
  fetchSheetData,
  syncSheetData,
  saveSheetData,
  saveSheetUrl,
  addSheetRow,
  deleteSheetRow
} from '../lib/api';

export const SheetBoard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Core sheet data
  const [sheetData, setSheetData] = useState<SheetData>({
    url: '',
    lastSyncedAt: null,
    headers: [],
    rows: []
  });

  // URL management state
  const [editingUrl, setEditingUrl] = useState<boolean>(false);
  const [sheetUrlInput, setSheetUrlInput] = useState<string>('');
  const [urlSaving, setUrlSaving] = useState<boolean>(false);

  // Track modified rows locally before saving
  const [localRows, setLocalRows] = useState<string[][]>([]);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());

  // Active view: 'board' (interactive table) or 'embed' (live spreadsheet view)
  const [activeTab, setActiveTab] = useState<'board' | 'embed'>('board');
  const [embedMode, setEmbedMode] = useState<'preview' | 'pubhtml' | 'edit'>('preview');
  const [excelViewMode, setExcelViewMode] = useState<'native' | 'office' | 'microsoft'>('native');
  const [embedKey, setEmbedKey] = useState<number>(1);
  const [activeWorksheetName, setActiveWorksheetName] = useState<string>('');
  const [nativeSearch, setNativeSearch] = useState<string>('');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [columnSearch, setColumnSearch] = useState('');
  const [columnPreset, setColumnPreset] = useState<'key' | 'all' | 'custom'>('key');
  const [selectedColumnIndexes, setSelectedColumnIndexes] = useState<number[]>([]);

  // Inline Cell Editing State
  const [editingCell, setEditingCell] = useState<{
    rowIdx: number;
    colIdx: number;
    val: string;
  } | null>(null);

  // Inspector Modal for full 325-answers view
  const [inspectRowIndex, setInspectRowIndex] = useState<number | null>(null);
  const [inspectSearch, setInspectSearch] = useState('');

  // Add Row Modal
  const [addRowModalOpen, setAddRowModalOpen] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<number, string>>({});

  // Confirm Delete Modal
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Initial fetch
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSheetData(force);
      setSheetData(data);
      setSheetUrlInput(data.url || '');
      setLocalRows(data.rows || []);
      setActiveWorksheetName(data.activeSheetName || data.sheets?.[0]?.name || '');
      setEditedCells(new Set());
      if (data.provider === 'excel' || (data.url && /1drv\.ms|onedrive\.live\.com|sharepoint\.com|\.xlsx?/i.test(data.url))) {
        setExcelViewMode(data.rows && data.rows.length > 0 ? 'native' : 'office');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load spreadsheet data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchWorksheet = (sheetName: string) => {
    const targetSheet = sheetData.sheets?.find((s) => s.name === sheetName);
    if (!targetSheet) return;
    if (editedCells.size > 0) {
      if (!window.confirm('Switching worksheet will discard uncommitted local edits on the current tab. Continue?')) {
        return;
      }
    }
    setActiveWorksheetName(sheetName);
    setSheetData((prev) => ({
      ...prev,
      headers: targetSheet.headers,
      rows: targetSheet.rows,
      activeSheetName: sheetName
    }));
    setLocalRows(targetSheet.rows || []);
    setEditedCells(new Set());
    setEditingCell(null);
  };

  const handleSaveUrl = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setUrlSaving(true);
    setError(null);
    const cleaned = sheetUrlInput.trim();
    try {
      const updated = await saveSheetUrl(cleaned);
      setSheetData(updated);
      setSheetUrlInput(updated.url || cleaned);
      setEditingUrl(false);
      showToast(
        updated.url
          ? `${updated.provider === 'excel' ? 'Microsoft Excel Online' : 'Spreadsheet'} link saved successfully!`
          : 'Spreadsheet link removed.'
      );
      if (updated.url) {
        // Automatically sync latest data whenever a spreadsheet URL is connected/updated
        handleSync(updated.url);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save spreadsheet link.');
    } finally {
      setUrlSaving(false);
    }
  };

  const handleSync = async (customUrl?: string) => {
    const targetUrl = (customUrl || sheetData.url || '').trim();
    if (!targetUrl) {
      setError('No spreadsheet link configured. Please paste your Google Sheets or Microsoft Excel Online link above and save it.');
      setEditingUrl(true);
      return;
    }

    if (editedCells.size > 0) {
      const confirmed = window.confirm(
        'You have unsaved local edits on this board. Syncing from the spreadsheet will overwrite local edits. Continue?'
      );
      if (!confirmed) return;
    }

    setSyncing(true);
    setError(null);
    try {
      const data = await syncSheetData(targetUrl);
      setSheetData(data);
      setLocalRows(data.rows || []);
      setActiveWorksheetName(data.activeSheetName || data.sheets?.[0]?.name || '');
      setEditedCells(new Set());
      if (data.provider === 'excel') {
        setExcelViewMode(data.rows && data.rows.length > 0 ? 'native' : 'office');
      }
      showToast(
        `Successfully synchronized latest data from ${
          data.provider === 'excel' ? 'Microsoft Excel Online' : 'spreadsheet'
        }!`
      );
    } catch (err: any) {
      setError(err.message || 'Failed to synchronize with spreadsheet.');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await saveSheetData({
        headers: sheetData.headers,
        rows: localRows,
        url: sheetData.url
      });
      setSheetData(updated);
      setEditedCells(new Set());
      showToast('All changes saved successfully to database!');
    } catch (err: any) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscardChanges = () => {
    if (window.confirm('Discard all unsaved changes and reset to current server state?')) {
      setLocalRows(sheetData.rows || []);
      setEditedCells(new Set());
      setEditingCell(null);
      showToast('Unsaved changes discarded.');
    }
  };

  const showToast = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  // Inline Cell Edit
  const handleStartEdit = (rowIdx: number, colIdx: number, currentVal: string) => {
    setEditingCell({ rowIdx, colIdx, val: currentVal });
  };

  const handleCommitEdit = () => {
    if (!editingCell) return;
    const { rowIdx, colIdx, val } = editingCell;

    const nextRows = [...localRows];
    const row = [...(nextRows[rowIdx] || [])];
    while (row.length <= colIdx) row.push('');
    row[colIdx] = val;
    nextRows[rowIdx] = row;

    setLocalRows(nextRows);

    const cellKey = `${rowIdx}-${colIdx}`;
    setEditedCells((prev) => new Set(prev).add(cellKey));
    setEditingCell(null);
  };

  const handleCancelEdit = () => {
    setEditingCell(null);
  };

  // Delete Row
  const handleDeleteRow = async (index: number) => {
    try {
      await deleteSheetRow(index);
      const nextRows = localRows.filter((_, i) => i !== index);
      setLocalRows(nextRows);
      setDeleteConfirmIndex(null);
      showToast(`Row #${index + 1} deleted.`);
    } catch (err: any) {
      setError(err.message || 'Failed to delete row.');
    }
  };

  // Add Row
  const handleAddRowSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const row: string[] = [];
    const totalCols = Math.max(sheetData.headers.length, 325);
    for (let i = 0; i < totalCols; i++) {
      row.push(newRowData[i] || '');
    }

    try {
      await addSheetRow(row);
      setLocalRows((prev) => [row, ...prev]);
      setAddRowModalOpen(false);
      setNewRowData({});
      showToast('New record added to data board!');
    } catch (err: any) {
      setError(err.message || 'Failed to add row.');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    const csvContent = [
      sheetData.headers.map((h) => `"${(h || '').replace(/"/g, '""')}"`).join(','),
      ...localRows.map((r) =>
        r.map((cell) => `"${(cell || '').replace(/"/g, '""')}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Exam_Sheet_Export_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Column Filtering
  const visibleColumnIndexes = useMemo(() => {
    const allHeaders = sheetData.headers || [];
    if (allHeaders.length === 0) return [];

    let indexes: number[] = [];

    if (columnPreset === 'key') {
      // First 8 columns + any column matching column search
      const keyCount = Math.min(8, allHeaders.length);
      for (let i = 0; i < keyCount; i++) indexes.push(i);
    } else if (columnPreset === 'all') {
      indexes = allHeaders.map((_, i) => i);
    } else {
      indexes = selectedColumnIndexes.length > 0 ? selectedColumnIndexes : [0, 1, 2, 3, 4];
    }

    // Apply columnSearch if present
    if (columnSearch.trim()) {
      const q = columnSearch.toLowerCase();
      const matched = allHeaders
        .map((h, i) => ({ header: h, index: i }))
        .filter((item) => item.header.toLowerCase().includes(q))
        .map((item) => item.index);

      // Include always Timestamp (0), Email (1), Score (2) plus matching
      const set = new Set([0, 1, 2, ...matched]);
      return Array.from(set).sort((a, b) => a - b);
    }

    return indexes;
  }, [sheetData.headers, columnPreset, selectedColumnIndexes, columnSearch]);

  // Filtered Rows based on Search Query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return localRows.map((r, i) => ({ row: r, originalIndex: i }));
    const q = searchQuery.toLowerCase();
    return localRows
      .map((row, i) => ({ row, originalIndex: i }))
      .filter(({ row }) =>
        row.some((cell) => cell && cell.toLowerCase().includes(q))
      );
  }, [localRows, searchQuery]);

  // Statistics
  const totalSubmissions = localRows.length;
  const totalQuestions = sheetData.headers.length;
  const uniqueEmails = useMemo(() => {
    const emails = localRows.map((r) => r[1]).filter(Boolean);
    return new Set(emails).size;
  }, [localRows]);

  const sheetMeta = useMemo(() => {
    let raw = (sheetData.url || '').trim();
    if (!raw) return null;

    if (raw.toLowerCase().includes('<iframe')) {
      const srcMatch = raw.match(/src\s*=\s*["']([^"']+)["']/i);
      if (srcMatch && srcMatch[1]) {
        raw = srcMatch[1].replace(/&amp;/g, '&').trim();
      }
    }

    const lower = raw.toLowerCase();
    const isExcel =
      sheetData.provider === 'excel' ||
      lower.includes('1drv.ms') ||
      lower.includes('onedrive.live.com') ||
      lower.includes('sharepoint.com') ||
      lower.includes('sharepoint-df.com') ||
      lower.includes('view.officeapps.live.com') ||
      /\.(xlsx|xls|xlsm|xlsb|ods)(\?|$|#)/i.test(lower);

    if (isExcel) {
      // Build fallback client-side Microsoft embed & Office viewer URLs if server fields absent
      let clientEmbed = sheetData.embedUrl || '';
      let clientOffice = sheetData.officeViewerUrl || '';

      if (!clientEmbed) {
        if (lower.includes('onedrive.live.com') && (lower.includes('edit.aspx') || lower.includes('view.aspx'))) {
          clientEmbed = raw.replace(/\/(edit|view)\.aspx/i, '/embed');
          if (!clientEmbed.includes('em=')) {
            clientEmbed += (clientEmbed.includes('?') ? '&' : '?') + 'em=2&wdAllowInteractivity=True';
          }
        } else if (lower.includes('sharepoint.com') && (lower.includes('doc.aspx') || lower.includes('wopiframe.aspx'))) {
          try {
            const u = new URL(raw);
            u.searchParams.set('action', 'embedview');
            u.searchParams.set('wdAllowInteractivity', 'True');
            clientEmbed = u.toString();
          } catch {
            clientEmbed = raw;
          }
        } else if (lower.includes('sharepoint.com')) {
          try {
            const u = new URL(raw);
            u.searchParams.set('action', 'embedview');
            clientEmbed = u.toString();
          } catch {
            clientEmbed = raw;
          }
        } else if (lower.includes('view.officeapps.live.com')) {
          clientEmbed = raw.replace(/\/op\/view\.aspx/i, '/op/embed.aspx');
        } else {
          clientEmbed = raw;
        }
      }

      if (!clientOffice) {
        if (lower.includes('view.officeapps.live.com')) {
          clientOffice = raw.replace(/\/op\/view\.aspx/i, '/op/embed.aspx');
        } else if (lower.includes('sharepoint.com')) {
          try {
            const u = new URL(raw);
            u.searchParams.set('download', '1');
            clientOffice = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(u.toString())}`;
          } catch {
            clientOffice = '';
          }
        } else if (/\.(xlsx|xls|xlsm|xlsb|ods)(\?|$|#)/i.test(lower)) {
          clientOffice = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(raw)}`;
        }
      }

      return {
        provider: 'excel' as const,
        type: 'excel' as const,
        id: null,
        gid: null,
        rawUrl: raw,
        microsoftEmbedUrl: clientEmbed || raw,
        officeViewerUrl: clientOffice || clientEmbed || raw
      };
    }

    let gid: string | null = null;
    const gidMatch = raw.match(/[?&#]gid=([0-9]+)/);
    if (gidMatch && gidMatch[1]) gid = gidMatch[1];

    // Check published Google Sheet link: /spreadsheets/d/e/([a-zA-Z0-9-_]+)
    const pubMatch = raw.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
    if (pubMatch && pubMatch[1]) {
      return {
        provider: 'google' as const,
        type: 'published' as const,
        id: pubMatch[1],
        gid,
        rawUrl: raw,
        microsoftEmbedUrl: '',
        officeViewerUrl: ''
      };
    }

    // Standard Google Sheet link: /spreadsheets/d/([a-zA-Z0-9-_]+) (where id is not 'e')
    const docMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (docMatch && docMatch[1] && docMatch[1] !== 'e') {
      return {
        provider: 'google' as const,
        type: 'standard' as const,
        id: docMatch[1],
        gid,
        rawUrl: raw,
        microsoftEmbedUrl: '',
        officeViewerUrl: ''
      };
    }

    return {
      provider: 'unknown' as const,
      type: 'raw' as const,
      id: null,
      gid,
      rawUrl: raw,
      microsoftEmbedUrl: '',
      officeViewerUrl: ''
    };
  }, [sheetData.url, sheetData.provider, sheetData.embedUrl, sheetData.officeViewerUrl]);

  const iframeSrc = useMemo(() => {
    if (!sheetMeta) return null;

    if (sheetMeta.provider === 'excel') {
      if (excelViewMode === 'office') {
        return sheetMeta.officeViewerUrl || sheetMeta.microsoftEmbedUrl;
      }
      if (excelViewMode === 'microsoft') {
        return sheetMeta.microsoftEmbedUrl || sheetMeta.officeViewerUrl;
      }
      return sheetMeta.microsoftEmbedUrl || sheetMeta.officeViewerUrl;
    }

    if (sheetMeta.type === 'published') {
      return `https://docs.google.com/spreadsheets/d/e/${sheetMeta.id}/pubhtml${
        sheetMeta.gid ? `?gid=${sheetMeta.gid}&single=true` : '?widget=true&headers=false'
      }`;
    }

    if (sheetMeta.type === 'standard') {
      if (embedMode === 'preview') {
        return `https://docs.google.com/spreadsheets/d/${sheetMeta.id}/preview${
          sheetMeta.gid ? `?gid=${sheetMeta.gid}` : ''
        }`;
      }
      if (embedMode === 'pubhtml') {
        return `https://docs.google.com/spreadsheets/d/${sheetMeta.id}/pubhtml${
          sheetMeta.gid ? `?gid=${sheetMeta.gid}` : ''
        }`;
      }
      return `https://docs.google.com/spreadsheets/d/${sheetMeta.id}/edit?rm=embedded${
        sheetMeta.gid ? `&gid=${sheetMeta.gid}` : ''
      }`;
    }

    return sheetMeta.rawUrl;
  }, [sheetMeta, embedMode, excelViewMode]);

  const getExcelColLetter = (index: number) => {
    let col = '';
    let n = index + 1;
    while (n > 0) {
      const rem = (n - 1) % 26;
      col = String.fromCharCode(65 + rem) + col;
      n = Math.floor((n - 1) / 26);
    }
    return col;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-white">Spreadsheet Data Board</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  sheetMeta?.provider === 'excel'
                    ? 'bg-blue-950/60 text-blue-300 border-blue-800'
                    : 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                }`}>
                  {sheetMeta?.provider === 'excel'
                    ? 'Microsoft Excel Online'
                    : sheetMeta?.provider === 'google'
                    ? 'Google Sheets'
                    : 'Google Sheets & Excel Online'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect, edit, search, and synchronize spreadsheets from Google Sheets or Microsoft Excel Online (OneDrive / SharePoint).
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {sheetData.url ? (
            <a
              href={sheetData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {sheetMeta?.provider === 'excel'
                  ? 'Open in Excel Online'
                  : sheetMeta?.provider === 'google'
                  ? 'Open in Google Sheets'
                  : 'Open Spreadsheet'}
              </span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setEditingUrl(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Paste Spreadsheet Link</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSync()}
            disabled={syncing || loading || !sheetData.url}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors disabled:opacity-50"
            title={sheetData.url ? 'Fetch the latest live rows from your connected spreadsheet' : 'Paste and save a spreadsheet link first to sync'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Spreadsheet'}</span>
          </button>

          {editedCells.size > 0 && (
            <>
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-red-400 border border-red-900/50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>Discard ({editedCells.size})</span>
              </button>

              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02]"
              >
                <Save className="w-4 h-4" />
                <span>{saving ? 'Saving...' : `Save Changes (${editedCells.size})`}</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setNewRowData({
                0: new Date().toLocaleString(),
                1: '',
                2: '0 / 100'
              });
              setAddRowModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
          >
            <Plus className="w-4 h-4" />
            <span>Add Row</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Download table data as CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Spreadsheet Connection & Link Management Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 transition-all shadow-xl">
        {editingUrl || !sheetData.url ? (
          <form onSubmit={handleSaveUrl} className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Link2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {sheetData.url
                    ? 'Change Spreadsheet Link (Google Sheets / Microsoft Excel Online)'
                    : 'Connect Your Spreadsheet (Google Sheets or Microsoft Excel Online)'}
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Supports Google Sheets, OneDrive (1drv.ms), SharePoint Excel, or iframe embed snippets
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Paste Google Sheets URL, OneDrive / SharePoint Excel Online URL, or <iframe> embed code..."
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={urlSaving}
                  className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 flex-shrink-0 transition-all"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{urlSaving ? 'Connecting...' : 'Save & Connect'}</span>
                </button>
                {sheetData.url && (
                  <button
                    type="button"
                    onClick={() => {
                      setSheetUrlInput(sheetData.url || '');
                      setEditingUrl(false);
                    }}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-start gap-1.5 leading-relaxed">
              <Info className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <span>
                Ensure your <strong>Google Sheet</strong> or <strong>Microsoft Excel Online</strong> (OneDrive / SharePoint) file is shared as{' '}
                <strong>"Anyone with the link can view"</strong> (or paste the File &gt; Share &gt; Embed URL) so Proctor+ can synchronize and display it cleanly.
              </span>
            </div>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className={`p-2.5 rounded-xl border flex-shrink-0 ${
                sheetMeta?.provider === 'excel'
                  ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              }`}>
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${
                    sheetMeta?.provider === 'excel' ? 'text-blue-400' : 'text-emerald-400'
                  }`}>
                    {sheetMeta?.provider === 'excel'
                      ? 'Linked Microsoft Excel Online'
                      : sheetMeta?.provider === 'google'
                      ? 'Linked Google Sheet'
                      : 'Linked Spreadsheet'}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-slate-400">Connected</span>
                </div>
                <div className="text-xs font-mono text-slate-200 truncate max-w-xl mt-0.5" title={sheetData.url}>
                  {sheetData.url}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setSheetUrlInput(sheetData.url);
                  setEditingUrl(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors text-xs font-semibold"
                title="Change or update the linked spreadsheet URL"
              >
                <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Change Link</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  if (window.confirm('Disconnect this spreadsheet link?')) {
                    setSheetUrlInput('');
                    await saveSheetUrl('');
                    setSheetData((prev) => ({
                      ...prev,
                      url: '',
                      provider: 'unknown',
                      embedUrl: '',
                      officeViewerUrl: '',
                      sheets: []
                    }));
                    showToast('Spreadsheet disconnected.');
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-red-400 border border-slate-800 transition-colors text-xs"
                title="Disconnect spreadsheet"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications / Alerts */}
      {successMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Metrics Banner */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Submissions / Records
          </span>
          <div className="text-2xl font-black text-white mt-1">{totalSubmissions}</div>
          <span className="text-[10px] text-slate-500 mt-1 block">Responses recorded</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Assessment Columns
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1">
            {totalQuestions || 325}
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block">Questions &amp; fields</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Unique Examinees
          </span>
          <div className="text-2xl font-black text-emerald-400 mt-1">{uniqueEmails}</div>
          <span className="text-[10px] text-slate-500 mt-1 block">Distinct email accounts</span>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            Spreadsheet Sync Status
          </span>
          <div className="text-xs font-bold text-white mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              {sheetData.lastSyncedAt
                ? new Date(sheetData.lastSyncedAt).toLocaleTimeString()
                : 'Not Synced'}
            </span>
          </div>
          <span className="text-[10px] text-slate-500 mt-1 block truncate">
            {editedCells.size > 0 ? `${editedCells.size} uncommitted edits` : 'In sync with database'}
          </span>
        </div>
      </div>

      {/* Worksheet Tabs (For multi-sheet Excel workbooks) */}
      {sheetData.sheets && sheetData.sheets.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 shrink-0">
            Workbook Tabs:
          </span>
          {sheetData.sheets.map((ws) => {
            const isSelected = (activeWorksheetName || sheetData.sheets?.[0]?.name) === ws.name;
            return (
              <button
                key={ws.name}
                type="button"
                onClick={() => handleSwitchWorksheet(ws.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors shrink-0 ${
                  isSelected
                    ? 'bg-blue-600/25 border-blue-500/60 text-blue-300'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {ws.name} ({ws.rows.length})
              </button>
            );
          })}
        </div>
      )}

      {/* View Switcher Tabs: Data Board vs Embedded Spreadsheet */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('board')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'board'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Table className="w-4 h-4" />
            <span>Editable Data Board</span>
            {editedCells.size > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('embed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'embed'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            <span>Spreadsheet Live Frame</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 hidden sm:block">
          Double-click any cell on the board to edit inline
        </div>
      </div>

      {/* =========================================================
          TAB 1: EDITABLE DATA BOARD
         ========================================================= */}
      {activeTab === 'board' && (
        <div className="space-y-4">
          {/* Controls & Search Bar */}
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row gap-3 items-center justify-between">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search examinee email, score, timestamp, or any answer text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Question / Column Search Filter */}
            <div className="relative w-full md:w-64">
              <SlidersHorizontal className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter questions (e.g. SSS, leave)..."
                value={columnSearch}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
              />
              {columnSearch && (
                <button
                  type="button"
                  onClick={() => setColumnSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Column Presets */}
            <div className="flex items-center gap-1.5 w-full md:w-auto justify-end">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">
                Columns:
              </span>
              <button
                type="button"
                onClick={() => setColumnPreset('key')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  columnPreset === 'key'
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                Key (8)
              </button>
              <button
                type="button"
                onClick={() => setColumnPreset('all')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  columnPreset === 'all'
                    ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                All ({sheetData.headers.length || 325})
              </button>
            </div>
          </div>

          {/* Table Container with Sticky Columns */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/90 overflow-hidden shadow-2xl">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 select-none">
                <div className="relative w-16 h-16 rounded-full border-2 border-emerald-500/60 p-0.5 bg-slate-900 shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                  <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 border-r-blue-400 animate-spin" />
                  <img
                    src="/logo.png"
                    alt="Loading..."
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover rounded-full animate-spin-slow pointer-events-none"
                  />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Loading spreadsheet data...</p>
                  <p className="text-xs text-slate-400">Retrieving workbook sheets, columns, and records</p>
                </div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
                  <Table className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white">No Matching Records Found</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {searchQuery
                    ? `No submissions match "${searchQuery}". Try a different keyword or clear search.`
                    : 'No records exist in this spreadsheet yet. Click "Add Row" or "Sync Spreadsheet".'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[640px] relative scrollbar-thin scrollbar-thumb-slate-700">
                <table className="w-full text-left border-collapse text-xs">
                  {/* Table Header */}
                  <thead className="bg-slate-950/95 sticky top-0 z-10 border-b border-slate-800 text-[11px] font-bold text-slate-300 backdrop-blur-md">
                    <tr>
                      {/* Row # & Actions sticky column */}
                      <th className="py-3 px-3 w-16 sticky left-0 z-20 bg-slate-950 border-r border-slate-800 text-center">
                        #
                      </th>
                      <th className="py-3 px-3 w-28 sticky left-16 z-20 bg-slate-950 border-r border-slate-800">
                        Actions
                      </th>

                      {/* Visible Columns */}
                      {visibleColumnIndexes.map((colIdx) => {
                        const headerText = sheetData.headers[colIdx] || `Col ${colIdx + 1}`;
                        const isScoreCol = colIdx === 2 || headerText.toLowerCase().includes('score');
                        return (
                          <th
                            key={colIdx}
                            className={`py-3 px-4 border-r border-slate-800/60 min-w-[200px] max-w-[320px] select-none ${
                              isScoreCol ? 'min-w-[120px]' : ''
                            }`}
                            title={`Column #${colIdx + 1}: ${headerText}`}
                          >
                            <div className="flex items-center gap-1.5 text-slate-400 text-[9px] uppercase tracking-wider mb-0.5">
                              <span>Col {colIdx + 1}</span>
                              {colIdx === 0 && <span className="text-emerald-400 font-bold">• Time</span>}
                              {colIdx === 1 && <span className="text-emerald-400 font-bold">• Email</span>}
                              {isScoreCol && <span className="text-amber-400 font-bold">• Score</span>}
                            </div>
                            <div className="truncate font-semibold text-slate-200">
                              {headerText}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredRows.map(({ row, originalIndex }) => {
                      const email = row[1] || 'Anonymous';
                      const score = row[2] || '—';

                      return (
                        <tr
                          key={originalIndex}
                          className="hover:bg-slate-800/40 transition-colors group"
                        >
                          {/* Row Number (Sticky Left) */}
                          <td className="py-3 px-3 sticky left-0 z-10 bg-slate-900/95 group-hover:bg-slate-800/90 border-r border-slate-800 text-center font-mono text-slate-400 font-bold">
                            {originalIndex + 1}
                          </td>

                          {/* Quick Actions (Sticky Left) */}
                          <td className="py-3 px-3 sticky left-16 z-10 bg-slate-900/95 group-hover:bg-slate-800/90 border-r border-slate-800">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setInspectRowIndex(originalIndex);
                                  setInspectSearch('');
                                }}
                                className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20 transition-colors"
                                title="Inspect all 325 questions and answers for this examinee"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmIndex(originalIndex)}
                                className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/20 transition-colors"
                                title="Delete this record"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* Render Cells */}
                          {visibleColumnIndexes.map((colIdx) => {
                            const val = row[colIdx] || '';
                            const cellKey = `${originalIndex}-${colIdx}`;
                            const isEdited = editedCells.has(cellKey);
                            const isEditing =
                              editingCell?.rowIdx === originalIndex &&
                              editingCell?.colIdx === colIdx;

                            if (isEditing) {
                              return (
                                <td
                                  key={colIdx}
                                  className="p-1.5 border-r border-slate-800/60 bg-slate-900/60"
                                >
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingCell.val}
                                      onChange={(e) =>
                                        setEditingCell({
                                          ...editingCell,
                                          val: e.target.value
                                        })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCommitEdit();
                                        if (e.key === 'Escape') handleCancelEdit();
                                      }}
                                      className="w-full px-2 py-1 bg-slate-950 border border-emerald-500 rounded text-xs text-white focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={handleCommitEdit}
                                      className="p-1 rounded bg-emerald-600 text-white hover:bg-emerald-500"
                                      title="Save edit"
                                    >
                                      <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEdit}
                                      className="p-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700"
                                      title="Cancel"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                </td>
                              );
                            }

                            return (
                              <td
                                key={colIdx}
                                onDoubleClick={() =>
                                  handleStartEdit(originalIndex, colIdx, val)
                                }
                                className={`py-3 px-4 border-r border-slate-800/60 max-w-[320px] relative group/cell cursor-pointer hover:bg-slate-800/70 transition-colors ${
                                  isEdited ? 'bg-amber-500/10' : ''
                                }`}
                                title="Double-click to edit cell"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span
                                    className={`truncate block ${
                                      colIdx === 1
                                        ? 'font-bold text-white'
                                        : colIdx === 2
                                        ? 'font-bold text-amber-300'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {val || <span className="text-slate-600 italic">—</span>}
                                  </span>

                                  {isEdited && (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0"
                                      title="Cell modified locally"
                                    />
                                  )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Table Footer Bar */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <span>
                  Showing{' '}
                  <strong className="text-white">{filteredRows.length}</strong> of{' '}
                  <strong className="text-white">{localRows.length}</strong> rows
                </span>
                <span>•</span>
                <span>
                  Displaying{' '}
                  <strong className="text-emerald-400">
                    {visibleColumnIndexes.length}
                  </strong>{' '}
                  columns of {sheetData.headers.length || 325} total
                </span>
              </div>

              {editedCells.size > 0 && (
                <div className="flex items-center gap-2 text-amber-400 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>{editedCells.size} unsaved cell edits</span>
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="ml-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold"
                  >
                    Save All
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          TAB 2: EMBEDDED SPREADSHEET LIVE VIEW (GOOGLE SHEETS & EXCEL ONLINE)
         ========================================================= */}
      {activeTab === 'embed' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-white flex items-center gap-2">
                <span>
                  {sheetMeta?.provider === 'excel'
                    ? 'Microsoft Excel Online Live View'
                    : sheetMeta?.provider === 'google'
                    ? 'Embedded Google Spreadsheet'
                    : 'Live Spreadsheet Frame'}
                </span>
                <span className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${
                  sheetMeta?.provider === 'excel'
                    ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                }`}>
                  {sheetMeta?.provider === 'excel'
                    ? 'Excel Online / OneDrive'
                    : sheetMeta?.type === 'published'
                    ? 'Published Web'
                    : 'Google Docs Embed'}
                </span>
              </div>
              <p className="text-slate-400">
                {sheetMeta?.provider === 'excel'
                  ? 'View your synced Microsoft Excel Online workbook directly or switch to Office Web Viewer / Microsoft Embed frames.'
                  : 'Live interactive Google Sheet view. Switch embed mode below if your browser blocks specific frame headers.'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Embed Mode Selector (tailored per provider) */}
              {sheetMeta?.provider === 'excel' ? (
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setExcelViewMode('native')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      excelViewMode === 'native'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Built-in Spreadsheet Grid — Always works even when Microsoft CSP blocks third-party iframes"
                  >
                    Live Workbook Grid
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcelViewMode('office')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      excelViewMode === 'office'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Microsoft Office Web Viewer iframe (view.officeapps.live.com)"
                  >
                    Office Web Viewer
                  </button>
                  <button
                    type="button"
                    onClick={() => setExcelViewMode('microsoft')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      excelViewMode === 'microsoft'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Direct OneDrive / SharePoint Embed Frame"
                  >
                    Microsoft Embed
                  </button>
                </div>
              ) : (
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setEmbedMode('preview')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      embedMode === 'preview'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Interactive Google Sheet Preview (Highest compatibility, avoids SAMEORIGIN blocks)"
                  >
                    Preview Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbedMode('pubhtml')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      embedMode === 'pubhtml'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Published Web View (Formatted HTML table)"
                  >
                    Published Web
                  </button>
                  <button
                    type="button"
                    onClick={() => setEmbedMode('edit')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      embedMode === 'edit'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                    title="Edit Widget (Requires Google account sign-in and third-party cookies enabled)"
                  >
                    Edit Frame
                  </button>
                </div>
              )}

              {/* Refresh Button */}
              {sheetMeta && (
                <button
                  type="button"
                  onClick={() => {
                    if (sheetMeta.provider === 'excel' && excelViewMode === 'native') {
                      handleSync();
                    } else {
                      setEmbedKey((k) => k + 1);
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors text-xs font-semibold"
                  title="Reload live spreadsheet view"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${syncing ? 'animate-spin' : ''}`} />
                  <span>{sheetMeta.provider === 'excel' && excelViewMode === 'native' ? 'Sync Now' : 'Reload'}</span>
                </button>
              )}

              {sheetData.url && (
                <a
                  href={sheetData.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold transition-colors flex-shrink-0 shadow-md shadow-emerald-600/20"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{sheetMeta?.provider === 'excel' ? 'Open in Excel Online' : 'Open in Google Sheets'}</span>
                </a>
              )}
            </div>
          </div>

          {/* Excel Built-in Live Workbook Grid View OR Iframe Embed */}
          {sheetMeta?.provider === 'excel' && excelViewMode === 'native' ? (
            <div className="space-y-3">
              <div className="rounded-3xl border border-slate-800 bg-slate-950 overflow-hidden shadow-2xl flex flex-col">
                {/* Native Excel Toolbar */}
                <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-bold">
                      Synced Excel Workbook
                    </span>
                    {sheetData.sheets && sheetData.sheets.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {sheetData.sheets.map((ws) => {
                          const isCurrent = (activeWorksheetName || sheetData.sheets?.[0]?.name) === ws.name;
                          return (
                            <button
                              key={ws.name}
                              type="button"
                              onClick={() => handleSwitchWorksheet(ws.name)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                                isCurrent
                                  ? 'bg-emerald-600 text-white border-emerald-500'
                                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                              }`}
                            >
                              {ws.name}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">Sheet1</span>
                    )}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={nativeSearch}
                      onChange={(e) => setNativeSearch(e.target.value)}
                      placeholder="Filter workbook rows..."
                      className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Spreadsheet Grid Body */}
                {syncing ? (
                  <div className="py-24 text-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
                    <p className="text-sm font-bold text-white">Syncing Excel Online Workbook...</p>
                    <p className="text-xs text-slate-400">Downloading worksheets and formatting cells</p>
                  </div>
                ) : sheetData.headers.length === 0 && localRows.length === 0 ? (
                  <div className="py-20 px-6 text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mx-auto text-blue-400">
                      <FileSpreadsheet className="w-7 h-7" />
                    </div>
                    <div className="space-y-1.5 max-w-md mx-auto">
                      <h3 className="text-sm font-bold text-white">Excel Workbook Not Synced Yet</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Click <strong>Sync Now</strong> to load all worksheets and rows from your shared Excel link, or switch to <strong>Office Web Viewer</strong> / <strong>Microsoft Embed</strong> above.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSync()}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Sync Excel Now</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcelViewMode('office')}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700"
                      >
                        Try Office Web Viewer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[680px]">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700">
                        <tr>
                          <th className="py-1.5 px-3 w-12 bg-slate-950 border-r border-slate-800 text-center text-[10px] font-mono text-slate-500">
                            #
                          </th>
                          {sheetData.headers.map((h, i) => (
                            <th
                              key={i}
                              className="py-2 px-3 border-r border-slate-800 bg-slate-900 min-w-[140px] max-w-[300px]"
                            >
                              <div className="text-[9px] font-mono text-blue-400 uppercase mb-0.5">
                                {getExcelColLetter(i)}
                              </div>
                              <div className="font-bold text-slate-100 truncate" title={h}>
                                {h || `Column ${i + 1}`}
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {localRows
                          .filter((row) => {
                            if (!nativeSearch.trim()) return true;
                            const q = nativeSearch.toLowerCase();
                            return row.some((cell) => cell && cell.toLowerCase().includes(q));
                          })
                          .map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-900/70 transition-colors">
                              <td className="py-2 px-3 bg-slate-950/90 border-r border-slate-800 text-center font-mono text-[11px] text-slate-500">
                                {rIdx + 1}
                              </td>
                              {sheetData.headers.map((_, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="py-2 px-3 border-r border-slate-800/60 text-slate-300 max-w-[300px] truncate"
                                  title={row[cIdx] || ''}
                                >
                                  {row[cIdx] || <span className="text-slate-700">—</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>
                    <strong>Live Workbook Grid:</strong> Displays your shared Excel workbook cleanly inside Proctor+, bypassing Microsoft OneDrive/SharePoint iframe restrictions.
                  </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 shrink-0">
                  <span>{localRows.length} rows</span>
                  <span>•</span>
                  <span>{sheetData.headers.length} columns</span>
                </div>
              </div>
            </div>
          ) : iframeSrc ? (
            <div className="space-y-3">
              <div className="w-full h-[750px] rounded-3xl border border-slate-800 overflow-hidden bg-slate-950 shadow-2xl relative">
                <iframe
                  key={`${embedKey}-${excelViewMode}-${embedMode}`}
                  src={iframeSrc}
                  className="w-full h-full border-0"
                  title="Spreadsheet Embedded Live View"
                  allowFullScreen
                  loading="lazy"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-emerald-400 shrink-0" />
                  {sheetMeta?.provider === 'excel' ? (
                    <span>
                      <strong>Excel Frame Notice:</strong> If Microsoft displays <em>"refused to connect"</em> or a blank area due to OneDrive/SharePoint CSP rules, click{' '}
                      <button
                        type="button"
                        onClick={() => setExcelViewMode('native')}
                        className="text-emerald-400 underline font-bold hover:text-emerald-300"
                      >
                        Live Workbook Grid
                      </button>{' '}
                      to view the synced Excel spreadsheet directly.
                    </span>
                  ) : (
                    <span>
                      <strong>Frame Notice:</strong> If Google displays a blank page or <em>"refused to connect"</em>, switch to <strong>Preview Mode</strong> above or click <strong>Open in Google Sheets</strong>.
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 shrink-0">
                  <span>Mode: {(sheetMeta?.provider === 'excel' ? excelViewMode : embedMode).toUpperCase()}</span>
                  {sheetMeta?.provider !== 'excel' && (
                    <>
                      <span>•</span>
                      <span>GID: {sheetMeta?.gid || '0'}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-16 rounded-3xl border border-slate-800 bg-slate-900/60 text-center space-y-4 shadow-xl">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center mx-auto text-emerald-400">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-white">No Spreadsheet Connected</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Paste your Google Sheets or Microsoft Excel Online (OneDrive / SharePoint) link in the connection bar above to view, edit, and interact with your spreadsheet directly inside Proctor+.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingUrl(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all hover:scale-[1.02]"
              >
                Paste Spreadsheet Link
              </button>
            </div>
          )}
        </div>
      )}

      {/* =========================================================
          MODAL: INSPECT ALL 325 ANSWERS OF A SPECIFIC EXAMINEE
         ========================================================= */}
      {inspectRowIndex !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 bg-slate-950/70 flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-600 text-white">
                    Submission #{inspectRowIndex + 1}
                  </span>
                  <h3 className="text-base font-bold text-white">
                    {localRows[inspectRowIndex]?.[1] || 'Examinee Record'}
                  </h3>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  <div>
                    Timestamp:{' '}
                    <strong className="text-white">
                      {localRows[inspectRowIndex]?.[0] || '—'}
                    </strong>
                  </div>
                  <div>
                    Score:{' '}
                    <strong className="text-amber-300">
                      {localRows[inspectRowIndex]?.[2] || '—'}
                    </strong>
                  </div>
                  <div>
                    Total Fields:{' '}
                    <strong className="text-emerald-400">
                      {sheetData.headers.length || 325}
                    </strong>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setInspectRowIndex(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Question Search within Inspect Modal */}
            <div className="p-4 border-b border-slate-800 bg-slate-950/40">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search questions or examinee responses (e.g. paternity, allowance, score)..."
                  value={inspectSearch}
                  onChange={(e) => setInspectSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            {/* Questions & Answers List */}
            <div className="p-6 overflow-y-auto space-y-3 flex-1 scrollbar-thin scrollbar-thumb-slate-700">
              {sheetData.headers.map((question, colIdx) => {
                const answer = localRows[inspectRowIndex]?.[colIdx] || '';
                const qLower = question.toLowerCase();
                const aLower = answer.toLowerCase();
                const sLower = inspectSearch.toLowerCase();

                if (inspectSearch && !qLower.includes(sLower) && !aLower.includes(sLower)) {
                  return null;
                }

                return (
                  <div
                    key={colIdx}
                    className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-2 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {colIdx + 1}
                        </span>
                        <h4 className="text-xs font-semibold text-slate-200 leading-snug">
                          {question}
                        </h4>
                      </div>
                    </div>

                    <div className="pl-8">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800/80 text-xs">
                        <span className="text-[10px] uppercase font-bold text-slate-500 block mb-0.5">
                          Examinee Answer:
                        </span>
                        {answer ? (
                          <span className="text-emerald-300 font-medium whitespace-pre-wrap">
                            {answer}
                          </span>
                        ) : (
                          <span className="text-slate-600 italic">No answer provided / blank</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectRowIndex(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: ADD ROW
         ========================================================= */}
      {addRowModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Add Record to Data Board</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Insert a new response row into the assessment dataset
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAddRowModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddRowSubmit} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Timestamp (Col 1)</label>
                <input
                  type="text"
                  required
                  value={newRowData[0] || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, 0: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Email Address (Col 2)
                </label>
                <input
                  type="email"
                  required
                  placeholder="examinee@company.com"
                  value={newRowData[1] || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, 1: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Score (Col 3)</label>
                <input
                  type="text"
                  placeholder="e.g. 50 / 60"
                  value={newRowData[2] || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, 2: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">
                  Answer for Q1 (Col 4)
                </label>
                <input
                  type="text"
                  placeholder="Answer to question 1"
                  value={newRowData[3] || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, 3: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30"
                />
              </div>

              <p className="text-[11px] text-slate-500 italic">
                Note: All remaining 320 columns will be initialized as empty and can be edited
                directly on the Data Board.
              </p>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAddRowModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-xl font-bold shadow-lg shadow-emerald-600/25"
                >
                  Add Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================
          MODAL: DELETE CONFIRMATION
         ========================================================= */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Record #{deleteConfirmIndex + 1}?</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Examinee: {localRows[deleteConfirmIndex]?.[1] || 'Anonymous'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete this submission record? This will remove the row from the local data board and database.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmIndex(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRow(deleteConfirmIndex)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-600/25"
              >
                Delete Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
