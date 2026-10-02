import { Role } from '@prisma/client';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceDTO {
  id: string;
  name: string;
  createdAt: Date;
}

export interface MemberDTO {
  id: string;
  userId: string;
  user: UserDTO;
  role: Role;
  createdAt: Date;
}

export interface TaskDTO {
  id: string;
  workspaceId: string;
  boardId: string;
  listId: string;
  title: string;
  description: string | null;
  status: string;
  position: string;
  assignee: UserDTO | null;
  labels: Array<{ id: string; name: string; color: string }>;
  version: number;
  createdBy: UserDTO | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BoardDTO {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ListDTO {
  id: string;
  workspaceId: string;
  boardId: string;
  name: string;
  position: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LabelDTO {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: Date;
}

export interface ActivityLogDTO {
  id: string;
  workspaceId: string;
  actor: UserDTO | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
}
