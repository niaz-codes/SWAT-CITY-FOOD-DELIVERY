// ============================================================
// Swat City Backend - Rider approval guard
//
// A rider can browse and view their own profile while their application is
// pending, but every "do work" action (go online, accept an order, accept a
// ride) requires an admin to have approved the profile first. This module is the
// single place that gate lives, so no entry point can forget it.
// ============================================================

import { RiderProfileModel } from '../models';
import { FORBIDDEN } from '../utils/AppError';

export async function assertRiderApproved(userId: string): Promise<void> {
  const profile = await RiderProfileModel.findOne({ user: userId }).select('approvalStatus').lean();
  if (!profile) throw FORBIDDEN('Rider profile not found');
  if (profile.approvalStatus !== 'approved') {
    throw FORBIDDEN('Your rider account is still awaiting admin approval');
  }
}
