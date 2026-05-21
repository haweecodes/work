// Shared domain types used across frontend stores and components

export interface StatusConfig {
  value: string;
  label: string;
  color: string;
  requiresReason?: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  invite_code?: string;
}

export interface Channel {
  id: string;
  workspace_id: string;
  name: string;
  is_private?: number;
  is_archived?: number;
  created_by?: string;
}

export interface DmThread {
  id: string;
  workspace_id: string;
  participants?: User[];
}

export interface Member extends User {
  role?: 'admin' | 'member';
}


export interface Board {
  id: string;
  workspace_id: string;
  name: string;
  project_key?: string;
  task_sequence?: number;
  created_by?: string;
}

export interface TaskUpdateResponse {
  id: string;
  request_id: string;
  task_id: string;
  task_key?: string;
  task_title?: string;
  user_id: string;
  user_name?: string;
  status: 'on_track' | 'delayed' | 'finished' | 'cancelled' | 'pending';
  reason?: string;
  created_at: string;
}

export interface TaskUpdateRequest {
  id: string;
  board_id: string;
  scope: 'task' | 'column' | 'board';
  task_id?: string;
  column_id?: string;
  requested_by: string;
  requester_name: string;
  workspace_id: string;
  created_at: string;
  responses: TaskUpdateResponse[];
}

export interface TaskAssignee {
  id: string;
  name: string;
  avatar_url?: string;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description?: string;
  priority?: string;
  due_date?: string;
  created_by?: string;
  linked_message_id?: string;
  linked_channel_id?: string;
  linked_parent_message_id?: string;
  linked_dm_thread_id?: string;
  parent_task_id?: string;
  linked_task_id?: string;
  linked_task?: Task;
  position?: number;
  task_number?: number;
  task_key?: string;
  created_at?: string;
  assignees?: TaskAssignee[];
  column_title?: string;
}

export interface Column {
  id: string;
  board_id: string;
  title: string;
  position?: number;
  tasks: Task[];
}

export interface Reaction {
  emoji: string;
  count: number;
  users: string[]; // user IDs who reacted
}

/** Lightweight snapshot embedded in a shared message */
export interface SharedMessagePreview {
  id: string;
  content: string;
  created_at: string;
  sender_name: string;
  sender_avatar?: string;
  /** Navigation fields — where the original message lives */
  channel_id?: string;
  channel_name?: string;
  dm_thread_id?: string;
  /** Set if the original message was a thread reply */
  parent_message_id?: string;
}

export interface MentionPriority {
  userId: string;
  name: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export interface Message {
  id: string;
  channel_id?: string;
  dm_thread_id?: string;
  sender_id: string;
  content: string;
  linked_task_id?: string;
  linked_task?: Task;
  created_at: string;
  sender?: User;
  parent_message_id?: string;
  reply_count?: number;
  reactions?: Reaction[];
  /** Set when this message is a forwarded/shared message */
  shared_message_id?: string;
  shared_message?: SharedMessagePreview;
  is_system?: number;
  edited_at?: string | null;
  deleted?: boolean;
  importance?: string;
  mention_priorities?: MentionPriority[];
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  reference_id?: string;
  reference_type?: string;
  message?: string;
  is_read: number;
  is_resolved?: number;
  sender_name?: string;
  sender_avatar?: string;
  workspace_id?: string;
  priority?: string;
  extra_id?: string;
  created_at: string;
}
