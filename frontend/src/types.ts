// Shared domain types used across frontend stores and components

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

export interface Member extends User { }

export interface Board {
  id: string;
  workspace_id: string;
  name: string;
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
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  reference_id?: string;
  reference_type?: string;
  message?: string;
  is_read: number;
  created_at: string;
}
