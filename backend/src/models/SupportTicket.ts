import { defineModel } from '../db/model';
import { UserModel } from './User';

/** One message in the ticket thread (no `_id`). */
export interface SupportTicketMessage {
  from: string;
  text: string;
  at?: Date | null;
}

export interface SupportTicket {
  _id: string;

  user: string;
  subject: string;
  description: string;
  category: string;

  status: string;
  priority: string;

  messages: SupportTicketMessage[];

  assignedTo?: string | null;
  resolvedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

export const SupportTicketModel = defineModel<SupportTicket>({
  table: 'support_tickets',
  columns: [
    'user',
    'subject',
    'description',
    'category',
    'status',
    'priority',
    'messages',
    'assignedTo',
    'resolvedAt',
    'createdAt',
    'updatedAt',
  ],
  refs: {
    user: () => UserModel,
    assignedTo: () => UserModel,
  },
});
