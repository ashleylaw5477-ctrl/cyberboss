import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { dashboardApi, setCsrfToken } from "./api";

const NAV_ITEMS = [
  { id: "home", label: "首页", icon: "home" },
  { id: "desk", label: "书桌", icon: "notebook" },
  { id: "activity", label: "轨迹", icon: "pulse" },
  { id: "stickers", label: "表情包", icon: "image" },
];

const ACTIVITY_TYPES = [
  { id: "", label: "全部" },
  { id: "checkin", label: "想起我" },
  { id: "send_message", label: "发消息" },
  { id: "silent", label: "保持安静" },
  { id: "reminder", label: "提醒" },
  { id: "diary_write", label: "日记" },
  { id: "sticker_send", label: "表情包" },
];

const ACTIVITY_META = {
  checkin: { label: "CHECK-IN", icon: "spark", tone: "rose" },
  reminder: { label: "REMINDER", icon: "bell", tone: "amber" },
  send_message: { label: "SEND MESSAGE", icon: "send", tone: "green" },
  silent: { label: "SILENT", icon: "moon", tone: "muted" },
  diary_write: { label: "DIARY", icon: "book", tone: "violet" },
  sticker_send: { label: "STICKER", icon: "image", tone: "blue" },
};

export default function App() {
  const [session, setSession] = useState({
    loading: true,
    configured: true,
    authenticated: false,
    csrf: "",
  });

  const loadSession = useCallback(async () => {
    try {
      const next = await dashboardApi.session();
      setCsrfToken(next.csrf);
      setSession({ loading: false, ...next });
    } catch {
      setSession({
        loading: false,
        configured: true,
        authenticated: false,
        csrf: "",
      });
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  if (session.loading) {
    return <SplashScreen />;
  }
  if (!session.authenticated) {
    return (
      <LoginScreen
        configured={session.configured}
        onAuthenticated={(next) => {
          setCsrfToken(next.csrf);
          setSession({ loading: false, configured: true, ...next });
        }}
      />
    );
  }
  return (
    <DashboardShell
      onUnauthorized={loadSession}
      onLogout={async () => {
        try {
          await dashboardApi.logout();
        } finally {
          setCsrfToken("");
          setSession({ loading: false, configured: true, authenticated: false, csrf: "" });
        }
      }}
    />
  );
}

function SplashScreen() {
  return (
    <main className="splash-screen">
      <BrandMark size="large" />
      <div className="splash-wordmark">KNOX</div>
      <div className="loading-line"><span /></div>
    </main>
  );
}

function LoginScreen({ configured, onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const session = await dashboardApi.login(password);
      onAuthenticated(session);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-glow login-glow-one" />
      <div className="login-glow login-glow-two" />
      <section className="login-card">
        <div className="login-brand">
          <BrandMark size="large" />
          <div>
            <p className="eyebrow">PRIVATE CONSOLE</p>
            <h1>Knox</h1>
          </div>
        </div>
        <div className="login-copy">
          <p className="login-kicker">欢迎回来</p>
          <h2>看看他今天有没有<br />乖乖盯着你。</h2>
          <p>这里装着只属于你们的行动、日记和那些没说出口的沉默。</p>
        </div>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="dashboard-password">访问密码</label>
          <div className="password-field">
            <Icon name="lock" />
            <input
              id="dashboard-password"
              autoComplete="current-password"
              autoFocus
              disabled={!configured || submitting}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入 Zeabur 中设置的密码"
              type="password"
              value={password}
            />
          </div>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          {!configured ? (
            <p className="setup-note">
              请先在 Zeabur Secret 中添加 <code>CYBERBOSS_DASHBOARD_PASSWORD</code>，然后重新部署。
            </p>
          ) : null}
          <button className="primary-button" disabled={!configured || !password || submitting} type="submit">
            <span>{submitting ? "正在确认…" : "进入控制台"}</span>
            <Icon name="arrow" />
          </button>
        </form>
        <p className="privacy-note"><Icon name="shield" /> 登录会安全保留 30 天</p>
      </section>
    </main>
  );
}

function DashboardShell({ onLogout, onUnauthorized }) {
  const [activePage, setActivePage] = useState("home");
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handler = (event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const pageTitle = NAV_ITEMS.find((item) => item.id === activePage)?.label || "首页";
  const page = {
    home: <HomePage onUnauthorized={onUnauthorized} />,
    desk: <DeskPage onUnauthorized={onUnauthorized} />,
    activity: <ActivityPage onUnauthorized={onUnauthorized} />,
    stickers: <StickersPage onUnauthorized={onUnauthorized} />,
  }[activePage];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <BrandMark />
          <div><strong>Knox</strong><span>CYBERBOSS</span></div>
        </div>
        <nav className="sidebar-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <button
              className={activePage === item.id ? "active" : ""}
              key={item.id}
              onClick={() => setActivePage(item.id)}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          {installPrompt ? (
            <button
              className="install-button"
              onClick={async () => {
                await installPrompt.prompt();
                setInstallPrompt(null);
              }}
              type="button"
            >
              <Icon name="download" /> 添加到桌面
            </button>
          ) : null}
          <button className="logout-button" onClick={onLogout} type="button">
            <Icon name="logout" /> 退出登录
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="mobile-header">
          <div className="mobile-brand"><BrandMark size="small" /><strong>Knox</strong></div>
          <span>{pageTitle}</span>
        </header>
        {page}
      </main>
      <nav className="bottom-nav" aria-label="手机导航">
        {NAV_ITEMS.map((item) => (
          <button
            className={activePage === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setActivePage(item.id)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function HomePage({ onUnauthorized }) {
  const { data, error, loading, refresh, refreshing } = useRemoteData(
    dashboardApi.overview,
    [],
    { onUnauthorized, intervalMs: 30_000 }
  );
  if (loading) return <PageSkeleton title="首页" />;
  if (error) return <PageError error={error} onRetry={refresh} />;

  const action = data.lastAction;
  const actionMeta = ACTIVITY_META[action?.type] || ACTIVITY_META.silent;
  return (
    <PageFrame>
      <PageHeading
        eyebrow={formatFullDate(new Date())}
        title={`${greetingForShanghai()}，${data.agent.userName}`}
        subtitle="他还在。这里是今天留下的痕迹。"
        action={<RefreshButton refreshing={refreshing} onClick={refresh} />}
      />

      <section className="status-hero">
        <div className="status-hero-orbit">
          <BrandMark size="hero" />
          <span className={`presence-dot ${data.agent.status}`} />
        </div>
        <div className="status-hero-copy">
          <div className="status-line">
            <span className={`status-pill ${data.agent.status}`}>
              <i /> {data.agent.statusLabel}
            </span>
            <span className="runtime-label">{data.runtime.id === "claudecode" ? "CLAUDE CODE" : "CODEX"}</span>
          </div>
          <h2>{data.agent.name}</h2>
          <p>{data.runtime.model || "使用运行时默认模型"}</p>
          <div className="session-line">
            <Icon name="folder" />
            <span>{data.session.workspaceName || "等待绑定工作区"}</span>
            {data.session.threadId ? <small>THREAD · {shortId(data.session.threadId)}</small> : null}
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <MetricCard
          icon="spark"
          label={`最近一次想起 ${data.agent.userName}`}
          value={data.lastCheckin ? formatRelativeTime(data.lastCheckin.occurredAt) : "还没有记录"}
          detail={data.lastCheckin ? formatDateTime(data.lastCheckin.occurredAt) : `随机间隔 ${data.checkin.minMinutes}–${data.checkin.maxMinutes} 分钟`}
          tone="rose"
        />
        <MetricCard
          icon={actionMeta.icon}
          label="最后动作"
          value={action ? (action.type === "send_message" ? "发来消息" : "保持安静") : "等待下一次动作"}
          detail={action?.summary || "新的行动会自动出现在这里"}
          tone={actionMeta.tone}
        />
        <MetricCard
          icon="book"
          label="日记"
          value={`${data.counts.diaryDays} 天`}
          detail="保留原始 Markdown，只读展示"
          tone="violet"
        />
        <MetricCard
          icon="image"
          label="表情包"
          value={`${data.counts.stickers} 个`}
          detail="可以搜索、上传和整理标签"
          tone="blue"
        />
      </section>

      <section className="section-card upcoming-card">
        <SectionTitle icon="bell" title="接下来" subtitle={`${data.counts.pendingReminders} 条待处理提醒`} />
        {data.reminders.length ? (
          <div className="reminder-list">
            {data.reminders.map((reminder) => (
              <article className="reminder-row" key={reminder.id}>
                <time>{formatTime(reminder.dueAt)}</time>
                <span className="reminder-rail" />
                <div><strong>{reminder.text}</strong><small>{formatDateLabel(reminder.dueAt)}</small></div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState icon="bell" title="暂时没有待处理提醒" text="安静并不意味着他没有在看。" compact />
        )}
      </section>

      <p className="refresh-note">数据于 {formatTime(data.refreshedAt)} 更新 · 每 30 秒自动刷新</p>
    </PageFrame>
  );
}

function DeskPage({ onUnauthorized }) {
  const [section, setSection] = useState("home");
  return (
    <PageFrame>
      <PageHeading
        eyebrow="KNOX'S DESK"
        title="Knox 的书桌"
        subtitle="日记记下发生过什么，笔记留下他真正学会的东西。"
      />
      <nav className="desk-tabs" aria-label="书桌内容">
        {[
          { id: "home", label: "书桌", icon: "desk" },
          { id: "diary", label: "日记", icon: "calendar" },
          { id: "notes", label: "笔记", icon: "notebook" },
        ].map((item) => (
          <button
            aria-current={section === item.id ? "page" : undefined}
            className={section === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setSection(item.id)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {section === "home" ? (
        <DeskOverview onOpen={setSection} onUnauthorized={onUnauthorized} />
      ) : null}
      {section === "diary" ? <DiaryPage embedded onUnauthorized={onUnauthorized} /> : null}
      {section === "notes" ? <NotesShelf onUnauthorized={onUnauthorized} /> : null}
    </PageFrame>
  );
}

function DeskOverview({ onOpen, onUnauthorized }) {
  const { data, error, loading, refresh } = useRemoteData(
    dashboardApi.desk,
    [],
    { onUnauthorized }
  );
  if (loading) return <ContentSkeleton rows={3} />;
  if (error) return <PageError error={error} onRetry={refresh} inline />;
  return (
    <div className="desk-overview">
      <section className="desk-intro">
        <span className="desk-lamp"><Icon name="lamp" /></span>
        <div>
          <p>PRIVATE ARCHIVE</p>
          <h2>今天想翻哪一个抽屉？</h2>
          <span>这里没有待办和统计，只有 Knox 认真留下的东西。</span>
        </div>
      </section>
      <div className="desk-drawers">
        <button className="desk-drawer diary-drawer" onClick={() => onOpen("diary")} type="button">
          <span className="drawer-icon"><Icon name="calendar" /></span>
          <div className="drawer-copy">
            <small>按日期收好 · {data.counts.diaryDays} 天</small>
            <h3>日记</h3>
            {data.latestDiary ? (
              <>
                <strong>{formatLongDate(data.latestDiary.date)}</strong>
                <p>{data.latestDiary.summary || data.latestDiary.title}</p>
              </>
            ) : <p>还没有写下第一天。</p>}
          </div>
          <Icon name="chevron" />
        </button>
        <button className="desk-drawer notes-drawer" onClick={() => onOpen("notes")} type="button">
          <span className="drawer-icon"><Icon name="notebook" /></span>
          <div className="drawer-copy">
            <small>按主题沉淀 · {data.counts.notes} 篇</small>
            <h3>笔记</h3>
            {data.latestNote ? (
              <>
                <strong>{data.latestNote.title}</strong>
                <p>{data.latestNote.summary || "一篇刚整理好的主题笔记。"}</p>
              </>
            ) : <p>第一本薄笔记还在等内容。</p>}
          </div>
          <Icon name="chevron" />
        </button>
      </div>
    </div>
  );
}

function NotesShelf({ onUnauthorized }) {
  const { data, error, loading, refresh } = useRemoteData(
    dashboardApi.notes,
    [],
    { onUnauthorized }
  );
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [returnScroll, setReturnScroll] = useState(0);
  const items = useMemo(() => (data?.items || [])
    .filter((item) => !category || item.category === category)
    .filter((item) => !tag || item.tags.includes(tag)), [data?.items, category, tag]);

  if (selectedId) {
    return (
      <NoteReader
        id={selectedId}
        onBack={() => {
          setSelectedId("");
          window.requestAnimationFrame(() => window.scrollTo({ top: returnScroll, behavior: "auto" }));
        }}
        onUnauthorized={onUnauthorized}
      />
    );
  }

  return (
    <section className="notes-shelf">
      <header className="shelf-heading">
        <div><p>TOPIC NOTEBOOKS</p><h2>主题笔记</h2></div>
        <span className="readonly-badge"><Icon name="eye" /> 首版只读</span>
      </header>
      {data?.categories?.length ? (
        <div className="note-filters" aria-label="按分类筛选">
          <button className={!category ? "active" : ""} onClick={() => setCategory("")} type="button">全部</button>
          {data.categories.map((value) => (
            <button
              className={category === value ? "active" : ""}
              key={value}
              onClick={() => setCategory(value)}
              type="button"
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}
      {data?.tags?.length ? (
        <div className="note-tags" aria-label="按标签筛选">
          {data.tags.map((value) => (
            <button
              className={tag === value ? "active" : ""}
              key={value}
              onClick={() => setTag(tag === value ? "" : value)}
              type="button"
            >
              #{value}
            </button>
          ))}
        </div>
      ) : null}
      {loading ? <ContentSkeleton rows={4} /> : null}
      {error ? <PageError error={error} onRetry={refresh} inline /> : null}
      {!loading && !error && items.length ? (
        <div className="note-grid">
          {items.map((item) => (
            <button
              className={`note-card note-tone-${categoryTone(item.category)}`}
              key={item.id}
              onClick={() => {
                setReturnScroll(window.scrollY);
                setSelectedId(item.id);
                window.scrollTo({ top: 0, behavior: "auto" });
              }}
              type="button"
            >
              <span className="note-spine" />
              <span className="note-card-top">
                <small>{item.category || "未分类"}</small>
                <Icon name="chevron" />
              </span>
              <strong>{item.title}</strong>
              <p>{item.summary || "Knox 没有给这篇笔记写摘要。"}</p>
              <span className="note-card-meta">
                <time>{formatCompactDate(item.updatedAt)}</time>
                <span>{item.tags.slice(0, 2).map((value) => `#${value}`).join(" ")}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {!loading && !error && !items.length ? (
        <EmptyState icon="notebook" title="这个抽屉还是空的" text="Knox 主动整理的主题笔记会出现在这里。" />
      ) : null}
    </section>
  );
}

function NoteReader({ id, onBack, onUnauthorized }) {
  const loader = useCallback(() => dashboardApi.note(id), [id]);
  const { data, error, loading, refresh } = useRemoteData(loader, [id], { onUnauthorized });
  return (
    <article className="note-reader">
      <button className="reader-back" onClick={onBack} type="button">
        <Icon name="back" /> 返回笔记原位置
      </button>
      {loading ? <ContentSkeleton rows={5} /> : null}
      {error ? <PageError error={error} onRetry={refresh} inline /> : null}
      {data ? (
        <div className={`note-paper note-tone-${categoryTone(data.category)}`}>
          <header>
            <p>{data.category || "未分类"}</p>
            <h2>{data.title}</h2>
            <div className="reader-meta">
              <span><Icon name="clock" /> {formatDateTime(data.updatedAt)}</span>
              {data.tags.map((value) => <span key={value}>#{value}</span>)}
            </div>
          </header>
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.body}</ReactMarkdown>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DiaryPage({ onUnauthorized, embedded = false }) {
  const [selectedDate, setSelectedDate] = useState("");
  const loader = useCallback(() => dashboardApi.diary(selectedDate), [selectedDate]);
  const { data, error, loading, refresh } = useRemoteData(loader, [selectedDate], { onUnauthorized });

  useEffect(() => {
    if (data?.date && !selectedDate) setSelectedDate(data.date);
  }, [data?.date, selectedDate]);

  const content = (
    <>
      <PageHeading
        eyebrow="LEDGER OF LIFE"
        title="日记"
        subtitle="按日期翻阅他写下的东西。第一版只读，不会碰坏原文。"
      />
      <section className="diary-toolbar">
        <div className="date-pills">
          {(data?.dates || []).slice(0, 7).map((date) => (
            <button
              className={data?.date === date ? "active" : ""}
              key={date}
              onClick={() => setSelectedDate(date)}
              type="button"
            >
              <strong>{date.slice(8)}</strong>
              <span>{formatWeekday(date)}</span>
            </button>
          ))}
        </div>
        <label className="date-picker">
          <Icon name="calendar" />
          <input
            max="9999-12-31"
            onChange={(event) => setSelectedDate(event.target.value)}
            type="date"
            value={data?.date || selectedDate}
          />
        </label>
      </section>
      {loading ? <ContentSkeleton /> : null}
      {error ? <PageError error={error} onRetry={refresh} inline /> : null}
      {!loading && data ? (
        <article className="diary-paper">
          <header>
            <div>
              <p>{formatLongDate(data.date)}</p>
              <h2>{data.entries[0]?.title || "今天的记录"}</h2>
            </div>
            <span className="readonly-badge"><Icon name="eye" /> 只读</span>
          </header>
          {data.exists ? (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{data.markdown}</ReactMarkdown>
            </div>
          ) : (
            <EmptyState icon="book" title="这一天还没有日记" text="也许他只是还没决定该怎么写。" />
          )}
        </article>
      ) : null}
    </>
  );
  return embedded ? <section className="desk-diary">{content}</section> : <PageFrame>{content}</PageFrame>;
}

function ActivityPage({ onUnauthorized }) {
  const [type, setType] = useState("");
  const loader = useCallback(() => dashboardApi.activity(type), [type]);
  const { data, error, loading, refresh, refreshing } = useRemoteData(loader, [type], { onUnauthorized });
  return (
    <PageFrame>
      <PageHeading
        eyebrow="ACTION LEDGER"
        title="行动轨迹"
        subtitle="每一次醒来、沉默和靠近，都按时间留下。"
        action={<RefreshButton refreshing={refreshing} onClick={refresh} />}
      />
      <div className="filter-strip" role="tablist" aria-label="筛选行动类型">
        {ACTIVITY_TYPES.map((item) => (
          <button
            aria-selected={type === item.id}
            className={type === item.id ? "active" : ""}
            key={item.id || "all"}
            onClick={() => setType(item.id)}
            role="tab"
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {loading ? <ContentSkeleton rows={5} /> : null}
      {error ? <PageError error={error} onRetry={refresh} inline /> : null}
      {!loading && !error && data?.items?.length ? (
        <section className="timeline-list">
          {data.items.map((item, index) => (
            <ActivityRow item={item} key={item.id} last={index === data.items.length - 1} />
          ))}
        </section>
      ) : null}
      {!loading && !error && !data?.items?.length ? (
        <EmptyState icon="pulse" title="这里暂时还很安静" text="下一次 check-in 后，新的行动会出现在这里。" />
      ) : null}
    </PageFrame>
  );
}

function ActivityRow({ item, last }) {
  const meta = ACTIVITY_META[item.type] || ACTIVITY_META.silent;
  return (
    <article className={`timeline-row tone-${meta.tone}`}>
      <div className="timeline-time">
        <strong>{formatTime(item.occurredAt)}</strong>
        <span>{formatCompactDate(item.occurredAt)}</span>
      </div>
      <div className="timeline-marker">
        <span><Icon name={meta.icon} /></span>
        {!last ? <i /> : null}
      </div>
      <div className="timeline-card">
        <div className="timeline-card-top">
          <span>{meta.label}</span>
          <small>{formatRelativeTime(item.occurredAt)}</small>
        </div>
        <h3>{item.title || activityFallbackTitle(item.type)}</h3>
        {item.summary ? <p>{item.summary}</p> : null}
        {item.meta?.dueAt ? (
          <div className="inline-meta"><Icon name="clock" /> 计划于 {formatDateTime(item.meta.dueAt)}</div>
        ) : null}
      </div>
    </article>
  );
}

function StickersPage({ onUnauthorized }) {
  const { data, error, loading, refresh } = useRemoteData(dashboardApi.stickers, [], { onUnauthorized });
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [editing, setEditing] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.items || []).filter((item) => {
      const matchesTag = !activeTag || item.tags.includes(activeTag);
      const haystack = `${item.stickerId} ${item.desc} ${item.tags.join(" ")}`.toLowerCase();
      return matchesTag && (!normalizedQuery || haystack.includes(normalizedQuery));
    });
  }, [activeTag, data?.items, query]);

  return (
    <PageFrame>
      <PageHeading
        eyebrow="STICKER VAULT"
        title="表情包"
        subtitle="给他的情绪找一个准确的表情。删除功能暂时锁住。"
        action={(
          <button className="primary-button compact" onClick={() => setUploading(true)} type="button">
            <Icon name="plus" /> 上传
          </button>
        )}
      />
      <div className="sticker-controls">
        <label className="search-field">
          <Icon name="search" />
          <input onChange={(event) => setQuery(event.target.value)} placeholder="搜索描述、标签或 ID" value={query} />
        </label>
        <div className="tag-strip">
          <button className={!activeTag ? "active" : ""} onClick={() => setActiveTag("")} type="button">全部</button>
          {(data?.tags || []).map((tag) => (
            <button className={activeTag === tag ? "active" : ""} key={tag} onClick={() => setActiveTag(tag)} type="button">
              {tag}
            </button>
          ))}
        </div>
      </div>
      {notice ? <div className="success-notice"><Icon name="check" /> {notice}</div> : null}
      {loading ? <StickerSkeleton /> : null}
      {error ? <PageError error={error} onRetry={refresh} inline /> : null}
      {!loading && !error && filteredItems.length ? (
        <section className="sticker-grid">
          {filteredItems.map((sticker) => (
            <article className="sticker-card" key={sticker.stickerId}>
              <button className="sticker-image" onClick={() => setEditing(sticker)} type="button">
                <img alt={sticker.desc || sticker.stickerId} loading="lazy" src={sticker.mediaUrl} />
                <span className="edit-overlay"><Icon name="edit" /> 整理</span>
              </button>
              <div className="sticker-info">
                <div><strong>{sticker.stickerId}</strong><span>{sticker.desc || "还没有描述"}</span></div>
                <div className="sticker-tags">
                  {sticker.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}
      {!loading && !error && !filteredItems.length ? (
        <EmptyState icon="image" title="没有找到合适的表情" text="换个标签，或者上传一张新的。" />
      ) : null}
      {editing ? (
        <StickerEditDialog
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setNotice("表情包信息已经更新。");
            await refresh();
          }}
          sticker={editing}
        />
      ) : null}
      {uploading ? (
        <StickerUploadDialog
          knownTags={data?.tags || []}
          onClose={() => setUploading(false)}
          onSaved={async (result) => {
            setUploading(false);
            setNotice(result?.deduped ? "这张已经收藏过了，没有重复添加。" : "新的表情包已经收好。");
            await refresh();
          }}
        />
      ) : null}
    </PageFrame>
  );
}

function StickerEditDialog({ sticker, onClose, onSaved }) {
  const [desc, setDesc] = useState(sticker.desc);
  const [tags, setTags] = useState(sticker.tags.join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await dashboardApi.updateSticker(sticker.stickerId, { desc, tags: splitTags(tags) });
      await onSaved();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal onClose={onClose} title="整理表情包">
      <form className="modal-form" onSubmit={handleSubmit}>
        <img className="modal-sticker-preview" alt={sticker.desc} src={sticker.mediaUrl} />
        <FormField label="描述">
          <textarea maxLength={240} onChange={(event) => setDesc(event.target.value)} rows="3" value={desc} />
        </FormField>
        <FormField hint="用逗号分隔，保留 1–3 个" label="标签">
          <input onChange={(event) => setTags(event.target.value)} value={tags} />
        </FormField>
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">取消</button>
          <button
            className="primary-button compact"
            disabled={saving || !desc || splitTags(tags).length < 1 || splitTags(tags).length > 3}
            type="submit"
          >
            {saving ? "保存中…" : "保存修改"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StickerUploadDialog({ knownTags, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [desc, setDesc] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!file) {
      setPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("desc", desc);
      formData.set("tags", JSON.stringify(splitTags(tags)));
      const result = await dashboardApi.uploadSticker(formData);
      await onSaved(result.sticker);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} title="收藏新表情">
      <form className="modal-form" onSubmit={handleSubmit}>
        <label className={`upload-dropzone ${preview ? "has-preview" : ""}`}>
          {preview ? <img alt="上传预览" src={preview} /> : <Icon name="upload" />}
          <strong>{preview ? "换一张图片" : "选择一张图片"}</strong>
          <span>GIF、JPG、PNG 或 WebP · 最大 10 MB</span>
          <input
            accept="image/gif,image/jpeg,image/png,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            type="file"
          />
        </label>
        <FormField label="描述">
          <textarea onChange={(event) => setDesc(event.target.value)} placeholder="具体说说画面和它适合表达什么…" rows="3" value={desc} />
        </FormField>
        <FormField hint="1–3 个，用逗号分隔" label="标签">
          <input onChange={(event) => setTags(event.target.value)} placeholder="例如：开心, 得意" value={tags} />
        </FormField>
        {knownTags.length ? <p className="known-tags">已有标签：{knownTags.slice(0, 8).join(" · ")}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose} type="button">取消</button>
          <button
            className="primary-button compact"
            disabled={saving || !file || !desc || splitTags(tags).length < 1 || splitTags(tags).length > 3}
            type="submit"
          >
            {saving ? "正在处理…" : "收藏起来"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section aria-modal="true" className="modal-card" role="dialog">
        <header><h2>{title}</h2><button aria-label="关闭" onClick={onClose} type="button"><Icon name="close" /></button></header>
        {children}
      </section>
    </div>
  );
}

function FormField({ label, hint, children }) {
  return <label className="form-field"><span>{label}{hint ? <small>{hint}</small> : null}</span>{children}</label>;
}

function PageFrame({ children }) {
  return <div className="page-frame">{children}</div>;
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action ? <div className="page-heading-action">{action}</div> : null}
    </header>
  );
}

function MetricCard({ icon, label, value, detail, tone }) {
  return (
    <article className={`metric-card tone-${tone}`}>
      <span className="metric-icon"><Icon name={icon} /></span>
      <div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div>
    </article>
  );
}

function SectionTitle({ icon, title, subtitle }) {
  return <header className="section-title"><span><Icon name={icon} /></span><div><h2>{title}</h2><p>{subtitle}</p></div></header>;
}

function RefreshButton({ onClick, refreshing }) {
  return (
    <button aria-label="刷新" className={`refresh-button ${refreshing ? "spinning" : ""}`} onClick={onClick} type="button">
      <Icon name="refresh" />
    </button>
  );
}

function EmptyState({ icon, title, text, compact = false }) {
  return (
    <div className={`empty-state ${compact ? "compact" : ""}`}>
      <span><Icon name={icon} /></span><h3>{title}</h3><p>{text}</p>
    </div>
  );
}

function PageSkeleton({ title }) {
  return <PageFrame><PageHeading eyebrow="LOADING" title={title} subtitle="正在把今天的痕迹整理好…" /><ContentSkeleton rows={5} /></PageFrame>;
}

function ContentSkeleton({ rows = 3 }) {
  return <div className="content-skeleton">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

function StickerSkeleton() {
  return <div className="sticker-grid skeleton-grid">{Array.from({ length: 8 }, (_, index) => <span key={index} />)}</div>;
}

function PageError({ error, onRetry, inline = false }) {
  return (
    <div className={`page-error ${inline ? "inline" : ""}`}>
      <span><Icon name="warning" /></span><h2>这里刚刚卡了一下</h2><p>{error.message}</p>
      <button className="ghost-button" onClick={onRetry} type="button">再试一次</button>
    </div>
  );
}

function BrandMark({ size = "normal" }) {
  return (
    <span className={`brand-mark brand-mark-${size}`}>
      <svg aria-hidden="true" viewBox="0 0 64 64">
        <path className="brand-shield" d="M32 7c12 0 23 5.5 30 14.5-1 13.5-6.25 26-16 37-4.5 5-9 9.75-14 14.5-5-4.75-9.5-9.5-14-14.5-9.75-11-15-23.5-16-37C9 12.5 20 7 32 7Z" />
        <path className="brand-eye" d="M11 29c7-6 14-9 21-9s14 3 21 9c-7 9.5-14 14-21 14s-14-4.5-21-14Z" />
        <circle className="brand-pupil" cx="32" cy="29" r="7" />
        <circle className="brand-glint" cx="35" cy="26" r="2" />
        <path className="brand-rose" d="M32 52c-2-10 0-17 7-21 8 3 11 10 10 19-5 4-11 5-17 2Z" />
      </svg>
    </span>
  );
}

function Icon({ name }) {
  const paths = {
    home: <><path d="M3.5 10.5 12 3.7l8.5 6.8" /><path d="M5.8 9.7v10.1h12.4V9.7M9.4 19.8v-6.2h5.2v6.2" /></>,
    book: <><path d="M4.2 5.2A2.7 2.7 0 0 1 6.9 2.5h4.3v17.2H6.9a2.7 2.7 0 0 0-2.7 2.7Z" /><path d="M19.8 5.2a2.7 2.7 0 0 0-2.7-2.7h-4.3v17.2h4.3a2.7 2.7 0 0 1 2.7 2.7Z" /></>,
    notebook: <><rect x="5" y="3" width="15.5" height="18" rx="2.5" /><path d="M8.5 3v18M3.5 7h3M3.5 12h3M3.5 17h3M12 8h5M12 12h5" /></>,
    desk: <><path d="M4 13.5h16M6 13.5V21M18 13.5V21M3 10.5h18l-1.3-5.2a2 2 0 0 0-1.9-1.5H6.2a2 2 0 0 0-1.9 1.5Z" /><path d="M9 7.5h6" /></>,
    lamp: <><path d="M9.5 3h5l2.7 7H6.8ZM12 10v6M8 21h8M9 16h6" /><path d="M17.5 7.5h2a2 2 0 0 1 2 2V12" /></>,
    pulse: <><path d="M3 12h4l2.1-6.7 4 13.4 2-6.7H21" /></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 15-5-5L5 20" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 21h16" /></>,
    logout: <><path d="M10 4H4v16h6M14 8l4 4-4 4m4-4H9" /></>,
    folder: <><path d="M3 6h7l2 2h9v11H3Z" /></>,
    spark: <><path d="m12 2 1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5Z" /><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6Z" /></>,
    moon: <><path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    edit: <><path d="m14 4 6 6L9 21H3v-6Z" /><path d="m12 6 6 6" /></>,
    check: <><path d="m4 12 5 5L20 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5M4 20h16" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a8 8 0 1 1-2-6" /></>,
    warning: <><path d="M12 3 2 21h20ZM12 9v5M12 18h.01" /></>,
    chevron: <><path d="m9 5 7 7-7 7" /></>,
    back: <><path d="m15 18-6-6 6-6M9 12h11" /></>,
  };
  return <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65">{paths[name] || paths.spark}</svg>;
}

function useRemoteData(loader, dependencies, { onUnauthorized, intervalMs = 0 } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true, refreshing: false });
  const refresh = useCallback(async ({ quiet = false } = {}) => {
    setState((current) => ({ ...current, error: null, loading: quiet ? current.loading : !current.data, refreshing: true }));
    try {
      const data = await loader();
      setState({ data, error: null, loading: false, refreshing: false });
      return data;
    } catch (error) {
      if (error.status === 401) onUnauthorized?.();
      setState((current) => ({ ...current, error, loading: false, refreshing: false }));
      return null;
    }
  }, [loader, onUnauthorized]);

  useEffect(() => {
    refresh();
    if (!intervalMs) return undefined;
    const timer = window.setInterval(() => refresh({ quiet: true }), intervalMs);
    return () => window.clearInterval(timer);
    // dependencies are provided by page-level callers to make reload intent explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, intervalMs, ...dependencies]);

  return { ...state, refresh };
}

function splitTags(value) {
  return [...new Set(String(value || "").split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 4);
}

function categoryTone(value) {
  const text = String(value || "");
  if (/Ally|关于|关系|我们/i.test(text)) return "rose";
  if (/游戏|课程|学习/i.test(text)) return "amber";
  if (/前端|设计|代码|技术/i.test(text)) return "violet";
  if (/花园|植物|自然/i.test(text)) return "green";
  if (/复盘|事故|问题/i.test(text)) return "blue";
  const tones = ["rose", "amber", "violet", "green", "blue"];
  const hash = [...text].reduce((total, character) => total + character.codePointAt(0), 0);
  return tones[hash % tones.length];
}

function shortId(value) {
  const text = String(value || "");
  return text.length > 12 ? `${text.slice(0, 6)}…${text.slice(-4)}` : text;
}

function formatRelativeTime(value) {
  const difference = Date.now() - Date.parse(value);
  if (!Number.isFinite(difference)) return "未知时间";
  const minutes = Math.round(Math.abs(difference) / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDateLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date)
    === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(today);
  return sameDay ? "今天" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric" }).format(date);
}

function formatCompactDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatFullDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(value).toUpperCase();
}

function greetingForShanghai() {
  const rawHour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    hour12: false,
  }).format(new Date()));
  const hour = rawHour % 24;
  if (hour < 5) return "夜深了";
  if (hour < 11) return "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
}

function formatLongDate(date) {
  const parsed = new Date(`${date}T12:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(parsed);
}

function formatWeekday(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function activityFallbackTitle(type) {
  return {
    checkin: "又想起你",
    reminder: "安排了一条提醒",
    send_message: "主动发来一条消息",
    silent: "选择保持安静",
    diary_write: "写下一段日记",
    sticker_send: "发送了一个表情包",
  }[type] || "记录了一次行动";
}
