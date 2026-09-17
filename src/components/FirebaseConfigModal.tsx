import React, { useState } from 'react';
import { FirebaseConfig, SystemConfig } from '../types';
import { X, Flame, Server, CheckCircle2, AlertTriangle, Copy, Shield, HelpCircle } from 'lucide-react';
import { updateFirebaseConfig } from '../lib/api';

interface FirebaseConfigModalProps {
  currentConfig?: SystemConfig | null;
  onClose: () => void;
  onUpdated: (config: SystemConfig) => void;
}

export const FirebaseConfigModal: React.FC<FirebaseConfigModalProps> = ({
  currentConfig,
  onClose,
  onUpdated
}) => {
  const [syncMode, setSyncMode] = useState<'server' | 'firebase'>(
    currentConfig?.syncMode || 'server'
  );

  const [apiKey, setApiKey] = useState(currentConfig?.firebase?.apiKey || '');
  const [authDomain, setAuthDomain] = useState(currentConfig?.firebase?.authDomain || '');
  const [databaseURL, setDatabaseURL] = useState(currentConfig?.firebase?.databaseURL || '');
  const [projectId, setProjectId] = useState(currentConfig?.firebase?.projectId || '');
  const [storageBucket, setStorageBucket] = useState(currentConfig?.firebase?.storageBucket || '');
  const [messagingSenderId, setMessagingSenderId] = useState(currentConfig?.firebase?.messagingSenderId || '');
  const [appId, setAppId] = useState(currentConfig?.firebase?.appId || '');

  const [rawJson, setRawJson] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Auto-parse pasted config
  const handleParseJson = () => {
    setJsonError(null);
    try {
      // Clean up js object notation if copied from Firebase console
      let cleaned = rawJson.trim();
      // Match apiKey: "..."
      const extract = (key: string) => {
        const regex = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`, 'i');
        const match = cleaned.match(regex);
        return match ? match[1] : '';
      };

      let parsed: any = {};
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        // Fallback regex parsing for JS objects like { apiKey: '...' }
        parsed = {
          apiKey: extract('apiKey'),
          authDomain: extract('authDomain'),
          databaseURL: extract('databaseURL'),
          projectId: extract('projectId'),
          storageBucket: extract('storageBucket'),
          messagingSenderId: extract('messagingSenderId'),
          appId: extract('appId')
        };
      }

      if (parsed.apiKey) setApiKey(parsed.apiKey);
      if (parsed.authDomain) setAuthDomain(parsed.authDomain);
      if (parsed.databaseURL) setDatabaseURL(parsed.databaseURL);
      if (parsed.projectId) setProjectId(parsed.projectId);
      if (parsed.storageBucket) setStorageBucket(parsed.storageBucket);
      if (parsed.messagingSenderId) setMessagingSenderId(parsed.messagingSenderId);
      if (parsed.appId) setAppId(parsed.appId);

      setSyncMode('firebase');
      setStatusMessage({ text: 'Firebase configuration parsed successfully!', type: 'success' });
    } catch (err: any) {
      setJsonError('Could not parse configuration snippet. Please verify the format or paste individual fields.');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatusMessage(null);
    try {
      const payload = {
        syncMode,
        firebase: {
          apiKey: apiKey.trim(),
          authDomain: authDomain.trim(),
          databaseURL: databaseURL.trim(),
          projectId: projectId.trim(),
          storageBucket: storageBucket.trim(),
          messagingSenderId: messagingSenderId.trim(),
          appId: appId.trim(),
          enabled: syncMode === 'firebase'
        }
      };

      const result = await updateFirebaseConfig(payload);
      onUpdated(result.config);
      setStatusMessage({
        text: syncMode === 'server'
          ? 'System switched to Built-in Multi-PC Server Synchronization.'
          : 'Firebase configuration saved and activated.',
        type: 'success'
      });
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to save configuration', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-8">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold tracking-wider text-orange-400 uppercase">
                DATABASE &amp; SYNC SETTINGS
              </span>
              <h2 className="text-xl font-bold text-white">Firebase &amp; Sync Configuration</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Active Cloud Firestore Database Banner */}
          <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                <span>Google Cloud Database Connected</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-semibold border border-emerald-500/30">
                ONLINE • CLOUD FIRESTORE
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Examination rooms, administrator accounts, examinee submissions, and proctoring logs are persisted in Google Cloud Firestore. Rooms created on this PC are instantly visible to any examinee on other computers, mobile devices, and static deployments (such as GitHub Pages).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 pt-1 border-t border-emerald-900/60">
              <div>
                <span className="text-slate-500">Project:</span> gen-lang-client-0667768884
              </div>
              <div className="truncate">
                <span className="text-slate-500">Database:</span> ai-studio-proctorexaminati-...
              </div>
            </div>
          </div>
          {/* Active Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
              Synchronization Engine
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSyncMode('server')}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  syncMode === 'server'
                    ? 'bg-emerald-950/50 border-emerald-500 ring-1 ring-emerald-500 text-white'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className={`p-2 rounded-lg ${syncMode === 'server' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>Built-in Server Sync</span>
                    {syncMode === 'server' && <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded font-bold">ACTIVE</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">
                    Instant multi-PC sync on this portal. Any computer on the link can join rooms without needing Firebase.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSyncMode('firebase')}
                className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${
                  syncMode === 'firebase'
                    ? 'bg-orange-950/50 border-orange-500 ring-1 ring-orange-500 text-white'
                    : 'bg-slate-800/40 border-slate-700 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className={`p-2 rounded-lg ${syncMode === 'firebase' ? 'bg-orange-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    <span>Custom Firebase RTDB</span>
                    {syncMode === 'firebase' && <span className="text-[10px] bg-orange-500/30 text-orange-300 px-1.5 py-0.5 rounded font-bold">ACTIVE</span>}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-normal">
                    Connect your own external Google Firebase Realtime Database project credentials.
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Paste JSON */}
          <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/70 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Replace Firebase Config with Snippet
              </span>
              <button
                type="button"
                onClick={handleParseJson}
                disabled={!rawJson.trim()}
                className="text-xs font-semibold text-orange-400 hover:text-orange-300 disabled:opacity-40"
              >
                Auto-Extract Fields &gt;
              </button>
            </div>
            <textarea
              rows={3}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
              placeholder='Paste firebaseConfig object from Firebase Console (e.g. const firebaseConfig = { apiKey: "...", ... })'
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-orange-500 resize-none"
            />
            {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
          </div>

          {/* Individual Firebase fields */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Firebase Project Credentials
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">API Key</label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Database URL</label>
                <input
                  type="text"
                  value={databaseURL}
                  onChange={(e) => setDatabaseURL(e.target.value)}
                  placeholder="https://your-project-default-rtdb.firebaseio.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Project ID</label>
                <input
                  type="text"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  placeholder="your-project-id"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Auth Domain</label>
                <input
                  type="text"
                  value={authDomain}
                  onChange={(e) => setAuthDomain(e.target.value)}
                  placeholder="your-project.firebaseapp.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">App ID</label>
                <input
                  type="text"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1:123456789:web:abcdef..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Messaging Sender ID</label>
                <input
                  type="text"
                  value={messagingSenderId}
                  onChange={(e) => setMessagingSenderId(e.target.value)}
                  placeholder="1234567890"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-orange-500"
                />
              </div>
            </div>
          </div>

          {statusMessage && (
            <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                : 'bg-red-950/60 border border-red-800 text-red-300'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <button
            type="button"
            onClick={() => {
              setSyncMode('server');
              setApiKey('');
              setDatabaseURL('');
              setProjectId('');
              setAuthDomain('');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Reset to Built-in Server Sync
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 rounded-xl shadow-lg shadow-orange-600/20 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
