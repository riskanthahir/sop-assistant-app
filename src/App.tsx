import { useCallback, useEffect, useState } from 'react';
import { AccessGate } from './components/AccessGate';
import { ChatView } from './components/ChatView';
import { DebugView } from './components/DebugView';
import { HistoryDrawer } from './components/HistoryDrawer';
import { TopBar } from './components/TopBar';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { TRANSLATIONS } from './i18n';
import type { AppStatusResponse, Language, SavedQA } from './types';

const ACCESS_STORAGE_KEY = 'sop_assistant_access_code';
const HISTORY_STORAGE_KEY = 'sop_assistant_history_v1';
const LANG_STORAGE_KEY = 'sop_assistant_lang';
const THEME_STORAGE_KEY = 'sop_assistant_theme';

function loadSavedHistory(): SavedQA[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedQA[]).slice(0, 20) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [language, setLanguage] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'si' || saved === 'ta' || saved === 'en') return saved;
    } catch {
      // ignore
    }
    return 'en';
  });

  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [route, setRoute] = useState<'chat' | 'debug'>(() =>
    window.location.pathname === '/debug' ? 'debug' : 'chat'
  );

  const [accessCode, setAccessCode] = useState<string>(() => {
    try {
      return localStorage.getItem(ACCESS_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [history, setHistory] = useState<SavedQA[]>(() => loadSavedHistory());
  const [thread, setThread] = useState<SavedQA[]>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const first = loadSavedHistory()[0];
      return first ? [first] : [];
    }
    return [];
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  const [status, setStatus] = useState<AppStatusResponse | null>(null);

  const t = TRANSLATIONS[language];

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [dark]);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_STORAGE_KEY, language);
    } catch {
      // ignore
    }
  }, [language]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(window.location.pathname === '/debug' ? 'debug' : 'chat');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AppStatusResponse | null) => {
        if (!cancelled && data) {
          setStatus(data);
          if (data.appName) {
            document.title = data.appName;
          }
        }
      })
      .catch(() => {
        // Offline or unreachable; saved Q&As remain accessible
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = useCallback((next: 'chat' | 'debug') => {
    setRoute(next);
    const targetPath = next === 'debug' ? '/debug' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  }, []);

  const handleUnlock = (code: string) => {
    setAccessCode(code);
    try {
      localStorage.setItem(ACCESS_STORAGE_KEY, code);
    } catch {
      // ignore
    }
  };

  const handleLock = () => {
    setAccessCode('');
    try {
      localStorage.removeItem(ACCESS_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const handleSaveQA = (qa: SavedQA) => {
    setThread((prev) => {
      const idx = prev.findIndex((item) => item.id === qa.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = qa;
        return next;
      }
      return [...prev, qa];
    });
    setHistory((prev) => {
      const next = [qa, ...prev.filter((item) => item.id !== qa.id)].slice(0, 20);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const handleNewChat = () => {
    setThread([]);
  };

  const handleClearHistory = () => {
    setHistory([]);
    setThread([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const appName = status?.appName || t.appNameFallback;
  const isUnlocked = Boolean(accessCode);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <TopBar
        appName={appName}
        language={language}
        onLanguageChange={setLanguage}
        dark={dark}
        onToggleDark={() => setDark((d) => !d)}
        route={route}
        onNavigate={navigate}
        onOpenHistory={() => setHistoryOpen(true)}
        historyCount={history.length}
        isUnlocked={isUnlocked}
        accessConfigured={status?.accessConfigured ?? true}
        onLock={handleLock}
        t={t}
      />

      {!isUnlocked ? (
        <AccessGate
          appName={appName}
          accessConfigured={status?.accessConfigured ?? true}
          onUnlock={handleUnlock}
          t={t}
        />
      ) : route === 'debug' ? (
        <DebugView
          accessCode={accessCode}
          language={language}
          status={status}
          onBack={() => navigate('chat')}
          onUnauthorized={handleLock}
          t={t}
        />
      ) : (
        <ChatView
          language={language}
          accessCode={accessCode}
          docsCount={status?.docsCount ?? 0}
          reportUrl={status?.reportUrl ?? ''}
          isOnline={isOnline}
          dark={dark}
          thread={thread}
          onSaveQA={handleSaveQA}
          onNewChat={handleNewChat}
          onUnauthorized={handleLock}
          t={t}
        />
      )}

      <HistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        items={history}
        onSelect={(item) => {
          setThread((prev) => (prev.some((x) => x.id === item.id) ? prev : [item]));
          navigate('chat');
        }}
        onClear={handleClearHistory}
        t={t}
      />
    </div>
  );
}
