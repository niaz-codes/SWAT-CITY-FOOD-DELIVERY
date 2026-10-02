import mongoose, { type InferSchemaType, Schema } from 'mongoose';

export const TICKET_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;
export const TICKET_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const supportTicketSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, default: 'general' } as unknown as string,

    status: { type: String, enum: TICKET_STATUSES, default: 'open', index: true },
    priority: { type: String, enum: TICKET_PRIORITIES, default: 'medium' },

    messages: [
      {
        _id: false,
        from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        text: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true },
);

supportTicketSchema.index({ user: 1, status: 1, createdAt: -1 });

export type SupportTicket = InferSchemaType<typeof supportTicketSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const SupportTicketModel = mongoose.model('SupportTicket', supportTicketSchema);