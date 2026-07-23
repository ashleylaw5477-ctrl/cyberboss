import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { dashboardApi, setCsrfToken } from "./api";

const NAV_ITEMS = [
  { id: "home", label: "首页", icon: "home" },
  { id: "diary", label: "日记", icon: "book" },
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
    diary: <DiaryPage onUnauthorized={onUnauthorized} />,
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

function DiaryPage({ onUnauthorized }) {
  const [selectedDate, setSelectedDate] = useState("");
  const loader = useCallback(() => dashboardApi.diary(selectedDate), [selectedDate]);
  const { data, error, loading, refresh } = useRemoteData(loader, [selectedDate], { onUnauthorized });

  useEffect(() => {
    if (data?.date && !selectedDate) setSelectedDate(data.date);
  }, [data?.date, selectedDate]);

  return (
    <PageFrame>
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
    </PageFrame>
  );
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
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-7h6v7" /></>,
    book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22.5Z" /><path d="M20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5a2.5 2.5 0 0 1 2.5 2.5Z" /></>,
    pulse: <><path d="M3 12h4l2-7 4 14 2-7h6" /></>,
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
  };
  return <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">{paths[name] || paths.spark}</svg>;
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
