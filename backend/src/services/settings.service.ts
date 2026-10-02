import { AppSettingModel } from '../models';

export const DEFAULT_SETTINGS: Record<string, { value: unknown; label?: string }> = {
  platform_fee: { value: 15, label: 'Flat platform fee per order (Rs)' },
  free_delivery_threshold: { value: 800, label: 'Free delivery minimum cart value (Rs)' },
  min_order_amount: { value: 150, label: 'Minimum order value (Rs)' },
  support_phone: { value: '03001112222', label: 'Support phone number' },
  support_email: { value: 'support@swatcity.pk', label: 'Support email' },
  currency: { value: 'PKR', label: 'Display currency' },
};

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  const setting = await AppSettingModel.findOne({ key }).lean();
  return setting ? (setting.value as T) : undefined;
}

export async function setSetting(key: string, value: unknown, label?: string): Promise<void> {
  await AppSettingModel.findOneAndUpdate(
    { key },
    { $set: { value, label } },
    { upsert: true, new: true },
  );
}

export async function ensureDefaultSettings(): Promise<void> {
  await Promise.all(
    Object.entries(DEFAULT_SETTINGS).map(([key, conf]) =>
      AppSettingModel.updateOne(
        { key },
        { $setOnInsert: { key, ...conf } },
        { upsert: true },
      ),
    ),
  );
}