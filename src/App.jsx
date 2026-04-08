import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";

// ─── MOBILE HOOK ──────────────────────────────────────────────────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return isMobile;
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  todo:        { label: "К выполнению", color: "#94a3b8", bg: "#1e293b", dot: "#64748b" },
  in_progress: { label: "В работе",     color: "#38bdf8", bg: "#0c2a3d", dot: "#0ea5e9" },
  review:      { label: "На проверке",  color: "#f59e0b", bg: "#2d1f04", dot: "#d97706" },
  done:        { label: "Готово",       color: "#4ade80", bg: "#052e16", dot: "#16a34a" },
};

const PRIORITY_CONFIG = {
  low:    { label: "Низкий",  color: "#64748b" },
  medium: { label: "Средний", color: "#f59e0b" },
  high:   { label: "Высокий", color: "#ef4444" },
};

const SORT_OPTIONS = [
  { value: "created_desc",  label: "Дата создания ↓" },
  { value: "created_asc",   label: "Дата создания ↑" },
  { value: "deadline_asc",  label: "Дедлайн ↑" },
  { value: "deadline_desc", label: "Дедлайн ↓" },
  { value: "priority_desc", label: "Приоритет ↓" },
  { value: "priority_asc",  label: "Приоритет ↑" },
];

const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 };

const SAMPLE_TASKS = [
  { id: 1, title: "Разработать дизайн главной страницы", project: "Сайт компании",        status: "done",        priority: "high",   deadline: "2026-04-05", assignee: "Анна К.",    tags: ["дизайн"],              comments: [{ id: 1, text: "Макет согласован с клиентом", date: "2026-04-03T10:00:00" }], createdAt: "2026-03-28T09:00:00", history: [{ action: "Создана", date: "2026-03-28T09:00:00" }, { action: "Статус → Готово", date: "2026-04-05T17:00:00" }] },
  { id: 2, title: "Написать техническое задание",        project: "Мобильное приложение", status: "in_progress", priority: "high",   deadline: "2026-04-10", assignee: "Дмитрий Р.", tags: ["документация","срочно"], comments: [],                                                                          createdAt: "2026-03-30T11:00:00", history: [{ action: "Создана", date: "2026-03-30T11:00:00" }, { action: "Статус → В работе", date: "2026-04-01T09:00:00" }] },
  { id: 3, title: "Настроить CI/CD pipeline",            project: "Инфраструктура",       status: "review",      priority: "medium", deadline: "2026-04-12", assignee: "Иван М.",    tags: ["devops"],               comments: [{ id: 1, text: "Надо проверить env-переменные", date: "2026-04-07T14:00:00" }], createdAt: "2026-04-01T10:00:00", history: [{ action: "Создана", date: "2026-04-01T10:00:00" }] },
  { id: 4, title: "Провести UX-исследование",            project: "Мобильное приложение", status: "todo",        priority: "medium", deadline: "2026-04-20", assignee: "Ольга С.",   tags: ["ux","исследование"],    comments: [],                                                                          createdAt: "2026-04-02T08:00:00", history: [{ action: "Создана", date: "2026-04-02T08:00:00" }] },
  { id: 5, title: "Обновить документацию API",           project: "Инфраструктура",       status: "todo",        priority: "low",    deadline: "2026-04-25", assignee: "Дмитрий Р.", tags: ["документация"],         comments: [],                                                                          createdAt: "2026-04-02T09:00:00", history: [{ action: "Создана", date: "2026-04-02T09:00:00" }] },
  { id: 6, title: "Тестирование на пользователях",       project: "Сайт компании",        status: "in_progress", priority: "high",   deadline: "2026-04-09", assignee: "Анна К.",    tags: ["тестирование","срочно"], comments: [],                                                                         createdAt: "2026-04-03T10:00:00", history: [{ action: "Создана", date: "2026-04-03T10:00:00" }] },
];

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────

// Convert DB row (snake_case, flat) → app task object
function rowToTask(row) {
  return {
    id:        row.id,
    title:     row.title     || "",
    project:   row.project   || "",
    status:    row.status    || "todo",
    priority:  row.priority  || "medium",
    deadline:  row.deadline  || "",
    assignee:  row.assignee  || "",
    tags:      row.tags      || [],
    comments:  row.comments  || [],
    history:   row.history   || [],
    createdAt: row.created_at || new Date().toISOString(),
  };
}

// Convert app task → DB upsert payload (omit id for inserts)
function taskToRow(task) {
  const row = {
    title:    task.title,
    project:  task.project,
    status:   task.status,
    priority: task.priority,
    deadline: task.deadline || null,
    assignee: task.assignee,
    tags:     task.tags     || [],
    comments: task.comments || [],
    history:  task.history  || [],
  };
  if (task.id && typeof task.id === "number" && task.id > 1000000000000) {
    // id was a local Date.now() temp id — don't send it, let DB generate
    return row;
  }
  if (task.id) row.id = task.id;
  return row;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getDaysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// FIX #4: tasks without deadline always sort to the bottom regardless of direction
const NO_DEADLINE_LOW  = "0000-00-00"; // below everything for desc
const NO_DEADLINE_HIGH = "9999-99-99"; // above everything for asc

function sortTasks(tasks, sortBy) {
  return [...tasks].sort((a, b) => {
    switch (sortBy) {
      case "deadline_asc":
        return (a.deadline || NO_DEADLINE_HIGH) < (b.deadline || NO_DEADLINE_HIGH) ? -1 : 1;
      case "deadline_desc":
        // tasks without deadline sink to the bottom (treated as the smallest value)
        return (a.deadline || NO_DEADLINE_LOW) > (b.deadline || NO_DEADLINE_LOW) ? -1 : 1;
      case "priority_desc": return PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
      case "priority_asc":  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      case "created_asc":   return new Date(a.createdAt) - new Date(b.createdAt);
      default:              return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });
}

// FIX #3: shallow-compare two task objects to detect real changes
function hasChanged(original, updated) {
  const keys = ["title", "project", "status", "priority", "deadline", "assignee",
                "tags", "comments"];
  for (const k of keys) {
    if (JSON.stringify(original[k]) !== JSON.stringify(updated[k])) return true;
  }
  return false;
}

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────

function DeadlineBadge({ deadline, status }) {
  const days = getDaysUntil(deadline);
  if (status === "done") return <span style={{ color: "#4ade80", fontSize: 11, fontFamily: "monospace" }}>✓ выполнено</span>;
  if (days < 0)   return <span style={{ color: "#f87171", fontSize: 11, fontFamily: "monospace", background: "#2d0a0a", padding: "2px 7px", borderRadius: 4 }}>просрочено {Math.abs(days)}д</span>;
  if (days === 0) return <span style={{ color: "#fb923c", fontSize: 11, fontFamily: "monospace", background: "#2d1400", padding: "2px 7px", borderRadius: 4 }}>сегодня</span>;
  if (days <= 3)  return <span style={{ color: "#fbbf24", fontSize: 11, fontFamily: "monospace" }}>через {days}д ⚠</span>;
  return <span style={{ color: "#64748b", fontSize: 11, fontFamily: "monospace" }}>через {days}д</span>;
}

function TagBadge({ tag, onRemove }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#1e3a5f", color: "#7dd3fc", fontSize: 10, padding: "2px 7px", borderRadius: 4, fontFamily: "monospace" }}>
      #{tag}
      {onRemove && <span onClick={e => { e.stopPropagation(); onRemove(tag); }} style={{ cursor: "pointer", opacity: 0.6 }}>✕</span>}
    </span>
  );
}

// ─── TASK MODAL ───────────────────────────────────────────────────────────────

function TaskModal({ task, onClose, onSave }) {
  const isNew = !task?.id;

  // Keep a snapshot of the original to detect real changes (FIX #3)
  const originalRef = useRef(task);

  const [form, setForm] = useState(task || {
    title: "", project: "", status: "todo", priority: "medium",
    deadline: "", assignee: "", tags: [], comments: [],
    createdAt: new Date().toISOString(), history: [],
  });
  const [newTag,     setNewTag]     = useState("");
  const [newComment, setNewComment] = useState("");
  const [tab,        setTab]        = useState("main");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const addTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, "-");
    if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
    setNewTag("");
  };

  const addComment = () => {
    if (!newComment.trim()) return;
    set("comments", [...form.comments, { id: Date.now(), text: newComment.trim(), date: new Date().toISOString() }]);
    setNewComment("");
  };

  // FIX #3: only write a history entry when something actually changed
  const handleSave = () => {
    if (!form.title.trim()) return;
    const now = new Date().toISOString();
    let history = form.history || [];

    if (isNew) {
      history = [{ action: "Создана", date: now }];
    } else if (hasChanged(originalRef.current, form)) {
      // Build a human-readable list of what changed
      const changed = [];
      if (originalRef.current.status !== form.status)     changed.push(`статус → ${STATUS_CONFIG[form.status].label}`);
      if (originalRef.current.priority !== form.priority) changed.push(`приоритет → ${PRIORITY_CONFIG[form.priority].label}`);
      if (originalRef.current.deadline !== form.deadline) changed.push(`дедлайн → ${form.deadline || "удалён"}`);
      if (originalRef.current.title !== form.title)       changed.push("название изменено");
      if (originalRef.current.assignee !== form.assignee) changed.push(`ответственный → ${form.assignee}`);
      const label = changed.length ? changed.join(", ") : "изменено";
      history = [...history, { action: label.charAt(0).toUpperCase() + label.slice(1), date: now }];
    }
    // If nothing changed, history stays untouched — no phantom entry

    onSave({ ...form, history });
  };

  const inp = { width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px", color: "#f8fafc", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const lbl = { color: "#64748b", fontSize: 10, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 6 };
  const tabBtn = (t) => ({ background: "none", border: "none", borderBottom: tab === t ? "2px solid #0ea5e9" : "2px solid transparent", color: tab === t ? "#f8fafc" : "#475569", cursor: "pointer", padding: "8px 14px", fontSize: 11, fontFamily: "inherit", letterSpacing: 1, textTransform: "uppercase" });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
      <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16, width: 520, maxWidth: "95vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 60px rgba(0,0,0,0.7)" }}>

        <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ color: "#f8fafc", fontSize: 16, fontFamily: "'Courier New',monospace", margin: 0 }}>{isNew ? "Новая задача" : "Редактировать задачу"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 20 }}>✕</button>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid #1e293b", paddingLeft: 12, marginTop: 12 }}>
          {[
            ["main",     "Основное"],
            ["comments", `Комментарии${form.comments.length > 0 ? ` (${form.comments.length})` : ""}`],
            ["history",  "История"],
          ].map(([k, l]) => (
            <button key={k} style={tabBtn(k)} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>

          {tab === "main" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div><label style={lbl}>Название *</label><input value={form.title} onChange={e => set("title", e.target.value)} style={inp} placeholder="Что нужно сделать?" /></div>
              <div><label style={lbl}>Проект</label><input value={form.project} onChange={e => set("project", e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Ответственный</label><input value={form.assignee} onChange={e => set("assignee", e.target.value)} style={inp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={lbl}>Статус</label>
                  <select value={form.status} onChange={e => set("status", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                    {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Приоритет</label>
                  <select value={form.priority} onChange={e => set("priority", e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                    {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div><label style={lbl}>Дедлайн</label><input type="date" value={form.deadline} onChange={e => set("deadline", e.target.value)} style={inp} /></div>
              <div>
                <label style={lbl}>Теги</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                  {form.tags.map(t => <TagBadge key={t} tag={t} onRemove={tag => set("tags", form.tags.filter(x => x !== tag))} />)}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} style={{ ...inp, flex: 1, padding: "8px 12px", fontSize: 13 }} placeholder="Новый тег (Enter)" />
                  <button onClick={addTag} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "8px 14px", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>+ Добавить</button>
                </div>
              </div>
            </div>
          )}

          {tab === "comments" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {form.comments.length === 0 && <p style={{ color: "#334155", fontSize: 13, textAlign: "center", margin: "20px 0" }}>Нет комментариев</p>}
              {form.comments.map(c => (
                <div key={c.id} style={{ background: "#1e293b", borderRadius: 10, padding: "12px 14px" }}>
                  <p style={{ color: "#e2e8f0", fontSize: 13, margin: "0 0 6px", lineHeight: 1.5 }}>{c.text}</p>
                  <span style={{ color: "#475569", fontSize: 10, fontFamily: "monospace" }}>{fmtDate(c.date)}</span>
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addComment(); } }} style={{ ...inp, flex: 1, fontSize: 13 }} placeholder="Написать комментарий…" />
                <button onClick={addComment} style={{ background: "#0ea5e9", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", cursor: "pointer", fontSize: 13 }}>→</button>
              </div>
            </div>
          )}

          {tab === "history" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {(!form.history || form.history.length === 0) && <p style={{ color: "#334155", fontSize: 13, textAlign: "center", margin: "20px 0" }}>История пуста</p>}
              {[...(form.history || [])].reverse().map((h, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #1e293b" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#334155", marginTop: 5, flexShrink: 0 }} />
                  <div>
                    <p style={{ color: "#94a3b8", fontSize: 13, margin: 0 }}>{h.action}</p>
                    <span style={{ color: "#475569", fontSize: 10, fontFamily: "monospace" }}>{fmtDate(h.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, padding: "16px 24px", borderTop: "1px solid #1e293b" }}>
          <button onClick={onClose} style={{ flex: 1, background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: 11, color: "#94a3b8", cursor: "pointer", fontSize: 14 }}>Отмена</button>
          <button onClick={handleSave} style={{ flex: 1, background: "#0ea5e9", border: "none", borderRadius: 8, padding: 11, color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

// ─── TASK CARD ────────────────────────────────────────────────────────────────

function TaskCard({ task, onClick, onDelete, onDragStart }) {
  const sc = STATUS_CONFIG[task.status];
  const pc = PRIORITY_CONFIG[task.priority];
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, task.id)}
      onClick={() => onClick(task)}
      style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "14px 16px", cursor: "grab", transition: "border-color 0.15s, box-shadow 0.15s", position: "relative", overflow: "hidden", userSelect: "none" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "#334155"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "#1e293b"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: sc.color, borderRadius: "12px 0 0 12px" }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <p style={{ color: "#f1f5f9", fontSize: 13, margin: 0, fontWeight: 500, lineHeight: 1.4, paddingRight: 8, flex: 1 }}>{task.title}</p>
        <button onClick={e => { e.stopPropagation(); onDelete(task.id); }}
          style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
          onMouseLeave={e => e.currentTarget.style.color = "#334155"}>✕</button>
      </div>
      {task.tags?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
          {task.tags.map(t => <TagBadge key={t} tag={t} />)}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 10, color: "#64748b", background: "#1e293b", padding: "2px 7px", borderRadius: 4, fontFamily: "monospace" }}>{task.project}</span>
        <span style={{ fontSize: 10, color: pc.color, fontFamily: "monospace" }}>● {pc.label}</span>
        {task.comments?.length > 0 && <span style={{ fontSize: 10, color: "#475569" }}>💬 {task.comments.length}</span>}
        <span style={{ fontSize: 10, color: "#475569", marginLeft: "auto" }}>{task.assignee}</span>
      </div>
      {task.deadline && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>{task.deadline}</span>
          <DeadlineBadge deadline={task.deadline} status={task.status} />
        </div>
      )}
    </div>
  );
}

// ─── DROP COLUMN (FIX #2: counter-based drag detection, no false onDragLeave) ─

function DropColumn({ status, tasks, onEdit, onDelete, onDragStart, onDrop }) {
  const sc = STATUS_CONFIG[status];
  // Use a counter instead of boolean: incremented on enter, decremented on leave.
  // Reaches 0 only when cursor truly leaves the column (not when entering a child).
  const enterCount = useRef(0);
  const [over, setOver] = useState(false);

  const handleDragEnter = () => {
    enterCount.current += 1;
    setOver(true);
  };
  const handleDragLeave = () => {
    enterCount.current -= 1;
    if (enterCount.current === 0) setOver(false);
  };
  const handleDrop = (e) => {
    enterCount.current = 0;
    setOver(false);
    onDrop(e, status);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: sc.dot }} />
        <span style={{ fontSize: 11, color: sc.color, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 600 }}>{sc.label}</span>
        <span style={{ fontSize: 11, color: "#334155", background: "#1e293b", borderRadius: 4, padding: "1px 7px", marginLeft: "auto" }}>{tasks.length}</span>
      </div>
      <div style={{
        display: "flex", flexDirection: "column", gap: 10, minHeight: 60,
        background: over ? "rgba(14,165,233,0.05)" : "transparent",
        border: over ? "1px dashed #0ea5e9" : "1px dashed transparent",
        borderRadius: 10, padding: over ? 6 : 0, transition: "all 0.15s",
      }}>
        {tasks.map(t => <TaskCard key={t.id} task={t} onClick={onEdit} onDelete={onDelete} onDragStart={onDragStart} />)}
        {tasks.length === 0 && !over && (
          <div style={{ border: "1px dashed #1e293b", borderRadius: 12, padding: 20, textAlign: "center", color: "#334155", fontSize: 12 }}>Перетащи сюда</div>
        )}
      </div>
    </div>
  );
}

// ─── STATS VIEW ───────────────────────────────────────────────────────────────

function MiniBar({ value, max, color }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ flex: 1, height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", width: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function DonutChart({ segments, size = 80 }) {
  const r = 28; const cx = size / 2; const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  const arcs = segments.map(seg => {
    const dash = total === 0 ? 0 : (seg.value / total) * circ;
    const arc = { ...seg, dash, offset, pct: total === 0 ? 0 : Math.round((seg.value / total) * 100) };
    offset += dash;
    return arc;
  });
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      {total === 0
        ? <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={10} />
        : arcs.map((a, i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={a.color} strokeWidth={10}
              strokeDasharray={`${a.dash} ${circ - a.dash}`}
              strokeDashoffset={-a.offset} />
          ))
      }
    </svg>
  );
}

function StatCard({ children, style = {} }) {
  return (
    <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 22px", ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <div style={{ fontSize: 10, color: "#475569", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 16, fontFamily: "monospace" }}>{children}</div>;
}

function StatsView({ tasks }) {
  const total = tasks.length;
  const byStatus = Object.keys(STATUS_CONFIG).map(k => ({
    key: k, label: STATUS_CONFIG[k].label, color: STATUS_CONFIG[k].dot,
    value: tasks.filter(t => t.status === k).length,
  }));
  const byPriority = Object.keys(PRIORITY_CONFIG).map(k => ({
    key: k, label: PRIORITY_CONFIG[k].label, color: PRIORITY_CONFIG[k].color,
    value: tasks.filter(t => t.priority === k).length,
  }));

  // Project progress
  const projects = [...new Set(tasks.map(t => t.project).filter(Boolean))];
  const projectStats = projects.map(p => {
    const pt = tasks.filter(t => t.project === p);
    const done = pt.filter(t => t.status === "done").length;
    return { name: p, total: pt.length, done, pct: Math.round((done / pt.length) * 100) };
  }).sort((a, b) => b.total - a.total);

  // Assignee load
  const assignees = [...new Set(tasks.map(t => t.assignee).filter(Boolean))];
  const assigneeStats = assignees.map(a => {
    const at = tasks.filter(t => t.assignee === a);
    return {
      name: a,
      total: at.length,
      done: at.filter(t => t.status === "done").length,
      inProgress: at.filter(t => t.status === "in_progress").length,
      overdue: at.filter(t => t.status !== "done" && t.deadline && getDaysUntil(t.deadline) < 0).length,
    };
  }).sort((a, b) => b.total - a.total);

  // Avg completion time (days) for done tasks that have history with "Создана"
  const completionTimes = tasks
    .filter(t => t.status === "done" && t.createdAt && t.history?.length > 0)
    .map(t => {
      const doneEntry = [...t.history].reverse().find(h => h.action.includes("Готово") || h.action.includes("готово"));
      if (!doneEntry) return null;
      const days = Math.round((new Date(doneEntry.date) - new Date(t.createdAt)) / 86400000);
      return days >= 0 ? days : null;
    }).filter(d => d !== null);
  const avgDays = completionTimes.length
    ? Math.round(completionTimes.reduce((s, d) => s + d, 0) / completionTimes.length)
    : null;

  // Tasks closed last 7 days
  const now = new Date();
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i));
    const label = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    const dateStr = d.toISOString().slice(0, 10);
    const count = tasks.filter(t =>
      t.status === "done" &&
      t.history?.some(h => h.action.includes("Готово") && h.date.startsWith(dateStr))
    ).length;
    return { label, count };
  });
  const maxBar = Math.max(...last7.map(d => d.count), 1);

  const card = { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 22px" };

  return (
    <div style={{ padding: "20px 28px 40px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Top KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {[
          { label: "Завершено",     value: `${byStatus.find(s=>s.key==="done")?.value || 0} / ${total}`, color: "#4ade80", sub: total ? `${Math.round((byStatus.find(s=>s.key==="done")?.value||0)/total*100)}%` : "—" },
          { label: "В работе",      value: byStatus.find(s=>s.key==="in_progress")?.value || 0, color: "#38bdf8", sub: "активных" },
          { label: "Просрочено",    value: tasks.filter(t=>t.status!=="done"&&t.deadline&&getDaysUntil(t.deadline)<0).length, color: "#f87171", sub: "задач" },
          { label: "Ср. время",     value: avgDays !== null ? `${avgDays}д` : "—", color: "#a78bfa", sub: "на выполнение" },
        ].map(s => (
          <div key={s.label} style={card}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
            <div style={{ fontSize: 10, color: "#334155", marginTop: 2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Status donut */}
        <StatCard>
          <SectionTitle>Распределение по статусам</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <DonutChart segments={byStatus} size={90} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{total}</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {byStatus.map(s => (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: s.color }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{total ? Math.round(s.value/total*100) : 0}%</span>
                  </div>
                  <MiniBar value={s.value} max={total} color={s.color} />
                </div>
              ))}
            </div>
          </div>
        </StatCard>

        {/* Priority donut */}
        <StatCard>
          <SectionTitle>Распределение по приоритетам</SectionTitle>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <DonutChart segments={byPriority} size={90} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>{total}</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {byPriority.map(s => (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: s.color }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{total ? Math.round(s.value/total*100) : 0}%</span>
                  </div>
                  <MiniBar value={s.value} max={total} color={s.color} />
                </div>
              ))}
            </div>
          </div>
        </StatCard>
      </div>

      {/* Activity last 7 days */}
      <StatCard>
        <SectionTitle>Закрыто задач — последние 7 дней</SectionTitle>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
          {last7.map((d, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: d.count > 0 ? "#4ade80" : "#334155", fontFamily: "monospace" }}>{d.count > 0 ? d.count : ""}</span>
              <div style={{ width: "100%", background: "#1e293b", borderRadius: 4, overflow: "hidden", height: 48, display: "flex", alignItems: "flex-end" }}>
                <div style={{ width: "100%", background: d.count > 0 ? "#16a34a" : "#1e293b", height: `${(d.count / maxBar) * 100}%`, minHeight: d.count > 0 ? 4 : 0, borderRadius: 4, transition: "height 0.4s ease" }} />
              </div>
              <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>{d.label}</span>
            </div>
          ))}
        </div>
      </StatCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* Project progress */}
        <StatCard>
          <SectionTitle>Прогресс по проектам</SectionTitle>
          {projectStats.length === 0 && <p style={{ color: "#334155", fontSize: 13 }}>Нет проектов</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {projectStats.map(p => (
              <div key={p.name}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#e2e8f0" }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace" }}>{p.done}/{p.total} · {p.pct}%</span>
                </div>
                <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${p.pct}%`, height: "100%", background: p.pct === 100 ? "#4ade80" : "#0ea5e9", borderRadius: 3, transition: "width 0.4s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </StatCard>

        {/* Assignee load */}
        <StatCard>
          <SectionTitle>Нагрузка по участникам</SectionTitle>
          {assigneeStats.length === 0 && <p style={{ color: "#334155", fontSize: 13 }}>Нет участников</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {assigneeStats.map(a => (
              <div key={a.name}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: "#e2e8f0" }}>{a.name}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {a.inProgress > 0 && <span style={{ fontSize: 10, color: "#38bdf8", fontFamily: "monospace" }}>⬤ {a.inProgress}</span>}
                    {a.overdue   > 0 && <span style={{ fontSize: 10, color: "#f87171", fontFamily: "monospace" }}>⚠ {a.overdue}</span>}
                    {a.done      > 0 && <span style={{ fontSize: 10, color: "#4ade80", fontFamily: "monospace" }}>✓ {a.done}</span>}
                  </div>
                </div>
                <MiniBar value={a.total} max={Math.max(...assigneeStats.map(x=>x.total))} color="#6366f1" />
              </div>
            ))}
          </div>
        </StatCard>
      </div>

    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function App() {
  const isMobile = useIsMobile();
  const [tasks,   setTasks]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]  = useState(null);
  const [modal,   setModal]  = useState(null);
  const [view,    setView]   = useState("board");
  const [sortBy,  setSortBy] = useState("created_desc");
  const [filter,  setFilter] = useState({ status: "all", priority: "all", search: "", tag: "" });
  const [mobileStatus, setMobileStatus] = useState("todo"); // active column on mobile board
  const dragId = useRef(null);

  // ── Load all tasks on mount ──────────────────────────────────────────────
  useEffect(() => {
    async function fetchTasks() {
      setLoading(true);
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { setError(error.message); setLoading(false); return; }
      setTasks(data.map(rowToTask));
      setLoading(false);
    }
    fetchTasks();

    // ── Real-time subscription: reflect other users' changes instantly ────
    const channel = supabase
      .channel("tasks-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, payload => {
        if (payload.eventType === "INSERT") {
          setTasks(ts => [rowToTask(payload.new), ...ts]);
        } else if (payload.eventType === "UPDATE") {
          setTasks(ts => ts.map(t => t.id === payload.new.id ? rowToTask(payload.new) : t));
        } else if (payload.eventType === "DELETE") {
          setTasks(ts => ts.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── Save (insert or update) ──────────────────────────────────────────────
  const saveTask = useCallback(async (form) => {
    setError(null);
    const row = taskToRow(form);
    if (form.id && !(typeof form.id === "number" && form.id > 1000000000000)) {
      // Update existing row
      const { error } = await supabase.from("tasks").update(row).eq("id", form.id);
      if (error) { setError(error.message); return; }
      // Real-time will update state; but update locally too for instant feedback
      setTasks(ts => ts.map(t => t.id === form.id ? { ...form } : t));
    } else {
      // Insert new row
      const { data, error } = await supabase.from("tasks").insert(row).select().single();
      if (error) { setError(error.message); return; }
      setTasks(ts => [rowToTask(data), ...ts]);
    }
    setModal(null);
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────
  const deleteTask = useCallback(async (id) => {
    setError(null);
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setTasks(ts => ts.filter(t => t.id !== id));
  }, []);

  // ── Drag & Drop (update status) ──────────────────────────────────────────
  const handleDragStart = (e, id) => { dragId.current = id; e.dataTransfer.effectAllowed = "move"; };
  const handleDrop = useCallback(async (e, newStatus) => {
    e.preventDefault();
    const id = dragId.current; if (!id) return;
    dragId.current = null;
    const task = tasks.find(t => t.id === id);
    if (!task || task.status === newStatus) return;
    const now = new Date().toISOString();
    const updatedHistory = [...(task.history || []), { action: `Статус → ${STATUS_CONFIG[newStatus].label}`, date: now }];
    // Optimistic update
    setTasks(ts => ts.map(t => t.id === id ? { ...t, status: newStatus, history: updatedHistory } : t));
    const { error } = await supabase.from("tasks").update({ status: newStatus, history: updatedHistory }).eq("id", id);
    if (error) {
      // Rollback on failure
      setTasks(ts => ts.map(t => t.id === id ? { ...t, status: task.status, history: task.history } : t));
      setError(error.message);
    }
  }, [tasks]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const allTags = [...new Set(tasks.flatMap(t => t.tags || []))].sort();

  const filtered = sortTasks(
    tasks.filter(t =>
      (filter.status   === "all" || t.status   === filter.status)   &&
      (filter.priority === "all" || t.priority === filter.priority) &&
      (filter.tag      === ""   || (t.tags || []).includes(filter.tag)) &&
      (t.title.toLowerCase().includes(filter.search.toLowerCase()) ||
       (t.project || "").toLowerCase().includes(filter.search.toLowerCase()))
    ),
    sortBy
  );

  const stats = {
    total:   tasks.length,
    done:    tasks.filter(t => t.status === "done").length,
    overdue: tasks.filter(t => t.status !== "done" && t.deadline && getDaysUntil(t.deadline) < 0).length,
    today:   tasks.filter(t => t.status !== "done" && t.deadline && getDaysUntil(t.deadline) === 0).length,
  };

  const sel = () => ({ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 14px", color: "#94a3b8", fontSize: 12, outline: "none", fontFamily: "inherit", cursor: "pointer" });
  const pad = isMobile ? "0 12px 100px" : "0 28px 32px";

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>◈</div>
        <div style={{ color: "#475569", fontSize: 13, letterSpacing: 2 }}>ЗАГРУЗКА...</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#f8fafc", fontFamily: "'IBM Plex Mono','Courier New',monospace" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#0f172a}
        ::-webkit-scrollbar-thumb{background:#334155;border-radius:2px}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4)}
        select option{background:#1e293b}
        input, select, button { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* Error banner */}
      {error && (
        <div style={{ background: "#2d0a0a", borderBottom: "1px solid #7f1d1d", padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#f87171", fontSize: 12 }}>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ borderBottom: "1px solid #1e293b", padding: isMobile ? "12px 16px" : "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#020817", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "linear-gradient(135deg,#0ea5e9,#6366f1)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>◈</div>
          <div>
            <div style={{ fontSize: isMobile ? 12 : 14, fontWeight: 700, letterSpacing: 2 }}>TASKFLOW</div>
            {!isMobile && <div style={{ fontSize: 9, color: "#475569", letterSpacing: 1 }}>УПРАВЛЕНИЕ ПРОЕКТАМИ</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
            <span style={{ fontSize: 9, color: "#4ade80", letterSpacing: 1 }}>LIVE</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* Desktop nav buttons — hidden on mobile (bottom nav used instead) */}
          {!isMobile && [["board","⊞ ДОСКА"], ["list","≡ СПИСОК"], ["stats","◎ СТАТИСТИКА"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: view === v ? "#1e293b" : "none", border: `1px solid ${view === v ? "#334155" : "transparent"}`, borderRadius: 6, padding: "6px 12px", color: view === v ? "#f8fafc" : "#475569", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
          <button onClick={() => setModal({ tags: [], comments: [], history: [], createdAt: new Date().toISOString() })}
            style={{ background: "#0ea5e9", border: "none", borderRadius: 8, padding: isMobile ? "8px 14px" : "8px 16px", color: "#fff", cursor: "pointer", fontSize: isMobile ? 18 : 12, fontWeight: 700, fontFamily: "inherit", letterSpacing: 0.5, lineHeight: 1 }}>
            {isMobile ? "+" : "+ ЗАДАЧА"}
          </button>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      {view !== "stats" && (
        <div style={{ padding: isMobile ? "12px 12px 0" : "18px 28px 0", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: isMobile ? 6 : 10 }}>
          {[
            { label: "Всего",      value: stats.total,   color: "#94a3b8" },
            { label: "Готово",     value: stats.done,    color: "#4ade80" },
            { label: "Просрочено", value: stats.overdue, color: "#f87171" },
            { label: "Сегодня",    value: stats.today,   color: "#fb923c" },
          ].map(s => (
            <div key={s.label} style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 10, padding: isMobile ? "10px 10px" : "12px 16px" }}>
              <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: isMobile ? 8 : 9, color: "#475569", marginTop: 4, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── FILTERS ── */}
      {view !== "stats" && (
        <div style={{ padding: isMobile ? "10px 12px" : "14px 28px", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Поиск…" value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
            style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, padding: "8px 12px", color: "#f8fafc", fontSize: 12, outline: "none", fontFamily: "inherit", flex: 1, minWidth: 100 }} />
          <select value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))} style={{ ...sel(), fontSize: 11, padding: "8px 10px" }}>
            <option value="all">Все статусы</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {!isMobile && <>
            <select value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))} style={sel()}>
              <option value="all">Все приоритеты</option>
              {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={filter.tag} onChange={e => setFilter(f => ({ ...f, tag: e.target.value }))} style={sel()}>
              <option value="">Все теги</option>
              {allTags.map(t => <option key={t} value={t}>#{t}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={sel()}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </>}
          <span style={{ color: "#334155", fontSize: 11, marginLeft: "auto" }}>{filtered.length}/{tasks.length}</span>
        </div>
      )}

      {/* ── STATS VIEW ── */}
      {view === "stats" && <StatsView tasks={tasks} />}

      {/* ── BOARD ── */}
      {view === "board" && !isMobile && (
        <div style={{ padding: pad, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, alignItems: "start" }}>
          {Object.keys(STATUS_CONFIG).map(status => (
            <DropColumn key={status} status={status}
              tasks={filtered.filter(t => t.status === status)}
              onEdit={setModal} onDelete={deleteTask}
              onDragStart={handleDragStart} onDrop={handleDrop} />
          ))}
        </div>
      )}

      {/* ── MOBILE BOARD: one column at a time with tab switcher ── */}
      {view === "board" && isMobile && (
        <div style={{ padding: "0 0 100px" }}>
          {/* Column tab switcher */}
          <div style={{ display: "flex", overflowX: "auto", borderBottom: "1px solid #1e293b", padding: "0 12px" }}>
            {Object.entries(STATUS_CONFIG).map(([k, sc]) => {
              const count = filtered.filter(t => t.status === k).length;
              return (
                <button key={k} onClick={() => setMobileStatus(k)}
                  style={{ background: "none", border: "none", borderBottom: mobileStatus === k ? `2px solid ${sc.color}` : "2px solid transparent", color: mobileStatus === k ? sc.color : "#475569", padding: "10px 14px", cursor: "pointer", fontSize: 11, fontFamily: "inherit", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {sc.label} <span style={{ fontSize: 10, opacity: 0.7 }}>({count})</span>
                </button>
              );
            })}
          </div>
          {/* Active column cards */}
          <div style={{ padding: "12px 12px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.filter(t => t.status === mobileStatus).map(t => (
              <TaskCard key={t.id} task={t} onClick={setModal} onDelete={deleteTask} onDragStart={() => {}} />
            ))}
            {filtered.filter(t => t.status === mobileStatus).length === 0 && (
              <div style={{ border: "1px dashed #1e293b", borderRadius: 12, padding: 32, textAlign: "center", color: "#334155", fontSize: 13 }}>Нет задач</div>
            )}
          </div>
        </div>
      )}

      {/* ── LIST ── */}
      {view === "list" && !isMobile && (
        <div style={{ padding: pad }}>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 120px 100px 160px 100px 36px", padding: "10px 18px", borderBottom: "1px solid #1e293b", color: "#475569", fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>
              {["Задача", "Проект", "Статус", "Приоритет", "Дедлайн", "Ответственный", ""].map((h, i) => <div key={i}>{h}</div>)}
            </div>
            {filtered.map((t, i) => {
              const sc = STATUS_CONFIG[t.status];
              const pc = PRIORITY_CONFIG[t.priority];
              return (
                <div key={t.id} onClick={() => setModal(t)}
                  style={{ display: "grid", gridTemplateColumns: "2fr 1fr 120px 100px 160px 100px 36px", padding: "12px 18px", borderBottom: i < filtered.length - 1 ? "1px solid #0a1525" : "none", cursor: "pointer", alignItems: "center", background: i % 2 === 0 ? "transparent" : "#080f1a", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#1e293b"}
                  onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "#080f1a"}>
                  <div>
                    <div style={{ fontSize: 13, color: "#e2e8f0", marginBottom: 4 }}>{t.title}</div>
                    {t.tags?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{t.tags.map(tag => <TagBadge key={tag} tag={tag} />)}</div>}
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{t.project}</div>
                  <div><span style={{ fontSize: 11, color: sc.color, background: sc.bg, padding: "3px 8px", borderRadius: 4 }}>{sc.label}</span></div>
                  <div style={{ fontSize: 11, color: pc.color }}>● {pc.label}</div>
                  <div>
                    <div style={{ color: "#64748b", fontFamily: "monospace", fontSize: 11, marginBottom: 2 }}>{t.deadline || "—"}</div>
                    {t.deadline && <DeadlineBadge deadline={t.deadline} status={t.status} />}
                  </div>
                  <div style={{ fontSize: 11, color: "#475569" }}>
                    {t.assignee}
                    {t.comments?.length > 0 && <span style={{ color: "#334155", marginLeft: 6 }}>💬{t.comments.length}</span>}
                  </div>
                  <div>
                    <button onClick={e => { e.stopPropagation(); deleteTask(t.id); }}
                      style={{ background: "none", border: "none", color: "#334155", cursor: "pointer", fontSize: 13 }}
                      onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
                      onMouseLeave={e => e.currentTarget.style.color = "#334155"}>✕</button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#334155", fontSize: 14 }}>Задачи не найдены</div>}
          </div>
        </div>
      )}

      {/* ── MOBILE LIST: card-based ── */}
      {view === "list" && isMobile && (
        <div style={{ padding: "12px 12px 100px", display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(t => (
            <TaskCard key={t.id} task={t} onClick={setModal} onDelete={deleteTask} onDragStart={() => {}} />
          ))}
          {filtered.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#334155", fontSize: 14 }}>Задачи не найдены</div>}
        </div>
      )}

      {/* ── MOBILE BOTTOM NAV ── */}
      {isMobile && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f172a", borderTop: "1px solid #1e293b", display: "flex", zIndex: 50 }}>
          {[
            ["board",  "⊞", "Доска"],
            ["list",   "≡", "Список"],
            ["stats",  "◎", "Стат."],
          ].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ flex: 1, background: "none", border: "none", padding: "12px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", color: view === v ? "#0ea5e9" : "#475569", fontFamily: "inherit" }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
              <span style={{ fontSize: 9, letterSpacing: 0.5 }}>{label}</span>
            </button>
          ))}
        </div>
      )}

      {modal !== null && (
        <TaskModal task={modal.id ? modal : null} onClose={() => setModal(null)} onSave={saveTask} />
      )}
    </div>
  );
}
