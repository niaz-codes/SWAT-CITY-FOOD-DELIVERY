import { Router } from 'express';
import {
  listNotificationsCtrl,
  markAllReadCtrl,
  markReadCtrl,
  unreadCount,
} from '../controllers/notification.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

router.get('/', listNotificationsCtrl);
router.get('/unread-count', unreadCount);
router.post('/mark-all-read', markAllReadCtrl);
router.post('/:id/read', markReadCtrl);

export default router;
