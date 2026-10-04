import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { io, Socket } from 'socket.io-client';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import AppShell from '../../../../components/AppShell';
import AccessibleDialog from '../../../../components/AccessibleDialog';
import { useAuth } from '../../../../lib/auth';
import { api, getAccessToken } from '../../../../lib/api';

interface List {
  id: string;
  name: string;
  position: string;
}
interface Label {
  id: string;
  name: string;
  color: string;
}
interface Task {
  id: string;
  listId: string;
  title: string;
  description?: string | null;
  status: string;
  position: string;
  version: number;
  assignee?: { id: string; name: string } | null;
  labels?: Label[];
}
interface Board {
  id: string;
  name: string;
  description?: string | null;
  lists: List[];
}
interface Member {
  userId: string;
  user: { name: string };
  role: string;
}
const eventNames = [
  'task:created',
  'task:updated',
  'task:moved',
  'task:deleted',
  'list:created',
  'list:updated',
  'list:moved',
  'list:deleted',
];

function SortableTask({ task, onEdit }: { task: Task; onEdit: (task: Task) => void }) {
  const sortable = useSortable({ id: task.id });
  return (
    <article
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className="task-card"
    >
      <div className="task-card-top">
        <span className={`task-status status-${task.status.toLowerCase()}`}>
          {task.status.replace('_', ' ')}
        </span>
        <div className="task-card-controls">
          <span className="task-version">v{task.version}</span>
          <button
            type="button"
            className="task-card-control"
            aria-label={`Drag ${task.title}`}
            ref={sortable.setActivatorNodeRef}
            {...sortable.attributes}
            {...sortable.listeners}
          >
            ⠿
          </button>
          <button
            type="button"
            className="task-card-control task-edit-action"
            aria-label={`Edit ${task.title}`}
            onClick={() => onEdit(task)}
          >
            Edit
          </button>
        </div>
      </div>
      <strong>{task.title}</strong>
      {task.description && <p>{task.description}</p>}
      <div className="task-card-bottom">
        {task.labels?.length ? (
          <div className="task-labels">
            {task.labels.slice(0, 2).map((label) => (
              <span
                className="task-label"
                style={{ borderColor: label.color, color: label.color }}
                key={label.id}
              >
                {label.name}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        {task.assignee ? (
          <span className="task-assignee" title={task.assignee.name}>
            {task.assignee.name.slice(0, 1).toUpperCase()}
          </span>
        ) : (
          <span className="unassigned">＋</span>
        )}
      </div>
    </article>
  );
}

export default function BoardPage() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const workspaceId = String(router.query.workspaceId || '');
  const boardId = String(router.query.boardId || '');
  const [board, setBoard] = useState<Board | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [labelId, setLabelId] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [connected, setConnected] = useState(false);
  const [drawer, setDrawer] = useState<Task | 'new' | null>(null);
  const [listModal, setListModal] = useState(false);
  const [membersModal, setMembersModal] = useState(false);
  const workspaceRole = useMemo(
    () => session?.memberships.find((m) => m.workspaceId === workspaceId)?.role,
    [session, workspaceId]
  );
  const canEdit = workspaceRole !== 'VIEWER';
  const canInvite = workspaceRole === 'OWNER' || workspaceRole === 'ADMIN';
  const filtered = Boolean(search || status || assigneeId || labelId);
  const load = useCallback(
    async (append = false) => {
      if (!workspaceId || !boardId) return;
      try {
        const query = new URLSearchParams({ boardId, limit: '50', sort: 'newest' });
        if (search) query.set('q', search);
        if (status) query.set('status', status);
        if (assigneeId) query.set('assigneeId', assigneeId);
        if (labelId) query.set('labelId', labelId);
        if (append && cursor) query.set('cursor', cursor);
        const [b, t, l, m] = await Promise.all([
          api<{ board: Board }>(`/workspaces/${workspaceId}/boards/${boardId}`),
          api<{ items: Task[]; nextCursor: string | null }>(
            `/workspaces/${workspaceId}/tasks?${query}`
          ),
          api<{ items: Label[] }>(`/workspaces/${workspaceId}/labels`),
          api<{ items: Member[] }>(`/workspaces/${workspaceId}/members`),
        ]);
        setBoard(b.board);
        setTasks((current) => (append ? [...current, ...t.items] : t.items));
        setCursor(t.nextCursor);
        setLabels(l.items);
        setMembers(m.items);
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load board');
      }
    },
    [workspaceId, boardId, search, status, assigneeId, labelId, cursor]
  );
  useEffect(() => {
    if (!loading && !session) void router.replace('/login');
    if (session && workspaceId && boardId) window.setTimeout(() => void load(), 0);
  }, [loading, session, workspaceId, boardId, router, load]);
  useEffect(() => {
    if (!workspaceId || !boardId || !getAccessToken()) return undefined;
    const socket: Socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      auth: (cb) => cb({ token: getAccessToken() }),
    });
    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join:board', { workspaceId, boardId });
      void load();
    });
    socket.on('disconnect', () => setConnected(false));
    eventNames.forEach((name) =>
      socket.on(name, (payload: { data: Task | List | { id: string } }) => {
        if (!name.startsWith('task:')) {
          void load();
          return;
        }
        const data = payload.data as Task;
        setTasks((current) =>
          name === 'task:deleted'
            ? current.filter((task) => task.id !== data.id)
            : current.some((task) => task.id === data.id)
              ? current.map((task) =>
                  task.id === data.id && (!('version' in data) || data.version >= task.version)
                    ? data
                    : task
                )
              : [...current, data]
        );
      })
    );
    return () => {
      socket.disconnect();
    };
  }, [workspaceId, boardId, load]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const moveTask = async ({ active, over }: DragEndEvent) => {
    if (!canEdit || filtered || !over || active.id === over.id) return;
    const moving = tasks.find((task) => task.id === active.id);
    const target = tasks.find((task) => task.id === over.id);
    if (!moving || !target) return;
    const before = tasks;
    const destination = target.listId;
    const inDestination = tasks
      .filter((task) => task.listId === destination && task.id !== moving.id)
      .sort((a, b) => a.position.localeCompare(b.position));
    const index = inDestination.findIndex((task) => task.id === target.id);
    const afterId = index > 0 ? inDestination[index - 1].id : null;
    setTasks(
      tasks.map((task) => (task.id === moving.id ? { ...task, listId: destination } : task))
    );
    try {
      const result = await api<{ task: Task }>(
        `/workspaces/${workspaceId}/tasks/${moving.id}/move`,
        { method: 'POST', body: JSON.stringify({ toListId: destination, afterId }) }
      );
      setTasks((current) => current.map((task) => (task.id === moving.id ? result.task : task)));
    } catch (e) {
      setTasks(before);
      setToast(e instanceof Error ? e.message : 'Move failed');
      if (e instanceof Error && e.message.toLowerCase().includes('stale')) void load();
    }
  };
  const saveTask = async (
    input: Partial<Task> & {
      title: string;
      description: string | null;
      status: string;
      assigneeId: string | null;
      labelIds: string[];
    }
  ) => {
    try {
      if (drawer === 'new') {
        const list = board?.lists[0];
        if (!list) return;
        const result = await api<{ task: Task }>(
          `/workspaces/${workspaceId}/lists/${list.id}/tasks`,
          { method: 'POST', body: JSON.stringify(input) }
        );
        setTasks((current) => [...current, result.task]);
      } else if (drawer) {
        const result = await api<{ task: Task }>(`/workspaces/${workspaceId}/tasks/${drawer.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...input, expectedVersion: drawer.version }),
        });
        setTasks((current) =>
          current.map((task) => (task.id === result.task.id ? result.task : task))
        );
      }
      setDrawer(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Unable to save task');
      if (e instanceof Error && e.message.includes('changed')) void load();
    }
  };
  const createList = async (name: string) => {
    try {
      await api(`/workspaces/${workspaceId}/boards/${boardId}/lists`, {
        method: 'POST',
        body: JSON.stringify({ name, afterId: board?.lists[board.lists.length - 1]?.id || null }),
      });
      setListModal(false);
      void load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Unable to create list');
    }
  };
  if (loading || !session || !board)
    return <div className="loading-screen">{error || 'Waking up the server…'}</div>;
  return (
    <AppShell workspaceId={workspaceId} board={board}>
      <section className="content-wide board-page">
        <div className="board-context">
          <div>
            <div className="eyebrow">{connected ? 'LIVE BOARD' : 'RECONNECTING'}</div>
            <h1>{board.name}</h1>
            <p className="muted">{board.description || 'Plan, prioritize, and ship together.'}</p>
          </div>
          <div className="board-actions">
            <span className="role-pill">{canEdit ? 'EDITOR' : 'VIEWER'}</span>
            {canInvite && (
              <button className="button subtle" onClick={() => setMembersModal(true)}>
                Manage members
              </button>
            )}
          </div>
        </div>
        <div className="board-toolbar">
          <input
            className="search"
            aria-label="Search tasks"
            placeholder="Search tasks…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(null);
            }}
          />
          <a className="activity-link" href={`/w/${workspaceId}/activity`}>
            ⌁ Activity
          </a>
        </div>
        <div className="filter-row">
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setCursor(null);
            }}
          >
            <option value="">All statuses</option>
            <option value="TODO">To do</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </select>
          <select
            aria-label="Filter by assignee"
            value={assigneeId}
            onChange={(e) => {
              setAssigneeId(e.target.value);
              setCursor(null);
            }}
          >
            <option value="">All assignees</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by label"
            value={labelId}
            onChange={(e) => {
              setLabelId(e.target.value);
              setCursor(null);
            }}
          >
            <option value="">All labels</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        {filtered && (
          <div className="notice">
            Drag and drop is disabled while search or filters are active.
          </div>
        )}
        {error && <div className="notice error">{error}</div>}
        {toast && (
          <div className="notice error">
            {toast} <button onClick={() => setToast('')}>Dismiss</button>
          </div>
        )}
        <DndContext sensors={sensors} onDragEnd={moveTask}>
          <div className="kanban">
            {board.lists.map((list) => {
              const listTasks = tasks
                .filter((task) => task.listId === list.id)
                .sort((a, b) => a.position.localeCompare(b.position));
              return (
                <div className="column" id={`list-${list.id}`} key={list.id}>
                  <div className="column-heading">
                    <h2>
                      <span className="status-dot" />
                      {list.name}
                    </h2>
                    <span>{listTasks.length.toString().padStart(2, '0')}</span>
                  </div>
                  {listTasks.length ? (
                    <SortableContext
                      items={listTasks.map((task) => task.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {listTasks.map((task) => (
                        <SortableTask key={task.id} task={task} onEdit={setDrawer} />
                      ))}
                    </SortableContext>
                  ) : (
                    <div className="column-empty">No tasks here yet.</div>
                  )}
                  {canEdit && (
                    <button className="add-task" onClick={() => setDrawer('new')}>
                      ＋ Add task
                    </button>
                  )}
                </div>
              );
            })}
            {canEdit && (
              <button className="add-list" onClick={() => setListModal(true)}>
                ＋ Add a list
              </button>
            )}
          </div>
        </DndContext>
        {cursor && (
          <button className="button subtle load-more" onClick={() => void load(true)}>
            Load more tasks
          </button>
        )}
      </section>
      {drawer && (
        <TaskDrawer
          task={drawer === 'new' ? null : drawer}
          labels={labels}
          members={members}
          onClose={() => setDrawer(null)}
          onSave={saveTask}
        />
      )}
      {listModal && (
        <NameModal
          title="Create a list"
          description="Add a column for the next stage of your workflow."
          placeholder="In review"
          onClose={() => setListModal(false)}
          onSave={createList}
        />
      )}
      {membersModal && (
        <InviteModal
          workspaceId={workspaceId}
          onClose={() => setMembersModal(false)}
          onCreated={() => setToast('Invitation created')}
        />
      )}
    </AppShell>
  );
}

function TaskDrawer({
  task,
  labels,
  members,
  onClose,
  onSave,
}: {
  task: Task | null;
  labels: Label[];
  members: Member[];
  onClose: () => void;
  onSave: (
    input: Partial<Task> & {
      title: string;
      description: string | null;
      status: string;
      assigneeId: string | null;
      labelIds: string[];
    }
  ) => void;
}) {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [status, setStatus] = useState(task?.status || 'TODO');
  const [assigneeId, setAssigneeId] = useState(task?.assignee?.id || '');
  const [labelIds, setLabelIds] = useState(task?.labels?.map((label) => label.id) || []);
  return (
    <AccessibleDialog
      label={task ? 'Edit task' : 'Create task'}
      className="drawer"
      backdropClassName="drawer-backdrop"
      onClose={onClose}
    >
      <div>
        <div className="section-heading">
          <h2>{task ? 'Edit task' : 'New task'}</h2>
          <button aria-label="Close task editor" onClick={onClose}>
            ×
          </button>
        </div>
        <label>
          Title
          <input
            data-dialog-initial-focus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Description
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="TODO">To do</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="DONE">Done</option>
          </select>
        </label>
        <label>
          Assignee
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.user.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Labels
          <select
            multiple
            value={labelIds}
            onChange={(e) =>
              setLabelIds(Array.from(e.target.selectedOptions, (option) => option.value))
            }
          >
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button primary"
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              title: title.trim(),
              description: description || null,
              status,
              assigneeId: assigneeId || null,
              labelIds,
            })
          }
        >
          Save task
        </button>
      </div>
    </AccessibleDialog>
  );
}

function NameModal({
  title,
  description,
  placeholder,
  onClose,
  onSave,
}: {
  title: string;
  description: string;
  placeholder: string;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <AccessibleDialog label={title} className="modal-card" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (value.trim()) onSave(value.trim());
        }}
      >
        <div className="modal-heading">
          <div>
            <div className="eyebrow">WORKSPACE SETUP</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">{description}</p>
        <label>
          Name
          <input
            data-dialog-initial-focus
            placeholder={placeholder}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="button subtle" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={!value.trim()}>
            Create
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
}

function InviteModal({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [error, setError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await api<{ inviteUrl: string }>(`/workspaces/${workspaceId}/invitations`, {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role }),
      });
      setInviteUrl(result.inviteUrl);
      setEmail('');
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create invitation');
    } finally {
      setSaving(false);
    }
  };
  return (
    <AccessibleDialog
      label="Invite a teammate"
      className="modal-card member-modal"
      onClose={onClose}
    >
      <form onSubmit={invite}>
        <div className="modal-heading">
          <div>
            <div className="eyebrow">WORKSPACE ACCESS</div>
            <h2>Invite a teammate</h2>
          </div>
          <button type="button" className="modal-close" aria-label="Close dialog" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">Give someone access to this workspace.</p>
        <div className="invite-fields">
          <label>
            Email address
            <input
              data-dialog-initial-focus
              type="email"
              placeholder="teammate@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)}>
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {inviteUrl && (
          <div className="notice">
            <strong>Invite created.</strong>
            <small>Share this link if email delivery is unavailable.</small>
            <code>{inviteUrl}</code>
            <button
              type="button"
              className="button subtle"
              onClick={() => void navigator.clipboard?.writeText(inviteUrl)}
            >
              Copy invite link
            </button>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="button subtle" onClick={onClose}>
            Close
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create invite'}
          </button>
        </div>
      </form>
    </AccessibleDialog>
  );
}
