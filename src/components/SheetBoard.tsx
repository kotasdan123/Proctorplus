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
  AlertCircle
} from 'lucide-react';
import { SheetData } from '../types';
import {
  fetchSheetData,
  syncSheetData,
  saveSheetData,
  addSheetRow,
  deleteSheetRow
} from '../lib/api';

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1Fa_x25xdW0hQP_zWNavmRLaHmpyTHpgUObczmcx-ETE/edit?usp=sharing';

export const SheetBoard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Core sheet data
  const [sheetData, setSheetData] = useState<SheetData>({
    url: DEFAULT_SHEET_URL,
    lastSyncedAt: null,
    headers: [],
    rows: []
  });

  // Track modified rows locally before saving
  const [localRows, setLocalRows] = useState<string[][]>([]);
  const [editedCells, setEditedCells] = useState<Set<string>>(new Set());

  // Active view: 'board' (interactive table) or 'embed' (google sheet iframe)
  const [activeTab, setActiveTab] = useState<'board' | 'embed'>('board');

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
      setLocalRows(data.rows || []);
      setEditedCells(new Set());
    } catch (err: any) {
      setError(err.message || 'Failed to load Google Sheet data.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (editedCells.size > 0) {
      const confirmed = window.confirm(
        'You have unsaved local edits on this board. Syncing from Google Sheet will overwrite local edits. Continue?'
      );
      if (!confirmed) return;
    }

    setSyncing(true);
    setError(null);
    try {
      const data = await syncSheetData(sheetData.url || DEFAULT_SHEET_URL);
      setSheetData(data);
      setLocalRows(data.rows || []);
      setEditedCells(new Set());
      showToast('Successfully synchronized latest data from Google Sheet!');
    } catch (err: any) {
      setError(err.message || 'Failed to synchronize with Google Sheet.');
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
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white">Google Sheet Data Board</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                  Live Response Sheet
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Inspect, edit, search, and synchronize submissions from the linked Google Sheet.
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <a
            href={sheetData.url || DEFAULT_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span>Open in Google Sheets</span>
          </a>

          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-colors disabled:opacity-50"
            title="Fetch the latest live rows from Google Sheets"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-indigo-400' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync from Google'}</span>
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02]"
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
          <div className="text-2xl font-black text-indigo-400 mt-1">
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
            Google Sync Status
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

      {/* View Switcher Tabs: Data Board vs Embedded Sheet */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('board')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'board'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
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
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <ExternalLink className="w-4 h-4" />
            <span>Google Sheet Live Frame</span>
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
                className="w-full pl-9 pr-4 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
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
                className="w-full pl-8 pr-7 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
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
                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
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
                    ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
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
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin text-indigo-400" />
                <p className="text-sm font-semibold text-slate-300">
                  Loading data from Google Sheet...
                </p>
                <p className="text-xs text-slate-500">
                  Retrieving 325 assessment columns and response records
                </p>
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
                    : 'No records exist in this sheet yet. Click "Add Row" or "Sync from Google".'}
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
                              {colIdx === 0 && <span className="text-indigo-400 font-bold">• Time</span>}
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
                                className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 transition-colors"
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
                                  className="p-1.5 border-r border-slate-800/60 bg-indigo-950/40"
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
                                      className="w-full px-2 py-1 bg-slate-950 border border-indigo-500 rounded text-xs text-white focus:outline-none"
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
                  <strong className="text-indigo-400">
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
          TAB 2: EMBEDDED GOOGLE SHEET LIVE VIEW
         ========================================================= */}
      {activeTab === 'embed' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-white flex items-center gap-2">
                <span>Embedded Google Spreadsheet</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px]">
                  Direct Sync
                </span>
              </div>
              <p className="text-slate-400">
                Live Google Docs spreadsheet editor. To enable direct editing here, ensure your Google account has editor permissions.
              </p>
            </div>

            <a
              href={sheetData.url || DEFAULT_SHEET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex-shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open in Full Browser Tab</span>
            </a>
          </div>

          <div className="w-full h-[750px] rounded-3xl border border-slate-800 overflow-hidden bg-slate-950 shadow-2xl relative">
            <iframe
              src={`https://docs.google.com/spreadsheets/d/1Fa_x25xdW0hQP_zWNavmRLaHmpyTHpgUObczmcx-ETE/edit?widget=true&headers=false`}
              className="w-full h-full border-0"
              title="Google Sheet Embedded Data Board"
              allowFullScreen
            />
          </div>
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
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-600 text-white">
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
                    <strong className="text-indigo-400">
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
                  className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
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
                        <span className="w-6 h-6 rounded-lg bg-indigo-950 border border-indigo-800/60 text-indigo-300 font-mono text-[10px] font-bold flex items-center justify-center flex-shrink-0">
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-300 font-semibold block">Score (Col 3)</label>
                <input
                  type="text"
                  placeholder="e.g. 50 / 60"
                  value={newRowData[2] || ''}
                  onChange={(e) => setNewRowData({ ...newRowData, 2: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
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
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-indigo-500"
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
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/25"
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
