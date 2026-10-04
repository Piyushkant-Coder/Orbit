import Link from 'next/link';
import { ReactNode } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

export default function AppShell({
  children,
  workspaceId,
  board,
}: {
  children: ReactNode;
  workspaceId?: string;
  board?: { name: string; lists: Array<{ id: string; name: string }> };
}) {
  const { session, logout } = useAuth();
  const router = useRouter();
  const workspace = session?.memberships.find(
    (membership) => membership.workspaceId === workspaceId
  );
  const overviewActive = router.pathname === '/w/[workspaceId]';
  const boardsActive = router.pathname.includes('/b/');
  const membersActive = router.pathname.endsWith('/members');
  const activityActive = router.pathname.endsWith('/activity');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/w" className="brand">
            <span className="brand-mark">O</span>
            <span>Orbit</span>
          </Link>
          {workspaceId && (
            <span className="breadcrumb">
              / {workspace?.workspaceName || 'Workspace'}{' '}
              {board && (
                <>
                  / <strong>{board.name}</strong>
                </>
              )}
            </span>
          )}
        </div>
        <div className="top-actions">
          <span className="live-dot" aria-hidden="true">
            ●
          </span>
          <span className="connection-label">Workspace online</span>
          <span className="user-chip" aria-label={session?.user.name}>
            {session?.user.name?.slice(0, 1).toUpperCase()}
          </span>
          <button className="button subtle" onClick={() => void logout()}>
            Log out
          </button>
        </div>
      </header>
      <div className="app-layout">
        {workspaceId && (
          <nav className="mobile-workspace-nav" aria-label="Workspace navigation">
            <Link aria-current={overviewActive ? 'page' : undefined} href={`/w/${workspaceId}`}>
              Overview
            </Link>
            <Link
              aria-current={membersActive ? 'page' : undefined}
              href={`/w/${workspaceId}/members`}
            >
              Members
            </Link>
            <Link
              aria-current={activityActive ? 'page' : undefined}
              href={`/w/${workspaceId}/activity`}
            >
              Activity
            </Link>
          </nav>
        )}
        {workspaceId && (
          <aside className="sidebar">
            <div className="workspace-switcher">
              <span className="workspace-mark">
                {workspace?.workspaceName?.slice(0, 1).toUpperCase() || 'W'}
              </span>
              <span>
                <strong>{workspace?.workspaceName || 'Workspace'}</strong>
                <small>{workspace?.role || 'Member'}</small>
              </span>
              <span className="sidebar-chevron">⌄</span>
            </div>
            <nav className="sidebar-nav" aria-label="Workspace">
              <span className="nav-label">Workspace</span>
              <Link className={overviewActive ? 'active' : ''} href={`/w/${workspaceId}`}>
                <span aria-hidden="true">▦</span>Overview
              </Link>
              <Link className={boardsActive ? 'active' : ''} href={`/w/${workspaceId}`}>
                <span aria-hidden="true">▤</span>Boards
              </Link>
              <Link className={membersActive ? 'active' : ''} href={`/w/${workspaceId}/members`}>
                <span aria-hidden="true">♧</span>Members
              </Link>
              <Link className={activityActive ? 'active' : ''} href={`/w/${workspaceId}/activity`}>
                <span aria-hidden="true">◷</span>Activity
              </Link>
              {board && (
                <>
                  <span className="nav-label board-label">Board lists</span>
                  {board.lists.map((list) => (
                    <a className="list-link" href={`#list-${list.id}`} key={list.id}>
                      <span className="list-dot" />
                      {list.name}
                    </a>
                  ))}
                </>
              )}
            </nav>
            <div className="sidebar-bottom">
              <Link href="/w">All workspaces</Link>
              <div className="profile-row">
                <span className="user-chip">{session?.user.name?.slice(0, 1).toUpperCase()}</span>
                <span>
                  <strong>{session?.user.name}</strong>
                  <small>{session?.user.email}</small>
                </span>
              </div>
            </div>
          </aside>
        )}
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
